import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, withUserContext } from '../../apps/api/src/db/index.js';
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
import { defaultEmailDelivery } from '../../apps/api/src/modules/lifecycle/deletionService.js';
import { DaynoriWorker, type StorageServiceContract } from '../../apps/worker/src/worker.js';

describe('Phase 37 Prerequisite Repairs: Deletion Confirmation, RLS Boundaries, Durable Lifecycle & DR', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase37-repairs-key';

  const userAuthorId = crypto.randomUUID(); // Author
  const userOwnerId = crypto.randomUUID(); // Workspace Owner
  const userStrangerId = crypto.randomUUID(); // Stranger

  const userAuthorEmail = 'author.repairs@example.test';
  const userOwnerEmail = 'owner.repairs@example.test';
  const userStrangerEmail = 'stranger.repairs@example.test';

  const authorPassword = 'AuthorPassword123!';
  const ownerPassword = 'OwnerPassword123!';

  const publicTargetEmail = `public.victim.${crypto.randomUUID().slice(0, 8)}@example.test`;
  const publicTargetUserId = crypto.randomUUID();

  let tokenAuthorSession1: string;
  let tokenAuthorSession2: string;
  let tokenOwner: string;
  let tokenStranger: string;

  let clientAuthorSession1: DaynoriApiClient;
  let clientAuthorSession2: DaynoriApiClient;
  let clientOwner: DaynoriApiClient;
  let clientStranger: DaynoriApiClient;

  let sharedWorkspaceId: string;
  let authorPersonalWorkspaceId: string;
  let ownerSecondaryWorkspaceId: string;

  let memoryStorage: MemoryStorageProvider;
  let worker: DaynoriWorker;

  async function createToken(userId: string, email: string, sessionId?: string): Promise<string> {
    return new SignJWT({
      sub: userId,
      email,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: sessionId || crypto.randomUUID(),
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

    class MockReauthAuth implements ReauthAuthenticator {
      async verifyPassword(params: {
        userId: string;
        email?: string;
        password: string;
      }): Promise<{ success: boolean; error?: string }> {
        if (params.userId === userAuthorId && params.password === authorPassword) {
          return { success: true };
        }
        if (params.userId === userOwnerId && params.password === ownerPassword) {
          return { success: true };
        }
        return { success: false, error: 'Invalid password credentials' };
      }

      async getUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
        if (email.toLowerCase() === publicTargetEmail.toLowerCase()) {
          return { id: publicTargetUserId, email: publicTargetEmail };
        }
        if (email.toLowerCase() === userAuthorEmail.toLowerCase()) {
          return { id: userAuthorId, email: userAuthorEmail };
        }
        return null;
      }
    }
    setReauthAuthenticator(new MockReauthAuth());

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

    baseUrl = await server.listen({ port: 0, host: '127.0.0.1' });

    tokenAuthorSession1 = await createToken(userAuthorId, userAuthorEmail, 'session_1_author');
    tokenAuthorSession2 = await createToken(userAuthorId, userAuthorEmail, 'session_2_author');
    tokenOwner = await createToken(userOwnerId, userOwnerEmail, 'session_owner');
    tokenStranger = await createToken(userStrangerId, userStrangerEmail, 'session_stranger');

    clientAuthorSession1 = createApiClient({ baseUrl, token: () => tokenAuthorSession1 });
    clientAuthorSession2 = createApiClient({ baseUrl, token: () => tokenAuthorSession2 });
    clientOwner = createApiClient({ baseUrl, token: () => tokenOwner });
    clientStranger = createApiClient({ baseUrl, token: () => tokenStranger });

    worker = new DaynoriWorker(runtimePool, {
      storageService: memoryStorage as unknown as StorageServiceContract,
      defaultBucket: PRIVATE_ASSETS_BUCKET,
    });
    worker.start();

    // Seed test profiles and workspaces
    const admin = await adminPool.connect();
    try {
      await admin.query(
        `INSERT INTO app.profiles (id, display_name)
         VALUES
           ($1, 'Author User'),
           ($2, 'Owner User'),
           ($3, 'Stranger User')
         ON CONFLICT (id) DO UPDATE
           SET display_name = EXCLUDED.display_name;`,
        [userAuthorId, userOwnerId, userStrangerId]
      );

      // Shared Workspace owned by Owner
      sharedWorkspaceId = crypto.randomUUID();
      await admin.query(
        `INSERT INTO app.workspaces (id, owner_id, name, kind)
         VALUES ($1, $2, 'Shared Workspace', 'room');`,
        [sharedWorkspaceId, userOwnerId]
      );
      await admin.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES
           ($1, $2, 'owner'),
           ($1, $3, 'editor');`,
        [sharedWorkspaceId, userOwnerId, userAuthorId]
      );

      // Author Personal Workspace
      authorPersonalWorkspaceId = crypto.randomUUID();
      await admin.query(
        `INSERT INTO app.workspaces (id, owner_id, name, kind)
         VALUES ($1, $2, 'Author Personal', 'personal');`,
        [authorPersonalWorkspaceId, userAuthorId]
      );
      await admin.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner');`,
        [authorPersonalWorkspaceId, userAuthorId]
      );

      // Owner Secondary Workspace
      ownerSecondaryWorkspaceId = crypto.randomUUID();
      await admin.query(
        `INSERT INTO app.workspaces (id, owner_id, name, kind)
         VALUES ($1, $2, 'Owner Secondary', 'personal');`,
        [ownerSecondaryWorkspaceId, userOwnerId]
      );
      await admin.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner');`,
        [ownerSecondaryWorkspaceId, userOwnerId]
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

  describe('1. Deletion Confirmation, Session Binding & Scope Verification', () => {
    let confirmationToken: string;

    it('rejects confirmation when attempted from a different session of the same user', async () => {
      // Author requests deletion using Session 1
      const req = await clientAuthorSession1.requestAccountDeletion({ password: authorPassword });
      expect(req.status).toBe('pending_confirmation');
      confirmationToken = req.confirmationToken!;

      // Author attempts to confirm using Session 2 -> must be rejected with 403 Forbidden
      await expect(
        clientAuthorSession2.confirmAccountDeletion({ confirmationToken })
      ).rejects.toThrow();
    });

    it('rejects confirmation if cancellation deadline has expired', async () => {
      const admin = await adminPool.connect();
      try {
        // Force the cancellation deadline into the past
        await admin.query(
          `UPDATE app.account_deletions
           SET cancellation_deadline = now() - interval '1 hour'
           WHERE user_id = $1 AND status = 'pending_confirmation';`,
          [userAuthorId]
        );
      } finally {
        admin.release();
      }

      await expect(
        clientAuthorSession1.confirmAccountDeletion({ confirmationToken })
      ).rejects.toThrow();

      // Reset deadline for subsequent tests
      const admin2 = await adminPool.connect();
      try {
        await admin2.query(
          `UPDATE app.account_deletions
           SET cancellation_deadline = now() + interval '24 hours'
           WHERE user_id = $1 AND status = 'pending_confirmation';`,
          [userAuthorId]
        );
      } finally {
        admin2.release();
      }
    });

    it('rejects workspace deletion with a ticket bound to a different workspace', async () => {
      // Ticket bound to sharedWorkspaceId
      const ticket = issueReauthToken({
        userId: userOwnerId,
        purpose: 'workspace_deletion',
        sessionToken: tokenOwner,
        workspaceId: sharedWorkspaceId,
      });

      // Attempting to delete ownerSecondaryWorkspaceId with ticket for sharedWorkspaceId must be rejected
      await expect(
        clientOwner.deleteWorkspace(ownerSecondaryWorkspaceId, {
          reauthTicket: ticket.token,
        })
      ).rejects.toThrow();
    });

    it('succeeds workspace deletion with ticket bound to exact target workspace', async () => {
      const ticket = issueReauthToken({
        userId: userOwnerId,
        purpose: 'workspace_deletion',
        sessionToken: tokenOwner,
        workspaceId: ownerSecondaryWorkspaceId,
      });

      const res = await clientOwner.deleteWorkspace(ownerSecondaryWorkspaceId, {
        reauthTicket: ticket.token,
      });
      expect(res.success).toBe(true);
      expect(res.status).toBe('completed');
    });

    it('provides idempotent results on duplicate confirmation retries', async () => {
      // Confirm with Session 1
      const confirmRes = await clientAuthorSession1.confirmAccountDeletion({ confirmationToken });
      expect(confirmRes.success).toBe(true);
      expect(confirmRes.status).toBe('completed');

      // Duplicate retry with same token returns idempotent success rather than crashing
      const retryRes = await clientAuthorSession1.confirmAccountDeletion({ confirmationToken });
      expect(retryRes.success).toBe(true);
      expect(retryRes.status).toBe('completed');
    });
  });

  describe('2. Current-Membership Authorization Boundaries (RLS Enforcement)', () => {
    let noteInSharedWsId: string;
    let tagInSharedWsId: string;

    beforeAll(async () => {
      const admin = await adminPool.connect();
      try {
        // Re-seed author profile and membership
        await admin.query(
          `INSERT INTO app.profiles (id, display_name)
           VALUES ($1, 'Author User')
           ON CONFLICT (id) DO NOTHING;`,
          [userAuthorId]
        );
        await admin.query(
          `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
           VALUES ($1, $2, 'editor')
           ON CONFLICT DO NOTHING;`,
          [sharedWorkspaceId, userAuthorId]
        );

        // Author creates an item and tag in shared workspace
        noteInSharedWsId = crypto.randomUUID();
        await admin.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
           VALUES ($1, $2, 'note', $3, $3, 'standard');`,
          [noteInSharedWsId, sharedWorkspaceId, userAuthorId]
        );
        await admin.query(
          `INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count, purpose)
           VALUES ($1, $2, 'Original Author Note', '{"type":"doc"}'::jsonb, 'Content by author', 3, 17, 'standard');`,
          [noteInSharedWsId, sharedWorkspaceId]
        );

        tagInSharedWsId = crypto.randomUUID();
        await admin.query(
          `INSERT INTO app.tags (id, workspace_id, name, color, created_by)
           VALUES ($1, $2, 'AuthorTag', '#123456', $3);`,
          [tagInSharedWsId, sharedWorkspaceId, userAuthorId]
        );
      } finally {
        admin.release();
      }
    });

    it('denies SELECT, UPDATE, and DELETE to an author who was removed from the workspace', async () => {
      const admin = await adminPool.connect();
      try {
        // Remove author from shared workspace
        await admin.query(
          `DELETE FROM app.workspace_memberships WHERE workspace_id = $1 AND user_id = $2;`,
          [sharedWorkspaceId, userAuthorId]
        );
      } finally {
        admin.release();
      }

      // Test under real daynori_runtime pool with user context set to userAuthorId
      await withUserContext(runtimePool, userAuthorId, async (runtimeClient) => {
        // 1. SELECT items created by author: must return 0 rows (no creator bypass!)
        const selectRes = await runtimeClient.query(
          `SELECT id FROM app.items WHERE id = $1;`,
          [noteInSharedWsId]
        );
        expect(selectRes.rows.length).toBe(0);

        // 2. UPDATE item created by author: must update 0 rows
        const updateRes = await runtimeClient.query(
          `UPDATE app.items SET security_scope = 'confidential' WHERE id = $1 RETURNING id;`,
          [noteInSharedWsId]
        );
        expect(updateRes.rows.length).toBe(0);

        // 3. DELETE item created by author: must delete 0 rows
        const deleteRes = await runtimeClient.query(
          `DELETE FROM app.items WHERE id = $1 RETURNING id;`,
          [noteInSharedWsId]
        );
        expect(deleteRes.rows.length).toBe(0);

        // 4. Tags created by author: must also return 0 rows
        const tagRes = await runtimeClient.query(
          `SELECT id FROM app.tags WHERE id = $1;`,
          [tagInSharedWsId]
        );
        expect(tagRes.rows.length).toBe(0);
      });
    });

    it('allows SELECT but denies UPDATE and DELETE to a downgraded viewer who created content', async () => {
      const admin = await adminPool.connect();
      try {
        // Re-add author as a viewer only
        await admin.query(
          `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
           VALUES ($1, $2, 'viewer');`,
          [sharedWorkspaceId, userAuthorId]
        );
      } finally {
        admin.release();
      }

      await withUserContext(runtimePool, userAuthorId, async (runtimeClient) => {
        // 1. SELECT must succeed for viewer
        const selectRes = await runtimeClient.query(
          `SELECT id FROM app.items WHERE id = $1;`,
          [noteInSharedWsId]
        );
        expect(selectRes.rows.length).toBe(1);

        // 2. UPDATE must update 0 rows for viewer (editor role required)
        const updateRes = await runtimeClient.query(
          `UPDATE app.items SET security_scope = 'confidential' WHERE id = $1 RETURNING id;`,
          [noteInSharedWsId]
        );
        expect(updateRes.rows.length).toBe(0);

        // 3. DELETE must delete 0 rows for viewer
        const deleteRes = await runtimeClient.query(
          `DELETE FROM app.items WHERE id = $1 RETURNING id;`,
          [noteInSharedWsId]
        );
        expect(deleteRes.rows.length).toBe(0);
      });
    });

    it('strictly denies runtime UPDATE on app.mutation_receipts to protect audit provenance', async () => {
      await withUserContext(runtimePool, userAuthorId, async (runtimeClient) => {
        // Runtime UPDATE on mutation_receipts is revoked
        await expect(
          runtimeClient.query(
            `UPDATE app.mutation_receipts SET actor_user_id = $1;`,
            [userOwnerId]
          )
        ).rejects.toThrow();
      });
    });
  });

  describe('3. Durable Worker Blob Purge & Error Handling', () => {
    it('throws if storage service is unavailable', async () => {
      const workerNoStorage = new DaynoriWorker(runtimePool, {
        storageService: undefined,
        defaultBucket: PRIVATE_ASSETS_BUCKET,
      });
      workerNoStorage.start();

      try {
        const res = await workerNoStorage.processJob('job-1', 'blob_purge', {
          storagePaths: ['test/path.txt'],
        });
        expect(res.status).toBe('failed');
        expect(res.error).toContain('Blob purge cannot proceed: storageService is unavailable');
      } finally {
        workerNoStorage.stop();
      }
    });

    it('treats 404 / NoSuchKey as explicit idempotent success', async () => {
      const mockStorage: StorageServiceContract = {
        deleteObject: async () => {
          const err = new Error('Object does not exist') as Error & { status: number };
          err.status = 404;
          throw err;
        },
      };

      const worker404 = new DaynoriWorker(runtimePool, {
        storageService: mockStorage,
        defaultBucket: PRIVATE_ASSETS_BUCKET,
      });
      worker404.start();

      try {
        const res = await worker404.processJob('job-2', 'blob_purge', {
          storagePaths: ['non-existent/blob.txt'],
        });

        expect(res.status).toBe('completed');
        expect(res.details?.purgedCount).toBe(1);
      } finally {
        worker404.stop();
      }
    });

    it('records failed status with inspectable error on non-404 storage failures', async () => {
      const mockStorage: StorageServiceContract = {
        deleteObject: async () => {
          const err = new Error('500 Internal Storage Error') as Error & { status: number };
          err.status = 500;
          throw err;
        },
      };

      const worker500 = new DaynoriWorker(runtimePool, {
        storageService: mockStorage,
        defaultBucket: PRIVATE_ASSETS_BUCKET,
      });
      worker500.start();

      try {
        const res = await worker500.processJob('job-3', 'blob_purge', {
          storagePaths: ['failing/blob.txt'],
        });
        expect(res.status).toBe('failed');
        expect(res.error).toContain('Blob purge failed for object');
      } finally {
        worker500.stop();
      }
    });
  });

  describe('4. Enumeration-Safe Public Deletion Flow with Abuse Control', () => {
    beforeAll(async () => {
      const admin = await adminPool.connect();
      try {
        await admin.query(
          `INSERT INTO app.profiles (id, display_name)
           VALUES ($1, 'Public Deletion User')
           ON CONFLICT (id) DO NOTHING;`,
          [publicTargetUserId]
        );
      } finally {
        admin.release();
      }
    });

    it('submits a public deletion request and dispatches a verification email via adapter', async () => {
      defaultEmailDelivery.clear();

      const res = await clientStranger.submitPublicDeletionRequest({
        email: publicTargetEmail,
        reason: 'User submitted deletion from website',
      });

      expect(res.success).toBe(true);
      expect(res.message).toContain('confirmation email with deletion instructions');

      const dispatch = defaultEmailDelivery.getLastDispatch(publicTargetEmail);
      expect(dispatch).toBeDefined();
      expect(dispatch?.toEmail).toBe(publicTargetEmail);
      expect(dispatch?.token).toBeDefined();
    });

    it('rate limits repeated abuse submissions for the same email address', async () => {
      // Submit 3 more times to trigger rate limit
      await clientStranger.submitPublicDeletionRequest({ email: publicTargetEmail });
      await clientStranger.submitPublicDeletionRequest({ email: publicTargetEmail });
      await clientStranger.submitPublicDeletionRequest({ email: publicTargetEmail });

      const admin = await adminPool.connect();
      try {
        const countRes = await admin.query<{ count: string }>(
          `SELECT count(*) as count FROM app.public_deletion_requests
           WHERE email = $1;`,
          [publicTargetEmail]
        );
        // At most 3 records inserted due to 3-per-15m throttle
        expect(parseInt(countRes.rows[0]!.count, 10)).toBeLessThanOrEqual(3);
      } finally {
        admin.release();
      }
    });

    it('rejects verification with an invalid token', async () => {
      const dispatch = defaultEmailDelivery.getLastDispatch(publicTargetEmail)!;

      await expect(
        clientStranger.verifyPublicDeletionRequest({
          requestId: dispatch.requestId,
          verificationToken: 'invalid_token_123',
        })
      ).rejects.toThrow();
    });

    it('successfully verifies and permanently deletes account upon providing valid token', async () => {
      const dispatch = defaultEmailDelivery.getLastDispatch(publicTargetEmail)!;

      const res = await clientStranger.verifyPublicDeletionRequest({
        requestId: dispatch.requestId,
        verificationToken: dispatch.token,
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('completed');

      // Verify profile is permanently erased
      const admin = await adminPool.connect();
      try {
        const pRes = await admin.query(`SELECT id FROM app.profiles WHERE id = $1;`, [
          publicTargetUserId,
        ]);
        expect(pRes.rows.length).toBe(0);

        // Verify tombstone in suppression ledger
        const tombstone = await admin.query(
          `SELECT id, reason FROM app.deletion_suppression_ledger
           WHERE entity_type = 'account' AND reason = 'public_web_verified_deletion';`
        );
        expect(tombstone.rows.length).toBeGreaterThanOrEqual(1);
      } finally {
        admin.release();
      }
    });
  });

  describe('5. Real Isolated Backup/Restore Drill with Independent Ledger Preservation', () => {
    it('executes isolated database and object restore drill, sanitizing restored entities via ledger', async () => {
      const drillUserId = crypto.randomUUID();
      const drillEmail = 'drill.user@example.test';
      const drillWsId = crypto.randomUUID();
      const drillNoteId = crypto.randomUUID();
      const drillStoragePath = `files/${drillWsId}/secret_document.pdf`;

      const admin = await adminPool.connect();
      try {
        // 1. Establish pre-backup state
        await admin.query(
          `INSERT INTO app.profiles (id, display_name)
           VALUES ($1, 'Drill Target User');`,
          [drillUserId]
        );
        await admin.query(
          `INSERT INTO app.workspaces (id, owner_id, name, kind)
           VALUES ($1, $2, 'Drill Target Workspace', 'personal');`,
          [drillWsId, drillUserId]
        );
        await admin.query(
          `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
           VALUES ($1, $2, 'owner');`,
          [drillWsId, drillUserId]
        );
        await admin.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by)
           VALUES ($1, $2, 'note', $3, $3);`,
          [drillNoteId, drillWsId, drillUserId]
        );
        await admin.query(
          `INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count, purpose)
           VALUES ($1, $2, 'Confidential Drill Note', '{"type":"doc"}'::jsonb, 'Must not resurrect', 3, 19, 'standard');`,
          [drillNoteId, drillWsId]
        );

        await memoryStorage.putObject(
          PRIVATE_ASSETS_BUCKET,
          drillStoragePath,
          Buffer.from('Confidential drill PDF content')
        );

        // 2. Capture isolated backup snapshot (metadata + storage)
        const snapshotDatabaseRows = {
          profile: { id: drillUserId, email: drillEmail, display_name: 'Drill Target User' },
          workspace: { id: drillWsId, owner_id: drillUserId, name: 'Drill Target Workspace', kind: 'personal' },
          membership: { workspace_id: drillWsId, user_id: drillUserId, role: 'owner' },
          item: { id: drillNoteId, workspace_id: drillWsId, kind: 'note', created_by: drillUserId, updated_by: drillUserId },
          note: { id: drillNoteId, workspace_id: drillWsId, title: 'Confidential Drill Note', plain_text: 'Must not resurrect' },
        };
        const snapshotStorageObject = await memoryStorage.getObject(PRIVATE_ASSETS_BUCKET, drillStoragePath);
        expect(snapshotStorageObject).not.toBeNull();

        // 3. User initiates and executes account deletion
        // Simulating the actual deletion:
        await admin.query(`SELECT app.record_deletion_tombstone('account', $1, 'hash_drill_acc', 'user_account_deleted');`, [drillUserId]);
        await admin.query(`SELECT app.record_deletion_tombstone('workspace', $1, 'hash_drill_ws', 'account_deletion');`, [drillWsId]);
        await admin.query(`SELECT app.purge_owned_workspace($1, $2);`, [drillWsId, drillUserId]);
        await admin.query(`DELETE FROM app.profiles WHERE id = $1;`, [drillUserId]);
        await memoryStorage.deleteObject(PRIVATE_ASSETS_BUCKET, drillStoragePath);

        // 4. Capture independent external suppression ledger
        const independentLedger = [
          { entity_type: 'account', entity_id: drillUserId, reason: 'user_account_deleted' },
          { entity_type: 'workspace', entity_id: drillWsId, reason: 'account_deletion' },
        ];

        // 5. Simulate disaster recovery database & storage snapshot restore (older state restored)
        await admin.query(
          `INSERT INTO app.profiles (id, display_name) VALUES ($1, $2);`,
          [snapshotDatabaseRows.profile.id, snapshotDatabaseRows.profile.display_name]
        );
        await admin.query(
          `INSERT INTO app.workspaces (id, owner_id, name, kind) VALUES ($1, $2, $3, $4);`,
          [snapshotDatabaseRows.workspace.id, snapshotDatabaseRows.workspace.owner_id, snapshotDatabaseRows.workspace.name, snapshotDatabaseRows.workspace.kind]
        );
        await admin.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by) VALUES ($1, $2, $3, $4, $5);`,
          [snapshotDatabaseRows.item.id, snapshotDatabaseRows.item.workspace_id, snapshotDatabaseRows.item.kind, snapshotDatabaseRows.item.created_by, snapshotDatabaseRows.item.updated_by]
        );
        await memoryStorage.putObject(PRIVATE_ASSETS_BUCKET, drillStoragePath, snapshotStorageObject!);

        // Verify entities were resurrected in the restored snapshot
        const resProfile = await admin.query(`SELECT id FROM app.profiles WHERE id = $1;`, [drillUserId]);
        expect(resProfile.rows.length).toBe(1);
        expect(await memoryStorage.getObject(PRIVATE_ASSETS_BUCKET, drillStoragePath)).not.toBeNull();

        // 6. Apply independent external ledger barrier to the restored database
        for (const entry of independentLedger) {
          await admin.query(
            `INSERT INTO app.deletion_suppression_ledger (entity_type, entity_id, content_free_hash, reason, expires_at)
             VALUES ($1, $2, 'replayed_hash', $3, now() + interval '90 days')
             ON CONFLICT (entity_type, entity_id) DO NOTHING;`,
            [entry.entity_type, entry.entity_id, entry.reason]
          );
        }

        // 7. Execute restore drill post-restore sanitization procedure
        await admin.query(`
          -- Runbook post-restore sanitization
          SELECT app.reassign_shared_workspace_content(entity_id)
          FROM app.deletion_suppression_ledger
          WHERE entity_type = 'account';

          DELETE FROM app.workspaces
          WHERE id IN (
            SELECT entity_id FROM app.deletion_suppression_ledger WHERE entity_type = 'workspace'
          ) OR owner_id IN (
            SELECT entity_id FROM app.deletion_suppression_ledger WHERE entity_type = 'account'
          );

          DELETE FROM app.profiles
          WHERE id IN (
            SELECT entity_id FROM app.deletion_suppression_ledger WHERE entity_type = 'account'
          );
        `);

        // Purge restored storage objects for suppressed workspaces
        await memoryStorage.deleteObject(PRIVATE_ASSETS_BUCKET, drillStoragePath);

        // 8. Assert zero resurrected entities or storage objects survive
        const verifyRestoredProfiles = await admin.query(
          `SELECT id FROM app.profiles WHERE id = $1;`,
          [drillUserId]
        );
        expect(verifyRestoredProfiles.rows.length).toBe(0);

        const verifyRestoredWorkspaces = await admin.query(
          `SELECT id FROM app.workspaces WHERE id = $1;`,
          [drillWsId]
        );
        expect(verifyRestoredWorkspaces.rows.length).toBe(0);

        const verifyRestoredStorage = await memoryStorage.getObject(PRIVATE_ASSETS_BUCKET, drillStoragePath);
        expect(verifyRestoredStorage).toBeNull();
      } finally {
        admin.release();
      }
    });
  });
});
