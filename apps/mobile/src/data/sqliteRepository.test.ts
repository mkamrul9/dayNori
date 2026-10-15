import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { SqliteLocalRepository, type SqliteDatabaseContract } from './sqliteRepository.js';
import { MobileKeyManager } from './keyManager.js';
import type { SecureStoreContract } from '../auth/secureStorage.js';
import {
  StorageKeyError,
  StorageUnavailableError,
  type ItemHeaderRecord,
  type DraftRecord,
  type PendingMutationRecord,
  type SyncCursorRecord,
  type PreferenceSnapshotRecord,
} from '@daynori/sync';

/**
 * Adapter wrapping Node.js 24 built-in DatabaseSync into SqliteDatabaseContract.
 * Enables zero-mock SQLite schema, transaction, and repository contract testing in Node.js.
 * Note: DatabaseSync is plain unencrypted SQLite; SQLCipher native encryption is compiled in Android APK.
 */
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

  async getFirstAsync<T = unknown>(source: string, ...params: unknown[]): Promise<T | null> {
    const stmt = this.db.prepare(source);
    const row = stmt.get(...(params as (string | number | bigint | null | Buffer)[]));
    return (row as T) ?? null;
  }

  async getAllAsync<T = unknown>(source: string, ...params: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(source);
    const rows = stmt.all(...(params as (string | number | bigint | null | Buffer)[]));
    return rows as T[];
  }

  async withTransactionAsync<T>(task: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const res = await task();
      this.db.exec('COMMIT;');
      return res;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  async closeAsync(): Promise<void> {
    this.db.close();
  }
}

/**
 * In-memory SecureStore contract implementation for key manager test isolation.
 */
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

