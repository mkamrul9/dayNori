import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import {
  createAdminPool,
  createRuntimePool,
  withTenantContext,
} from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import {
  createApiClient,
  DaynoriApiClient,
  ApiConflictError,
  ApiForbiddenError,
} from '@daynori/api-client';
import { encodeSyncCursor } from '../../apps/api/src/modules/sync/types.js';

describe('Phase 12: Server Mutation Receipts and Change Feed Integration', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase12-sync-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let tokenUserA: string;
  let tokenUserB: string;

  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;

  let workspaceAId: string;
  let workspaceBId: string;

  const deviceIdA = 'device-alice-phone';
  const deviceIdB = 'device-bob-tablet';

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
    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    // 1. Run migrations to ensure 00010_server_mutation_receipts_and_change_feed.sql is applied
    migrator = new Migrator();
    await migrator.migrate();

    // 2. Setup JWT Key Pair & Tokens
    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    server = buildServer({
      runtimePool,
      jwtVerifier: verifier,
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const address = server.server.address();
    if (typeof address === 'object' && address !== null) {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }

    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    // 3. Provision personal workspaces for Alice and Bob
    const wsARes = await clientA.provisionPersonalWorkspace({ displayName: 'Alice' });
    workspaceAId = wsARes.data.workspace.id;

    const wsBRes = await clientB.provisionPersonalWorkspace({ displayName: 'Bob' });
    workspaceBId = wsBRes.data.workspace.id;
  });

  afterAll(async () => {
    if (server) await server.close();
    if (migrator) await migrator.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  describe('1. Canonical Mutation Envelopes & Foundation Commands', () => {
    const itemId = crypto.randomUUID();
    const op1 = crypto.randomUUID();
    let currentSeq = 0;

    it('creates an item via sync push, recording receipt, change, and outbox intent', async () => {
      const res = await clientA.syncPush({
        commands: [
          {
            operationId: op1,
            deviceId: deviceIdA,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'createItem',
            entityType: 'item',
            entityId: itemId,
            baseRevision: 0,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: {
              kind: 'note',
              rank: '0|hzzzzz:',
              securityScope: 'standard',
            },
          },
        ],
      });

      expect(res.data.results).toHaveLength(1);
      const result = res.data.results[0]!;
      expect(result.operationId).toBe(op1);
      expect(result.status).toBe('accepted');
      expect(result.entityId).toBe(itemId);
      expect(result.revision).toBe(1);
      expect(result.seq).toBeGreaterThan(0);
      currentSeq = result.seq!;

      // Verify item exists in database
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (client) => {
          const itemRes = await client.query('SELECT * FROM app.items WHERE id = $1', [itemId]);
          expect(itemRes.rows).toHaveLength(1);
          expect(Number(itemRes.rows[0].revision)).toBe(1);
          expect(itemRes.rows[0].kind).toBe('note');

          // Verify outbox intent was generated
          const outboxRes = await client.query(
            "SELECT * FROM app.outbox_intents WHERE workspace_id = $1 AND event_type = 'item.created'",
            [workspaceAId]
          );
          expect(outboxRes.rows.length).toBeGreaterThan(0);
        }
      );
    });

    it('updates item revision and records monotonic change sequence', async () => {
      const op2 = crypto.randomUUID();
      const res = await clientA.syncPush({
        commands: [
          {
            operationId: op2,
            deviceId: deviceIdA,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'updateItem',
            entityType: 'item',
            entityId: itemId,
            baseRevision: 1,
            dependencyOperationIds: [op1],
            clientTimestamp: new Date().toISOString(),
            payload: {
              rank: '0|i00000:',
            },
          },
        ],
      });

      expect(res.data.results).toHaveLength(1);
      const result = res.data.results[0]!;
      expect(result.status).toBe('accepted');
      expect(result.revision).toBe(2);
      expect(result.seq).toBe(currentSeq + 1);
      currentSeq = result.seq!;
    });

    it('applies flag updates: pinItem and archiveItem', async () => {
      const op3 = crypto.randomUUID();
      const op4 = crypto.randomUUID();

      const res = await clientA.syncPush({
        commands: [
          {
            operationId: op3,
            deviceId: deviceIdA,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'pinItem',
            entityType: 'item',
            entityId: itemId,
            baseRevision: 2,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: {},
          },
          {
            operationId: op4,
            deviceId: deviceIdA,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'archiveItem',
            entityType: 'item',
            entityId: itemId,
            baseRevision: 3,
            dependencyOperationIds: [op3],
            clientTimestamp: new Date().toISOString(),
            payload: {},
          },
        ],
      });

      expect(res.data.results).toHaveLength(2);
      expect(res.data.results[0]?.status).toBe('accepted');
      expect(res.data.results[0]?.revision).toBe(3);
      expect(res.data.results[1]?.status).toBe('accepted');
      expect(res.data.results[1]?.revision).toBe(4);
    });

    it('applies trashItem as tombstone and restoreItem', async () => {
      const opTrash = crypto.randomUUID();
      const resTrash = await clientA.syncPush({
        commands: [
          {
            operationId: opTrash,
            deviceId: deviceIdA,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'trashItem',
            entityType: 'item',
            entityId: itemId,
            baseRevision: 4,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: {},
          },
        ],
      });

      expect(resTrash.data.results[0]?.status).toBe('accepted');
      expect(resTrash.data.results[0]?.revision).toBe(5);

      // Verify item is tombstoned
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (client) => {
          const itemRes = await client.query('SELECT deleted_at FROM app.items WHERE id = $1', [
            itemId,
          ]);
          expect(itemRes.rows[0].deleted_at).not.toBeNull();
        }
      );

      // Restore item
      const opRestore = crypto.randomUUID();
      const resRestore = await clientA.syncPush({
        commands: [
          {
            operationId: opRestore,
            deviceId: deviceIdA,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'restoreItem',
            entityType: 'item',
            entityId: itemId,
            baseRevision: 5,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: {},
          },
        ],
      });

      expect(resRestore.data.results[0]?.status).toBe('accepted');
      expect(resRestore.data.results[0]?.revision).toBe(6);

      // Verify item restored
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (client) => {
          const itemRes = await client.query('SELECT deleted_at FROM app.items WHERE id = $1', [
            itemId,
          ]);
          expect(itemRes.rows[0].deleted_at).toBeNull();
        }
      );
    });
  });

  describe('2. Durable Idempotency & Conflict Semantics', () => {
    const testItemId = crypto.randomUUID();
    const testOpId = crypto.randomUUID();

    it('returns exact durable receipt on sequential identical retry without new change seq', async () => {
      const cmd = {
        operationId: testOpId,
        deviceId: deviceIdA,
        workspaceId: workspaceAId,
        commandVersion: 1,
        schemaVersion: 1,
        command: 'createItem' as const,
        entityType: 'item' as const,
        entityId: testItemId,
        baseRevision: 0,
        dependencyOperationIds: [],
        clientTimestamp: new Date().toISOString(),
        payload: { kind: 'task' },
      };

      const firstRes = await clientA.syncPush({ commands: [cmd] });
      expect(firstRes.data.results[0]?.status).toBe('accepted');
      const firstSeq = firstRes.data.results[0]?.seq;
      const firstRev = firstRes.data.results[0]?.revision;

      // Duplicate retry
      const retryRes = await clientA.syncPush({ commands: [cmd] });
      expect(retryRes.data.results[0]?.status).toBe('accepted');
      expect(retryRes.data.results[0]?.seq).toBe(firstSeq);
      expect(retryRes.data.results[0]?.revision).toBe(firstRev);
      expect(retryRes.data.results[0]?.operationId).toBe(testOpId);
    });

    it('handles concurrent identical retries safely returning the durable receipt', async () => {
      const concurrentOp = crypto.randomUUID();
      const concurrentItem = crypto.randomUUID();

      const cmd = {
        operationId: concurrentOp,
        deviceId: deviceIdA,
        workspaceId: workspaceAId,
        commandVersion: 1,
        schemaVersion: 1,
        command: 'createItem' as const,
        entityType: 'item' as const,
        entityId: concurrentItem,
        baseRevision: 0,
        dependencyOperationIds: [],
        clientTimestamp: new Date().toISOString(),
        payload: { kind: 'routine' },
      };

      const [res1, res2] = await Promise.all([
        clientA.syncPush({ commands: [cmd] }),
        clientA.syncPush({ commands: [cmd] }),
      ]);

      expect(res1.data.results[0]?.status).toBe('accepted');
      expect(res2.data.results[0]?.status).toBe('accepted');
      expect(res1.data.results[0]?.seq).toBe(res2.data.results[0]?.seq);
      expect(res1.data.results[0]?.revision).toBe(res2.data.results[0]?.revision);
    });

    it('rejects operationId reuse with modified payload as IDEMPOTENCY_KEY_REUSED', async () => {
      const reusedCmd = {
        operationId: testOpId, // Reusing existing opId
        deviceId: deviceIdA,
        workspaceId: workspaceAId,
        commandVersion: 1,
        schemaVersion: 1,
        command: 'createItem' as const,
        entityType: 'item' as const,
        entityId: testItemId,
        baseRevision: 0,
        dependencyOperationIds: [],
        clientTimestamp: new Date().toISOString(),
        payload: { kind: 'DIFFERENT_PAYLOAD' }, // Different content
      };

      const res = await clientA.syncPush({ commands: [reusedCmd] });
      expect(res.data.results[0]?.status).toBe('rejected');
      expect(res.data.results[0]?.error?.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('rejects operationId reuse across different workspace as IDEMPOTENCY_KEY_REUSED', async () => {
      // Create a shared workspace where Alice is also an editor
      const sharedWsRes = await clientA.createWorkspace({
        name: 'Room Workspace For Alice',
        kind: 'room',
      });
      const sharedWsId = sharedWsRes.data.id;

      const reusedAcrossWs = {
        operationId: testOpId, // Reusing existing opId
        deviceId: deviceIdA,
        workspaceId: sharedWsId, // Different workspace
        commandVersion: 1,
        schemaVersion: 1,
        command: 'createItem' as const,
        entityType: 'item' as const,
        entityId: testItemId,
        baseRevision: 0,
        dependencyOperationIds: [],
        clientTimestamp: new Date().toISOString(),
        payload: { kind: 'task' },
      };

      const res = await clientA.syncPush({ commands: [reusedAcrossWs] });
      expect(res.data.results[0]?.status).toBe('rejected');
      expect(res.data.results[0]?.error?.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('detects stale revision conflict and preserves server revision and state', async () => {
      const conflictItem = crypto.randomUUID();
      const opCreate = crypto.randomUUID();

      await clientA.syncPush({
        commands: [
          {
            operationId: opCreate,
            deviceId: deviceIdA,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'createItem',
            entityType: 'item',
            entityId: conflictItem,
            baseRevision: 0,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: { kind: 'note' },
          },
        ],
      });

      // Advance revision to 2
      const opAdvance = crypto.randomUUID();
      await clientA.syncPush({
        commands: [
          {
            operationId: opAdvance,
            deviceId: deviceIdA,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'updateItem',
            entityType: 'item',
            entityId: conflictItem,
            baseRevision: 1,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: { rank: '0|jzzzzz:' },
          },
        ],
      });

      // Now attempt update with stale baseRevision = 1 (server is at 2)
      const opStale = crypto.randomUUID();
      const resStale = await clientA.syncPush({
        commands: [
          {
            operationId: opStale,
            deviceId: deviceIdA,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'updateItem',
            entityType: 'item',
            entityId: conflictItem,
            baseRevision: 1, // Stale!
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: { rank: '0|k00000:' },
          },
        ],
      });

      expect(resStale.data.results[0]?.status).toBe('conflict');
      expect(resStale.data.results[0]?.error?.code).toBe('REVISION_CONFLICT');
      expect(resStale.data.results[0]?.error?.currentServerRevision).toBe(2);
      expect(resStale.data.results[0]?.error?.currentServerState).toBeDefined();
    });
  });

  describe('3. Commit-Safe Change Ordering & Monotonicity', () => {
    it('serializes concurrent writers on same workspace with strictly contiguous sequence numbers', async () => {
      // Launch 8 concurrent operations on workspaceA
      const concurrentOps = Array.from({ length: 8 }, (_, i) => ({
        operationId: crypto.randomUUID(),
        deviceId: `device-writer-${i}`,
        workspaceId: workspaceAId,
        commandVersion: 1,
        schemaVersion: 1,
        command: 'createItem' as const,
        entityType: 'item' as const,
        entityId: crypto.randomUUID(),
        baseRevision: 0,
        dependencyOperationIds: [],
        clientTimestamp: new Date().toISOString(),
        payload: { kind: 'note', rank: `rank-${i}` },
      }));

      const responses = await Promise.all(
        concurrentOps.map((cmd) => clientA.syncPush({ commands: [cmd] }))
      );

      const assignedSeqs = responses.map((r) => r.data.results[0]?.seq).sort((a, b) => a! - b!);

      // Verify all succeeded
      responses.forEach((r) => {
        expect(r.data.results[0]?.status).toBe('accepted');
      });

      // Verify sequences are strictly unique and contiguous
      for (let i = 1; i < assignedSeqs.length; i++) {
        expect(assignedSeqs[i]).toBe(assignedSeqs[i - 1]! + 1);
      }
    });
  });

  describe('4. Pull, Bootstrap & Cursor Lifecycles', () => {
    it('pulls changes monotonically and supports bounded pagination', async () => {
      // Pull first 3 changes
      const page1 = await clientA.syncPull({
        workspaceId: workspaceAId,
        limit: 3,
      });

      expect(page1.data.changes).toHaveLength(3);
      expect(page1.data.hasMore).toBe(true);
      expect(page1.data.nextCursor).toBeDefined();

      // Pull next page with cursor
      const page2 = await clientA.syncPull({
        workspaceId: workspaceAId,
        cursor: page1.data.nextCursor,
        limit: 3,
      });

      expect(page2.data.changes.length).toBeGreaterThan(0);
      // Ensure sequence numbers on page 2 are strictly greater than page 1
      const maxSeqP1 = Math.max(...page1.data.changes.map((c) => c.seq));
      const minSeqP2 = Math.min(...page2.data.changes.map((c) => c.seq));
      expect(minSeqP2).toBeGreaterThan(maxSeqP1);
    });

    it('rejects expired cursor (>90 days) with SYNC_RESET_REQUIRED', async () => {
      const expiredTimestamp = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
      const expiredCursor = encodeSyncCursor({
        v: 1,
        ws: workspaceAId,
        seq: 1,
        epoch: 'epoch-1',
        ts: expiredTimestamp,
      });

      await expect(
        clientA.syncPull({
          workspaceId: workspaceAId,
          cursor: expiredCursor,
        })
      ).rejects.toThrow(ApiConflictError);
    });

    it('rejects cursor with mismatched access epoch with SYNC_RESET_REQUIRED', async () => {
      const mismatchedEpochCursor = encodeSyncCursor({
        v: 1,
        ws: workspaceAId,
        seq: 1,
        epoch: 'epoch-invalid-never-existed',
        ts: new Date().toISOString(),
      });

      await expect(
        clientA.syncPull({
          workspaceId: workspaceAId,
          cursor: mismatchedEpochCursor,
        })
      ).rejects.toThrow(ApiConflictError);
    });

    it('bootstraps active workspace items with consistent watermark cursor', async () => {
      const bootstrapRes = await clientA.syncBootstrap({
        workspaceId: workspaceAId,
      });

      expect(bootstrapRes.data.items.length).toBeGreaterThan(0);
      expect(bootstrapRes.data.watermarkCursor).toBeDefined();
      expect(bootstrapRes.data.accessEpoch).toBeDefined();

      // Ensure no tombstoned/deleted items are returned in bootstrap
      bootstrapRes.data.items.forEach((item) => {
        expect(item.deletedAt).toBeNull();
      });

      // Pull changes using watermarkCursor: should yield 0 new changes
      const afterBootstrapPull = await clientA.syncPull({
        workspaceId: workspaceAId,
        cursor: bootstrapRes.data.watermarkCursor,
      });

      expect(afterBootstrapPull.data.changes).toHaveLength(0);
      expect(afterBootstrapPull.data.hasMore).toBe(false);
    });
  });

  describe('5. Cross-Tenant Authorization & revoking access', () => {
    it('rejects User B pushing mutations to User A workspace with FORBIDDEN', async () => {
      const opB = crypto.randomUUID();
      const res = await clientB.syncPush({
        commands: [
          {
            operationId: opB,
            deviceId: deviceIdB,
            workspaceId: workspaceAId, // User A's workspace!
            commandVersion: 1,
            schemaVersion: 1,
            command: 'createItem',
            entityType: 'item',
            entityId: crypto.randomUUID(),
            baseRevision: 0,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: { kind: 'note' },
          },
        ],
      });

      expect(res.data.results[0]?.status).toBe('rejected');
      expect(res.data.results[0]?.error?.code).toBe('FORBIDDEN');
    });

    it('rejects User B pulling changes from User A workspace', async () => {
      await expect(
        clientB.syncPull({
          workspaceId: workspaceAId,
        })
      ).rejects.toThrow(ApiForbiddenError);
    });

    it('rejects User B bootstrapping User A workspace', async () => {
      await expect(
        clientB.syncBootstrap({
          workspaceId: workspaceAId,
        })
      ).rejects.toThrow(ApiForbiddenError);
    });

    it('rejects User A pulling changes from User B workspace', async () => {
      await expect(
        clientA.syncPull({
          workspaceId: workspaceBId,
        })
      ).rejects.toThrow(ApiForbiddenError);
    });
  });

  describe('6. Batch Behavior & Failure Isolation', () => {
    it('processes batch with partial success without rolling back successful commands', async () => {
      const validItemId = crypto.randomUUID();
      const conflictItemId = crypto.randomUUID();

      // Create conflictItem at revision 1
      await clientA.syncPush({
        commands: [
          {
            operationId: crypto.randomUUID(),
            deviceId: deviceIdA,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'createItem',
            entityType: 'item',
            entityId: conflictItemId,
            baseRevision: 0,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: { kind: 'task' },
          },
        ],
      });

      // Now send batch: Cmd 1 is valid createItem; Cmd 2 is conflicting updateItem (baseRevision 999)
      const opValid = crypto.randomUUID();
      const opConflict = crypto.randomUUID();

      const batchRes = await clientA.syncPush({
        commands: [
          {
            operationId: opValid,
            deviceId: deviceIdA,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'createItem',
            entityType: 'item',
            entityId: validItemId,
            baseRevision: 0,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: { kind: 'note' },
          },
          {
            operationId: opConflict,
            deviceId: deviceIdA,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'updateItem',
            entityType: 'item',
            entityId: conflictItemId,
            baseRevision: 999, // Wrong revision!
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: { rank: '0|xyz:' },
          },
        ],
      });

      expect(batchRes.data.results).toHaveLength(2);
      expect(batchRes.data.results[0]?.status).toBe('accepted');
      expect(batchRes.data.results[1]?.status).toBe('conflict');

      // Verify Cmd 1 was indeed committed
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (client) => {
          const itemRes = await client.query('SELECT * FROM app.items WHERE id = $1', [
            validItemId,
          ]);
          expect(itemRes.rows).toHaveLength(1);
        }
      );
    });
  });
});
