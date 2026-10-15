import crypto from 'node:crypto';
import 'fake-indexeddb/auto';
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
  type DaynoriApiClient,
} from '@daynori/api-client';
import {
  SyncEngine,
  ApiClientSyncTransport,
  BroadcastChannelTabCoordinator,
  type SyncTransportPort,
  type ItemHeaderRecord,
  type DraftRecord,
} from '@daynori/sync';
import {
  IndexedDbLocalRepository,
  clearAllLocalData,
  setTrustedDeviceConsent,
} from '../../apps/web/src/data/indexedDbRepository.js';

// In-memory localStorage mock for Node test runner
const memoryStorage = new Map<string, string>();
const globalWithStorage = globalThis as unknown as { localStorage?: Storage };
if (typeof globalWithStorage.localStorage === 'undefined') {
  globalWithStorage.localStorage = {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => memoryStorage.set(key, String(value)),
    removeItem: (key: string) => memoryStorage.delete(key),
    clear: () => memoryStorage.clear(),
    key: (_index: number) => null,
    length: 0,
  };
}

describe('Phase 13: Shared Client Synchronization Engine Integration Tests', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase13-sync-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let tokenUserA: string;
  let tokenUserB: string;

  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;

  let workspaceAId: string;
  let workspaceBId: string;

  const deviceIdA = 'device-engine-alice-01';
  const _deviceIdB = 'device-engine-bob-01';

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

    migrator = new Migrator();
    await migrator.migrate();

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

  describe('1. Offline Create/Edit followed by Reconnect', () => {
    it('saves mutation locally with "saved_locally" status, then synchronizes once reconnected', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const transport = new ApiClientSyncTransport(clientA);
      const engine = new SyncEngine({
        repository: repo,
        transport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: deviceIdA,
        initialNetworkStatus: 'offline',
        pollIntervalMs: 60000,
      });

      // 1. Start engine in offline state
      await engine.start();
      expect(engine.getNetworkStatus()).toBe('offline');

      // 2. Perform local write transaction (item + draft)
      const itemId = crypto.randomUUID();
      const itemHeader: ItemHeaderRecord = {
        id: itemId,
        workspaceId: workspaceAId,
        kind: 'note',
        folderId: null,
        rank: '0|offline:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const draft: DraftRecord = {
        id: crypto.randomUUID(),
        workspaceId: workspaceAId,
        userId: userAId,
        entityType: 'item',
        entityId: itemId,
        title: 'Offline Note',
        payload: { kind: 'note', content: 'Draft written offline' },
        savedAt: new Date().toISOString(),
        isQuarantined: false,
        quarantinedAt: null,
      };

      const mutation = await engine.saveItem(itemHeader, draft, 'createItem', { autoSync: false });
      expect(mutation.operationId).toBeDefined();

      // 3. Verify status: saved locally on device, cloud status is NOT synced
      const itemStateBefore = engine.getItemSyncState(itemId);
      expect(itemStateBefore.savedOnDevice).toBe(true);
      expect(itemStateBefore.cloudSyncStatus).toBe('saved_locally');
      expect(engine.getOverallCloudStatus()).toBe('saved_locally');

      // Verify pending mutation is stored in IndexedDB
      const pendingBefore = await repo.getPendingMutations(workspaceAId, userAId);
      expect(pendingBefore).toHaveLength(1);
      expect(pendingBefore[0].operationId).toBe(mutation.operationId);

      // Verify server does NOT have the item yet
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (db) => {
          const res = await db.query('SELECT * FROM app.items WHERE id = $1', [itemId]);
          expect(res.rows).toHaveLength(0);
        }
      );

      // 4. Reconnect network: engine triggers immediate sync
      engine.setNetworkStatus('online');
      expect(engine.getNetworkStatus()).toBe('online');

      // Await sync completion
      await engine.syncNow();

      // 5. Verify acknowledgment and status transition
      const itemStateAfter = engine.getItemSyncState(itemId);
      expect(itemStateAfter.savedOnDevice).toBe(true);
      expect(itemStateAfter.cloudSyncStatus).toBe('synced');
      expect(itemStateAfter.lastSyncedRevision).toBe(1);

      // Verify pending mutation queue is empty (acknowledged)
      const pendingAfter = await repo.getPendingMutations(workspaceAId, userAId);
      expect(pendingAfter).toHaveLength(0);

      // Verify server has committed the item with revision 1
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (db) => {
          const res = await db.query('SELECT * FROM app.items WHERE id = $1', [itemId]);
          expect(res.rows).toHaveLength(1);
          expect(Number(res.rows[0].revision)).toBe(1);
        }
      );

      await engine.stop();
      await repo.close();
    });
  });

  describe('2. Commit Followed by Lost Response (Idempotent Recovery)', () => {
    it('re-submits the exact operation on retry and recovers durable receipt without duplicate records', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const realTransport = new ApiClientSyncTransport(clientA);
      let simulateLostResponse = true;

      // Fault injection transport: commits on server but throws network error before returning
      const faultTransport: SyncTransportPort = {
        push: async (req) => {
          const res = await realTransport.push(req);
          if (simulateLostResponse) {
            simulateLostResponse = false;
            const netErr = new Error('Network timeout: connection reset after server commit');
            Object.assign(netErr, { code: 'NETWORK_ERROR' });
            throw netErr;
          }
          return res;
        },
        pull: (q) => realTransport.pull(q),
        bootstrap: (q) => realTransport.bootstrap(q),
      };

      const engine = new SyncEngine({
        repository: repo,
        transport: faultTransport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: deviceIdA,
        pollIntervalMs: 60000,
      });

      await engine.start();

      const itemId = crypto.randomUUID();
      const itemHeader: ItemHeaderRecord = {
        id: itemId,
        workspaceId: workspaceAId,
        kind: 'task',
        folderId: null,
        rank: '0|lost_res:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      await engine.saveItem(itemHeader, undefined, 'createItem', { autoSync: false });

      // First sync attempt will fail because response was lost after commit
      await engine.syncNow();
      expect(engine.getItemSyncState(itemId).cloudSyncStatus).toBe('saved_locally');

      // Verify item was actually committed on server
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (db) => {
          const res = await db.query('SELECT revision FROM app.items WHERE id = $1', [itemId]);
          expect(res.rows).toHaveLength(1);
          expect(Number(res.rows[0].revision)).toBe(1);
        }
      );

      // Second sync attempt (simulate reconnect retry with same operationId)
      await engine.syncNow();

      // State is now synced!
      expect(engine.getItemSyncState(itemId).cloudSyncStatus).toBe('synced');
      expect(engine.getItemSyncState(itemId).lastSyncedRevision).toBe(1);

      // Verify no duplicate change was generated on server
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (db) => {
          const changes = await db.query(
            'SELECT * FROM app.changes WHERE workspace_id = $1 AND entity_id = $2',
            [workspaceAId, itemId]
          );
          expect(changes.rows).toHaveLength(1);
        }
      );

      await engine.stop();
      await repo.close();
    });
  });

  describe('3. Restart Durability & Crash Recovery', () => {
    it('persists queue across engine restart and successfully drains on startup', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const transport = new ApiClientSyncTransport(clientA);

      // Engine 1 creates item offline and stops
      const engine1 = new SyncEngine({
        repository: repo,
        transport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: deviceIdA,
        initialNetworkStatus: 'offline',
      });

      await engine1.start();

      const itemId = crypto.randomUUID();
      const itemHeader: ItemHeaderRecord = {
        id: itemId,
        workspaceId: workspaceAId,
        kind: 'task',
        folderId: null,
        rank: '0|restart:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      await engine1.saveItem(itemHeader, undefined, 'createItem', { autoSync: false });
      await engine1.stop();

      // Verify pending mutation is durable on disk
      const pendingInDb = await repo.getPendingMutations(workspaceAId, userAId);
      expect(pendingInDb).toHaveLength(1);

      // Engine 2 restarts against the same repository
      const engine2 = new SyncEngine({
        repository: repo,
        transport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: deviceIdA,
      });

      await engine2.start();
      await engine2.syncNow();

      expect(engine2.getItemSyncState(itemId).cloudSyncStatus).toBe('synced');
      const pendingAfter = await repo.getPendingMutations(workspaceAId, userAId);
      expect(pendingAfter).toHaveLength(0);

      await engine2.stop();
      await repo.close();
    });
  });

  describe('4. Multi-Tab Coordination & Leader Election', () => {
    it('coordinates tabs: follower delegates sync to leader; leader failure triggers election', async () => {
      const channelName = `daynori_test_coord_${crypto.randomUUID()}`;

      const coord1 = new BroadcastChannelTabCoordinator({
        channelName,
        tabId: 'tab_leader_1',
        heartbeatIntervalMs: 200,
        leaseDurationMs: 600,
      });

      const coord2 = new BroadcastChannelTabCoordinator({
        channelName,
        tabId: 'tab_follower_2',
        heartbeatIntervalMs: 200,
        leaseDurationMs: 600,
      });

      coord1.start();
      // Allow coord1 to claim leadership
      await new Promise((r) => setTimeout(r, 400));
      expect(coord1.isLeader).toBe(true);

      coord2.start();
      await new Promise((r) => setTimeout(r, 300));
      // Coord2 detects active leader and remains follower
      expect(coord2.isLeader).toBe(false);

      // Verify sync request routing from follower to leader
      let leaderReceivedSyncRequest = false;
      coord1.onSyncRequested(() => {
        leaderReceivedSyncRequest = true;
      });

      coord2.requestSync();
      await new Promise((r) => setTimeout(r, 100));
      expect(leaderReceivedSyncRequest).toBe(true);

      // Simulate crash of leader tab 1
      coord1.stop();

      // Follower tab 2 should detect expired lease and claim leadership
      await new Promise((r) => setTimeout(r, 1000));
      expect(coord2.isLeader).toBe(true);

      coord2.stop();
    });
  });

  describe('5. Dependency Failures, Topological Ordering & Conflicts', () => {
    it('enforces dependency ordering and handles revision conflicts with explicit resolution', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const transport = new ApiClientSyncTransport(clientA);
      const engine = new SyncEngine({
        repository: repo,
        transport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: deviceIdA,
      });

      await engine.start();

      // 1. Create item online
      const itemId = crypto.randomUUID();
      const itemHeader: ItemHeaderRecord = {
        id: itemId,
        workspaceId: workspaceAId,
        kind: 'note',
        folderId: null,
        rank: '0|conflict_test:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      await engine.saveItem(itemHeader, undefined, 'createItem');
      await engine.syncNow();
      expect(engine.getItemSyncState(itemId).cloudSyncStatus).toBe('synced');

      // 2. Simulate concurrent modification on server by another device
      await clientA.syncPush({
        commands: [
          {
            operationId: crypto.randomUUID(),
            deviceId: 'device-other-tab',
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'pinItem',
            entityType: 'item',
            entityId: itemId,
            baseRevision: 1,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: { isPinned: true },
          },
        ],
      });

      // Server is now at revision 2! Local engine thinks it is at revision 1.

      // 3. Local engine makes an offline edit at stale baseRevision 1
      engine.setNetworkStatus('offline');
      itemHeader.serverRevision = 1;
      itemHeader.rank = '0|local_conflict_rank:';
      await engine.saveItem(itemHeader, undefined, 'updateItem');

      // 4. Bring online and sync -> Server returns conflict!
      engine.setNetworkStatus('online');
      await engine.syncNow();

      // Item cloud state is 'conflict'
      expect(engine.getItemSyncState(itemId).cloudSyncStatus).toBe('conflict');
      const conflicts = engine.getConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].entityId).toBe(itemId);
      expect(conflicts[0].serverRevision).toBe(2);

      // 5. Explicit conflict resolution: keep local intent with a fresh operation ID and baseRevision 2
      await engine.resolveConflict(conflicts[0].id, 'keep_local');
      await engine.syncNow();

      // Verify conflict resolved
      expect(engine.getConflicts()).toHaveLength(0);

      // Verify item state transitions to synced at revision 3
      expect(engine.getItemSyncState(itemId).cloudSyncStatus).toBe('synced');
      expect(engine.getItemSyncState(itemId).lastSyncedRevision).toBe(3);

      await engine.stop();
      await repo.close();
    });
  });

  describe('6. Cursor Expiry / SYNC_RESET_REQUIRED without Erasing Drafts', () => {
    it('reconstructs projection via fresh snapshot while strictly preserving unsent local drafts and pending queue', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const realTransport = new ApiClientSyncTransport(clientA);
      let simulateResetRequired = true;

      const resetFaultTransport: SyncTransportPort = {
        push: (req) => realTransport.push(req),
        pull: async (q) => {
          if (simulateResetRequired) {
            simulateResetRequired = false;
            const err = new Error('SYNC_RESET_REQUIRED: Cursor expired');
            Object.assign(err, { statusCode: 409, code: 'SYNC_RESET_REQUIRED' });
            throw err;
          }
          return realTransport.pull(q);
        },
        bootstrap: (q) => realTransport.bootstrap(q),
      };

      const engine = new SyncEngine({
        repository: repo,
        transport: resetFaultTransport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: deviceIdA,
        initialNetworkStatus: 'offline',
      });

      await engine.start();

      // 1. Create an unsent local draft and pending mutation offline
      const unsentItemId = crypto.randomUUID();
      const unsentHeader: ItemHeaderRecord = {
        id: unsentItemId,
        workspaceId: workspaceAId,
        kind: 'task',
        folderId: null,
        rank: '0|draft_during_reset:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const unsentDraft: DraftRecord = {
        id: crypto.randomUUID(),
        workspaceId: workspaceAId,
        userId: userAId,
        entityType: 'item',
        entityId: unsentItemId,
        title: 'Preserved Draft',
        payload: { kind: 'task', text: 'Must survive reset' },
        savedAt: new Date().toISOString(),
        isQuarantined: false,
        quarantinedAt: null,
      };

      await engine.saveItem(unsentHeader, unsentDraft, 'createItem', { autoSync: false });

      // 2. Bring online: pull encounters 409 SYNC_RESET_REQUIRED
      engine.setNetworkStatus('online');
      await engine.syncNow();

      // 3. Verify unsent draft and pending mutation are 100% intact and pushed!
      const draftAfter = await repo.getDraft(workspaceAId, userAId, unsentDraft.id);
      expect(draftAfter).toBeDefined();
      expect(draftAfter?.title).toBe('Preserved Draft');

      // The mutation was successfully pushed after the snapshot bootstrap
      expect(engine.getItemSyncState(unsentItemId).cloudSyncStatus).toBe('synced');

      await engine.stop();
      await repo.close();
    });
  });

  describe('7. Auth Loss, Revocation, and Storage Diagnostics', () => {
    it('pauses sync on auth error, isolates data on account switch, and outputs clean diagnostics', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const realTransport = new ApiClientSyncTransport(clientA);
      let simulateAuthError = false;

      const authFaultTransport: SyncTransportPort = {
        push: (req) => realTransport.push(req),
        pull: async (q) => {
          if (simulateAuthError) {
            const err = new Error('Unauthorized');
            Object.assign(err, { statusCode: 401, code: 'UNAUTHORIZED' });
            throw err;
          }
          return realTransport.pull(q);
        },
        bootstrap: (q) => realTransport.bootstrap(q),
      };

      const engine = new SyncEngine({
        repository: repo,
        transport: authFaultTransport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: deviceIdA,
      });

      await engine.start();
      await engine.syncNow();

      // 1. Diagnostics inspection
      const diag = engine.getDiagnostics();
      expect(diag.workspaceId).toBe(workspaceAId);
      expect(diag.userId).toBe(userAId);
      expect(diag.deviceId).toBe(deviceIdA);
      expect(diag.cloudSyncStatus).toBe('synced');

      // Verify NO user content or credentials in diagnostics
      const diagJson = JSON.stringify(diag);
      expect(diagJson).not.toContain('password');
      expect(diagJson).not.toContain('secret');
      expect(diagJson).not.toContain('token');
      expect(diagJson).not.toContain('Preserved Draft');

      // 2. Trigger auth loss (401)
      simulateAuthError = true;
      await engine.syncNow();
      expect(engine.getOverallCloudStatus()).toBe('needs_attention');

      // 3. Restore auth
      simulateAuthError = false;
      engine.handleAuthRestored();
      await engine.syncNow();
      expect(engine.getOverallCloudStatus()).toBe('synced');

      // 4. Account switch: isolates user A drafts into quarantine
      await engine.handleAccountSwitch({ userId: userBId, workspaceId: workspaceBId });
      expect(engine.getDiagnostics().userId).toBe(userBId);

      await engine.stop();
      await repo.close();
    });
  });

  describe('8. Atomic Transactions, Recovery, Chained Offline Revisions & Persistent Conflicts', () => {
    it('chains expected base revisions across multiple offline edits on the same entity and drains cleanly', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const transport = new ApiClientSyncTransport(clientA);
      const engine = new SyncEngine({
        repository: repo,
        transport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: deviceIdA,
        initialNetworkStatus: 'offline',
      });

      await engine.start();

      const itemId = crypto.randomUUID();
      const initialHeader: ItemHeaderRecord = {
        id: itemId,
        workspaceId: workspaceAId,
        kind: 'note',
        folderId: null,
        rank: '0|offline_first:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      // 1. First edit offline: createItem (baseRevision 0)
      const mut1 = await engine.saveItem(initialHeader, undefined, 'createItem', { autoSync: false });
      expect(mut1.baseRevision).toBe(0);

      // 2. Second edit offline: updateItem (baseRevision must be 1, chained from mut1)
      const updatedHeader: ItemHeaderRecord = {
        ...initialHeader,
        rank: '0|offline_second:',
      };
      const mut2 = await engine.saveItem(updatedHeader, undefined, 'updateItem', { autoSync: false });
      expect(mut2.baseRevision).toBe(1);
      expect(mut2.dependencyOperationIds).toContain(mut1.operationId);

      // 3. Bring online and push both in sequence
      engine.setNetworkStatus('online');
      await engine.syncNow();

      // Both mutations must be accepted and item must be fully synced!
      expect(engine.getItemSyncState(itemId).cloudSyncStatus).toBe('synced');
      const syncedHeader = await repo.getItemHeader(workspaceAId, itemId);
      expect(syncedHeader?.serverRevision).toBe(2);

      await engine.stop();
      await repo.close();
    });

    it('persists conflicts across engine restart and resolves them transactionally without losing replacement mutation', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const transport = new ApiClientSyncTransport(clientA);

      // 1. Create item on server with client A
      const itemId = crypto.randomUUID();
      const createRes = await clientA.syncPush({
        commands: [
          {
            operationId: crypto.randomUUID(),
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
            payload: { kind: 'note', rank: '0|conflict_test:' },
          },
        ],
      });
      expect(createRes.data.results[0].status).toBe('accepted');

      // 2. Another client updates item on server to revision 2
      const clientBUpdate = await clientA.syncPush({
        commands: [
          {
            operationId: crypto.randomUUID(),
            deviceId: 'other_device',
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'updateItem',
            entityType: 'item',
            entityId: itemId,
            baseRevision: 1,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: { kind: 'note', rank: '0|concurrent_server:' },
          },
        ],
      });
      expect(clientBUpdate.data.results[0].status).toBe('accepted');
      expect(clientBUpdate.data.results[0].revision).toBe(2);

      // 3. Client A sync engine attempts update with stale baseRevision: 1
      const engine1 = new SyncEngine({
        repository: repo,
        transport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: deviceIdA,
      });
      await engine1.start();

      const staleHeader: ItemHeaderRecord = {
        id: itemId,
        workspaceId: workspaceAId,
        kind: 'note',
        folderId: null,
        rank: '0|clientA_local_intent:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      await engine1.saveItem(staleHeader, undefined, 'updateItem', { autoSync: false });
      await engine1.syncNow();

      expect(engine1.getItemSyncState(itemId).cloudSyncStatus).toBe('conflict');
      const conflicts = engine1.getConflicts();
      expect(conflicts).toHaveLength(1);
      const conflictId = conflicts[0].id;

      // 4. Simulate process restart: stop engine1 and close repo
      await engine1.stop();
      await repo.close();

      // 5. Reopen storage and start a new engine instance
      const repo2 = new IndexedDbLocalRepository();
      await repo2.initialize({ userId: userAId, workspaceId: workspaceAId });
      const engine2 = new SyncEngine({
        repository: repo2,
        transport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: deviceIdA,
      });
      await engine2.start();

      // Verify conflict was reloaded from durable repository
      const reloadedConflicts = engine2.getConflicts();
      expect(reloadedConflicts).toHaveLength(1);
      expect(reloadedConflicts[0].id).toBe(conflictId);
      expect(engine2.getItemSyncState(itemId).cloudSyncStatus).toBe('conflict');

      // 6. Resolve conflict with keep_local: mints new operation ID and syncs successfully
      await engine2.resolveConflict(conflictId, 'keep_local');
      await engine2.syncNow();

      expect(engine2.getItemSyncState(itemId).cloudSyncStatus).toBe('synced');
      expect(engine2.getConflicts()).toHaveLength(0);

      await engine2.stop();
      await repo2.close();
    });

    it('installBootstrapGeneration safely removes obsolete projections while preserving local uncommitted items', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      // Add obsolete item (serverRevision > 0, deleted on server before feed horizon)
      const obsoleteId = crypto.randomUUID();
      await repo.upsertItemHeader({
        id: obsoleteId,
        workspaceId: workspaceAId,
        kind: 'note',
        folderId: null,
        rank: '0|obsolete:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // Add local uncommitted item (serverRevision === 0)
      const localId = crypto.randomUUID();
      await repo.upsertItemHeader({
        id: localId,
        workspaceId: workspaceAId,
        kind: 'task',
        folderId: null,
        rank: '0|local:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // Active snapshot item
      const activeId = crypto.randomUUID();
      const activeItem: ItemHeaderRecord = {
        id: activeId,
        workspaceId: workspaceAId,
        kind: 'note',
        folderId: null,
        rank: '0|active:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 15,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const watermarkCursor: SyncCursorRecord = {
        workspaceId: workspaceAId,
        userId: userAId,
        lastServerRevision: 15,
        cursor: 'wm_15',
        lastSyncedAt: new Date().toISOString(),
        epoch: 'epoch_1',
      };

      // Install bootstrap generation
      await repo.installBootstrapGeneration([activeItem], watermarkCursor, new Set([localId]));

      // Obsolete item must be safely removed
      expect(await repo.getItemHeader(workspaceAId, obsoleteId)).toBeNull();

      // Local uncommitted item must be preserved
      expect(await repo.getItemHeader(workspaceAId, localId)).not.toBeNull();

      // Active snapshot item must be present
      expect(await repo.getItemHeader(workspaceAId, activeId)).not.toBeNull();

      await repo.close();
    });

    it('protects against stale concurrent pull page moving cursor backward or overwriting newer projection', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const itemId = crypto.randomUUID();

      // 1. Initial newer state: revision 5
      await repo.upsertItemHeader({
        id: itemId,
        workspaceId: workspaceAId,
        kind: 'note',
        folderId: null,
        rank: '0|rev5:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await repo.saveCursor({
        workspaceId: workspaceAId,
        userId: userAId,
        lastServerRevision: 5,
        cursor: 'cur_5',
        lastSyncedAt: new Date().toISOString(),
        epoch: 'epoch_1',
      });

      // 2. Stale pull arrives with revision 3 and cursor 3
      const staleChange: ItemHeaderRecord = {
        id: itemId,
        workspaceId: workspaceAId,
        kind: 'note',
        folderId: null,
        rank: '0|stale_rev3:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const staleCursor: SyncCursorRecord = {
        workspaceId: workspaceAId,
        userId: userAId,
        lastServerRevision: 3,
        cursor: 'cur_3',
        lastSyncedAt: new Date().toISOString(),
        epoch: 'epoch_1',
      };

      await repo.applyPullPage([staleChange], staleCursor);

      // Verify projection remained at revision 5 and was not overwritten by stale revision 3
      const currentHeader = await repo.getItemHeader(workspaceAId, itemId);
      expect(currentHeader?.serverRevision).toBe(5);
      expect(currentHeader?.rank).toBe('0|rev5:');

      // Verify cursor was not moved backward
      const currentCursor = await repo.getCursor(workspaceAId, userAId);
      expect(currentCursor?.lastServerRevision).toBe(5);
      expect(currentCursor?.cursor).toBe('cur_5');

      await repo.close();
    });
  });
});
