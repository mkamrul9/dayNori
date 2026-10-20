/**
 * Phase 49 repair — Drive selected-file connector (fake provider + real worker dispatch).
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
  getDriveProvider,
  setDriveProviderForTests,
} from '../../apps/api/src/modules/drive/provider.js';
import { executeDriveBackgroundJob } from '../../apps/api/src/modules/drive/jobExecutor.js';
import { handleDriveJob } from '../../apps/worker/src/driveJobs.js';
import {
  MemoryStorageProvider,
  setDefaultStorageProvider,
} from '../../apps/api/src/modules/files/storageAdapter.js';
import {
  PolicyMalwareScanner,
  setDefaultMalwareScanner,
} from '../../apps/api/src/modules/files/scanner.js';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

describe('Phase 49 repair: Drive connector (fake provider + worker path)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;
  let fake: FakeGoogleDriveProvider;
  let memoryStorage: MemoryStorageProvider;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase49-drive-repair-key';

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
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'] = 'true';
    process.env['DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY'] = crypto.randomBytes(32).toString('base64');
    process.env['DAYNORI_DRIVE_TOKEN_KEY_VERSION'] = 'v1-phase49-repair';
    process.env['DAYNORI_DRIVE_PROVIDER'] = 'fake';

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();
    migrator = new Migrator();
    await migrator.migrate();

    memoryStorage = new MemoryStorageProvider();
    setDefaultStorageProvider(memoryStorage);
    setDefaultMalwareScanner(new PolicyMalwareScanner());

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    const verifier = new JwtVerifier({ issuer, audience, localJwks: jwks });
    fake = new FakeGoogleDriveProvider();
    setDriveProviderForTests(fake);

    server = buildServer({
      jwtVerifier: verifier,
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
    });
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    memoryStorage.setBaseUrl(baseUrl);

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
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'] = 'true';
    process.env['DAYNORI_DRIVE_PROVIDER'] = 'fake';
    setDriveProviderForTests(fake);
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

  async function connectionGeneration(workspaceId: string, accountId: string): Promise<number> {
    const res = await adminPool.query<{ generation: string }>(
      `SELECT generation FROM app.drive_connections WHERE workspace_id = $1 AND account_id = $2`,
      [workspaceId, accountId]
    );
    return Number(res.rows[0]!.generation);
  }

  it('rejects cross-tenant connection status', async () => {
    await connectFake(clientA, workspaceAId);
    await expect(clientB.getDriveConnection(workspaceAId)).rejects.toThrow();
  });

  it('imports real synthetic bytes through worker dispatch and persists local file reference', async () => {
    await connectFake(clientA, workspaceAId);
    fake.seedAuthorizedFile(
      {
        id: 'import-src-1',
        name: 'note.png',
        mimeType: 'image/png',
        md5Checksum: 'x',
        version: '1',
        trashed: false,
        isShortcut: false,
        isSharedDrive: false,
        shortcutTargetId: null,
      },
      PNG_BYTES
    );

    const selected = await clientA.selectDriveFile(workspaceAId, {
      providerFileId: 'import-src-1',
      displayName: 'note.png',
      mimeType: 'image/png',
      linkMode: 'import_copy',
      isShortcut: false,
      isSharedDrive: false,
    });
    expect(selected.data.jobId).toBeTruthy();
    const gen = await connectionGeneration(workspaceAId, userAId);

    await withTenantContext(
      runtimePool,
      { userId: userAId, workspaceId: workspaceAId },
      async (client) => {
        const handled = await handleDriveJob(client as never, 'drive_import_copy', {
          driveJobId: selected.data.jobId!,
          connectionId: selected.data.linkedFile.connectionId,
          workspaceId: workspaceAId,
          accountId: userAId,
          linkedFileId: selected.data.linkedFile.id,
          connectionGeneration: gen,
          providerFileId: 'import-src-1',
          exportMimeType: null,
          folderId: null,
          localFileItemId: null,
          idempotencyKey: `import_copy:import-src-1:none`,
        });
        expect(handled.status).toBe('completed');
        expect(
          handled.details['driveStatus'],
          `import failed: ${JSON.stringify(handled.details)}`
        ).toBe('succeeded');
      }
    );

    const files = await clientA.listDriveLinkedFiles(workspaceAId);
    const linked = files.data.find((f) => f.providerFileId === 'import-src-1');
    expect(linked?.availability).toBe('imported');
    expect(linked?.localFileItemId).toBeTruthy();
    expect(linked?.checksum).toBeTruthy();
  });

  it('does not set offline_cached from server download alone', async () => {
    await connectFake(clientA, workspaceAId);
    fake.seedAuthorizedFile(
      {
        id: 'offline-src-1',
        name: 'offline.png',
        mimeType: 'image/png',
        md5Checksum: 'y',
        version: '1',
        trashed: false,
        isShortcut: false,
        isSharedDrive: false,
        shortcutTargetId: null,
      },
      PNG_BYTES
    );
    const selected = await clientA.selectDriveFile(workspaceAId, {
      providerFileId: 'offline-src-1',
      displayName: 'offline.png',
      mimeType: 'image/png',
      linkMode: 'download_offline',
      isShortcut: false,
      isSharedDrive: false,
    });
    const gen = await connectionGeneration(workspaceAId, userAId);
    await withTenantContext(
      runtimePool,
      { userId: userAId, workspaceId: workspaceAId },
      async (client) => {
        await executeDriveBackgroundJob(client, {
          driveJobId: selected.data.jobId!,
          connectionId: selected.data.linkedFile.connectionId,
          workspaceId: workspaceAId,
          accountId: userAId,
          linkedFileId: selected.data.linkedFile.id,
          connectionGeneration: gen,
          providerFileId: 'offline-src-1',
          exportMimeType: null,
          folderId: null,
          localFileItemId: null,
          idempotencyKey: `download_offline:offline-src-1:none`,
        });
      }
    );
    const files = await clientA.listDriveLinkedFiles(workspaceAId);
    const linked = files.data.find((f) => f.providerFileId === 'offline-src-1');
    expect(linked?.availability).toBe('pending_offline');
    expect(linked?.availability).not.toBe('offline_cached');

    const ack = await clientA.acknowledgeDriveOffline(workspaceAId, linked!.id);
    expect(ack.data.availability).toBe('offline_cached');
  });

  it('fences disconnect during transfer and rejects shortcuts', async () => {
    await connectFake(clientA, workspaceAId);
    fake.seedAuthorizedFile(
      {
        id: 'fence-src',
        name: 'f.png',
        mimeType: 'image/png',
        md5Checksum: 'z',
        version: '1',
        trashed: false,
        isShortcut: false,
        isSharedDrive: false,
        shortcutTargetId: null,
      },
      PNG_BYTES
    );
    const selected = await clientA.selectDriveFile(workspaceAId, {
      providerFileId: 'fence-src',
      displayName: 'f.png',
      mimeType: 'image/png',
      linkMode: 'import_copy',
      isShortcut: false,
      isSharedDrive: false,
    });
    await clientA.disconnectDrive(workspaceAId);
    await withTenantContext(
      runtimePool,
      { userId: userAId, workspaceId: workspaceAId },
      async (client) => {
        const result = await executeDriveBackgroundJob(client, {
          driveJobId: selected.data.jobId!,
          connectionId: selected.data.linkedFile.connectionId,
          workspaceId: workspaceAId,
          accountId: userAId,
          linkedFileId: selected.data.linkedFile.id,
          connectionGeneration: 0,
          providerFileId: 'fence-src',
          exportMimeType: null,
          folderId: null,
          localFileItemId: null,
          idempotencyKey: `import_copy:fence-src:none`,
        });
        expect(result.status).toBe('fenced');
      }
    );

    await connectFake(clientA, workspaceAId);
    fake.seedAuthorizedFile(
      {
        id: 'sc-1',
        name: 'shortcut',
        mimeType: 'application/vnd.google-apps.shortcut',
        md5Checksum: null,
        version: '1',
        trashed: false,
        isShortcut: true,
        isSharedDrive: false,
        shortcutTargetId: 'target',
      },
      Buffer.from('shortcut')
    );
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

  it('rejects fake provider in production runtime', () => {
    setDriveProviderForTests(null);
    const prevNode = process.env['NODE_ENV'];
    const prevInject = process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'];
    const prevMode = process.env['DAYNORI_DRIVE_PROVIDER'];
    process.env['NODE_ENV'] = 'production';
    delete process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'];
    process.env['DAYNORI_DRIVE_PROVIDER'] = 'fake';
    expect(() => getDriveProvider()).toThrow(/production/i);
    process.env['NODE_ENV'] = prevNode;
    if (prevInject === undefined) delete process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'];
    else process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'] = prevInject;
    process.env['DAYNORI_DRIVE_PROVIDER'] = prevMode ?? 'fake';
    setDriveProviderForTests(fake);
  });

  it('rejects payload/selection mismatches', async () => {
    await connectFake(clientA, workspaceAId);
    fake.seedAuthorizedFile(
      {
        id: 'bind-src',
        name: 'b.png',
        mimeType: 'image/png',
        md5Checksum: 'b',
        version: '1',
        trashed: false,
        isShortcut: false,
        isSharedDrive: false,
        shortcutTargetId: null,
      },
      PNG_BYTES
    );
    const selected = await clientA.selectDriveFile(workspaceAId, {
      providerFileId: 'bind-src',
      displayName: 'b.png',
      mimeType: 'image/png',
      linkMode: 'import_copy',
      isShortcut: false,
      isSharedDrive: false,
    });
    const gen = await connectionGeneration(workspaceAId, userAId);

    await withTenantContext(
      runtimePool,
      { userId: userAId, workspaceId: workspaceAId },
      async (client) => {
        const result = await executeDriveBackgroundJob(client, {
          driveJobId: selected.data.jobId!,
          connectionId: selected.data.linkedFile.connectionId,
          workspaceId: workspaceAId,
          accountId: userAId,
          linkedFileId: selected.data.linkedFile.id,
          connectionGeneration: gen,
          providerFileId: 'wrong-id',
          exportMimeType: null,
          folderId: null,
          localFileItemId: null,
          idempotencyKey: `import_copy:bind-src:none`,
        });
        expect(result.status).toBe('failed');
        expect(result.errorCode).toBe('selection_boundary');
      }
    );
  });

  it('rejects quarantine scanner failure without marking imported', async () => {
    await connectFake(clientA, workspaceAId);
    const eicar = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
    );
    fake.seedAuthorizedFile(
      {
        id: 'eicar-src',
        name: 'eicar.txt',
        mimeType: 'text/plain',
        md5Checksum: 'e',
        version: '1',
        trashed: false,
        isShortcut: false,
        isSharedDrive: false,
        shortcutTargetId: null,
      },
      eicar
    );
    const selected = await clientA.selectDriveFile(workspaceAId, {
      providerFileId: 'eicar-src',
      displayName: 'eicar.txt',
      mimeType: 'text/plain',
      linkMode: 'import_copy',
      isShortcut: false,
      isSharedDrive: false,
    });
    const gen = await connectionGeneration(workspaceAId, userAId);
    await withTenantContext(
      runtimePool,
      { userId: userAId, workspaceId: workspaceAId },
      async (client) => {
        const result = await executeDriveBackgroundJob(client, {
          driveJobId: selected.data.jobId!,
          connectionId: selected.data.linkedFile.connectionId,
          workspaceId: workspaceAId,
          accountId: userAId,
          linkedFileId: selected.data.linkedFile.id,
          connectionGeneration: gen,
          providerFileId: 'eicar-src',
          exportMimeType: null,
          folderId: null,
          localFileItemId: null,
          idempotencyKey: `import_copy:eicar-src:none`,
        });
        expect(result.status).toBe('failed');
        expect(result.errorCode).toMatch(/quarantine|rejected|malware|scan/i);
      }
    );
    const files = await clientA.listDriveLinkedFiles(workspaceAId);
    const linked = files.data.find((f) => f.providerFileId === 'eicar-src');
    expect(linked?.availability).not.toBe('imported');
  });

  it('rejects denied downloads without marking imported', async () => {
    await connectFake(clientA, workspaceAId);
    fake.seedAuthorizedFile(
      {
        id: 'denied-src',
        name: 'd.png',
        mimeType: 'image/png',
        md5Checksum: 'd',
        version: '1',
        trashed: false,
        isShortcut: false,
        isSharedDrive: false,
        shortcutTargetId: null,
      },
      PNG_BYTES
    );
    fake.deniedFileIds.add('denied-src');
    await expect(
      clientA.selectDriveFile(workspaceAId, {
        providerFileId: 'denied-src',
        displayName: 'd.png',
        mimeType: 'image/png',
        linkMode: 'import_copy',
        isShortcut: false,
        isSharedDrive: false,
      })
    ).rejects.toThrow();
    fake.deniedFileIds.delete('denied-src');
  });
});