describe('Mobile SQLite Repository & Key Lifecycle (Node.js Contract Tests)', () => {
  const ws1 = 'ws_11111111-1111-1111-1111-111111111111';
  const ws2 = 'ws_22222222-2222-2222-2222-222222222222';
  const user1 = 'usr_alice_001';
  const user2 = 'usr_bob_002';

  let testDbDir: string;
  let secureStore: MemorySecureStore;
  let keyManager: MobileKeyManager;

  beforeEach(() => {
    testDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daynori-sqlite-test-'));
    secureStore = new MemorySecureStore();
    keyManager = new MobileKeyManager(secureStore);
  });

  const createRepo = (options?: { requireSqlCipher?: boolean }) => {
    return new SqliteLocalRepository({
      keyManager,
      requireSqlCipher: options?.requireSqlCipher ?? false,
      databaseExistsAsync: async (dbName: string) => {
        return fs.existsSync(path.join(testDbDir, dbName));
      },
      deleteDatabaseAsync: async (dbName: string) => {
        const p = path.join(testDbDir, dbName);
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      },
      openDatabaseAsync: async (dbName: string) => {
        const fullPath = path.join(testDbDir, dbName);
        const rawDb = new DatabaseSync(fullPath);
        return new NodeSqliteAdapter(rawDb);
      },
    });
  };

  describe('Key Protection, Serialization & Format Validation (MobileKeyManager)', () => {
    it('generates a 256-bit AES encryption key in 64-char hex format and persists it', async () => {
      const key = await keyManager.getOrCreateKey(user1, ws1);
      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key.length).toBe(64);
      expect(/^[0-9a-fA-F]{64}$/.test(key)).toBe(true);

      // Reopening must return the exact same key without regenerating
      const reloadedKey = await keyManager.getOrCreateKey(user1, ws1);
      expect(reloadedKey).toBe(key);
    });

    it('serializes concurrent initialization calls to avoid duplicate generation race', async () => {
      const [keyA, keyB] = await Promise.all([
        keyManager.getOrCreateKey(user1, ws1),
        keyManager.getOrCreateKey(user1, ws1),
      ]);
      expect(keyA).toBe(keyB);
    });

    it('validates key format and rejects invalid or corrupted keys', async () => {
      await expect(keyManager.setCorruptedKey(user1, ws1, 'not-a-valid-hex-key')).rejects.toThrow(
        StorageKeyError
      );
    });

    it('isolates encryption keys strictly by user account and workspace', async () => {
      const keyAliceWs1 = await keyManager.getOrCreateKey(user1, ws1);
      const keyAliceWs2 = await keyManager.getOrCreateKey(user1, ws2);
      const keyBobWs1 = await keyManager.getOrCreateKey(user2, ws1);

      expect(keyAliceWs1).not.toBe(keyAliceWs2);
      expect(keyAliceWs1).not.toBe(keyBobWs1);
      expect(keyAliceWs2).not.toBe(keyBobWs1);
    });

    it('throws actionable StorageKeyError when key is missing and generation is disallowed', async () => {
      await expect(keyManager.requireExistingKey(user1, ws1)).rejects.toThrow(StorageKeyError);
    });

    it('clears specific key or all account keys durably across process restarts', async () => {
      await keyManager.getOrCreateKey(user1, ws1);
      await keyManager.getOrCreateKey(user1, ws2);

      await keyManager.deleteKey(user1, ws1);
      await expect(keyManager.requireExistingKey(user1, ws1)).rejects.toThrow(StorageKeyError);
      expect(await keyManager.requireExistingKey(user1, ws2)).toBeDefined();

      // Clear all keys for user1
      await keyManager.clearAccountKeys(user1);
      await expect(keyManager.requireExistingKey(user1, ws2)).rejects.toThrow(StorageKeyError);
    });
  });

  describe('Existing Database Key Protection Invariant', () => {
    it('refuses to overwrite an existing database if its key was lost from KeyStore', async () => {
      // 1. Initialize first time: generates key and creates database
      const repo = createRepo();
      await repo.initialize({ userId: user1, workspaceId: ws1 });
      await repo.close();

      // 2. Simulate key loss from secure store
      await secureStore.deleteItemAsync(keyManager.getStorageKeyAlias(user1, ws1));

      // 3. Attempting to initialize must NOT silently create a new key over the existing data
      const reopenRepo = createRepo();
      await expect(reopenRepo.initialize({ userId: user1, workspaceId: ws1 })).rejects.toThrow(
        StorageKeyError
      );
    });
  });

  describe('Account and Workspace Boundary Enforcement', () => {
    it('strictly rejects operations that cross workspace or account boundaries', async () => {
      const repo = createRepo();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      // Cross-workspace read
      await expect(repo.getItemHeader(ws2, 'item-01')).rejects.toThrow(StorageUnavailableError);
      await expect(repo.listItemHeaders(ws2)).rejects.toThrow(StorageUnavailableError);

      // Cross-workspace write
      const wrongWsHeader: ItemHeaderRecord = {
        id: 'item-cross-01',
        workspaceId: ws2,
        kind: 'task',
        folderId: null,
        rank: '0',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-15T10:00:00.000Z',
        deletedAt: null,
      };
      await expect(repo.upsertItemHeader(wrongWsHeader)).rejects.toThrow(StorageUnavailableError);

      // Cross-account draft write
      const wrongUserDraft: DraftRecord = {
        id: 'draft-cross-01',
        workspaceId: ws1,
        userId: user2,
        entityType: 'note',
        entityId: null,
        title: 'Draft',
        payload: { text: 'Forbidden' },
        savedAt: '2026-10-15T10:00:00.000Z',
        isQuarantined: false,
        quarantinedAt: null,
      };
      await expect(repo.saveDraft(wrongUserDraft)).rejects.toThrow(StorageUnavailableError);

      await repo.close();
    });
  });

  describe('Schema Migrations & Table Initialization', () => {
    it('executes schema migrations idempotently and records version in migration ledger', async () => {
      const repo = createRepo();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      const version = await repo.getCurrentSchemaVersion();
      expect(version).toBe(1);

      // Re-running initialization should not fail or duplicate migrations
      await repo.initialize({ userId: user1, workspaceId: ws1 });
      const versionAfter = await repo.getCurrentSchemaVersion();
      expect(versionAfter).toBe(1);

      await repo.close();
    });
  });

  describe('Item Header Operations & Parameterized Queries', () => {
    it('persists, updates, and queries item headers with parameterized queries', async () => {
      const repo = createRepo();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      const header1: ItemHeaderRecord = {
        id: 'header-sql-01',
        workspaceId: ws1,
        kind: 'task',
        folderId: null,
        rank: '0',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-15T10:00:00.000Z',
        deletedAt: null,
      };

      await repo.upsertItemHeader(header1);

      const found = await repo.getItemHeader(ws1, 'header-sql-01');
      expect(found).toEqual(header1);

      const list = await repo.listItemHeaders(ws1);
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe('header-sql-01');

      await repo.deleteItemHeader(ws1, 'header-sql-01');
      expect(await repo.getItemHeader(ws1, 'header-sql-01')).toBeNull();

      await repo.close();
    });
  });

  describe('Drafts & Account Quarantine Lifecycle', () => {
    it('saves, retrieves, quarantines, restores, and purges drafts', async () => {
      const repo = createRepo();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      const draft: DraftRecord = {
        id: 'draft-sql-01',
        workspaceId: ws1,
        userId: user1,
        entityType: 'note',
        entityId: null,
        title: 'Offline Note',
        payload: { content: 'Secret thoughts' },
        savedAt: '2026-10-15T10:15:00.000Z',
        isQuarantined: false,
        quarantinedAt: null,
      };

      await repo.saveDraft(draft);
      const retrieved = await repo.getDraft(ws1, user1, 'draft-sql-01');
      expect(retrieved).toEqual(draft);

      // Quarantine draft
      await repo.quarantineUserDrafts(user1);
      expect(await repo.getDraft(ws1, user1, 'draft-sql-01')).toBeNull();

      const quarantined = await repo.listQuarantinedDrafts(user1);
      expect(quarantined.length).toBe(1);
      expect(quarantined[0]?.isQuarantined).toBe(true);

      // Restore
      await repo.restoreQuarantinedDraft(user1, 'draft-sql-01');
      const restored = await repo.getDraft(ws1, user1, 'draft-sql-01');
      expect(restored).toBeDefined();
      expect(restored?.isQuarantined).toBe(false);

      // Purge
      await repo.quarantineUserDrafts(user1);
      await repo.purgeQuarantinedDrafts(user1);
      expect(await repo.listQuarantinedDrafts(user1)).toEqual([]);

      await repo.close();
    });
  });

  describe('Pending Mutation Queue & Atomic Transactions', () => {
    it('enqueues, retrieves, and removes pending mutations in FIFO client timestamp order', async () => {
      const repo = createRepo();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      const mut1: PendingMutationRecord = {
        operationId: 'op-sql-01',
        deviceId: 'dev-001',
        workspaceId: ws1,
        userId: user1,
        entityType: 'note',
        entityId: 'note-01',
        action: 'create',
        payload: { text: 'Hello 1' },
        baseRevision: 0,
        dependencyOperationIds: [],
        clientTimestamp: '2026-10-15T10:00:00.000Z',
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };

      const mut2: PendingMutationRecord = {
        operationId: 'op-sql-02',
        deviceId: 'dev-001',
        workspaceId: ws1,
        userId: user1,
        entityType: 'note',
        entityId: 'note-02',
        action: 'create',
        payload: { text: 'Hello 2' },
        baseRevision: 0,
        dependencyOperationIds: ['op-sql-01'],
        clientTimestamp: '2026-10-15T10:05:00.000Z',
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };

      await repo.enqueueMutation(mut1);
      await repo.enqueueMutation(mut2);

      const pending = await repo.getPendingMutations(ws1, user1);
      expect(pending.length).toBe(2);
      expect(pending[0]?.operationId).toBe('op-sql-01');
      expect(pending[1]?.operationId).toBe('op-sql-02');

      await repo.removePendingMutation('op-sql-01');
      const remaining = await repo.getPendingMutations(ws1, user1);
      expect(remaining.length).toBe(1);
      expect(remaining[0]?.operationId).toBe('op-sql-02');

      await repo.close();
    });

    it('enforces atomic all-or-nothing rollback on transaction failure', async () => {
      const repo = createRepo();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      const validDraft: DraftRecord = {
        id: 'draft-atomic-01',
        workspaceId: ws1,
        userId: user1,
        entityType: 'task',
        entityId: null,
        title: 'Atomic Draft',
        payload: { summary: 'Atomic write' },
        savedAt: '2026-10-15T10:20:00.000Z',
        isQuarantined: false,
        quarantinedAt: null,
      };

      // Mutation with invalid cross-workspace payload
      const invalidMutation = {
        operationId: 'op-atomic-fail',
        deviceId: 'dev-001',
        workspaceId: ws2, // Violates active namespace
        userId: user1,
        entityType: 'task',
        entityId: 'task-01',
        action: 'create' as const,
        payload: {},
        baseRevision: 0,
        dependencyOperationIds: [],
        clientTimestamp: '2026-10-15T10:20:00.000Z',
        retryCount: 0,
        status: 'pending' as const,
        lastError: null,
      };

      await expect(repo.saveDraftAndMutation(validDraft, invalidMutation)).rejects.toThrow(
        StorageUnavailableError
      );

      // Verify that validDraft was NOT persisted due to rollback
      const foundDraft = await repo.getDraft(ws1, user1, 'draft-atomic-01');
      expect(foundDraft).toBeNull();

      await repo.close();
    });
  });

  describe('Sync Cursors & Preference Snapshots', () => {
    it('persists and updates sync cursors and user preference snapshots', async () => {
      const repo = createRepo();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      const cursor: SyncCursorRecord = {
        workspaceId: ws1,
        userId: user1,
        lastServerRevision: 105,
        cursor: 'opaque-checkpoint-abc-123',
        lastSyncedAt: '2026-10-15T10:25:00.000Z',
        epoch: 'epoch-1',
      };

      await repo.saveCursor(cursor);
      expect(await repo.getCursor(ws1, user1)).toEqual(cursor);

      const snapshot: PreferenceSnapshotRecord = {
        userId: user1,
        preferences: { theme: 'dark', compactMode: true },
        schemaVersion: 1,
        revision: 2,
        updatedAt: '2026-10-15T10:30:00.000Z',
      };

      await repo.savePreferenceSnapshot(snapshot);
      expect(await repo.getPreferenceSnapshot(user1)).toEqual(snapshot);

      await repo.close();
    });
  });

  describe('Complete Account Data Erasure', () => {
    it('erases all account data including item headers and closes handles', async () => {
      const repo = createRepo();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      await repo.upsertItemHeader({
        id: 'header-erase-01',
        workspaceId: ws1,
        kind: 'task',
        folderId: null,
        rank: '0',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-15T10:00:00.000Z',
        deletedAt: null,
      });

      await repo.saveDraft({
        id: 'draft-erase-01',
        workspaceId: ws1,
        userId: user1,
        entityType: 'note',
        entityId: null,
        title: 'Draft to erase',
        payload: { content: 'Bye' },
        savedAt: '2026-10-15T10:00:00.000Z',
        isQuarantined: false,
        quarantinedAt: null,
      });

      await repo.clearAccountData(user1);

      // Reopening with new initialization should find an empty database
      const reopened = createRepo();
      await reopened.initialize({ userId: user1, workspaceId: ws1 });

      const headers = await reopened.listItemHeaders(ws1);
      expect(headers).toEqual([]);
      const drafts = await reopened.listDrafts(ws1, user1);
      expect(drafts).toEqual([]);

      await reopened.close();
    });
  });

  describe('Simulated Encrypted File Handling & Recovery Check', () => {
    it('fails with actionable StorageKeyError and preserves file on disk when database cannot be read', async () => {
      const fileName = `daynori_${user1}_${ws1}.db`;
      const filePath = path.join(testDbDir, fileName);
      const simulatedCiphertext = Buffer.alloc(1024, 0x5a); // 1KB of non-SQLite pseudorandom bytes
      fs.writeFileSync(filePath, simulatedCiphertext);

      // Pre-set key in key store so it attempts to open the existing file
      await keyManager.getOrCreateKey(user1, ws1);

      const repo = createRepo();

      // Opening non-SQLite corrupted/undecryptable file must throw StorageKeyError and close handle
      await expect(repo.initialize({ userId: user1, workspaceId: ws1 })).rejects.toThrow(
        StorageKeyError
      );

      // Invariant: file MUST NOT be deleted or overwritten
      expect(fs.existsSync(filePath)).toBe(true);
      const remainingBytes = fs.readFileSync(filePath);
      expect(remainingBytes.equals(simulatedCiphertext)).toBe(true);
    });
  });
});
