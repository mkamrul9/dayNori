/**
 * SYNTHETIC MODEL TEST (Phase 03 relabel, 2026-10-14).
 * Models storage-adapter semantics with Map-backed fakes named after Expo SQLite and IndexedDB.
 * Everything here runs in plain Node with in-memory classes. It checks the
 * *contract and policy shape* we intend to build against. It does NOT show real
 * browser storage, encrypted persistence, native hardware behavior, or
 * mobile cryptography library compatibility. See tests/spikes/README.md for the
 * observed / documented / untested split and the real experiments.
 */
import { describe, expect, it } from 'vitest';

/**
 * Storage Abstraction Contract
 * Models unified local-first data operations for Mobile SQLite and Web IndexedDB.
 */
interface StorageRecord {
  id: string;
  collection: string;
  payload: Record<string, unknown>;
  updatedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface StorageAdapter {
  name: string;
  type: 'sqlite' | 'indexeddb';
  put(record: StorageRecord): Promise<void>;
  get(collection: string, id: string): Promise<StorageRecord | null>;
  batch(records: StorageRecord[]): Promise<void>;
  migrate(targetVersion: number): Promise<number>;
  handleQuotaExceeded(quotaLimitBytes: number, attemptedBytes: number): boolean;
}

/**
 * Simulated SQLite Adapter
 * Emulates Expo SQLite synchronous/asynchronous SQLite transactions,
 * relational constraints, schema migration steps, and atomicity.
 */
class SimulatedSqliteAdapter implements StorageAdapter {
  name = 'synthetic-sqlite-model'; // Map-backed fake; not expo-sqlite
  type = 'sqlite' as const;
  private tables: Map<string, Map<string, StorageRecord>> = new Map();
  private schemaVersion = 1;

  async put(record: StorageRecord): Promise<void> {
    if (!this.tables.has(record.collection)) {
      this.tables.set(record.collection, new Map());
    }
    this.tables.get(record.collection)!.set(record.id, { ...record });
  }

  async get(collection: string, id: string): Promise<StorageRecord | null> {
    const table = this.tables.get(collection);
    return table?.get(id) ?? null;
  }

  async batch(records: StorageRecord[]): Promise<void> {
    // Atomic transaction simulation: all or nothing
    const snapshot = new Map<string, Map<string, StorageRecord>>();
    for (const [col, rows] of this.tables.entries()) {
      snapshot.set(col, new Map(rows));
    }

    try {
      for (const rec of records) {
        if (rec.id === 'FAIL_TRANSACTION') {
          throw new Error('SQLite disk I/O error during transaction');
        }
        await this.put(rec);
      }
    } catch (err) {
      // Rollback to snapshot
      this.tables = snapshot;
      throw err;
    }
  }

  async migrate(targetVersion: number): Promise<number> {
    while (this.schemaVersion < targetVersion) {
      if (this.schemaVersion === 1) {
        // v1 -> v2: Add syncStatus column
        this.schemaVersion = 2;
      } else if (this.schemaVersion === 2) {
        // v2 -> v3: Add full text search index (FTS5)
        this.schemaVersion = 3;
      }
    }
    return this.schemaVersion;
  }

  handleQuotaExceeded(_quotaLimitBytes: number, attemptedBytes: number): boolean {
    // SQLite files grow dynamically up to available OS disk space;
    // fails only when device storage is completely full.
    return attemptedBytes <= 1024 * 1024 * 1024; // 1GB test ceiling
  }
}

/**
 * Simulated IndexedDB Adapter
 * Emulates browser IndexedDB ObjectStores, transaction lifecycles,
 * auto-eviction risk on low disk space, and quota constraints.
 */
class SimulatedIndexedDBAdapter implements StorageAdapter {
  name = 'browser-indexeddb';
  type = 'indexeddb' as const;
  private objectStores: Map<string, Map<string, StorageRecord>> = new Map();
  private dbVersion = 1;

