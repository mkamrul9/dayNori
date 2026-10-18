import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import 'fake-indexeddb/auto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import {
  createAdminPool,
  createRuntimePool,
} from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import {
  SyncEngine,
  ApiClientSyncTransport,
  exportRecoveryData,
  getRedactedSyncDiagnostics,
  formatSyncStateLabel,
  mergeTaskFields,
  validateFolderMovePolicy,
  type ItemHeaderRecord,
  type DraftRecord,
  type TaskRecord,
} from '@daynori/sync';
import {
  IndexedDbLocalRepository,
  clearAllLocalData,
  setTrustedDeviceConsent,
} from '../../apps/web/src/data/indexedDbRepository.js';
import {
  SqliteLocalRepository,
  type SqliteDatabaseContract,
} from '../../apps/mobile/src/data/sqliteRepository.js';
import { MobileKeyManager } from '../../apps/mobile/src/data/keyManager.js';
import type { SecureStoreContract } from '../../apps/mobile/src/auth/secureStorage.js';

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

class MemorySecureStore implements SecureStoreContract {
  private store = new Map<string, string>();
  async getItemAsync(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async setItemAsync(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async deleteItemAsync(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class NodeSqliteAdapter implements SqliteDatabaseContract {
  constructor(private db: DatabaseSync) {}

  async execAsync(source: string): Promise<void> {
    this.db.exec(source);
  }

  async runAsync(
    source: string,
    ...params: unknown[]
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    const stmt = this.db.prepare(source);
    const result = stmt.run(...(params as (string | number | bigint | null | Buffer)[]));
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    const stmt = this.db.prepare(source);
    const result = stmt.get(...(params as (string | number | bigint | null | Buffer)[]));
    return (result as T) ?? null;
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(source);
    const results = stmt.all(...(params as (string | number | bigint | null | Buffer)[]));
    return results as T[];
  }

  async withTransactionAsync<T>(task: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      const res = await task();
      this.db.exec('COMMIT');
      return res;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async closeAsync(): Promise<void> {
    this.db.close();
  }
}

describe('Phase 34: Conflict Recovery & Offline Hardening Integration Tests', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase34-conflict-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let tokenUserA: string;
  let tokenUserB: string;

  let clientA: DaynoriApiClient;
  let _clientB: DaynoriApiClient;

  let workspaceAId: string;

  const device1 = 'device-conflict-01';
  const device2 = 'device-conflict-02';

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
      .setExpirationTime('2h')
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
    _clientB = createApiClient({ baseUrl, token: tokenUserB });

    const wsARes = await clientA.provisionPersonalWorkspace({ displayName: 'Alice Workspace' });
    workspaceAId = wsARes.data.workspace.id;
  });

  afterAll(async () => {
    if (server) await server.close();
    if (migrator) await migrator.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  describe('1. Multi-Device Concurrent Editing & Explicit Conflict Resolution', () => {
    it('detects concurrent edit conflict on text note, preserves local draft, and keeps both versions via save_copy', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo1 = new IndexedDbLocalRepository();
      await repo1.initialize({ userId: userAId, workspaceId: workspaceAId });

      const repo2 = new IndexedDbLocalRepository();
      await repo2.initialize({ userId: userAId, workspaceId: workspaceAId });
      const transport1 = new ApiClientSyncTransport(clientA);
      const transport2 = new ApiClientSyncTransport(clientA);

      const engine1 = new SyncEngine({
        repository: repo1,
        transport: transport1,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: device1,
        initialNetworkStatus: 'online',
        pollIntervalMs: 60000,
      });

      const engine2 = new SyncEngine({
        repository: repo2,
        transport: transport2,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: device2,
        initialNetworkStatus: 'online',
        pollIntervalMs: 60000,
      });

      await engine1.start();
      await engine2.start();

      // Step A: Device 1 creates note online
      const noteId = crypto.randomUUID();
      const initialHeader: ItemHeaderRecord = {
        id: noteId,
        workspaceId: workspaceAId,
        kind: 'note',
        folderId: null,
        rank: '00001000',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        name: 'Project Plan Baseline',
        title: 'Project Plan Baseline',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const initialDraft: DraftRecord = {
        id: crypto.randomUUID(),
        workspaceId: workspaceAId,
        userId: userAId,
        entityType: 'note',
        entityId: noteId,
        title: 'Project Plan Baseline',
        savedAt: new Date().toISOString(),
        payload: {
          title: 'Project Plan Baseline',
          plainText: 'Paragraph 1: Initial scope defined.',
          document: {
            version: 1,
            type: 'doc',
            content: [{ type: 'paragraph', text: 'Paragraph 1: Initial scope defined.' }],
          },
        },
      };

      await engine1.saveItem(initialHeader, initialDraft, 'createNote', { autoSync: true });
      await engine1.syncNow();

      // Verify accepted by server
      const dev1State = engine1.getItemSyncState(noteId);
      expect(dev1State.cloudSyncStatus).toBe('synced');
      expect(dev1State.lastSyncedRevision).toBeGreaterThan(0);
      const baseRev = dev1State.lastSyncedRevision!;

      // Step B: Device 2 pulls and gets note at base revision
      await engine2.syncNow();
      const dev2Header = await repo2.getItemHeader(workspaceAId, noteId);
      expect(dev2Header).not.toBeNull();
      expect(dev2Header?.serverRevision).toBe(baseRev);

      // Step C: Device 1 goes offline, edits note
      engine1.setNetworkStatus('offline');
      const dev1EditHeader = { ...initialHeader, serverRevision: baseRev };
      const dev1EditDraft: DraftRecord = {
        id: crypto.randomUUID(),
        workspaceId: workspaceAId,
        userId: userAId,
        entityType: 'note',
        entityId: noteId,
        title: 'Project Plan (Device 1 Edits)',
        savedAt: new Date().toISOString(),
        payload: {
          title: 'Project Plan (Device 1 Edits)',
          plainText: 'Paragraph 1: Initial scope. Paragraph 2: Device 1 added timeline.',
        },
      };
      await engine1.saveItem(dev1EditHeader, dev1EditDraft, 'updateNote', { autoSync: false });

      // Step D: Device 2 updates the note on server to revision baseRev + 1
      const dev2Res = await clientA.syncPush({
        commands: [
          {
            operationId: crypto.randomUUID(),
            deviceId: device2,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'updateNote',
            entityType: 'note',
            entityId: noteId,
            baseRevision: baseRev,
            clientTimestamp: new Date().toISOString(),
            payload: {
              title: 'Project Plan (Device 2 Edits)',
              plainText: 'Paragraph 1: Initial scope. Paragraph 2: Device 2 added budget.',
            },
          },
        ],
      });
      expect(dev2Res.data.results[0].status).toBe('accepted');

      // Step E: Device 1 reconnects and pushes its edit based on stale baseRev
      engine1.setNetworkStatus('online');
      await engine1.syncNow();

      // Conflict should be detected on Device 1
      const dev1FinalState = engine1.getItemSyncState(noteId);
      expect(dev1FinalState.cloudSyncStatus).toBe('conflict');
      const conflicts = engine1.getConflicts();
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
      const noteConflict = conflicts.find((c) => c.entityId === noteId);
      expect(noteConflict).toBeDefined();
      expect(noteConflict?.resolved).toBe(false);

      // Step F: Explicit conflict resolution with 'save_copy' (Keep Both)
      await engine1.resolveConflict(noteConflict!.id, 'save_copy');
      expect(engine1.getConflicts().filter((c) => c.entityId === noteId).length).toBe(0);

      // Push resolution (creates (Copy) item on server with fresh UUID)
      await engine1.syncNow();
      const localNotes = await repo1.listNotes(workspaceAId);
      expect(localNotes.length).toBe(2);
      expect(localNotes.some((n) => n.title.includes('(Copy)'))).toBe(true);

      const allItems = await clientA.listItems(workspaceAId);
      expect(allItems.data.length).toBe(2);

      await engine1.stop();
      await engine2.stop();
    });
  });

  describe('2. Edit-versus-Delete Handling', () => {
    it('preserves local offline edit when server deletes item without resurrecting it', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });
      const transport = new ApiClientSyncTransport(clientA);
      const engine = new SyncEngine({
        repository: repo,
        transport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: device1,
        initialNetworkStatus: 'online',
        pollIntervalMs: 60000,
      });
      await engine.start();

      // Create item on server
      const itemId = crypto.randomUUID();
      const header: ItemHeaderRecord = {
        id: itemId,
        workspaceId: workspaceAId,
        kind: 'task',
        folderId: null,
        rank: '00001000',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        title: 'Delete vs Edit Task',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      await engine.saveItem(header, undefined, 'createTask', { autoSync: true });
      await engine.syncNow();
      const syncedState = engine.getItemSyncState(itemId);
      const rev = syncedState.lastSyncedRevision!;

      // Device goes offline and edits the task
      engine.setNetworkStatus('offline');
      await engine.saveItem(
        { ...header, serverRevision: rev, title: 'Updated Title Offline' },
        undefined,
        'updateTask',
        { autoSync: false }
      );

      // Meanwhile, item is deleted on the server directly via clientB or API
      await clientA.syncPush({
        commands: [
          {
            operationId: crypto.randomUUID(),
            deviceId: device2,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'trashTask',
            entityType: 'task',
            entityId: itemId,
            baseRevision: rev,
            clientTimestamp: new Date().toISOString(),
            payload: {},
          },
        ],
      });

      // Device reconnects: pull will encounter tombstone while local pending mutation exists
      engine.setNetworkStatus('online');
      await engine.syncNow();

      // Verify item remains deleted locally (deletedAt is not null)
      const localItem = await repo.getItemHeader(workspaceAId, itemId);
      expect(localItem?.deletedAt).not.toBeNull();

      // Verify conflict was created to preserve offline edits
      const conflicts = engine.getConflicts();
      const delConflict = conflicts.find((c) => c.entityId === itemId);
      expect(delConflict).toBeDefined();
      expect(delConflict?.conflictReason).toContain('deleted');

      await engine.stop();
    });
  });

  describe('3. 90-Day Offline Horizon Enforcement', () => {
    it('rejects automatic replay of mutations older than 90 days and retains locally as recoverable conflict', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });
      const transport = new ApiClientSyncTransport(clientA);
      const engine = new SyncEngine({
        repository: repo,
        transport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: device1,
        initialNetworkStatus: 'offline',
        pollIntervalMs: 60000,
      });
      await engine.start();

      // Create an expired mutation (95 days old)
      const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
      const staleItemId = crypto.randomUUID();

      const _header: ItemHeaderRecord = {
        id: staleItemId,
        workspaceId: workspaceAId,
        kind: 'note',
        folderId: null,
        rank: '00001000',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        title: 'Very Old Offline Note',
        createdAt: ninetyFiveDaysAgo,
        updatedAt: ninetyFiveDaysAgo,
        deletedAt: null,
      };

      // Manually enqueue mutation with ancient clientTimestamp
      const ancientOpId = crypto.randomUUID();
      await repo.enqueueMutation({
        operationId: ancientOpId,
        deviceId: device1,
        workspaceId: workspaceAId,
        userId: userAId,
        entityType: 'note',
        entityId: staleItemId,
        action: 'create',
        command: 'createNote',
        commandVersion: 1,
        schemaVersion: 1,
        baseRevision: 0,
        dependencyOperationIds: [],
        clientTimestamp: ninetyFiveDaysAgo,
        status: 'pending',
        retryCount: 0,
        lastError: null,
        payload: { title: 'Very Old Offline Note' },
      });

      // Reconnect and sync
      engine.setNetworkStatus('online');
      await engine.syncNow();

      // The mutation must not be accepted by push, and must be retained as an offline horizon conflict
      const conflicts = engine.getConflicts();
      const expiredConflict = conflicts.find((c) => c.entityId === staleItemId);
      expect(expiredConflict).toBeDefined();
      expect(expiredConflict?.conflictReason).toContain('90-day');

      const state = engine.getItemSyncState(staleItemId);
      expect(state.cloudSyncStatus).toBe('conflict');

      await engine.stop();
    });
  });

