/**
 * Phase 87 — Google Drive connection and scope readiness integration and security suite.
 * Validates narrow drive.file scope enforcement, single-use state, cross-tenant/cross-workspace
 * isolation, AES-256-GCM token encryption with AAD binding, short-lived Picker tokens,
 * disconnect guarantees with generation fencing, byte transfer & malware quarantine,
 * upload idempotency reconciliation, and fail-closed production provider gates.
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
  DRIVE_FILE_SCOPE,
  assertDriveScopesForConnect,
  disconnectExplanation,
  evaluateSelectedObjectSupport,
  isProviderObjectAuthorized,
  isVaultDriveTarget,
  mayCompleteDriveWork,
  validateGrantedDriveScopes,
  validateRequestedDriveScopes,
} from '@daynori/domain';
import {
  sealDriveRefreshToken,
  unsealDriveRefreshToken,
  DriveTokenEncryptionUnavailableError,
  isDriveTokenEncryptionConfigured,
} from '../../apps/api/src/modules/drive/tokenCrypto.js';
import {
  DriveProviderUnavailableError,
  FakeGoogleDriveProvider,
  GoogleDriveProvider,
  classifyGoogleHttpError,
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

const SYNTHETIC_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

describe('Phase 87: Google Drive connection and scope readiness', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;
  let fakeProvider: FakeGoogleDriveProvider;
  let memoryStorage: MemoryStorageProvider;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase87-drive-readiness-key';

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
    process.env['DAYNORI_DRIVE_TOKEN_KEY_VERSION'] = 'v1-phase87-readiness';
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
    fakeProvider = new FakeGoogleDriveProvider();
    setDriveProviderForTests(fakeProvider);

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
        [userAId, 'Alice Phase87', userBId, 'Bob Phase87']
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
    setDriveProviderForTests(fakeProvider);
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

  async function getConnectionRow(workspaceId: string, accountId: string) {
    const res = await adminPool.query<{
      id: string;
      status: string;
      generation: string;
      refresh_token_ciphertext: string | null;
      refresh_token_key_version: string | null;
    }>(
      `SELECT id, status, generation, refresh_token_ciphertext, refresh_token_key_version FROM app.drive_connections WHERE workspace_id = $1 AND account_id = $2`,
      [workspaceId, accountId]
    );
    return res.rows[0] ?? null;
  }

  describe('1. Narrow drive.file Scope Boundary and Validation', () => {
    it('accepts only the approved drive.file scope and allows standard openid extras', () => {
      const requested = validateRequestedDriveScopes(DRIVE_FILE_SCOPE);
      expect(requested.ok).toBe(true);

      const granted = validateGrantedDriveScopes(`${DRIVE_FILE_SCOPE} openid email`, {
        allowOpenIdExtras: true,
      });
      expect(granted.ok).toBe(true);
      expect(() =>
        assertDriveScopesForConnect(DRIVE_FILE_SCOPE, `${DRIVE_FILE_SCOPE} openid email`)
      ).not.toThrow();
    });

    it('strictly rejects broad and unapproved Drive scopes', () => {
      const broadScopes = [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.metadata',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
        'https://www.googleapis.com/auth/drive.photos.readonly',
        'https://www.googleapis.com/auth/drive.appdata',
        `${DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/drive`,
        'https://malicious.example.com/auth/drive.file',
      ];

      for (const scope of broadScopes) {
        expect(validateRequestedDriveScopes(scope).ok).toBe(false);
        const granted = validateGrantedDriveScopes(scope, { allowOpenIdExtras: true });
        expect(granted.ok).toBe(false);
      }
    });
  });

  describe('2. OAuth Intent Single-Use and Tenant Isolation', () => {
    it('rejects state replay (single-use token enforcement)', async () => {
      const started = await clientA.startDriveConnect(workspaceAId, {
        platform: 'web',
        returnPath: '/settings',
      });
      const state = new URL(started.data.authorizationUrl).searchParams.get('state')!;

      // First completion succeeds
      const first = await clientA.completeDriveConnect(workspaceAId, {
        intentId: started.data.intentId,
        state,
        code: 'fake-ok',
      });
      expect(first.data.status).toBe('connected');

      // Attempting to reuse the exact same intent/state fails closed
      await expect(
        clientA.completeDriveConnect(workspaceAId, {
          intentId: started.data.intentId,
          state,
          code: 'fake-ok',
        })
      ).rejects.toThrow();
    });

    it('rejects cross-account and cross-workspace intent completion', async () => {
      const started = await clientA.startDriveConnect(workspaceAId, {
        platform: 'web',
        returnPath: '/settings',
      });
      const state = new URL(started.data.authorizationUrl).searchParams.get('state')!;

      // User B cannot complete User A's intent in User B's workspace
      await expect(
        clientB.completeDriveConnect(workspaceBId, {
          intentId: started.data.intentId,
          state,
          code: 'fake-ok',
        })
      ).rejects.toThrow();

      // User B cannot complete User A's intent in User A's workspace either
      await expect(
        clientB.completeDriveConnect(workspaceAId, {
          intentId: started.data.intentId,
          state,
          code: 'fake-ok',
        })
      ).rejects.toThrow();
    });
  });

  describe('3. Token Encryption at Rest with AAD Binding', () => {
    it('seals and unseals refresh token when binding parameters match exactly', () => {
      expect(isDriveTokenEncryptionConfigured()).toBe(true);

      const plaintext = '1//0gExampleRefreshTokenValueForDrive';
      const binding = {
        workspaceId: workspaceAId,
        connectionId: crypto.randomUUID(),
        accountId: userAId,
      };

      const sealed = sealDriveRefreshToken(plaintext, binding);
      expect(sealed.keyVersion).toBe('v1-phase87-readiness');
      expect(sealed.ciphertext).not.toContain(plaintext);

      const unsealed = unsealDriveRefreshToken(sealed, binding);
      expect(unsealed).toBe(plaintext);
    });

    it('strictly rejects unsealing when AAD binding does not match (tenant swap protection)', () => {
      const plaintext = 'secret-refresh-token';
      const bindingA = {
        workspaceId: workspaceAId,
        connectionId: crypto.randomUUID(),
        accountId: userAId,
      };
      const sealed = sealDriveRefreshToken(plaintext, bindingA);

      // Mismatched workspaceId
      expect(() =>
        unsealDriveRefreshToken(sealed, {
          workspaceId: workspaceBId,
          connectionId: bindingA.connectionId,
          accountId: bindingA.accountId,
        })
      ).toThrow();

      // Mismatched accountId
      expect(() =>
        unsealDriveRefreshToken(sealed, {
          workspaceId: bindingA.workspaceId,
          connectionId: bindingA.connectionId,
          accountId: userBId,
        })
      ).toThrow();

      // Mismatched connectionId
      expect(() =>
        unsealDriveRefreshToken(sealed, {
          workspaceId: bindingA.workspaceId,
          connectionId: crypto.randomUUID(),
          accountId: bindingA.accountId,
        })
      ).toThrow();
    });

    it('rejects tampered ciphertext and fails closed', () => {
      const plaintext = 'tamper-test-token';
      const binding = {
        workspaceId: workspaceAId,
        connectionId: crypto.randomUUID(),
        accountId: userAId,
      };
      const sealed = sealDriveRefreshToken(plaintext, binding);

      const raw = Buffer.from(sealed.ciphertext, 'base64');
      // Flip byte in encrypted payload
      raw[raw.length - 2] ^= 0xff;
      const tamperedSealed = {
        keyVersion: sealed.keyVersion,
        ciphertext: raw.toString('base64'),
      };

      expect(() => unsealDriveRefreshToken(tamperedSealed, binding)).toThrow();
    });

    it('fails closed when encryption key is unconfigured', () => {
      const prevKey = process.env['DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY'];
      delete process.env['DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY'];

      expect(isDriveTokenEncryptionConfigured()).toBe(false);
      expect(() =>
        sealDriveRefreshToken('plaintext', {
          workspaceId: workspaceAId,
          connectionId: crypto.randomUUID(),
          accountId: userAId,
        })
      ).toThrow(DriveTokenEncryptionUnavailableError);

      process.env['DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY'] = prevKey;
    });
  });

  describe('4. Short-Lived Google Picker Access Token and Leak Prevention', () => {
    it('returns an ephemeral access token with no-store cache control without leaking refresh token', async () => {
      await connectFake(clientA, workspaceAId);

      const pickerRes = await clientA.getDrivePickerToken(workspaceAId);
      expect(pickerRes.data.accessToken).toMatch(/^fake-access-/);
      expect(pickerRes.data.cacheControl).toBe('no-store');
      expect(new Date(pickerRes.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

      // Ensure no refresh token or ciphertext is leaked in response
      const json = JSON.stringify(pickerRes);
      expect(json).not.toContain('fake-refresh-');
      expect(json).not.toContain('ciphertext');
      expect(json).not.toContain('keyVersion');
    });

    it('fails closed when attempting to get a Picker token while disconnected', async () => {
      await clientA.disconnectDrive(workspaceAId);

      await expect(clientA.getDrivePickerToken(workspaceAId)).rejects.toThrow();
    });
  });

  describe('5. Disconnect Guarantees and Generation Fencing', () => {
    it('disconnects cleanly, removes stored tokens, preserves imported copies, and fences late jobs', async () => {
      await connectFake(clientA, workspaceAId);
      const rowBefore = await getConnectionRow(workspaceAId, userAId);
      expect(rowBefore?.status).toBe('connected');
      expect(rowBefore?.refresh_token_ciphertext).toBeTruthy();
      const initialGen = Number(rowBefore!.generation);

      // Seed and select a file
      fakeProvider.seedAuthorizedFile(
        {
          id: 'disconnect-test-file',
          name: 'doc.png',
          mimeType: 'image/png',
          md5Checksum: 'chk',
          version: '1',
          trashed: false,
          isShortcut: false,
          isSharedDrive: false,
          shortcutTargetId: null,
        },
        SYNTHETIC_PNG_BYTES
      );

      const selected = await clientA.selectDriveFile(workspaceAId, {
        providerFileId: 'disconnect-test-file',
        displayName: 'doc.png',
        mimeType: 'image/png',
        linkMode: 'import_copy',
        isShortcut: false,
        isSharedDrive: false,
      });

      // Disconnect
      const disconnectRes = await clientA.disconnectDrive(workspaceAId);
      expect(disconnectRes.data.status).toBe('disconnected');
      expect(disconnectRes.data.tokensRemoved).toBe(true);
      expect(disconnectRes.data.retainedImportedCopies).toBe(true);
      expect(disconnectRes.data.remoteOriginalDeleted).toBe(false);

      // Inspect DB row: tokens removed, generation bumped
      const rowAfter = await getConnectionRow(workspaceAId, userAId);
      expect(rowAfter?.status).toBe('disconnected');
      expect(rowAfter?.refresh_token_ciphertext).toBeNull();
      expect(Number(rowAfter?.generation)).toBeGreaterThan(initialGen);

      // Attempting to execute the late job with the pre-disconnect generation must fence
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (dbClient) => {
          const result = await executeDriveBackgroundJob(dbClient, {
            driveJobId: selected.data.jobId!,
            connectionId: selected.data.linkedFile.connectionId,
            workspaceId: workspaceAId,
            accountId: userAId,
            linkedFileId: selected.data.linkedFile.id,
            connectionGeneration: initialGen,
            providerFileId: 'disconnect-test-file',
            exportMimeType: null,
            folderId: null,
            localFileItemId: null,
            idempotencyKey: 'import_copy:disconnect-test-file:none',
          });
          expect(result.status).toBe('fenced');
        }
      );
    });

    it('validates disconnect explanation text for user transparency', () => {
      const expl = disconnectExplanation('local_disconnect');
      expect(expl.tokensRemoved).toBe(true);
      expect(expl.retainedImportedCopies).toBe(true);
      expect(expl.remoteOriginalDeleted).toBe(false);
      expect(expl.message).toContain('Local disconnect removed stored Google tokens');
      expect(expl.message).toContain('Imported/offline copies remain in Daynori');
      expect(expl.message).toContain('remote Drive originals were not trashed');
    });
  });

  describe('6. Actual-Byte Transfer, Checksums, and Malware Quarantine', () => {
    it('verifies byte transfer integrity, persists checksum, and updates availability to imported', async () => {
      await connectFake(clientA, workspaceAId);
      const testFileId = 'byte-transfer-file-1';
      fakeProvider.seedAuthorizedFile(
        {
          id: testFileId,
          name: 'report.png',
          mimeType: 'image/png',
          md5Checksum: 'md5-report',
          version: '1',
          trashed: false,
          isShortcut: false,
          isSharedDrive: false,
          shortcutTargetId: null,
        },
        SYNTHETIC_PNG_BYTES
      );

      const selected = await clientA.selectDriveFile(workspaceAId, {
        providerFileId: testFileId,
        displayName: 'report.png',
        mimeType: 'image/png',
        linkMode: 'import_copy',
        isShortcut: false,
        isSharedDrive: false,
      });

      const row = await getConnectionRow(workspaceAId, userAId);
      const gen = Number(row!.generation);

      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (dbClient) => {
          const handled = await handleDriveJob(dbClient as never, 'drive_import_copy', {
            driveJobId: selected.data.jobId!,
            connectionId: selected.data.linkedFile.connectionId,
            workspaceId: workspaceAId,
            accountId: userAId,
            linkedFileId: selected.data.linkedFile.id,
            connectionGeneration: gen,
            providerFileId: testFileId,
            exportMimeType: null,
            folderId: null,
            localFileItemId: null,
            idempotencyKey: `import_copy:${testFileId}:none`,
          });
          expect(handled.status).toBe('completed');
        }
      );

      const files = await clientA.listDriveLinkedFiles(workspaceAId);
      const linked = files.data.find((f) => f.providerFileId === testFileId);
      expect(linked?.availability).toBe('imported');
      expect(linked?.localFileItemId).toBeTruthy();
      expect(linked?.checksum).toBeTruthy();
    });

    it('quarantines malicious payloads and refuses to mark as imported', async () => {
      await connectFake(clientA, workspaceAId);
      const eicarPayload = Buffer.from(
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
      );
      const eicarId = 'eicar-payload-p87';
      fakeProvider.seedAuthorizedFile(
        {
          id: eicarId,
          name: 'eicar.com',
          mimeType: 'text/plain',
          md5Checksum: 'eicar-md5',
          version: '1',
          trashed: false,
          isShortcut: false,
          isSharedDrive: false,
          shortcutTargetId: null,
        },
        eicarPayload
      );

      const selected = await clientA.selectDriveFile(workspaceAId, {
        providerFileId: eicarId,
        displayName: 'eicar.com',
        mimeType: 'text/plain',
        linkMode: 'import_copy',
        isShortcut: false,
        isSharedDrive: false,
      });

      const row = await getConnectionRow(workspaceAId, userAId);
      const gen = Number(row!.generation);

      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (dbClient) => {
          const result = await executeDriveBackgroundJob(dbClient, {
            driveJobId: selected.data.jobId!,
            connectionId: selected.data.linkedFile.connectionId,
            workspaceId: workspaceAId,
            accountId: userAId,
            linkedFileId: selected.data.linkedFile.id,
            connectionGeneration: gen,
            providerFileId: eicarId,
            exportMimeType: null,
            folderId: null,
            localFileItemId: null,
            idempotencyKey: `import_copy:${eicarId}:none`,
          });
          expect(result.status).toBe('failed');
          expect(result.errorCode).toMatch(/quarantine|rejected|malware|scan/i);
        }
      );

      const files = await clientA.listDriveLinkedFiles(workspaceAId);
      const linked = files.data.find((f) => f.providerFileId === eicarId);
      expect(linked?.availability).not.toBe('imported');
    });
  });

  describe('7. Upload Reconciliation and Idempotency Tracking', () => {
    it('returns existing remote file on retried upload with identical idempotency key', async () => {
      const token = 'fake-access-upload-token';
      const uploadPayload = {
        name: 'sync-doc.txt',
        mimeType: 'text/plain',
        bytes: Buffer.from('synchronization test content'),
        idempotencyKey: 'upload:workspaceA:item123:rev1',
      };

      const first = await fakeProvider.uploadAppFile(token, uploadPayload);
      const second = await fakeProvider.uploadAppFile(token, uploadPayload);

      expect(first.id).toBe(second.id);
      expect(first.md5Checksum).toBe(second.md5Checksum);
    });
  });

  describe('8. Error Classification and Object Support Constraints', () => {
    it('classifies HTTP errors accurately into domain exceptions', () => {
      expect(classifyGoogleHttpError(401, 'Invalid Credentials').code).toBe('invalid_grant');
      expect(classifyGoogleHttpError(400, 'invalid_grant error').code).toBe('invalid_grant');
      expect(classifyGoogleHttpError(429, 'Rate Limit Exceeded').code).toBe('rate_limited');
      expect(
        classifyGoogleHttpError(403, 'userRateLimitExceeded: quota exceeded for user').code
      ).toBe('rate_limited');
      expect(
        classifyGoogleHttpError(403, 'storageQuotaExceeded: user has exceeded storage quota').code
      ).toBe('drive_quota_exceeded');
      expect(
        classifyGoogleHttpError(403, 'insufficientPermissions: not allowed to view').code
      ).toBe('permission_denied');
      expect(classifyGoogleHttpError(404, 'File not found').code).toBe('not_found');
      expect(classifyGoogleHttpError(500, 'Internal Server Error').code).toBe('http_500');
    });

    it('rejects shortcuts and shared drives from unsupported selected-object modes', () => {
      const shortcutEvaluation = evaluateSelectedObjectSupport({
        providerFileId: 'shortcut-1',
        mimeType: 'application/vnd.google-apps.shortcut',
        name: 'Shortcut to Doc',
        isShortcut: true,
        isSharedDrive: false,
      });
      expect(shortcutEvaluation.supported).toBe(false);

      const sharedDriveEvaluation = evaluateSelectedObjectSupport({
        providerFileId: 'sd-item-1',
        mimeType: 'application/pdf',
        name: 'Shared Team Doc.pdf',
        isShortcut: false,
        isSharedDrive: true,
      });
      expect(sharedDriveEvaluation.supported).toBe(false);
    });
  });

  describe('9. Vault Strict Exclusion Guard', () => {
    it('strictly identifies vault and encrypted vault items and blocks Drive operations', () => {
      expect(isVaultDriveTarget('vault')).toBe(true);
      expect(isVaultDriveTarget('vault_item')).toBe(true);
      expect(isVaultDriveTarget('encrypted_vault')).toBe(true);

      // Non-vault items are not flagged as vault
      expect(isVaultDriveTarget('general_note')).toBe(false);
      expect(isVaultDriveTarget('file_item')).toBe(false);
      expect(isVaultDriveTarget('routine_attachment')).toBe(false);
      expect(isVaultDriveTarget('vault_secret')).toBe(false);
      expect(isVaultDriveTarget(null)).toBe(false);
      expect(isVaultDriveTarget(undefined)).toBe(false);
    });
  });

  describe('10. Fail-Closed Provider Architecture and Production Gate', () => {
    it('fails closed when GoogleDriveProvider is instantiated without OAuth credentials', () => {
      const prevId = process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID'];
      const prevSec = process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET'];
      delete process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID'];
      delete process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET'];

      expect(() => new GoogleDriveProvider()).toThrow(DriveProviderUnavailableError);

      if (prevId) process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID'] = prevId;
      if (prevSec) process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET'] = prevSec;
    });

    it('fails closed when GoogleDriveProvider has credentials but DAYNORI_DRIVE_PRODUCTION_ENABLED is not true', () => {
      process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID'] = 'dummy-client-id';
      process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET'] = 'dummy-client-secret';
      process.env['DAYNORI_DRIVE_PRODUCTION_ENABLED'] = 'false';

      expect(() => new GoogleDriveProvider()).toThrow(/disabled until DAYNORI_DRIVE_PRODUCTION_ENABLED=true/i);

      delete process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID'];
      delete process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET'];
      delete process.env['DAYNORI_DRIVE_PRODUCTION_ENABLED'];
    });

    it('strictly forbids FakeGoogleDriveProvider in production runtime', () => {
      setDriveProviderForTests(null);
      const prevNode = process.env['NODE_ENV'];
      const prevMode = process.env['DAYNORI_DRIVE_PROVIDER'];
      const prevInject = process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'];

      process.env['NODE_ENV'] = 'production';
      delete process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'];
      process.env['DAYNORI_DRIVE_PROVIDER'] = 'fake';

      expect(() => getDriveProvider()).toThrow(
        /Fake Drive provider is rejected in production runtimes/i
      );

      process.env['NODE_ENV'] = prevNode;
      process.env['DAYNORI_DRIVE_PROVIDER'] = prevMode ?? 'fake';
      if (prevInject !== undefined) process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'] = prevInject;
      setDriveProviderForTests(fakeProvider);
    });

    it('unconfigured stub provider rejects all mutations with fail-closed error', async () => {
      setDriveProviderForTests(null);
      const prevMode = process.env['DAYNORI_DRIVE_PROVIDER'];
      process.env['DAYNORI_DRIVE_PROVIDER'] = 'google_production';
      delete process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID'];
      delete process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET'];

      const provider = getDriveProvider();
      expect(provider.kind).toBe('unconfigured');

      await expect(
        provider.exchangeAuthorizationCode({
          code: 'any',
          codeVerifier: 'any',
          redirectUri: 'any',
        })
      ).rejects.toThrow(/unconfigured/i);

      await expect(provider.downloadFile('any-token', 'file-id')).rejects.toThrow(
        /unconfigured/i
      );

      process.env['DAYNORI_DRIVE_PROVIDER'] = prevMode ?? 'fake';
      setDriveProviderForTests(fakeProvider);
    });
  });
});
