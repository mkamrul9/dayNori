import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import {
  MemoryStorageProvider,
  setDefaultStorageProvider,
} from '../../apps/api/src/modules/files/storageAdapter.js';
import {
  issueReauthToken,
  setReauthSecretForTesting,
  setReauthAuthenticator,
  type ReauthAuthenticator,
} from '../../apps/api/src/modules/portability/reauth.js';
import { PRIVATE_ASSETS_BUCKET } from '../../apps/api/src/modules/files/service.js';
import { DaynoriWorker, type StorageServiceContract } from '../../apps/worker/src/worker.js';

describe('Phase 36: Account Deletion, Backup and Recovery Lifecycle Integration Tests', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase36-deletion-key';

  const userAId = crypto.randomUUID(); // Alice (Account deletion candidate)
  const userBId = crypto.randomUUID(); // Bob (Workspace deletion candidate & shared collaborator)
  const userCId = crypto.randomUUID(); // Eve (Unauthorized actor)

  const userAEmail = 'alice.deletion@example.test';
  const userBEmail = 'bob.retention@example.test';
  const userCEmail = 'eve.attacker@example.test';

  const userAPassword = 'AliceValidPassword123!';
  const userBPassword = 'BobValidPassword123!';

  let tokenUserA: string;
  let tokenUserB: string;
  let tokenUserC: string;

  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let clientC: DaynoriApiClient;

  let workspaceAId: string;
  let workspaceB1Id: string;
  let workspaceB2Id: string;

  let memoryStorage: MemoryStorageProvider;
  let worker: DaynoriWorker;

  let fileAObjectPath: string;
  let exportAStoragePath: string;

  async function createToken(userId: string, email: string): Promise<string> {
    return new SignJWT({
      sub: userId,
      email,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
  }

  beforeAll(async () => {
    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    migrator = new Migrator();
    await migrator.migrate();

    memoryStorage = new MemoryStorageProvider();
    setDefaultStorageProvider(memoryStorage);

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    setReauthSecretForTesting('daynori-reauth-test-secret-with-sufficient-entropy-32-chars');

    class TestReauthAuthenticator implements ReauthAuthenticator {
      async verifyPassword(params: {
        userId: string;
        email?: string;
        password: string;
      }): Promise<{ success: boolean; error?: string }> {
        if (!params.password) {
          return { success: false, error: 'Password is required' };
        }
        if (params.userId === userAId && params.password === userAPassword) {
          return { success: true };
        }
        if (params.userId === userBId && params.password === userBPassword) {
          return { success: true };
        }
        return { success: false, error: 'Invalid password credentials' };
      }
    }
    setReauthAuthenticator(new TestReauthAuthenticator());

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
      allowedAlgorithms: ['RS256'],
    });

    server = buildServer({
      runtimePool,
      jwtVerifier: verifier,
      allowUnauthenticatedStartup: false,
    });

    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;

    tokenUserA = await createToken(userAId, userAEmail);
    tokenUserB = await createToken(userBId, userBEmail);
    tokenUserC = await createToken(userCId, userCEmail);

    clientA = createApiClient({ baseUrl, token: () => tokenUserA });
    clientB = createApiClient({ baseUrl, token: () => tokenUserB });
    clientC = createApiClient({ baseUrl, token: () => tokenUserC });

    worker = new DaynoriWorker(runtimePool, {
      storageService: memoryStorage as unknown as StorageServiceContract,
      defaultBucket: PRIVATE_ASSETS_BUCKET,
    });
    worker.start();

    // Seed test profiles and workspaces directly
    const admin = await adminPool.connect();
    try {
      await admin.query(
        `
        INSERT INTO app.profiles (id, display_name, preferences)
        VALUES
          ($1, 'Alice Exporter', '{"themeMode":"light"}'::jsonb),
          ($2, 'Bob Importer', '{"themeMode":"dark"}'::jsonb),
          ($3, 'Eve Attacker', '{"themeMode":"light"}'::jsonb)
        ON CONFLICT (id) DO UPDATE
          SET preferences = EXCLUDED.preferences;
      `,
        [userAId, userBId, userCId]
      );

      // Workspace A (owned by Alice)
      workspaceAId = crypto.randomUUID();
      await admin.query(
        `
        INSERT INTO app.workspaces (id, owner_id, name, kind)
        VALUES ($1, $2, 'Alice Personal Workspace', 'personal');
      `,
        [workspaceAId, userAId]
      );

      await admin.query(
        `
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
        VALUES ($1, $2, 'owner');
      `,
        [workspaceAId, userAId]
      );

      // Seed items in Workspace A
      const noteAId = crypto.randomUUID();
      await admin.query(
        `
        INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
        VALUES ($1, $2, 'note', $3, $3, 'standard');
      `,
        [noteAId, workspaceAId, userAId]
      );

      await admin.query(
        `
        INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count, purpose)
        VALUES ($1, $2, 'Alice Secret Note', '{"type": "doc"}'::jsonb, 'Confidential information', 2, 24, 'standard');
      `,
        [noteAId, workspaceAId]
      );

      const taskAId = crypto.randomUUID();
      await admin.query(
        `
        INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
        VALUES ($1, $2, 'todo', $3, $3, 'standard');
      `,
        [taskAId, workspaceAId, userAId]
      );

      await admin.query(
        `
        INSERT INTO app.tasks (id, workspace_id, title, status, priority)
        VALUES ($1, $2, 'Alice Task', 'todo', 'high');
      `,
        [taskAId, workspaceAId]
      );

      // Seed file in Workspace A and upload to memory storage
      const fileAId = crypto.randomUUID();
      fileAObjectPath = `files/${workspaceAId}/${fileAId}/sample.txt`;
      await memoryStorage.putObject(
        PRIVATE_ASSETS_BUCKET,
        fileAObjectPath,
        Buffer.from('Alice file content'),
        {
          contentType: 'text/plain',
        }
      );

      await admin.query(
        `
        INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
        VALUES ($1, $2, 'file', $3, $3, 'standard');
      `,
        [fileAId, workspaceAId, userAId]
      );

      await admin.query(
        `
        INSERT INTO app.file_items (id, workspace_id, object_path, file_name, byte_size, declared_mime_type, detected_mime_type, sha256_checksum, quarantine_status, created_by)
        VALUES ($1, $2, $3, 'sample.txt', 18, 'text/plain', 'text/plain', 'test_checksum', 'verified', $4);
      `,
        [fileAId, workspaceAId, fileAObjectPath, userAId]
      );

      // Seed export artifact in Workspace A
      const exportAId = crypto.randomUUID();
      exportAStoragePath = `exports/${workspaceAId}/${exportAId}.zip`;
      await memoryStorage.putObject(
        PRIVATE_ASSETS_BUCKET,
        exportAStoragePath,
        Buffer.from('Mock ZIP archive'),
        {
          contentType: 'application/zip',
        }
      );

      await admin.query(
        `
        INSERT INTO app.workspace_exports (id, workspace_id, user_id, session_hash, status, storage_path, manifest, expires_at)
        VALUES ($1, $2, $3, 'hash_alice', 'completed', $4, '{"version":"1.0.0"}'::jsonb, now() + interval '1 day');
      `,
        [exportAId, workspaceAId, userAId, exportAStoragePath]
      );

      // Workspace B1 (owned by Bob, room kind allows collaborators)
      workspaceB1Id = crypto.randomUUID();
      await admin.query(
        `
        INSERT INTO app.workspaces (id, owner_id, name, kind)
        VALUES ($1, $2, 'Bob Shared Room', 'room');
      `,
        [workspaceB1Id, userBId]
      );

      await admin.query(
        `
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
        VALUES ($1, $2, 'owner');
      `,
        [workspaceB1Id, userBId]
      );

      // Alice is also a collaborator in Workspace B1
      await admin.query(
        `
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
        VALUES ($1, $2, 'editor');
      `,
        [workspaceB1Id, userAId]
      );

      // Alice created a note in Workspace B1
      const sharedNoteId = crypto.randomUUID();
      await admin.query(
        `
        INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
        VALUES ($1, $2, 'note', $3, $3, 'standard');
      `,
        [sharedNoteId, workspaceB1Id, userAId]
      );

      await admin.query(
        `
        INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count, purpose)
        VALUES ($1, $2, 'Shared Note by Alice', '{"type": "doc"}'::jsonb, 'Collaborative content', 2, 21, 'standard');
      `,
        [sharedNoteId, workspaceB1Id]
      );

      // Workspace B2 (owned by Bob, will be deleted separately)
      workspaceB2Id = crypto.randomUUID();
      await admin.query(
        `
        INSERT INTO app.workspaces (id, owner_id, name, kind)
        VALUES ($1, $2, 'Bob Secondary Workspace', 'personal');
      `,
        [workspaceB2Id, userBId]
      );

      await admin.query(
        `
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
        VALUES ($1, $2, 'owner');
      `,
        [workspaceB2Id, userBId]
      );
    } finally {
      admin.release();
    }
  });

  afterAll(async () => {
    if (worker) worker.stop();
    if (server) await server.close();
    if (adminPool) await adminPool.end();
    if (runtimePool) await runtimePool.end();
  });

  describe('1. Reauthentication & Deletion Request Security', () => {
    it('rejects account deletion request without reauthentication credentials', async () => {
      await expect(clientA.requestAccountDeletion({})).rejects.toThrow();
    });

    it('rejects account deletion request with invalid password', async () => {
      await expect(
        clientA.requestAccountDeletion({ password: 'WrongPassword123!' })
      ).rejects.toThrow();
    });

    it('rejects account deletion request with ticket issued for a different purpose', async () => {
      const wrongPurposeTicket = issueReauthToken({
        userId: userAId,
        purpose: 'workspace_export',
        sessionToken: tokenUserA,
      });

      await expect(
        clientA.requestAccountDeletion({ reauthTicket: wrongPurposeTicket.token })
      ).rejects.toThrow();
    });

    it('succeeds with valid password and returns confirmation token and retention disclosure', async () => {
      const res = await clientA.requestAccountDeletion({ password: userAPassword });
      expect(res.deletionId).toBeDefined();
      expect(res.status).toBe('pending_confirmation');
      expect(res.confirmationRequired).toBe(true);
      expect(res.confirmationToken).toBeDefined();
      expect(res.cancellationDeadline).toBeDefined();
      expect(res.retainedDataDisclosure).toContain('permanently deleted upon confirmation');
      expect(res.retainedDataDisclosure).toContain('suppression ledger');
    });

    it('succeeds with valid reauth ticket bound to purpose account_deletion', async () => {
      const validTicket = issueReauthToken({
        userId: userAId,
        purpose: 'account_deletion',
        sessionToken: tokenUserA,
      });

      const res = await clientA.requestAccountDeletion({ reauthTicket: validTicket.token });
      expect(res.deletionId).toBeDefined();
      expect(res.status).toBe('pending_confirmation');
      expect(res.confirmationToken).toBeDefined();
    });
  });

  describe('2. Cancellation Lifecycle', () => {
    let pendingDeletionToken: string;

    it('allows user to query pending deletion status and cancel the request', async () => {
      const reqRes = await clientA.requestAccountDeletion({ password: userAPassword });
      pendingDeletionToken = reqRes.confirmationToken!;

      const statusRes = await clientA.getAccountDeletionStatus();
      expect(statusRes.status).toBe('pending_confirmation');
      expect(statusRes.cancellationDeadline).toBeDefined();

      const cancelRes = await clientA.cancelAccountDeletion({ reason: 'Changed my mind' });
      expect(cancelRes.success).toBe(true);
      expect(cancelRes.status).toBe('cancelled');

      const updatedStatus = await clientA.getAccountDeletionStatus();
      expect(updatedStatus.status).toBe('cancelled');
    });

    it('rejects confirmation of a cancelled deletion request', async () => {
      await expect(
        clientA.confirmAccountDeletion({ confirmationToken: pendingDeletionToken })
      ).rejects.toThrow();
    });
  });

  describe('3. Account Deletion Execution & Permanent Data Erasure', () => {
    let freshConfirmationToken: string;

    it('requests fresh deletion and confirms execution with confirmation token', async () => {
      const reqRes = await clientA.requestAccountDeletion({ password: userAPassword });
      freshConfirmationToken = reqRes.confirmationToken!;

      const confirmRes = await clientA.confirmAccountDeletion({
        confirmationToken: freshConfirmationToken,
      });

      expect(confirmRes.success).toBe(true);
      expect(confirmRes.status).toBe('completed');
      expect(confirmRes.message).toContain('permanently erased');
    });

    it('verifies complete erasure of user profile, owned workspaces, notes, and tasks in DB', async () => {
      const admin = await adminPool.connect();
      try {
        // User profile must be erased
        const pRes = await admin.query(`SELECT id FROM app.profiles WHERE id = $1;`, [userAId]);
        expect(pRes.rows.length).toBe(0);

        // Workspace A must be erased
        const wsRes = await admin.query(`SELECT id FROM app.workspaces WHERE id = $1;`, [
          workspaceAId,
        ]);
        expect(wsRes.rows.length).toBe(0);

        // Notes and Tasks in Workspace A must be erased
        const notesRes = await admin.query(`SELECT id FROM app.notes WHERE workspace_id = $1;`, [
          workspaceAId,
        ]);
        expect(notesRes.rows.length).toBe(0);

        const tasksRes = await admin.query(`SELECT id FROM app.tasks WHERE workspace_id = $1;`, [
          workspaceAId,
        ]);
        expect(tasksRes.rows.length).toBe(0);
      } finally {
        admin.release();
      }
    });

    it('verifies private storage objects were purged from storage provider', async () => {
      const fileBytes = await memoryStorage.getObject(PRIVATE_ASSETS_BUCKET, fileAObjectPath);
      expect(fileBytes).toBeNull();

      const exportBytes = await memoryStorage.getObject(PRIVATE_ASSETS_BUCKET, exportAStoragePath);
      expect(exportBytes).toBeNull();
    });

    it('verifies content created by deleted user in shared workspaces is cleanly reassigned to owner', async () => {
      const admin = await adminPool.connect();
      try {
        // Alice should no longer be a member of Workspace B1
        const memRes = await admin.query(
          `SELECT role FROM app.workspace_memberships WHERE workspace_id = $1 AND user_id = $2;`,
          [workspaceB1Id, userAId]
        );
        expect(memRes.rows.length).toBe(0);

        // Note created by Alice in Workspace B1 must be reassigned to Bob (owner)
        const noteRes = await admin.query<{ created_by: string; updated_by: string }>(
          `SELECT i.created_by, i.updated_by
           FROM app.items i
           JOIN app.notes n ON n.id = i.id
           WHERE i.workspace_id = $1 AND n.title = 'Shared Note by Alice';`,
          [workspaceB1Id]
        );
        expect(noteRes.rows.length).toBe(1);
        expect(noteRes.rows[0]!.created_by).toBe(userBId);
        expect(noteRes.rows[0]!.updated_by).toBe(userBId);
      } finally {
        admin.release();
      }
    });
  });

  describe('4. Token Revocation & Immediate Session Invalidation', () => {
    it('immediately rejects subsequent API calls with the deleted session token as 401 Unauthorized', async () => {
      await expect(clientA.listWorkspaces()).rejects.toThrow();
    });

    it('verifies token hash is recorded in app.revoked_tokens', async () => {
      const admin = await adminPool.connect();
      try {
        const tokenHash = crypto.createHash('sha256').update(tokenUserA).digest('hex');
        const revRes = await admin.query(
          `SELECT id, revocation_reason FROM app.revoked_tokens WHERE token_hash = $1;`,
          [tokenHash]
        );
        expect(revRes.rows.length).toBe(1);
        expect(revRes.rows[0]!.revocation_reason).toBe('account_deletion');
      } finally {
        admin.release();
      }
    });
  });

  describe('5. Suppression Ledger Enforcement', () => {
    it('verifies content-free tombstones for account and workspace exist in deletion suppression ledger', async () => {
      const admin = await adminPool.connect();
      try {
        const accountTombstone = await admin.query(
          `SELECT id, entity_type, entity_id, reason, expires_at
           FROM app.deletion_suppression_ledger
           WHERE entity_type = 'account' AND entity_id = $1;`,
          [userAId]
        );
        expect(accountTombstone.rows.length).toBe(1);
        expect(accountTombstone.rows[0]!.reason).toBe('user_account_deleted');

        const wsTombstone = await admin.query(
          `SELECT id, entity_type, entity_id, reason
           FROM app.deletion_suppression_ledger
           WHERE entity_type = 'workspace' AND entity_id = $1;`,
          [workspaceAId]
        );
        expect(wsTombstone.rows.length).toBe(1);
        expect(wsTombstone.rows[0]!.reason).toBe('account_deletion');
      } finally {
        admin.release();
      }
    });
  });

  describe('6. Distinct Single Workspace Deletion (Preserving User Account)', () => {
    it('rejects workspace deletion by non-owner', async () => {
      await expect(
        clientC.deleteWorkspace(workspaceB2Id, { password: 'WrongPassword!' })
      ).rejects.toThrow();
    });

    it('allows workspace owner Bob to delete Workspace B2 with password reauth', async () => {
      const res = await clientB.deleteWorkspace(workspaceB2Id, { password: userBPassword });
      expect(res.success).toBe(true);
      expect(res.workspaceId).toBe(workspaceB2Id);
      expect(res.status).toBe('completed');
    });

    it('verifies Workspace B2 is purged while Workspace B1 and Bob user account remain intact', async () => {
      const admin = await adminPool.connect();
      try {
        // Workspace B2 purged
        const ws2Res = await admin.query(`SELECT id FROM app.workspaces WHERE id = $1;`, [
          workspaceB2Id,
        ]);
        expect(ws2Res.rows.length).toBe(0);

        // Workspace B1 intact
        const ws1Res = await admin.query(`SELECT id FROM app.workspaces WHERE id = $1;`, [
          workspaceB1Id,
        ]);
        expect(ws1Res.rows.length).toBe(1);

        // Bob's profile intact
        const profileRes = await admin.query(
          `SELECT id, display_name FROM app.profiles WHERE id = $1;`,
          [userBId]
        );
        expect(profileRes.rows.length).toBe(1);
        expect(profileRes.rows[0]!.display_name).toBe('Bob Importer');

        // Bob can still access API normally
        const bobWorkspaces = await clientB.listWorkspaces();
        expect(bobWorkspaces.data.some((w) => w.id === workspaceB1Id)).toBe(true);
      } finally {
        admin.release();
      }
    });
  });

  describe('7. Disaster Recovery Restore Drill & Suppression Ledger Re-application', () => {
    it('simulates a restored database containing pre-deletion data and verifies sanitization via ledger', async () => {
      const admin = await adminPool.connect();
      try {
        // 1. Simulate a restored historical snapshot that resurrects Alice's profile and workspace
        await admin.query(
          `
          INSERT INTO app.profiles (id, display_name)
          VALUES ($1, 'Resurrected Alice')
          ON CONFLICT (id) DO NOTHING;
        `,
          [userAId]
        );

        const resurrectedWsId = crypto.randomUUID();
        await admin.query(
          `
          INSERT INTO app.workspaces (id, owner_id, name, kind)
          VALUES ($1, $2, 'Resurrected Workspace', 'room');
        `,
          [resurrectedWsId, userAId]
        );

        // Also add resurrected workspace into suppression ledger to test workspace tombstone
        await admin.query(
          `
          INSERT INTO app.deletion_suppression_ledger (entity_type, entity_id, content_free_hash, reason, expires_at)
          VALUES ('workspace', $1, 'hash_resurrected_ws', 'test_drill', now() + interval '90 days');
        `,
          [resurrectedWsId]
        );

        // 2. Execute the official Runbook restoration drill sanitization query
        await admin.query(`
          -- Runbook Step: purge workspaces suppressed by ledger
          DELETE FROM app.workspaces
          WHERE id IN (
            SELECT entity_id FROM app.deletion_suppression_ledger WHERE entity_type = 'workspace'
          ) OR owner_id IN (
            SELECT entity_id FROM app.deletion_suppression_ledger WHERE entity_type = 'account'
          );

          -- Runbook Step: purge profiles suppressed by ledger
          DELETE FROM app.profiles
          WHERE id IN (
            SELECT entity_id FROM app.deletion_suppression_ledger WHERE entity_type = 'account'
          );
        `);

        // 3. Verify zero resurrected profiles or workspaces survive
        const verifyProfiles = await admin.query<{ count: number }>(`
          SELECT count(*)::int as count
          FROM app.profiles p
          JOIN app.deletion_suppression_ledger l ON l.entity_id = p.id AND l.entity_type = 'account';
        `);
        expect(verifyProfiles.rows[0]!.count).toBe(0);

        const verifyWorkspaces = await admin.query<{ count: number }>(`
          SELECT count(*)::int as count
          FROM app.workspaces w
          JOIN app.deletion_suppression_ledger l ON l.entity_id = w.id AND l.entity_type = 'workspace';
        `);
        expect(verifyWorkspaces.rows[0]!.count).toBe(0);
      } finally {
        admin.release();
      }
    });
  });

  describe('8. Worker Storage Blob Purge Job', () => {
    it('executes blob_purge task successfully in worker to clean up residual private storage objects', async () => {
      const testPath1 = `purge_test/blob1.txt`;
      const testPath2 = `purge_test/blob2.txt`;

      await memoryStorage.putObject(PRIVATE_ASSETS_BUCKET, testPath1, Buffer.from('data1'));
      await memoryStorage.putObject(PRIVATE_ASSETS_BUCKET, testPath2, Buffer.from('data2'));

      expect(await memoryStorage.getObject(PRIVATE_ASSETS_BUCKET, testPath1)).not.toBeNull();
      expect(await memoryStorage.getObject(PRIVATE_ASSETS_BUCKET, testPath2)).not.toBeNull();

      // Enqueue job into app.background_jobs
      const admin = await adminPool.connect();
      try {
        await admin.query('DELETE FROM app.background_jobs');
        await admin.query(
          `
          INSERT INTO app.background_jobs (task_type, payload)
          VALUES ('blob_purge', $1);
        `,
          [JSON.stringify({ storagePaths: [testPath1, testPath2] })]
        );
      } finally {
        admin.release();
      }

      const jobResult = await worker.pollAndProcessNextJob();

      expect(jobResult).not.toBeNull();
      expect(jobResult?.status).toBe('completed');
      expect(jobResult?.details?.purgedCount).toBe(2);

      // Verify physical deletion from memory storage
      expect(await memoryStorage.getObject(PRIVATE_ASSETS_BUCKET, testPath1)).toBeNull();
      expect(await memoryStorage.getObject(PRIVATE_ASSETS_BUCKET, testPath2)).toBeNull();
    });
  });

  describe('9. Public Web Deletion Request Resource (Play Policy Compliance)', () => {
    it('submits a public deletion request and returns an enumeration-safe disclosure response', async () => {
      const res = await clientC.submitPublicDeletionRequest({
        email: 'anyone@example.com',
        reason: 'Requested from public web resource',
      });

      expect(res.success).toBe(true);
      expect(res.message).toContain('confirmation email with deletion instructions');
      expect(res.disclosure).toContain('permanently deleted upon confirmation');
    });
  });
});