  describe('4. Deleted Parent Folder Reference Re-parenting', () => {
    it('re-parents items whose folder was deleted or missing to root (folderId: null)', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });
      const transport = new ApiClientSyncTransport(clientA);
      const engine = new SyncEngine({
        repository: repo,
        transport,
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: device1,
        initialNetworkStatus: 'online',
        pollIntervalMs: 60000,
      });
      await engine.start();

      // Create a folder on server
      const folderId = crypto.randomUUID();
      const folderHeader: ItemHeaderRecord = {
        id: folderId,
        workspaceId: workspaceAId,
        kind: 'folder',
        folderId: null,
        rank: '00001000',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        name: 'Doomed Parent Folder',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      await engine.saveItem(folderHeader, undefined, 'createFolder', { autoSync: true });
      await engine.syncNow();

      // Create a child note on server under the folder BEFORE trashing it
      const childId = crypto.randomUUID();
      await clientA.syncPush({
        commands: [
          {
            operationId: crypto.randomUUID(),
            deviceId: device2,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'createNote',
            entityType: 'note',
            entityId: childId,
            baseRevision: 0,
            clientTimestamp: new Date().toISOString(),
            payload: {
              title: 'Orphaned Child Note',
              folderId,
            },
          },
        ],
      });

      // Now delete the folder on server
      await clientA.syncPush({
        commands: [
          {
            operationId: crypto.randomUUID(),
            deviceId: device2,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'trashFolder',
            entityType: 'folder',
            entityId: folderId,
            baseRevision: 1,
            clientTimestamp: new Date().toISOString(),
            payload: {},
          },
        ],
      });

      // Pull changes
      await engine.syncNow();

      // Verify that local repository re-parented child note to root
      const childItem = await repo.getItemHeader(workspaceAId, childId);
      expect(childItem).not.toBeNull();
      expect(childItem?.folderId).toBeNull();

      await engine.stop();
    });
  });

  describe('5. Storage Quota Error Handling', () => {
    it('detects quota failure in saveItem and sets status to error without falsely claiming savedOnDevice', async () => {
      const mockRepo = new IndexedDbLocalRepository();
      await mockRepo.initialize({ userId: userAId, workspaceId: workspaceAId });
      mockRepo.saveItemTransaction = async () => {
        const quotaErr = new Error('The quota has been exceeded.');
        quotaErr.name = 'QuotaExceededError';
        throw quotaErr;
      };

      const engine = new SyncEngine({
        repository: mockRepo,
        transport: new ApiClientSyncTransport(clientA),
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: device1,
        initialNetworkStatus: 'online',
      });

      const header: ItemHeaderRecord = {
        id: crypto.randomUUID(),
        workspaceId: workspaceAId,
        kind: 'note',
        folderId: null,
        rank: '00001000',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        title: 'Quota Exceeded Note',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      await expect(engine.saveItem(header, undefined, 'createNote')).rejects.toThrow('quota');
      const itemState = engine.getItemSyncState(header.id);
      expect(itemState.savedOnDevice).toBe(false);
      expect(itemState.cloudSyncStatus).toBe('error');
      expect(itemState.lastError).toContain('quota exceeded');
    });
  });

  describe('6. Structured 3-Way Task Field Merge Policy', () => {
    it('cleanly merges disjoint non-overlapping field edits against common base', () => {
      const base: TaskRecord = {
        id: 'task-1',
        workspaceId: 'ws-1',
        folderId: null,
        title: 'Original Title',
        details: 'Original details',
        priority: 'normal',
        status: 'todo',
        deadline: { type: 'none' },
        completedAt: null,
        reopenedAt: null,
        completionHistory: [],
        parentId: null,
        subtaskOrder: 0,
        tags: [],
        serverRevision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      // Device 1 changes status to 'in_progress'
      const local: Partial<TaskRecord> = { status: 'in_progress' };
      // Device 2 changes priority to 'urgent'
      const server: Partial<TaskRecord> = { priority: 'urgent' };

      const { merged, conflictingFields } = mergeTaskFields(base, local, server);
      expect(conflictingFields).toHaveLength(0);
      expect(merged.status).toBe('in_progress');
      expect(merged.priority).toBe('urgent');
      expect(merged.title).toBe('Original Title');
    });

    it('identifies conflicting field changes when both sides edit the same scalar field differently', () => {
      const base: TaskRecord = {
        id: 'task-2',
        workspaceId: 'ws-1',
        folderId: null,
        title: 'Original Title',
        details: 'Original details',
        priority: 'normal',
        status: 'todo',
        deadline: { type: 'none' },
        completedAt: null,
        reopenedAt: null,
        completionHistory: [],
        parentId: null,
        subtaskOrder: 0,
        tags: [],
        serverRevision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const local: Partial<TaskRecord> = { title: 'Local Modified Title' };
      const server: Partial<TaskRecord> = { title: 'Server Modified Title' };

      const { conflictingFields } = mergeTaskFields(base, local, server);
      expect(conflictingFields).toContain('title');
    });
  });

  describe('7. Folder Move Policy (Hierarchy & Cycles)', () => {
    it('detects circular parent cycles and excessive depth', () => {
      const existingFolders = [
        { id: 'f1', parentId: null },
        { id: 'f2', parentId: 'f1' },
        { id: 'f3', parentId: 'f2' },
      ];

      // Move f1 inside f3 -> would create cycle f1 -> f3 -> f2 -> f1
      const cycleCheck = validateFolderMovePolicy({
        folderId: 'f1',
        targetParentId: 'f3',
        existingFolders,
      });
      expect(cycleCheck.valid).toBe(false);
      expect(cycleCheck.reason).toContain('cycle');

      // Move f1 into f1 itself
      const selfCheck = validateFolderMovePolicy({
        folderId: 'f1',
        targetParentId: 'f1',
        existingFolders,
      });
      expect(selfCheck.valid).toBe(false);

      // Excessive depth check (max depth 3)
      const depthCheck = validateFolderMovePolicy({
        folderId: 'f4',
        targetParentId: 'f3', // f3 is at depth 3; f4 inside f3 would be depth 4
        existingFolders,
        maxDepth: 3,
      });
      expect(depthCheck.valid).toBe(false);
      expect(depthCheck.reason).toContain('exceeds maximum allowed hierarchy depth');
    });
  });

  describe('8. Redacted Sync Diagnostics & Local Recovery Export', () => {
    it('produces redacted diagnostics and safe recovery export omitting sensitive tokens and vault plaintext', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      // Save a standard note and a vault-scoped item
      await repo.saveDraft({
        id: crypto.randomUUID(),
        workspaceId: workspaceAId,
        userId: userAId,
        entityType: 'note',
        entityId: null,
        title: 'Secret Recovery Draft',
        savedAt: new Date().toISOString(),
        payload: {
          title: 'Secret Recovery Draft',
          secretToken: 'shhh-secret-value-12345',
          password: 'my-super-password',
        },
      });

      await repo.saveDraft({
        id: crypto.randomUUID(),
        workspaceId: workspaceAId,
        userId: userAId,
        entityType: 'vault_entry',
        entityId: null,
        title: 'Vault Secure Note',
        savedAt: new Date().toISOString(),
        payload: {
          title: 'Vault Secure Note',
          securityScope: 'vault',
          plainText: 'Encrypted vault content',
        },
      });

      const exportResult = await exportRecoveryData({
        workspaceId: workspaceAId,
        userId: userAId,
        repository: repo,
        deviceId: device1,
      });

      expect(exportResult.schemaVersion).toBe(1);
      expect(exportResult.summary.draftsCount).toBe(2);

      // Verify that secret keys were omitted
      const draftPayloads = exportResult.drafts.map((d) => d.payload);
      for (const p of draftPayloads) {
        expect(p).not.toHaveProperty('secretToken');
        expect(p).not.toHaveProperty('password');
      }

      // Verify vault title and plaintext was masked
      const vaultDraft = exportResult.drafts.find((d) => d.entityType === 'vault_entry');
      expect(vaultDraft?.title).toBe('[Vault item excluded]');
      expect(vaultDraft?.payload['plainText']).toBeUndefined();
      expect(vaultDraft?.payload['_masked']).toBe(true);

      // Test formatSyncStateLabel mapping
      expect(formatSyncStateLabel('saved_locally')).toBe('Saved on this device');
      expect(formatSyncStateLabel('syncing')).toBe('Syncing');
      expect(formatSyncStateLabel('synced')).toBe('Synced');
      expect(formatSyncStateLabel('conflict')).toBe('Conflict');
      expect(formatSyncStateLabel('error')).toBe('Needs attention');

      // Test getRedactedSyncDiagnostics
      const rawDiag = {
        workspaceId: workspaceAId,
        userId: userAId,
        deviceId: device1,
        isLeader: true,
        networkStatus: 'online' as const,
        cloudSyncStatus: 'synced' as const,
        queueLength: 0,
        inFlightCount: 0,
        failedCount: 0,
        lastSyncedAt: new Date().toISOString(),
        lastSyncSequence: 42,
        accessEpoch: 'epoch-123-super-secret-epoch-hash',
        consecutiveFailures: 0,
        activeConflictsCount: 0,
      };

      const redacted = getRedactedSyncDiagnostics(rawDiag);
      expect(redacted.userIdRedacted).not.toBe(userAId);
      expect(redacted.userIdRedacted).toContain('...');
      expect(redacted.accessEpochRedacted).toBe('epoch-set');
    });
  });

  describe('9. Mobile SQLite Repository Integration', () => {
    it('manages conflicts, drafts, and item headers cleanly in SQLite adapter', async () => {
      const db = new DatabaseSync(':memory:');
      const adapter = new NodeSqliteAdapter(db);
      const secureStore = new MemorySecureStore();
      const keyManager = new MobileKeyManager(secureStore);

      const sqliteRepo = new SqliteLocalRepository({
        keyManager,
        openDatabaseAsync: async () => adapter,
        databaseExistsAsync: async () => false,
        requireSqlCipher: false,
      });

      await sqliteRepo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const conflictItem: ItemHeaderRecord = {
        id: crypto.randomUUID(),
        workspaceId: workspaceAId,
        kind: 'note',
        folderId: null,
        rank: '00001000',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        name: 'SQLite Conflict Note',
        title: 'SQLite Conflict Note',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      await sqliteRepo.saveItemTransaction(conflictItem, {
        operationId: crypto.randomUUID(),
        deviceId: 'device-test-sqlite',
        workspaceId: workspaceAId,
        userId: userAId,
        entityType: 'note',
        entityId: conflictItem.id,
        action: 'create',
        command: 'createNote',
        commandVersion: 1,
        schemaVersion: 1,
        payload: { title: 'SQLite Conflict Note' },
        baseRevision: 0,
        dependencyOperationIds: [],
        clientTimestamp: new Date().toISOString(),
        retryCount: 0,
        status: 'pending',
        lastError: null,
      });
      const retrieved = await sqliteRepo.getItemHeader(workspaceAId, conflictItem.id);
      expect(retrieved?.name || retrieved?.title).toBe('SQLite Conflict Note');

      // Save conflict record
      const conflictId = crypto.randomUUID();
      await sqliteRepo.saveConflict({
        id: conflictId,
        workspaceId: workspaceAId,
        userId: userAId,
        entityType: 'note',
        entityId: conflictItem.id,
        operationId: crypto.randomUUID(),
        baseRevision: 1,
        serverRevision: 2,
        conflictReason: 'Server modified note concurrently',
        detectedAt: new Date().toISOString(),
        localPayload: { title: 'Local Note Title' },
        resolved: false,
      });

      const conflicts = await sqliteRepo.listConflicts(workspaceAId);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].id).toBe(conflictId);

      await sqliteRepo.close();
    });
  });

  describe('10. Phase 34 Hardened Defect Verifications', () => {
    it('preserves user text with password/secret words, strips nested credentials in arrays, and checks attachment cache', async () => {
      const repo = new IndexedDbLocalRepository();
      const testWsId = crypto.randomUUID();
      const testUserId = crypto.randomUUID();
      await repo.initialize({ workspaceId: testWsId, userId: testUserId });

      // Save draft with user text mentioning secret and password, and nested array with tokens
      await repo.saveDraft({
        id: crypto.randomUUID(),
        workspaceId: testWsId,
        userId: testUserId,
        entityType: 'note',
        entityId: null,
        title: 'My password reset guide',
        savedAt: new Date().toISOString(),
        payload: {
          title: 'My password reset guide',
          userNotes: 'Remember to reset password using your secret questions.',
          tokens: [
            {
              authtoken: 'leak-token-123',
              sessionid: 'leak-session-456',
              userDescription: 'This note is safe and should remain',
            },
          ],
        },
      });

      // Save file records with mock attachment status
      const cachedFileId = crypto.randomUUID();
      const uncachedFileId = crypto.randomUUID();
      await repo.saveItemTransaction(
        {
          id: cachedFileId,
          workspaceId: testWsId,
          kind: 'file',
          folderId: null,
          rank: '00001000',
          isArchived: false,
          isPinned: false,
          securityScope: 'standard',
          serverRevision: 1,
          name: 'cached_document.pdf',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        {
          operationId: crypto.randomUUID(),
          deviceId: 'device-test-defects',
          workspaceId: testWsId,
          userId: testUserId,
          entityType: 'file',
          entityId: cachedFileId,
          action: 'create',
          command: 'createItem',
          commandVersion: 1,
          schemaVersion: 1,
          payload: { name: 'cached_document.pdf' },
          baseRevision: 0,
          dependencyOperationIds: [],
          clientTimestamp: new Date().toISOString(),
          retryCount: 0,
          status: 'pending',
          lastError: null,
        }
      );
      await repo.saveItemTransaction(
        {
          id: uncachedFileId,
          workspaceId: testWsId,
          kind: 'file',
          folderId: null,
          rank: '00002000',
          isArchived: false,
          isPinned: false,
          securityScope: 'standard',
          serverRevision: 1,
          name: 'metadata_only.pdf',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        {
          operationId: crypto.randomUUID(),
          deviceId: 'device-test-defects',
          workspaceId: testWsId,
          userId: testUserId,
          entityType: 'file',
          entityId: uncachedFileId,
          action: 'create',
          command: 'createItem',
          commandVersion: 1,
          schemaVersion: 1,
          payload: { name: 'metadata_only.pdf' },
          baseRevision: 0,
          dependencyOperationIds: [],
          clientTimestamp: new Date().toISOString(),
          retryCount: 0,
          status: 'pending',
          lastError: null,
        }
      );

      await repo.upsertFile({
        id: cachedFileId,
        workspaceId: testWsId,
        folderId: null,
        fileName: 'cached_document.pdf',
        declaredMimeType: 'application/pdf',
        detectedMimeType: 'application/pdf',
        byteSize: 1024,
        sha256Checksum: 'a'.repeat(64),
        version: '1',
        quarantineStatus: 'verified',
        createdBy: testUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await repo.upsertFile({
        id: uncachedFileId,
        workspaceId: testWsId,
        folderId: null,
        fileName: 'metadata_only.pdf',
        declaredMimeType: 'application/pdf',
        detectedMimeType: 'application/pdf',
        byteSize: 2048,
        sha256Checksum: 'b'.repeat(64),
        version: '1',
        quarantineStatus: 'verified',
        createdBy: testUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const exportResult = await exportRecoveryData({
        workspaceId: testWsId,
        userId: testUserId,
        repository: repo,
        deviceId: 'device-test-defects',
        checkAttachmentCached: (f) => f.id === cachedFileId,
      });

      // Notice should document emergency recovery dump format and intentional limits
      expect(exportResult.notice).toContain('emergency local draft dump, NOT a full or portable backup');
      expect(exportResult.notice).toContain('vault plaintexts and private metadata are strictly excluded');

      // User text should be preserved
      const draft = exportResult.drafts[0];
      expect(draft.title).toBe('My password reset guide');
      expect(draft.payload['userNotes']).toBe('Remember to reset password using your secret questions.');

      // Tokens inside array must be stripped, while safe array content is kept
      const tokenArray = draft.payload['tokens'] as Array<Record<string, unknown>>;
      expect(tokenArray).toBeDefined();
      expect(tokenArray.length).toBe(1);
      expect(tokenArray[0]['authtoken']).toBeUndefined();
      expect(tokenArray[0]['sessionid']).toBeUndefined();
      expect(tokenArray[0]['userDescription']).toBe('This note is safe and should remain');

      // Attachment cache inspection
      const cachedAttachment = exportResult.attachments.files.find((f) => f.id === cachedFileId);
      const uncachedAttachment = exportResult.attachments.files.find((f) => f.id === uncachedFileId);
      expect(cachedAttachment?.availability).toBe('locally_cached');
      expect(cachedAttachment?.isBinaryCachedLocally).toBe(true);
      expect(uncachedAttachment?.availability).toBe('metadata_only');
      expect(uncachedAttachment?.isBinaryCachedLocally).toBe(false);

      await repo.close();
    });

    it('enforces validateFolderMovePolicy in saveItem and rejects circular parent cycles', async () => {
      const repo = new IndexedDbLocalRepository();
      const testWsId = crypto.randomUUID();
      const testUserId = crypto.randomUUID();
      await repo.initialize({ workspaceId: testWsId, userId: testUserId });

      const syncEngine = new SyncEngine({
        deviceId: 'device-cycle-test',
        namespace: { workspaceId: testWsId, userId: testUserId },
        repository: repo,
        transport: {
          push: async () => ({ data: { results: [] } }),
          pull: async () => ({
            data: {
              changes: [],
              nextCursor: { lastServerRevision: 0, epoch: '1' },
              serverTimestamp: new Date().toISOString(),
              hasMore: false,
            },
          }),
        },
      });

      const folderAId = crypto.randomUUID();
      const folderBId = crypto.randomUUID();

      const folderA: ItemHeaderRecord = {
        id: folderAId,
        workspaceId: testWsId,
        kind: 'folder',
        folderId: null,
        rank: '00001000',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        name: 'Folder A',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const folderB: ItemHeaderRecord = {
        id: folderBId,
        workspaceId: testWsId,
        kind: 'folder',
        folderId: null,
        parentId: folderAId,
        rank: '00002000',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        name: 'Folder B',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      // Create folder A
      await syncEngine.saveItem(folderA);

      // Create folder B under folder A
      await syncEngine.saveItem(folderB);

      // Try moving folder A under folder B (circular cycle A -> B -> A)
      const circularFolderA: ItemHeaderRecord = {
        ...folderA,
        parentId: folderBId,
      };
      await expect(syncEngine.saveItem(circularFolderA)).rejects.toThrow(/circular|cycle/i);

      await repo.close();
    });

    it('supports 3-way task conflict merging via resolveConflict merge option', async () => {
      const repo = new IndexedDbLocalRepository();
      const testWsId = crypto.randomUUID();
      const testUserId = crypto.randomUUID();
      await repo.initialize({ workspaceId: testWsId, userId: testUserId });

      const syncEngine = new SyncEngine({
        deviceId: 'device-merge-test',
        namespace: { workspaceId: testWsId, userId: testUserId },
        repository: repo,
        transport: {
          push: async () => ({ data: { results: [] } }),
          pull: async () => ({
            data: {
              changes: [],
              nextCursor: { lastServerRevision: 0, epoch: '1' },
              serverTimestamp: new Date().toISOString(),
              hasMore: false,
            },
          }),
        },
      });

      const taskId = crypto.randomUUID();
      const conflictId = crypto.randomUUID();

      const conflictRecord = {
        id: conflictId,
        workspaceId: testWsId,
        userId: testUserId,
        entityType: 'task',
        entityId: taskId,
        operationId: crypto.randomUUID(),
        baseRevision: 1,
        serverRevision: 2,
        conflictReason: 'Concurrent task edit',
        detectedAt: new Date().toISOString(),
        resolved: false,
        baseState: {
          id: taskId,
          title: 'Initial Task',
          priority: 'low',
          status: 'todo',
          deadline: null,
        },
        localPayload: {
          id: taskId,
          title: 'Initial Task',
          priority: 'high', // local changed priority
          status: 'todo',
          deadline: null,
        },
        serverState: {
          id: taskId,
          title: 'Initial Task',
          priority: 'low',
          status: 'in_progress', // server changed status
          deadline: null,
        },
      };

      await repo.saveConflict(conflictRecord);

      // Resolve conflict via 'merge'
      await syncEngine.resolveConflict(conflictId, 'merge');

      // Verify mutation enqueued with merged disjoint fields
      const pending = await repo.getPendingMutations(testWsId, testUserId);
      const mergeMutation = pending.find((m) => m.entityId === taskId);
      expect(mergeMutation).toBeDefined();
      expect(mergeMutation?.payload['priority']).toBe('high');
      expect(mergeMutation?.payload['status']).toBe('in_progress');

      // Verify conflict is resolved
      const resolvedConflict = await repo.getConflict(testWsId, conflictId);
      expect(resolvedConflict?.resolved).toBe(true);

      const remainingUnresolved = await repo.listConflicts(testWsId);
      expect(remainingUnresolved.length).toBe(0);

      await repo.close();
    });
  });
});