  async put(record: StorageRecord): Promise<void> {
    if (!this.objectStores.has(record.collection)) {
      this.objectStores.set(record.collection, new Map());
    }
    this.objectStores.get(record.collection)!.set(record.id, { ...record });
  }

  async get(collection: string, id: string): Promise<StorageRecord | null> {
    const store = this.objectStores.get(collection);
    return store?.get(id) ?? null;
  }

  async batch(records: StorageRecord[]): Promise<void> {
    for (const rec of records) {
      await this.put(rec);
    }
  }

  async migrate(targetVersion: number): Promise<number> {
    if (targetVersion > this.dbVersion) {
      // In IndexedDB, onupgradeneeded event handles schema changes
      this.dbVersion = targetVersion;
    }
    return this.dbVersion;
  }

  handleQuotaExceeded(quotaLimitBytes: number, attemptedBytes: number): boolean {
    // Browsers enforce NavigatorStorage.estimate() quotas and may evict
    // non-persistent storage under storage pressure.
    return attemptedBytes <= quotaLimitBytes;
  }
}

describe('[synthetic model] Storage & persistence contract', () => {
  describe('SQLite vs IndexedDB Unified Contract', () => {
    it('executes CRUD operations across both storage platforms', async () => {
      const adapters: StorageAdapter[] = [
        new SimulatedSqliteAdapter(),
        new SimulatedIndexedDBAdapter(),
      ];

      for (const adapter of adapters) {
        const testRecord: StorageRecord = {
          id: 'note-001',
          collection: 'notes',
          payload: { title: 'First Note', content: 'Local-first offline text' },
          updatedAt: Date.now(),
          syncStatus: 'pending',
        };

        await adapter.put(testRecord);
        const fetched = await adapter.get('notes', 'note-001');

        expect(fetched).not.toBeNull();
        expect(fetched?.payload.title).toBe('First Note');
        expect(fetched?.syncStatus).toBe('pending');
      }
    });

    it('enforces atomic transactional rollbacks in SQLite batch operations', async () => {
      const sqlite = new SimulatedSqliteAdapter();

      await sqlite.put({
        id: 'note-initial',
        collection: 'notes',
        payload: { title: 'Initial Note' },
        updatedAt: 1000,
        syncStatus: 'synced',
      });

      const invalidBatch: StorageRecord[] = [
        {
          id: 'note-update-1',
          collection: 'notes',
          payload: { title: 'Valid Note' },
          updatedAt: 2000,
          syncStatus: 'pending',
        },
        {
          id: 'FAIL_TRANSACTION',
          collection: 'notes',
          payload: { title: 'Bad Record' },
          updatedAt: 2000,
          syncStatus: 'pending',
        },
      ];

      await expect(sqlite.batch(invalidBatch)).rejects.toThrow(/SQLite disk I\/O error/);

      // Verify rollback: note-update-1 was NOT written, and note-initial remains intact
      const updatedNote = await sqlite.get('notes', 'note-update-1');
      const initialNote = await sqlite.get('notes', 'note-initial');

      expect(updatedNote).toBeNull();
      expect(initialNote).not.toBeNull();
      expect(initialNote?.payload.title).toBe('Initial Note');
    });

    it('validates schema migration capabilities across versions', async () => {
      const sqlite = new SimulatedSqliteAdapter();
      const idb = new SimulatedIndexedDBAdapter();

      const vSqlite = await sqlite.migrate(3);
      const vIdb = await idb.migrate(3);

      expect(vSqlite).toBe(3);
      expect(vIdb).toBe(3);
    });

    it('demonstrates IndexedDB quota exhaustion and eviction constraints', () => {
      const idb = new SimulatedIndexedDBAdapter();
      const quotaLimit = 50 * 1024 * 1024; // 50MB browser quota allocation

      const fits = idb.handleQuotaExceeded(quotaLimit, 10 * 1024 * 1024); // 10MB
      const exceeds = idb.handleQuotaExceeded(quotaLimit, 60 * 1024 * 1024); // 60MB

      expect(fits).toBe(true);
      expect(exceeds).toBe(false);
    });
  });

  describe('Auth Session Storage & Refresh Lifecycle', () => {
    interface SessionTokens {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    }

    class SessionManager {
      private memoryTokens: SessionTokens | null = null;
      private secureStore: Map<string, string> = new Map();

      saveSession(tokens: SessionTokens, persistSecure: boolean) {
        this.memoryTokens = tokens;
        if (persistSecure) {
          // Native SecureStore or secure cookie
          this.secureStore.set('refresh_token', tokens.refreshToken);
        }
      }

      getAccessToken(): string | null {
        if (!this.memoryTokens) return null;
        if (Date.now() >= this.memoryTokens.expiresAt) {
          return null; // Expired
        }
        return this.memoryTokens.accessToken;
      }

      canRefresh(): boolean {
        return this.secureStore.has('refresh_token');
      }

      refreshSession(newTokens: SessionTokens) {
        if (!this.canRefresh()) throw new Error('No refresh token available');
        this.memoryTokens = newTokens;
        this.secureStore.set('refresh_token', newTokens.refreshToken);
      }

      clearSession() {
        this.memoryTokens = null;
        this.secureStore.delete('refresh_token');
      }
    }

    it('isolates short-lived access tokens in memory and long-lived refresh tokens in secure storage', () => {
      const session = new SessionManager();
      const now = Date.now();

      session.saveSession(
        {
          accessToken: 'jwt.access.token',
          refreshToken: 'rt.longlived.token',
          expiresAt: now + 900000, // 15 mins
        },
        true
      );

      expect(session.getAccessToken()).toBe('jwt.access.token');
      expect(session.canRefresh()).toBe(true);
    });

    it('rejects expired access token and successfully performs refresh cycle', () => {
      const session = new SessionManager();
      const past = Date.now() - 1000;

      session.saveSession(
        {
          accessToken: 'jwt.expired.token',
          refreshToken: 'rt.valid.token',
          expiresAt: past,
        },
        true
      );

      expect(session.getAccessToken()).toBeNull();
      expect(session.canRefresh()).toBe(true);

      session.refreshSession({
        accessToken: 'jwt.new.token',
        refreshToken: 'rt.rotated.token',
        expiresAt: Date.now() + 900000,
      });

      expect(session.getAccessToken()).toBe('jwt.new.token');
    });
  });

  describe('Local-First Offline Navigation State', () => {
    interface RouteState {
      currentRoute: string;
      draftEntityId: string | null;
      isOffline: boolean;
      pendingMutationsCount: number;
    }

    class OfflineNavigationMachine {
      private state: RouteState = {
        currentRoute: '/today',
        draftEntityId: null,
        isOffline: false,
        pendingMutationsCount: 0,
      };

      navigate(route: string, draftId: string | null = null) {
        this.state.currentRoute = route;
        this.state.draftEntityId = draftId;
      }

      setNetworkStatus(isOffline: boolean) {
        this.state.isOffline = isOffline;
      }

      queueMutation() {
        this.state.pendingMutationsCount++;
      }

      getState(): Readonly<RouteState> {
        return { ...this.state };
      }
    }

    it('preserves draft navigation and route state seamlessly during network disconnects', () => {
      const nav = new OfflineNavigationMachine();

      nav.navigate('/notes/draft-123', 'draft-123');
      nav.setNetworkStatus(true); // Offline
      nav.queueMutation();

      const state = nav.getState();
      expect(state.currentRoute).toBe('/notes/draft-123');
      expect(state.draftEntityId).toBe('draft-123');
      expect(state.isOffline).toBe(true);
      expect(state.pendingMutationsCount).toBe(1);
    });
  });
});
