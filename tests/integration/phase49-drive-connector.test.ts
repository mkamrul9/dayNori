/**
 * Phase 49 — Drive selected-file connector integration (fake provider).
 * Not live Google verification.
 */
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, withTenantContext } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  FakeGoogleDriveProvider,
  setDriveProviderForTests,
} from '../../apps/api/src/modules/drive/provider.js';
import { processDriveBackgroundJob } from '../../apps/api/src/modules/drive/service.js';

describe('Phase 49: Drive selected-file connector (fake provider integration)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;
  let fake: FakeGoogleDriveProvider;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase49-drive-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let tokenUserA: string;
  let tokenUserB: string;
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let workspaceAId: string;
  let workspaceBId: string;

  async function createToken(userId: string): Promise<string> {
    return new SignJWT({
      sub: userId,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);
  }

  beforeAll(async () => {
    process.env['DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY'] = crypto.randomBytes(32).toString('base64');
    process.env['DAYNORI_DRIVE_TOKEN_KEY_VERSION'] = 'v1-phase49-test';
    process.env['DAYNORI_DRIVE_PROVIDER'] = 'fake';

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();
    migrator = new Migrator();
    await migrator.migrate();

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    fake = new FakeGoogleDriveProvider();
    setDriveProviderForTests(fake);

    const safeLogger = new (await import('../../apps/api/src/plugins/logger.js')).SafeLogger(
      (entry) => {
        if (entry.level === 'error') {
          console.error('SERVER ERROR:', JSON.stringify(entry));
        }
      }
    );

    server = buildServer({
      jwtVerifier: verifier,
      runtimePool,
      logger: safeLogger,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
    });
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);
    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    const setupClient = await adminPool.connect();
    try {
      await setupClient.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1, $2), ($3, $4) ON CONFLICT (id) DO NOTHING`,
        [userAId, 'Alice Drive', userBId, 'Bob Drive']
      );
      const wsARes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Alice Drive WS', userAId]
      );
      workspaceAId = wsARes.rows[0]!.id;
      const wsBRes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Bob Drive WS', userBId]
      );
      workspaceBId = wsBRes.rows[0]!.id;
      await setupClient.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
        [workspaceAId, userAId, workspaceBId, userBId]
      );
    } finally {
      setupClient.release();
    }
  }, 120_000);

  afterAll(async () => {
    setDriveProviderForTests(null);
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  beforeEach(() => {
    setDriveProviderForTests(fake);
    process.env['DAYNORI_DRIVE_PROVIDER'] = 'fake';
  });

  async function connectFake(client: DaynoriApiClient, workspaceId: string) {
    const started = await client.startDriveConnect(workspaceId, {
      platform: 'web',
      returnPath: '/settings',
    });
    const state = new URL(started.data.authorizationUrl).searchParams.get('state')!;
    return client.completeDriveConnect(workspaceId, {
      intentId: started.data.intentId,
      state,
      code: 'fake-ok',
    });
  }

  it('connects via fake provider and rejects cross-tenant access', async () => {
    const connected = await connectFake(clientA, workspaceAId);
    expect(connected.data.status).toBe('connected');
    expect(connected.data.isDevelopmentFixture).toBe(true);
    expect(connected.data.providerAccountEmail).toBe('drive-fixture@daynori.test');

    await expect(clientB.getDriveConnection(workspaceAId)).rejects.toThrow();
    const statusB = await clientB.getDriveConnection(workspaceBId);
    expect(['unconfigured', 'disconnected', 'revoked']).toContain(statusB.data.status);
  });

  it('rejects invalid state and replayed intents', async () => {
    const started = await clientA.startDriveConnect(workspaceAId, {
      platform: 'web',
      returnPath: '/settings',
    });
    await expect(
      clientA.completeDriveConnect(workspaceAId, {
        intentId: started.data.intentId,
        state: 'wrong-state',
        code: 'fake-ok',
      })
    ).rejects.toThrow();

    const started2 = await clientA.startDriveConnect(workspaceAId, {
      platform: 'web',
      returnPath: '/settings',
    });
    const state2 = new URL(started2.data.authorizationUrl).searchParams.get('state')!;
    await clientA.completeDriveConnect(workspaceAId, {
      intentId: started2.data.intentId,
      state: state2,
      code: 'fake-ok',
    });
    await expect(
      clientA.completeDriveConnect(workspaceAId, {
        intentId: started2.data.intentId,
        state: state2,
        code: 'fake-ok',
      })
    ).rejects.toThrow();
  });

  it('fences disconnect during import jobs and does not trash remote on unlink', async () => {
    await connectFake(clientA, workspaceAId);
    fake.seedAuthorizedFile(
      {
        id: 'sel-1',
        name: 'picked.txt',
        mimeType: 'text/plain',
        md5Checksum: 'd',
        version: '1',
        trashed: false,
        isShortcut: false,
        isSharedDrive: false,
        shortcutTargetId: null,
      },
      Buffer.from('picked-bytes')
    );

    const selected = await clientA.selectDriveFile(workspaceAId, {
      providerFileId: 'sel-1',
      displayName: 'picked.txt',
      mimeType: 'text/plain',
      linkMode: 'import_copy',
      isShortcut: false,
      isSharedDrive: false,
    });
    expect(selected.data.jobId).toBeTruthy();

    const disc = await clientA.disconnectDrive(workspaceAId);
    expect(disc.data.tokensRemoved).toBe(true);
    expect(disc.data.remoteOriginalDeleted).toBe(false);

    await withTenantContext(
      runtimePool,
      { userId: userAId, workspaceId: workspaceAId },
      async (client) => {
        const result = await processDriveBackgroundJob(client, {
          driveJobId: selected.data.jobId!,
          connectionId: selected.data.linkedFile.connectionId,
          workspaceId: workspaceAId,
          accountId: userAId,
          linkedFileId: selected.data.linkedFile.id,
          connectionGeneration: 0,
          providerFileId: 'sel-1',
          exportMimeType: null,
          folderId: null,
          localFileItemId: null,
          idempotencyKey: `import_copy:sel-1:none`,
        });
        expect(result.status).toBe('fenced');
      }
    );

    await connectFake(clientA, workspaceAId);
    const again = await clientA.selectDriveFile(workspaceAId, {
      providerFileId: 'sel-1',
      displayName: 'picked.txt',
      mimeType: 'text/plain',
      linkMode: 'link_reference',
      isShortcut: false,
      isSharedDrive: false,
    });
    await clientA.unlinkDriveFile(workspaceAId, again.data.linkedFile.id);

    const tokens = await fake.exchangeAuthorizationCode({
      code: 'fake-ok',
      codeVerifier: 'v',
      redirectUri: 'http://127.0.0.1/cb',
    });
    const meta = await fake.getFileMeta(tokens.accessToken, 'sel-1');
    expect(meta.id).toBe('sel-1');
  });

  it('rejects shortcuts outside the supported boundary', async () => {
    await connectFake(clientA, workspaceAId);
    await expect(
      clientA.selectDriveFile(workspaceAId, {
        providerFileId: 'sc-1',
        displayName: 'shortcut',
        mimeType: 'application/vnd.google-apps.shortcut',
        linkMode: 'link_reference',
        isShortcut: true,
        isSharedDrive: false,
      })
    ).rejects.toThrow();
  });

  it('fails closed when production Google provider is not enabled', async () => {
    setDriveProviderForTests(null);
    process.env['DAYNORI_DRIVE_PROVIDER'] = 'google';
    delete process.env['DAYNORI_DRIVE_PRODUCTION_ENABLED'];
    await expect(
      clientA.startDriveConnect(workspaceAId, { platform: 'web', returnPath: '/settings' })
    ).rejects.toThrow();
    process.env['DAYNORI_DRIVE_PROVIDER'] = 'fake';
    setDriveProviderForTests(fake);
  });
});
