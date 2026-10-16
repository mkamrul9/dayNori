import type {
  ItemHeaderRecord,
  DraftRecord,
  PendingMutationRecord,
  SyncCursorRecord,
  PreferenceSnapshotRecord,
  AccountNamespace,
  LocalRepositoryPort,
  ConflictRecord,
  NoteRecord,
  TaskRecord,
  RoutineRecord,
  RoutineOccurrenceRecord,
} from '@daynori/sync';
import {
  StorageQuotaError,
  StorageUnavailableError,
  StorageMigrationError,
  StorageKeyError,
  validateAccountNamespace,
  validateItemHeaderRecord,
  validateDraftRecord,
  validatePendingMutationRecord,
  validateSyncCursorRecord,
  validatePreferenceSnapshotRecord,
  validateConflictRecord,
  validateNoteRecord,
  validateTaskRecord,
  validateRoutineRecord,
  validateRoutineOccurrenceRecord,
} from '@daynori/sync';
import type { MobileKeyManager } from './keyManager.js';

export interface SqliteDatabaseContract {
  execAsync(source: string): Promise<void>;
  runAsync(
    source: string,
    ...params: unknown[]
  ): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  withTransactionAsync<T>(task: () => Promise<T>): Promise<T>;
  closeAsync(): Promise<void>;
}

export type OpenDatabaseFn = (
  dbName: string,
  options?: Record<string, unknown>
) => Promise<SqliteDatabaseContract>;

export interface SqliteLocalRepositoryOptions {
  keyManager: MobileKeyManager;
  openDatabaseAsync?: OpenDatabaseFn;
  databaseExistsAsync?: (dbName: string) => Promise<boolean>;
  deleteDatabaseAsync?: (dbName: string) => Promise<void>;
  requireSqlCipher?: boolean;
}

export class SqliteLocalRepository implements LocalRepositoryPort {
  private keyManager: MobileKeyManager;
  private openDbFn: OpenDatabaseFn;
  private dbExistsFn: (dbName: string) => Promise<boolean>;
  private dbDeleteFn: (dbName: string) => Promise<void>;
  private requireSqlCipher: boolean;
  private db: SqliteDatabaseContract | null = null;
  private currentNamespace: AccountNamespace | null = null;
  private isClosed = false;
  private mutex: Promise<void> = Promise.resolve();

  constructor(options: SqliteLocalRepositoryOptions) {
    this.keyManager = options.keyManager;
    this.openDbFn =
      options.openDatabaseAsync ||
      (async (dbName: string) => {
        // Dynamic import of expo-sqlite when running on mobile
        const SQLite = await import('expo-sqlite');
        return SQLite.openDatabaseAsync(dbName) as unknown as SqliteDatabaseContract;
      });
    this.dbExistsFn =
      options.databaseExistsAsync ||
      (async (dbName: string) => {
        let expoFsError: unknown = null;
        try {
          const expoFsMod = 'expo-file-system';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const FileSystem: any = await import(expoFsMod);
          if (FileSystem?.documentDirectory) {
            const dbPath = `${FileSystem.documentDirectory}SQLite/${dbName}`;
            const info = await FileSystem.getInfoAsync(dbPath);
            return Boolean(info?.exists);
          }
        } catch (err) {
          expoFsError = err;
        }
        try {
          const fs = await import('node:fs');
          const path = await import('node:path');
          return fs.existsSync(dbName) || fs.existsSync(path.join(process.cwd(), dbName));
        } catch (nodeFsError) {
          throw new StorageUnavailableError(
            `Unable to determine database file existence for "${dbName}": native filesystem check failed: ${expoFsError instanceof Error ? expoFsError.message : String(expoFsError)}; node fallback failed: ${nodeFsError instanceof Error ? nodeFsError.message : String(nodeFsError)}`
          );
        }
      });
    this.dbDeleteFn =
      options.deleteDatabaseAsync ||
      (async (dbName: string) => {
        try {
          const SQLite = await import('expo-sqlite');
          if (typeof SQLite.deleteDatabaseAsync === 'function') {
            await SQLite.deleteDatabaseAsync(dbName);
            return;
          }
        } catch {
          // Fall through
        }
        try {
          const expoFsMod = 'expo-file-system';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const FileSystem: any = await import(expoFsMod);
          if (FileSystem?.documentDirectory) {
            const dbPath = `${FileSystem.documentDirectory}SQLite/${dbName}`;
            await FileSystem.deleteAsync(dbPath, { idempotent: true });
            return;
          }
        } catch {
          // Fallback to node:fs
        }
        try {
          const fs = await import('node:fs');
          const path = await import('node:path');
          const target = fs.existsSync(dbName) ? dbName : path.join(process.cwd(), dbName);
          if (fs.existsSync(target)) {
            fs.unlinkSync(target);
          }
        } catch {
          /* ignore */
        }
      });
    // Production storage enforces SQLCipher capability by default
    this.requireSqlCipher = options.requireSqlCipher ?? true;
  }

  /**
   * Serializes access to SQLite write operations and transactions to prevent
   * concurrent work from entering or contaminating active transactions.
   */
  private async runWithLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutex;
    let release: () => void = () => {};
    this.mutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  getDatabaseFileName(userId: string, workspaceId: string): string {
    return `daynori_${userId}_${workspaceId}.db`;
  }

  getCurrentNamespace(): AccountNamespace | null {
    return this.currentNamespace;
  }

  /**
   * Enforces that the repository is open and initialized, and that requested
   * operations do not cross workspace or account boundaries.
   */
  private ensureNamespace(workspaceId?: string, userId?: string): AccountNamespace {
    if (this.isClosed || !this.db || !this.currentNamespace) {
      throw new StorageUnavailableError(
        'Database is not initialized or has been closed. Call initialize() first.'
      );
    }
    if (workspaceId !== undefined && workspaceId !== this.currentNamespace.workspaceId) {
      throw new StorageUnavailableError(
        `CROSS_WORKSPACE_VIOLATION: Requested workspace "${workspaceId}" does not match active namespace workspace "${this.currentNamespace.workspaceId}".`
      );
    }
    if (userId !== undefined && userId !== this.currentNamespace.userId) {
      throw new StorageUnavailableError(
        `CROSS_ACCOUNT_VIOLATION: Requested user "${userId}" does not match active namespace user "${this.currentNamespace.userId}".`
      );
    }
    return this.currentNamespace;
  }

  async initialize(namespace: AccountNamespace): Promise<void> {
    const validatedNs = validateAccountNamespace(namespace);

    // If an existing database connection was open, cleanly close it before switching
    if (this.db) {
      await this.close();
    }

    this.currentNamespace = validatedNs;
    this.isClosed = false;

    const dbName = this.getDatabaseFileName(validatedNs.userId, validatedNs.workspaceId);

    // 1. Distinguish new storage from existing database file
    const exists = await this.dbExistsFn(dbName);
    const hasExistingKey = await this.keyManager.hasKey(
      validatedNs.userId,
      validatedNs.workspaceId
    );

    if (exists && !hasExistingKey) {
      // Existing data must never be overwritten with a new key if the original key is missing
      throw new StorageKeyError(
        `KEY_NOT_FOUND: Existing database file "${dbName}" found on disk, but encryption key is missing from KeyStore. Will not replace key over existing data.`
      );
    }

    // Retrieve existing key or generate a new key for a brand-new database
    const key = await this.keyManager.getOrCreateKey(validatedNs.userId, validatedNs.workspaceId);

    try {
      // 2. Open the SQLite database
      this.db = await this.openDbFn(dbName);

      // 3. Apply the SQLCipher encryption key immediately
      await this.db.execAsync(`PRAGMA key = '${key}';`);

      // 4. Verify SQLCipher capability if required
      if (this.requireSqlCipher) {
        const cipherVer = await this.db.getFirstAsync<{ cipher_version?: string }>(
          'PRAGMA cipher_version;'
        );
        if (!cipherVer || !cipherVer.cipher_version) {
          throw new StorageKeyError(
            'SQLCIPHER_UNAVAILABLE: Underlying SQLite engine does not support SQLCipher encryption.'
          );
        }
      }

      // 5. Verify decryption by touching the database schema page (not SELECT 1 alone)
      try {
        await this.db.getAllAsync('SELECT count(*) FROM sqlite_master;');
      } catch (decryptErr) {
        // Close handle on decryption failure, preserve file on disk intact
        if (this.db) {
          try {
            await this.db.closeAsync();
          } catch {
            /* ignore */
          }
          this.db = null;
        }
        this.currentNamespace = null;
        throw new StorageKeyError(
          `KEY_INVALIDATED_OR_MISMATCH: Database file "${dbName}" exists but could not be decrypted with the provided KeyStore key: ${decryptErr instanceof Error ? decryptErr.message : String(decryptErr)}`
        );
      }

      // 6. Run transaction-safe migrations
      await this.runMigrations();
    } catch (err: unknown) {
      if (err instanceof StorageKeyError) {
        throw err;
      }
      if (this.db) {
        try {
          await this.db.closeAsync();
        } catch {
          /* ignore */
        }
        this.db = null;
      }
      this.currentNamespace = null;
      throw new StorageUnavailableError(
        `Failed to open encrypted database "${dbName}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async runMigrations(): Promise<void> {
    const db = this.ensureOpen();
    try {
      await db.withTransactionAsync(async () => {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
          );
        `);

        const row = await db.getFirstAsync<{ version: number }>(
          'SELECT MAX(version) as version FROM schema_migrations;'
        );
        const currentVersion = row?.version ?? 0;

        if (currentVersion < 1) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS item_headers (
              id TEXT NOT NULL,
              workspace_id TEXT NOT NULL,
              kind TEXT NOT NULL,
              folder_id TEXT,
              rank TEXT NOT NULL,
              is_archived INTEGER NOT NULL,
              is_pinned INTEGER NOT NULL,
              security_scope TEXT NOT NULL,
              server_revision INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              deleted_at TEXT,
              PRIMARY KEY (workspace_id, id)
            );

            CREATE TABLE IF NOT EXISTS drafts (
              id TEXT NOT NULL,
              workspace_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              entity_type TEXT NOT NULL,
              entity_id TEXT,
              title TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              saved_at TEXT NOT NULL,
              is_quarantined INTEGER NOT NULL DEFAULT 0,
              quarantined_at TEXT,
              PRIMARY KEY (workspace_id, user_id, id)
            );

            CREATE TABLE IF NOT EXISTS pending_mutations (
              operation_id TEXT PRIMARY KEY,
              device_id TEXT NOT NULL,
              workspace_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              entity_type TEXT NOT NULL,
              entity_id TEXT NOT NULL,
              action TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              base_revision INTEGER NOT NULL,
              dependency_operation_ids_json TEXT NOT NULL,
              client_timestamp TEXT NOT NULL,
              retry_count INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL,
              last_error TEXT
            );

            CREATE TABLE IF NOT EXISTS sync_cursors (
              workspace_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              last_server_revision INTEGER NOT NULL,
              cursor TEXT NOT NULL,
              last_synced_at TEXT NOT NULL,
              epoch TEXT NOT NULL,
              PRIMARY KEY (workspace_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS preference_snapshots (
              user_id TEXT PRIMARY KEY,
              preferences_json TEXT NOT NULL,
              schema_version INTEGER NOT NULL,
              revision INTEGER NOT NULL,
              updated_at TEXT NOT NULL
            );

            INSERT INTO schema_migrations (version, applied_at) VALUES (1, datetime('now'));
          `);
        }

        if (currentVersion < 2) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS conflicts (
              workspace_id TEXT NOT NULL,
              id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              entity_id TEXT NOT NULL,
              entity_type TEXT NOT NULL,
              operation_id TEXT NOT NULL,
              local_payload_json TEXT NOT NULL,
              base_revision INTEGER NOT NULL,
              server_revision INTEGER NOT NULL,
              server_state_json TEXT,
              conflict_reason TEXT NOT NULL,
              detected_at TEXT NOT NULL,
              resolved INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY (workspace_id, id)
            );

            INSERT INTO schema_migrations (version, applied_at) VALUES (2, datetime('now'));
          `);
        }

        if (currentVersion < 3) {
          try {
            await db.execAsync(`
              ALTER TABLE item_headers ADD COLUMN name TEXT;
              ALTER TABLE item_headers ADD COLUMN color TEXT;
              ALTER TABLE item_headers ADD COLUMN icon TEXT;
              ALTER TABLE item_headers ADD COLUMN parent_id TEXT;
            `);
          } catch {
            /* ignore if columns already exist */
          }
          await db.execAsync(`
            INSERT INTO schema_migrations (version, applied_at) VALUES (3, datetime('now'));
          `);
        }

        if (currentVersion < 4) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS notes (
              id TEXT NOT NULL,
              workspace_id TEXT NOT NULL,
              folder_id TEXT,
              title TEXT,
              document_json TEXT NOT NULL,
              plain_text TEXT NOT NULL,
              word_count INTEGER NOT NULL,
              char_count INTEGER NOT NULL,
              server_revision INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              deleted_at TEXT,
              PRIMARY KEY (workspace_id, id)
            );

            INSERT INTO schema_migrations (version, applied_at) VALUES (4, datetime('now'));
          `);
        }

        if (currentVersion < 5) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS tasks (
              id TEXT NOT NULL,
              workspace_id TEXT NOT NULL,
              folder_id TEXT,
              title TEXT NOT NULL,
              details TEXT,
              priority TEXT NOT NULL,
              status TEXT NOT NULL,
              deadline_json TEXT NOT NULL,
              completed_at TEXT,
              reopened_at TEXT,
              completion_history_json TEXT NOT NULL,
              parent_id TEXT,
              subtask_order INTEGER NOT NULL DEFAULT 0,
              tags_json TEXT NOT NULL,
              server_revision INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              deleted_at TEXT,
              PRIMARY KEY (workspace_id, id)
            );

            INSERT INTO schema_migrations (version, applied_at) VALUES (5, datetime('now'));
          `);
        }

        if (currentVersion < 6) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS routines (
              id TEXT NOT NULL,
              workspace_id TEXT NOT NULL,
              folder_id TEXT,
              title TEXT NOT NULL,
              details TEXT,
              frequency TEXT NOT NULL,
              weekdays_json TEXT NOT NULL,
              timezone TEXT NOT NULL,
              scheduled_time TEXT,
              active_from TEXT NOT NULL,
              active_to TEXT,
              is_paused INTEGER NOT NULL DEFAULT 0,
              is_archived INTEGER NOT NULL DEFAULT 0,
              is_pinned INTEGER NOT NULL DEFAULT 0,
              schedule_revision INTEGER NOT NULL DEFAULT 1,
              effective_date TEXT NOT NULL,
              server_revision INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              deleted_at TEXT,
              PRIMARY KEY (workspace_id, id)
            );

            CREATE TABLE IF NOT EXISTS routine_occurrences (
              id TEXT NOT NULL,
              workspace_id TEXT NOT NULL,
              routine_id TEXT NOT NULL,
              scheduled_date TEXT NOT NULL,
              schedule_revision INTEGER NOT NULL DEFAULT 1,
              planned_instant TEXT,
              timezone TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              completed_at TEXT,
              completed_by TEXT,
              history_json TEXT NOT NULL,
              server_revision INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (workspace_id, id),
              UNIQUE (workspace_id, routine_id, scheduled_date)
            );

            CREATE INDEX IF NOT EXISTS idx_routine_occurrences_lookup
            ON routine_occurrences (workspace_id, routine_id, scheduled_date);

            INSERT INTO schema_migrations (version, applied_at) VALUES (6, datetime('now'));
          `);
        }
      });
    } catch (err: unknown) {
      throw new StorageMigrationError(
        `Failed to apply local SQLite schema migrations: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async close(): Promise<void> {
    this.isClosed = true;
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
    this.currentNamespace = null;
  }

  private ensureOpen(): SqliteDatabaseContract {
    if (this.isClosed || !this.db) {
      throw new StorageUnavailableError('Encrypted SQLite database is closed or uninitialized.');
    }
    return this.db;
  }

  private mapError(err: unknown): Error {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('SQLITE_FULL') || msg.toLowerCase().includes('database or disk is full')) {
      return new StorageQuotaError(msg);
    }
    if (msg.includes('file is not a database') || msg.includes('SQLCipher error')) {
      return new StorageKeyError(`Failed to decrypt database with key: ${msg}`);
    }
    return new StorageUnavailableError(msg);
  }

  async getCurrentSchemaVersion(): Promise<number> {
    const db = this.ensureOpen();
    const row = await db.getFirstAsync<{ version: number }>(
      'SELECT MAX(version) as version FROM schema_migrations;'
    );
    return row?.version ?? 0;
  }

  // --- 1. Item Headers ---

  async getItemHeader(workspaceId: string, id: string): Promise<ItemHeaderRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    try {
      const row = await db.getFirstAsync<{
        id: string;
        workspace_id: string;
        kind: string;
        folder_id: string | null;
        rank: string;
        is_archived: number;
        is_pinned: number;
        security_scope: 'standard' | 'vault';
        server_revision: number;
        name?: string | null;
        color?: string | null;
        icon?: string | null;
        parent_id?: string | null;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>(`SELECT * FROM item_headers WHERE workspace_id = ? AND id = ?;`, workspaceId, id);

      if (!row) return null;
      const header: ItemHeaderRecord = {
        id: row.id,
        workspaceId: row.workspace_id,
        kind: row.kind,
        folderId: row.folder_id,
        rank: row.rank,
        isArchived: Boolean(row.is_archived),
        isPinned: Boolean(row.is_pinned),
        securityScope: row.security_scope,
        serverRevision: row.server_revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      };
      if (row.name != null) header.name = row.name;
      if (row.color != null) header.color = row.color;
      if (row.icon != null) header.icon = row.icon;
      if (row.parent_id != null) header.parentId = row.parent_id;
      return header;
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async listItemHeaders(workspaceId: string): Promise<ItemHeaderRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    try {
      const rows = await db.getAllAsync<{
        id: string;
        workspace_id: string;
        kind: string;
        folder_id: string | null;
        rank: string;
        is_archived: number;
        is_pinned: number;
        security_scope: 'standard' | 'vault';
        server_revision: number;
        name?: string | null;
        color?: string | null;
        icon?: string | null;
        parent_id?: string | null;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>(
        `SELECT * FROM item_headers WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY rank ASC;`,
        workspaceId
      );

      return rows.map((r) => {
        const item: ItemHeaderRecord = {
          id: r.id,
          workspaceId: r.workspace_id,
          kind: r.kind,
          folderId: r.folder_id,
          rank: r.rank,
          isArchived: Boolean(r.is_archived),
          isPinned: Boolean(r.is_pinned),
          securityScope: r.security_scope,
          serverRevision: r.server_revision,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          deletedAt: r.deleted_at,
        };
        if (r.name != null) item.name = r.name;
        if (r.color != null) item.color = r.color;
        if (r.icon != null) item.icon = r.icon;
        if (r.parent_id != null) item.parentId = r.parent_id;
        return item;
      });
    } catch (err) {
      throw this.mapError(err);
    }
  }

  private async upsertItemHeaderDirect(valid: ItemHeaderRecord): Promise<void> {
    const db = this.ensureOpen();
    await db.runAsync(
      `INSERT INTO item_headers (
        id, workspace_id, kind, folder_id, rank, is_archived, is_pinned,
        security_scope, server_revision, name, color, icon, parent_id,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id, id) DO UPDATE SET
        kind = excluded.kind,
        folder_id = excluded.folder_id,
        rank = excluded.rank,
        is_archived = excluded.is_archived,
        is_pinned = excluded.is_pinned,
        security_scope = excluded.security_scope,
        server_revision = excluded.server_revision,
        name = excluded.name,
        color = excluded.color,
        icon = excluded.icon,
        parent_id = excluded.parent_id,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at;`,
      valid.id,
      valid.workspaceId,
      valid.kind,
      valid.folderId ?? null,
      valid.rank,
      valid.isArchived ? 1 : 0,
      valid.isPinned ? 1 : 0,
      valid.securityScope,
      valid.serverRevision,
      valid.name ?? null,
      valid.color ?? null,
      valid.icon ?? null,
      valid.parentId ?? valid.folderId ?? null,
      valid.createdAt,
      valid.updatedAt,
      valid.deletedAt ?? null
    );
  }

  async upsertItemHeader(header: ItemHeaderRecord): Promise<void> {
    const valid = validateItemHeaderRecord(header);
    this.ensureNamespace(valid.workspaceId);
    return this.runWithLock(async () => {
      try {
        await this.upsertItemHeaderDirect(valid);
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async deleteItemHeader(workspaceId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.runAsync(
          `DELETE FROM item_headers WHERE workspace_id = ? AND id = ?;`,
          workspaceId,
          id
        );
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  // --- 2. Drafts & Quarantine ---

  async getDraft(workspaceId: string, userId: string, id: string): Promise<DraftRecord | null> {
    this.ensureNamespace(workspaceId, userId);
    const db = this.ensureOpen();
    try {
      const row = await db.getFirstAsync<{
        id: string;
        workspace_id: string;
        user_id: string;
        entity_type: string;
        entity_id: string | null;
        title: string;
        payload_json: string;
        saved_at: string;
        is_quarantined: number;
        quarantined_at: string | null;
      }>(
        `SELECT * FROM drafts WHERE workspace_id = ? AND user_id = ? AND id = ?;`,
        workspaceId,
        userId,
        id
      );

      if (!row || Boolean(row.is_quarantined)) return null;
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        userId: row.user_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        title: row.title,
        payload: JSON.parse(row.payload_json),
        savedAt: row.saved_at,
        isQuarantined: false,
        quarantinedAt: null,
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async listDrafts(workspaceId: string, userId: string): Promise<DraftRecord[]> {
    this.ensureNamespace(workspaceId, userId);
    const db = this.ensureOpen();
    try {
      const rows = await db.getAllAsync<{
        id: string;
        workspace_id: string;
        user_id: string;
        entity_type: string;
        entity_id: string | null;
        title: string;
        payload_json: string;
        saved_at: string;
        is_quarantined: number;
        quarantined_at: string | null;
      }>(
        `SELECT * FROM drafts WHERE workspace_id = ? AND user_id = ? AND is_quarantined = 0 ORDER BY saved_at DESC;`,
        workspaceId,
        userId
      );

      return rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspace_id,
        userId: r.user_id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        title: r.title,
        payload: JSON.parse(r.payload_json),
        savedAt: r.saved_at,
        isQuarantined: false,
        quarantinedAt: null,
      }));
    } catch (err) {
      throw this.mapError(err);
    }
  }

  private async saveDraftDirect(valid: DraftRecord): Promise<void> {
    const db = this.ensureOpen();
    await db.runAsync(
      `INSERT INTO drafts (
        id, workspace_id, user_id, entity_type, entity_id, title, payload_json,
        saved_at, is_quarantined, quarantined_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id, user_id, id) DO UPDATE SET
        entity_type = excluded.entity_type,
        entity_id = excluded.entity_id,
        title = excluded.title,
        payload_json = excluded.payload_json,
        saved_at = excluded.saved_at,
        is_quarantined = excluded.is_quarantined,
        quarantined_at = excluded.quarantined_at;`,
      valid.id,
      valid.workspaceId,
      valid.userId,
      valid.entityType,
      valid.entityId ?? null,
      valid.title,
      JSON.stringify(valid.payload),
      valid.savedAt,
      valid.isQuarantined ? 1 : 0,
      valid.quarantinedAt ?? null
    );
  }

  async saveDraft(draft: DraftRecord): Promise<void> {
    const valid = validateDraftRecord(draft);
    this.ensureNamespace(valid.workspaceId, valid.userId);
    return this.runWithLock(async () => {
      try {
        await this.saveDraftDirect(valid);
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async deleteDraft(workspaceId: string, userId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId, userId);
    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.runAsync(
          `DELETE FROM drafts WHERE workspace_id = ? AND user_id = ? AND id = ?;`,
          workspaceId,
          userId,
          id
        );
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async quarantineUserDrafts(userId: string): Promise<void> {
    this.ensureNamespace(undefined, userId);
    const db = this.ensureOpen();
    const now = new Date().toISOString();
    return this.runWithLock(async () => {
      try {
        await db.runAsync(
          `UPDATE drafts SET is_quarantined = 1, quarantined_at = ? WHERE user_id = ? AND is_quarantined = 0;`,
          now,
          userId
        );
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async listQuarantinedDrafts(userId: string): Promise<DraftRecord[]> {
    this.ensureNamespace(undefined, userId);
    const db = this.ensureOpen();
    try {
      const rows = await db.getAllAsync<{
        id: string;
        workspace_id: string;
        user_id: string;
        entity_type: string;
        entity_id: string | null;
        title: string;
        payload_json: string;
        saved_at: string;
        is_quarantined: number;
        quarantined_at: string | null;
      }>(
        `SELECT * FROM drafts WHERE user_id = ? AND is_quarantined = 1 ORDER BY quarantined_at DESC;`,
        userId
      );

      return rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspace_id,
        userId: r.user_id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        title: r.title,
        payload: JSON.parse(r.payload_json),
        savedAt: r.saved_at,
        isQuarantined: true,
        quarantinedAt: r.quarantined_at,
      }));
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async restoreQuarantinedDraft(userId: string, id: string): Promise<void> {
    this.ensureNamespace(undefined, userId);
    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.runAsync(
          `UPDATE drafts SET is_quarantined = 0, quarantined_at = NULL WHERE user_id = ? AND id = ?;`,
          userId,
          id
        );
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async purgeQuarantinedDrafts(userId: string): Promise<void> {
    this.ensureNamespace(undefined, userId);
    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.runAsync(`DELETE FROM drafts WHERE user_id = ? AND is_quarantined = 1;`, userId);
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  // --- 3. Pending Operations / Mutations ---

  private async enqueueMutationDirect(valid: PendingMutationRecord): Promise<void> {
    const db = this.ensureOpen();
    await db.runAsync(
      `INSERT INTO pending_mutations (
        operation_id, device_id, workspace_id, user_id, entity_type, entity_id, action,
        payload_json, base_revision, dependency_operation_ids_json, client_timestamp, retry_count, status, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (operation_id) DO UPDATE SET
        retry_count = excluded.retry_count,
        status = excluded.status,
        last_error = excluded.last_error;`,
      valid.operationId,
      valid.deviceId,
      valid.workspaceId,
      valid.userId,
      valid.entityType,
      valid.entityId,
      valid.action,
      JSON.stringify(valid.payload),
      valid.baseRevision,
      JSON.stringify(valid.dependencyOperationIds),
      valid.clientTimestamp,
      valid.retryCount,
      valid.status,
      valid.lastError ?? null
    );
  }

  async enqueueMutation(mutation: PendingMutationRecord): Promise<void> {
    const valid = validatePendingMutationRecord(mutation);
    this.ensureNamespace(valid.workspaceId, valid.userId);
    return this.runWithLock(async () => {
      try {
        await this.enqueueMutationDirect(valid);
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async getPendingMutations(workspaceId: string, userId: string): Promise<PendingMutationRecord[]> {
    this.ensureNamespace(workspaceId, userId);
    const db = this.ensureOpen();
    try {
      const rows = await db.getAllAsync<{
        operation_id: string;
        device_id: string;
        workspace_id: string;
        user_id: string;
        entity_type: string;
        entity_id: string;
        action: 'create' | 'update' | 'delete';
        payload_json: string;
        base_revision: number;
        dependency_operation_ids_json: string;
        client_timestamp: string;
        retry_count: number;
        status: 'pending' | 'in_flight' | 'failed';
        last_error: string | null;
      }>(
        `SELECT * FROM pending_mutations WHERE workspace_id = ? AND user_id = ? ORDER BY client_timestamp ASC;`,
        workspaceId,
        userId
      );

      return rows.map((r) => ({
        operationId: r.operation_id,
        deviceId: r.device_id,
        workspaceId: r.workspace_id,
        userId: r.user_id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        action: r.action,
        payload: JSON.parse(r.payload_json),
        baseRevision: r.base_revision,
        dependencyOperationIds: JSON.parse(r.dependency_operation_ids_json),
        clientTimestamp: r.client_timestamp,
        retryCount: r.retry_count,
        status: r.status,
        lastError: r.last_error,
      }));
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async removePendingMutation(operationId: string): Promise<void> {
    const ns = this.ensureNamespace();
    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        // Ensure the mutation belongs to current active namespace before deleting
        const existing = await db.getFirstAsync<{ workspace_id: string; user_id: string }>(
          `SELECT workspace_id, user_id FROM pending_mutations WHERE operation_id = ?;`,
          operationId
        );
        if (!existing) {
          return;
        }
        if (existing.workspace_id !== ns.workspaceId || existing.user_id !== ns.userId) {
          throw new StorageUnavailableError('Cross-workspace mutation removal rejected.');
        }
        await db.runAsync(`DELETE FROM pending_mutations WHERE operation_id = ?;`, operationId);
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  // --- 4. Atomic Multi-Store Writes ---

  async saveDraftAndMutation(draft: DraftRecord, mutation: PendingMutationRecord): Promise<void> {
    const validDraft = validateDraftRecord(draft);
    const validMut = validatePendingMutationRecord(mutation);
    this.ensureNamespace(validDraft.workspaceId, validDraft.userId);
    this.ensureNamespace(validMut.workspaceId, validMut.userId);

    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.withTransactionAsync(async () => {
          await this.saveDraftDirect(validDraft);
          await this.enqueueMutationDirect(validMut);
        });
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  private async upsertNoteDirect(valid: NoteRecord): Promise<void> {
    const db = this.ensureOpen();
    await db.runAsync(
      `INSERT INTO notes (
        id, workspace_id, folder_id, title, document_json, plain_text,
        word_count, char_count, server_revision, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id, id) DO UPDATE SET
        folder_id = excluded.folder_id,
        title = excluded.title,
        document_json = excluded.document_json,
        plain_text = excluded.plain_text,
        word_count = excluded.word_count,
        char_count = excluded.char_count,
        server_revision = excluded.server_revision,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at;`,
      valid.id,
      valid.workspaceId,
      valid.folderId ?? null,
      valid.title ?? null,
      JSON.stringify(valid.document),
      valid.plainText,
      valid.wordCount,
      valid.charCount,
      valid.serverRevision,
      valid.createdAt,
      valid.updatedAt,
      valid.deletedAt ?? null
    );
  }

  private async upsertTaskDirect(valid: TaskRecord): Promise<void> {
    const db = this.ensureOpen();
    await db.runAsync(
      `INSERT INTO tasks (
        id, workspace_id, folder_id, title, details, priority, status,
        deadline_json, completed_at, reopened_at, completion_history_json,
        parent_id, subtask_order, tags_json, server_revision, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id, id) DO UPDATE SET
        folder_id = excluded.folder_id,
        title = excluded.title,
        details = excluded.details,
        priority = excluded.priority,
        status = excluded.status,
        deadline_json = excluded.deadline_json,
        completed_at = excluded.completed_at,
        reopened_at = excluded.reopened_at,
        completion_history_json = excluded.completion_history_json,
        parent_id = excluded.parent_id,
        subtask_order = excluded.subtask_order,
        tags_json = excluded.tags_json,
        server_revision = excluded.server_revision,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at;`,
      valid.id,
      valid.workspaceId,
      valid.folderId ?? null,
      valid.title,
      valid.details ?? null,
      valid.priority,
      valid.status,
      JSON.stringify(valid.deadline),
      valid.completedAt ?? null,
      valid.reopenedAt ?? null,
      JSON.stringify(valid.completionHistory),
      valid.parentId ?? null,
      valid.subtaskOrder,
      JSON.stringify(valid.tags),
      valid.serverRevision,
      valid.createdAt,
      valid.updatedAt,
      valid.deletedAt ?? null
    );
  }

  private async upsertRoutineDirect(valid: RoutineRecord): Promise<void> {
    const db = this.ensureOpen();
    await db.runAsync(
      `INSERT INTO routines (
        id, workspace_id, folder_id, title, details, frequency,
        weekdays_json, timezone, scheduled_time, active_from, active_to,
        is_paused, is_archived, is_pinned, schedule_revision, effective_date,
        server_revision, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id, id) DO UPDATE SET
        folder_id = excluded.folder_id,
        title = excluded.title,
        details = excluded.details,
        frequency = excluded.frequency,
        weekdays_json = excluded.weekdays_json,
        timezone = excluded.timezone,
        scheduled_time = excluded.scheduled_time,
        active_from = excluded.active_from,
        active_to = excluded.active_to,
        is_paused = excluded.is_paused,
        is_archived = excluded.is_archived,
        is_pinned = excluded.is_pinned,
        schedule_revision = excluded.schedule_revision,
        effective_date = excluded.effective_date,
        server_revision = excluded.server_revision,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at;`,
      valid.id,
      valid.workspaceId,
      valid.folderId ?? null,
      valid.title,
      valid.details ?? null,
      valid.frequency,
      JSON.stringify(valid.weekdays),
      valid.timezone,
      valid.scheduledTime ?? null,
      valid.activeFrom,
      valid.activeTo ?? null,
      valid.isPaused ? 1 : 0,
      valid.isArchived ? 1 : 0,
      valid.isPinned ? 1 : 0,
      valid.scheduleRevision,
      valid.effectiveDate,
      valid.serverRevision,
      valid.createdAt,
      valid.updatedAt,
      valid.deletedAt ?? null
    );
  }

  private async upsertRoutineOccurrenceDirect(valid: RoutineOccurrenceRecord): Promise<void> {
    const db = this.ensureOpen();
    await db.runAsync(
      `INSERT INTO routine_occurrences (
        id, workspace_id, routine_id, scheduled_date, schedule_revision,
        planned_instant, timezone, status, completed_at, completed_by,
        history_json, server_revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id, id) DO UPDATE SET
        routine_id = excluded.routine_id,
        scheduled_date = excluded.scheduled_date,
        schedule_revision = excluded.schedule_revision,
        planned_instant = excluded.planned_instant,
        timezone = excluded.timezone,
        status = excluded.status,
        completed_at = excluded.completed_at,
        completed_by = excluded.completed_by,
        history_json = excluded.history_json,
        server_revision = excluded.server_revision,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;`,
      valid.id,
      valid.workspaceId,
      valid.routineId,
      valid.scheduledDate,
      valid.scheduleRevision,
      valid.plannedInstant ?? null,
      valid.timezone,
      valid.status,
      valid.completedAt ?? null,
      valid.completedBy ?? null,
      JSON.stringify(valid.history),
      valid.serverRevision,
      valid.createdAt,
      valid.updatedAt
    );
  }

  async saveItemTransaction(
    item: ItemHeaderRecord,
    mutation: PendingMutationRecord,
    draft?: DraftRecord,
    note?: NoteRecord,
    task?: TaskRecord,
    routine?: RoutineRecord,
    occurrence?: RoutineOccurrenceRecord
  ): Promise<void> {
    const validItem = validateItemHeaderRecord(item);
    const validMut = validatePendingMutationRecord(mutation);
    const validDraft = draft ? validateDraftRecord(draft) : undefined;
    const validNote = note ? validateNoteRecord(note) : undefined;
    const validTask = task ? validateTaskRecord(task) : undefined;
    const validRoutine = routine ? validateRoutineRecord(routine) : undefined;
    const validOccurrence = occurrence ? validateRoutineOccurrenceRecord(occurrence) : undefined;

    this.ensureNamespace(validItem.workspaceId);
    this.ensureNamespace(validMut.workspaceId, validMut.userId);
    if (validDraft) {
      this.ensureNamespace(validDraft.workspaceId, validDraft.userId);
    }
    if (validNote) {
      this.ensureNamespace(validNote.workspaceId);
    }
    if (validTask) {
      this.ensureNamespace(validTask.workspaceId);
    }
    if (validRoutine) {
      this.ensureNamespace(validRoutine.workspaceId);
    }
    if (validOccurrence) {
      this.ensureNamespace(validOccurrence.workspaceId);
    }

    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.withTransactionAsync(async () => {
          await this.upsertItemHeaderDirect(validItem);
          await this.enqueueMutationDirect(validMut);
          if (validDraft) {
            await this.saveDraftDirect(validDraft);
          }
          if (validNote) {
            await this.upsertNoteDirect(validNote);
          }
          if (validTask) {
            await this.upsertTaskDirect(validTask);
          }
          if (validRoutine) {
            await this.upsertRoutineDirect(validRoutine);
          }
          if (validOccurrence) {
            await this.upsertRoutineOccurrenceDirect(validOccurrence);
          }
        });
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async applyAcknowledgment(
    header: ItemHeaderRecord,
    operationId: string,
    note?: NoteRecord,
    task?: TaskRecord,
    routine?: RoutineRecord,
    occurrence?: RoutineOccurrenceRecord
  ): Promise<void> {
    const valid = validateItemHeaderRecord(header);
    const validNote = note ? validateNoteRecord(note) : undefined;
    const validTask = task ? validateTaskRecord(task) : undefined;
    const validRoutine = routine ? validateRoutineRecord(routine) : undefined;
    const validOccurrence = occurrence ? validateRoutineOccurrenceRecord(occurrence) : undefined;
    this.ensureNamespace(valid.workspaceId);
    if (validNote) this.ensureNamespace(validNote.workspaceId);
    if (validTask) this.ensureNamespace(validTask.workspaceId);
    if (validRoutine) this.ensureNamespace(validRoutine.workspaceId);
    if (validOccurrence) this.ensureNamespace(validOccurrence.workspaceId);

    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.withTransactionAsync(async () => {
          await this.upsertItemHeaderDirect(valid);
          await db.runAsync(`DELETE FROM pending_mutations WHERE operation_id = ?;`, operationId);
          if (validNote) {
            await this.upsertNoteDirect(validNote);
          }
          if (validTask) {
            await this.upsertTaskDirect(validTask);
          }
          if (validRoutine) {
            await this.upsertRoutineDirect(validRoutine);
          }
          if (validOccurrence) {
            await this.upsertRoutineOccurrenceDirect(validOccurrence);
          }
        });
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async applyPullPage(
    changes: ItemHeaderRecord[],
    newCursor: SyncCursorRecord,
    notes?: NoteRecord[],
    tasks?: TaskRecord[],
    routines?: RoutineRecord[],
    occurrences?: RoutineOccurrenceRecord[]
  ): Promise<void> {
    const validCursor = validateSyncCursorRecord(newCursor);
    this.ensureNamespace(validCursor.workspaceId, validCursor.userId);
    const validatedChanges = changes.map((c) => validateItemHeaderRecord(c));
    for (const c of validatedChanges) {
      this.ensureNamespace(c.workspaceId);
    }
    const validatedNotes = (notes || []).map((n) => validateNoteRecord(n));
    for (const n of validatedNotes) {
      this.ensureNamespace(n.workspaceId);
    }
    const validatedTasks = (tasks || []).map((t) => validateTaskRecord(t));
    for (const t of validatedTasks) {
      this.ensureNamespace(t.workspaceId);
    }
    const validatedRoutines = (routines || []).map((r) => validateRoutineRecord(r));
    for (const r of validatedRoutines) {
      this.ensureNamespace(r.workspaceId);
    }
    const validatedOccurrences = (occurrences || []).map((o) => validateRoutineOccurrenceRecord(o));
    for (const o of validatedOccurrences) {
      this.ensureNamespace(o.workspaceId);
    }

    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.withTransactionAsync(async () => {
          for (const change of validatedChanges) {
            const existing = await db.getFirstAsync<{
              server_revision: number;
              deleted_at: string | null;
            }>(
              `SELECT server_revision, deleted_at FROM item_headers WHERE workspace_id = ? AND id = ?;`,
              change.workspaceId,
              change.id
            );

            if (existing) {
              // Never overwrite with a stale/older revision
              if (existing.server_revision > change.serverRevision) {
                continue;
              }
              // Explicit newer restore check
              if (
                existing.deleted_at !== null &&
                change.deletedAt === null &&
                change.serverRevision <= existing.server_revision
              ) {
                continue;
              }
            }

            await this.upsertItemHeaderDirect(change);
          }

          for (const n of validatedNotes) {
            const existingNote = await db.getFirstAsync<{ server_revision: number }>(
              `SELECT server_revision FROM notes WHERE workspace_id = ? AND id = ?;`,
              n.workspaceId,
              n.id
            );
            if (existingNote && existingNote.server_revision > n.serverRevision) {
              continue;
            }
            await this.upsertNoteDirect(n);
          }

          for (const t of validatedTasks) {
            const existingTask = await db.getFirstAsync<{ server_revision: number }>(
              `SELECT server_revision FROM tasks WHERE workspace_id = ? AND id = ?;`,
              t.workspaceId,
              t.id
            );
            if (existingTask && existingTask.server_revision > t.serverRevision) {
              continue;
            }
            await this.upsertTaskDirect(t);
          }

          for (const r of validatedRoutines) {
            const existingRoutine = await db.getFirstAsync<{ server_revision: number }>(
              `SELECT server_revision FROM routines WHERE workspace_id = ? AND id = ?;`,
              r.workspaceId,
              r.id
            );
            if (existingRoutine && existingRoutine.server_revision > r.serverRevision) {
              continue;
            }
            await this.upsertRoutineDirect(r);
          }

          for (const o of validatedOccurrences) {
            const existingOcc = await db.getFirstAsync<{ server_revision: number }>(
              `SELECT server_revision FROM routine_occurrences WHERE workspace_id = ? AND id = ?;`,
              o.workspaceId,
              o.id
            );
            if (existingOcc && existingOcc.server_revision > o.serverRevision) {
              continue;
            }
            await this.upsertRoutineOccurrenceDirect(o);
          }

          // Cursor advancement check: protect against moving cursor backward
          const existingCursor = await db.getFirstAsync<{ last_server_revision: number }>(
            `SELECT last_server_revision FROM sync_cursors WHERE workspace_id = ? AND user_id = ?;`,
            validCursor.workspaceId,
            validCursor.userId
          );

          if (
            !existingCursor ||
            existingCursor.last_server_revision <= validCursor.lastServerRevision
          ) {
            await this.saveCursorDirect(validCursor);
          }
        });
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async installBootstrapGeneration(
    items: ItemHeaderRecord[],
    watermarkCursor: SyncCursorRecord,
    preserveLocalItemIds: Set<string>,
    notes?: NoteRecord[],
    tasks?: TaskRecord[],
    routines?: RoutineRecord[],
    occurrences?: RoutineOccurrenceRecord[]
  ): Promise<void> {
    const validCursor = validateSyncCursorRecord(watermarkCursor);
    this.ensureNamespace(validCursor.workspaceId, validCursor.userId);
    const validItems = items.map((i) => validateItemHeaderRecord(i));
    for (const item of validItems) {
      this.ensureNamespace(item.workspaceId);
    }
    const validatedNotes = (notes || []).map((n) => validateNoteRecord(n));
    for (const n of validatedNotes) {
      this.ensureNamespace(n.workspaceId);
    }
    const validatedTasks = (tasks || []).map((t) => validateTaskRecord(t));
    for (const t of validatedTasks) {
      this.ensureNamespace(t.workspaceId);
    }
    const validatedRoutines = (routines || []).map((r) => validateRoutineRecord(r));
    for (const r of validatedRoutines) {
      this.ensureNamespace(r.workspaceId);
    }
    const validatedOccurrences = (occurrences || []).map((o) => validateRoutineOccurrenceRecord(o));
    for (const o of validatedOccurrences) {
      this.ensureNamespace(o.workspaceId);
    }

    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.withTransactionAsync(async () => {
          const snapshotIds = new Set(validItems.map((i) => i.id));

          // 1. Scan existing items to replace obsolete server projections
          const existingRows = await db.getAllAsync<{ id: string; server_revision: number }>(
            `SELECT id, server_revision FROM item_headers WHERE workspace_id = ?;`,
            validCursor.workspaceId
          );

          for (const row of existingRows) {
            if (!snapshotIds.has(row.id)) {
              if (preserveLocalItemIds.has(row.id) || row.server_revision === 0) {
                continue;
              }
              await db.runAsync(
                `DELETE FROM item_headers WHERE workspace_id = ? AND id = ?;`,
                validCursor.workspaceId,
                row.id
              );
            }
          }

          // 2. Upsert snapshot items
          for (const item of validItems) {
            await this.upsertItemHeaderDirect(item);
          }

          // 3. Upsert snapshot notes
          for (const n of validatedNotes) {
            await this.upsertNoteDirect(n);
          }

          // 4. Upsert snapshot tasks
          for (const t of validatedTasks) {
            await this.upsertTaskDirect(t);
          }

          // 5. Upsert snapshot routines
          for (const r of validatedRoutines) {
            await this.upsertRoutineDirect(r);
          }

          // 6. Upsert snapshot occurrences
          for (const o of validatedOccurrences) {
            await this.upsertRoutineOccurrenceDirect(o);
          }

          // 7. Update watermark cursor
          await this.saveCursorDirect(validCursor);
        });
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  // --- 5. Conflicts ---

  async getConflict(workspaceId: string, conflictId: string): Promise<ConflictRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    try {
      const row = await db.getFirstAsync<{
        workspace_id: string;
        id: string;
        user_id: string;
        entity_id: string;
        entity_type: string;
        operation_id: string;
        local_payload_json: string;
        base_revision: number;
        server_revision: number;
        server_state_json: string | null;
        conflict_reason: string;
        detected_at: string;
        resolved: number;
      }>(`SELECT * FROM conflicts WHERE workspace_id = ? AND id = ?;`, workspaceId, conflictId);

      if (!row) return null;
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        userId: row.user_id,
        entityId: row.entity_id,
        entityType: row.entity_type,
        operationId: row.operation_id,
        localPayload: JSON.parse(row.local_payload_json),
        baseRevision: row.base_revision,
        serverRevision: row.server_revision,
        serverState: row.server_state_json ? JSON.parse(row.server_state_json) : undefined,
        conflictReason: row.conflict_reason,
        detectedAt: row.detected_at,
        resolved: Boolean(row.resolved),
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async listConflicts(workspaceId: string): Promise<ConflictRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    try {
      const rows = await db.getAllAsync<{
        workspace_id: string;
        id: string;
        user_id: string;
        entity_id: string;
        entity_type: string;
        operation_id: string;
        local_payload_json: string;
        base_revision: number;
        server_revision: number;
        server_state_json: string | null;
        conflict_reason: string;
        detected_at: string;
        resolved: number;
      }>(`SELECT * FROM conflicts WHERE workspace_id = ? AND resolved = 0;`, workspaceId);

      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        userId: row.user_id,
        entityId: row.entity_id,
        entityType: row.entity_type,
        operationId: row.operation_id,
        localPayload: JSON.parse(row.local_payload_json),
        baseRevision: row.base_revision,
        serverRevision: row.server_revision,
        serverState: row.server_state_json ? JSON.parse(row.server_state_json) : undefined,
        conflictReason: row.conflict_reason,
        detectedAt: row.detected_at,
        resolved: false,
      }));
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async saveConflict(
    conflict: ConflictRecord,
    updatedMutation?: PendingMutationRecord
  ): Promise<void> {
    const valid = validateConflictRecord(conflict);
    this.ensureNamespace(valid.workspaceId, valid.userId);
    const validMut = updatedMutation ? validatePendingMutationRecord(updatedMutation) : undefined;
    if (validMut) {
      this.ensureNamespace(validMut.workspaceId, validMut.userId);
    }

    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.withTransactionAsync(async () => {
          await db.runAsync(
            `INSERT INTO conflicts (
              workspace_id, id, user_id, entity_id, entity_type, operation_id,
              local_payload_json, base_revision, server_revision, server_state_json,
              conflict_reason, detected_at, resolved
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (workspace_id, id) DO UPDATE SET
              local_payload_json = excluded.local_payload_json,
              base_revision = excluded.base_revision,
              server_revision = excluded.server_revision,
              server_state_json = excluded.server_state_json,
              conflict_reason = excluded.conflict_reason,
              resolved = excluded.resolved;`,
            valid.workspaceId,
            valid.id,
            valid.userId,
            valid.entityId,
            valid.entityType,
            valid.operationId,
            JSON.stringify(valid.localPayload),
            valid.baseRevision,
            valid.serverRevision,
            valid.serverState ? JSON.stringify(valid.serverState) : null,
            valid.conflictReason,
            valid.detectedAt,
            valid.resolved ? 1 : 0
          );

          if (validMut) {
            await this.enqueueMutationDirect(validMut);
          }
        });
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async resolveConflictTransaction(
    conflictId: string,
    _resolution: 'keep_server' | 'keep_local' | 'custom' | 'save_copy',
    updatedHeader?: ItemHeaderRecord,
    newMutation?: PendingMutationRecord,
    removeOperationId?: string,
    updatedNote?: NoteRecord,
    recoveryDraft?: DraftRecord,
    updatedTask?: TaskRecord,
    updatedRoutine?: RoutineRecord,
    updatedOccurrence?: RoutineOccurrenceRecord
  ): Promise<void> {
    const ns = this.ensureNamespace();
    const validHeader = updatedHeader ? validateItemHeaderRecord(updatedHeader) : undefined;
    const validNewMut = newMutation ? validatePendingMutationRecord(newMutation) : undefined;
    const validNote = updatedNote ? validateNoteRecord(updatedNote) : undefined;
    const validDraft = recoveryDraft ? validateDraftRecord(recoveryDraft) : undefined;
    const validTask = updatedTask ? validateTaskRecord(updatedTask) : undefined;
    const validRoutine = updatedRoutine ? validateRoutineRecord(updatedRoutine) : undefined;
    const validOccurrence = updatedOccurrence
      ? validateRoutineOccurrenceRecord(updatedOccurrence)
      : undefined;

    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.withTransactionAsync(async () => {
          await db.runAsync(
            `UPDATE conflicts SET resolved = 1 WHERE workspace_id = ? AND id = ?;`,
            ns.workspaceId,
            conflictId
          );

          if (removeOperationId) {
            await db.runAsync(
              `DELETE FROM pending_mutations WHERE operation_id = ?;`,
              removeOperationId
            );
          }

          if (validNewMut) {
            await this.enqueueMutationDirect(validNewMut);
          }

          if (validHeader) {
            await this.upsertItemHeaderDirect(validHeader);
          }

          if (validNote) {
            await this.upsertNoteDirect(validNote);
          }

          if (validTask) {
            await this.upsertTaskDirect(validTask);
          }

          if (validRoutine) {
            await this.upsertRoutineDirect(validRoutine);
          }

          if (validOccurrence) {
            await this.upsertRoutineOccurrenceDirect(validOccurrence);
          }

          if (validDraft) {
            await this.saveDraftDirect(validDraft);
          }
        });
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  // --- 6. Notes & Documents ---

  async getNote(workspaceId: string, id: string): Promise<NoteRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    try {
      const row = await db.getFirstAsync<{
        id: string;
        workspace_id: string;
        folder_id: string | null;
        title: string | null;
        document_json: string;
        plain_text: string;
        word_count: number;
        char_count: number;
        server_revision: number;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>(`SELECT * FROM notes WHERE workspace_id = ? AND id = ?;`, workspaceId, id);

      if (!row) return null;
      return validateNoteRecord({
        id: row.id,
        workspaceId: row.workspace_id,
        folderId: row.folder_id ?? undefined,
        title: row.title ?? undefined,
        document: JSON.parse(row.document_json),
        plainText: row.plain_text,
        wordCount: row.word_count,
        charCount: row.char_count,
        serverRevision: row.server_revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at ?? null,
      });
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async listNotes(workspaceId: string): Promise<NoteRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    try {
      const rows = await db.getAllAsync<{
        id: string;
        workspace_id: string;
        folder_id: string | null;
        title: string | null;
        document_json: string;
        plain_text: string;
        word_count: number;
        char_count: number;
        server_revision: number;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>(
        `SELECT * FROM notes WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC;`,
        workspaceId
      );

      return rows.map((row) =>
        validateNoteRecord({
          id: row.id,
          workspaceId: row.workspace_id,
          folderId: row.folder_id ?? undefined,
          title: row.title ?? undefined,
          document: JSON.parse(row.document_json),
          plainText: row.plain_text,
          wordCount: row.word_count,
          charCount: row.char_count,
          serverRevision: row.server_revision,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          deletedAt: null,
        })
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async upsertNote(note: NoteRecord): Promise<void> {
    const valid = validateNoteRecord(note);
    this.ensureNamespace(valid.workspaceId);
    return this.runWithLock(async () => {
      try {
        await this.upsertNoteDirect(valid);
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async deleteNote(workspaceId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.runAsync(`DELETE FROM notes WHERE workspace_id = ? AND id = ?;`, workspaceId, id);
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  // --- 7. Tasks & Deadlines ---

  async getTask(workspaceId: string, id: string): Promise<TaskRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    try {
      const row = await db.getFirstAsync<{
        id: string;
        workspace_id: string;
        folder_id: string | null;
        title: string;
        details: string | null;
        priority: string;
        status: string;
        deadline_json: string;
        completed_at: string | null;
        reopened_at: string | null;
        completion_history_json: string;
        parent_id: string | null;
        subtask_order: number;
        tags_json: string;
        server_revision: number;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>(`SELECT * FROM tasks WHERE workspace_id = ? AND id = ?;`, workspaceId, id);

      if (!row) return null;
      return validateTaskRecord({
        id: row.id,
        workspaceId: row.workspace_id,
        folderId: row.folder_id ?? undefined,
        title: row.title,
        details: row.details ?? undefined,
        priority: row.priority,
        status: row.status,
        deadline: JSON.parse(row.deadline_json),
        completedAt: row.completed_at ?? undefined,
        reopenedAt: row.reopened_at ?? undefined,
        completionHistory: JSON.parse(row.completion_history_json),
        parentId: row.parent_id ?? undefined,
        subtaskOrder: row.subtask_order,
        tags: JSON.parse(row.tags_json),
        serverRevision: row.server_revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at ?? null,
      });
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async listTasks(workspaceId: string): Promise<TaskRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    try {
      const rows = await db.getAllAsync<{
        id: string;
        workspace_id: string;
        folder_id: string | null;
        title: string;
        details: string | null;
        priority: string;
        status: string;
        deadline_json: string;
        completed_at: string | null;
        reopened_at: string | null;
        completion_history_json: string;
        parent_id: string | null;
        subtask_order: number;
        tags_json: string;
        server_revision: number;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>(
        `SELECT * FROM tasks WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at ASC;`,
        workspaceId
      );

      return rows.map((row) =>
        validateTaskRecord({
          id: row.id,
          workspaceId: row.workspace_id,
          folderId: row.folder_id ?? undefined,
          title: row.title,
          details: row.details ?? undefined,
          priority: row.priority,
          status: row.status,
          deadline: JSON.parse(row.deadline_json),
          completedAt: row.completed_at ?? undefined,
          reopenedAt: row.reopened_at ?? undefined,
          completionHistory: JSON.parse(row.completion_history_json),
          parentId: row.parent_id ?? undefined,
          subtaskOrder: row.subtask_order,
          tags: JSON.parse(row.tags_json),
          serverRevision: row.server_revision,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          deletedAt: null,
        })
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async upsertTask(task: TaskRecord): Promise<void> {
    const valid = validateTaskRecord(task);
    this.ensureNamespace(valid.workspaceId);
    return this.runWithLock(async () => {
      try {
        await this.upsertTaskDirect(valid);
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async deleteTask(workspaceId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.runAsync(`DELETE FROM tasks WHERE workspace_id = ? AND id = ?;`, workspaceId, id);
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  // --- 8. Routines & Routine Occurrences ---

  async getRoutine(workspaceId: string, id: string): Promise<RoutineRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    try {
      const row = await db.getFirstAsync<{
        id: string;
        workspace_id: string;
        folder_id: string | null;
        title: string;
        details: string | null;
        frequency: string;
        weekdays_json: string;
        timezone: string;
        scheduled_time: string | null;
        active_from: string;
        active_to: string | null;
        is_paused: number;
        is_archived: number;
        is_pinned: number;
        schedule_revision: number;
        effective_date: string;
        server_revision: number;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>(`SELECT * FROM routines WHERE workspace_id = ? AND id = ?;`, workspaceId, id);

      if (!row) return null;
      return validateRoutineRecord({
        id: row.id,
        workspaceId: row.workspace_id,
        folderId: row.folder_id ?? undefined,
        title: row.title,
        details: row.details ?? undefined,
        frequency: row.frequency,
        weekdays: JSON.parse(row.weekdays_json),
        timezone: row.timezone,
        scheduledTime: row.scheduled_time ?? undefined,
        activeFrom: row.active_from,
        activeTo: row.active_to ?? undefined,
        isPaused: Boolean(row.is_paused),
        isArchived: Boolean(row.is_archived),
        isPinned: Boolean(row.is_pinned),
        scheduleRevision: row.schedule_revision,
        effectiveDate: row.effective_date,
        serverRevision: row.server_revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at ?? null,
      });
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async listRoutines(workspaceId: string): Promise<RoutineRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    try {
      const rows = await db.getAllAsync<{
        id: string;
        workspace_id: string;
        folder_id: string | null;
        title: string;
        details: string | null;
        frequency: string;
        weekdays_json: string;
        timezone: string;
        scheduled_time: string | null;
        active_from: string;
        active_to: string | null;
        is_paused: number;
        is_archived: number;
        is_pinned: number;
        schedule_revision: number;
        effective_date: string;
        server_revision: number;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>(
        `SELECT * FROM routines WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at ASC;`,
        workspaceId
      );

      return rows.map((row) =>
        validateRoutineRecord({
          id: row.id,
          workspaceId: row.workspace_id,
          folderId: row.folder_id ?? undefined,
          title: row.title,
          details: row.details ?? undefined,
          frequency: row.frequency,
          weekdays: JSON.parse(row.weekdays_json),
          timezone: row.timezone,
          scheduledTime: row.scheduled_time ?? undefined,
          activeFrom: row.active_from,
          activeTo: row.active_to ?? undefined,
          isPaused: Boolean(row.is_paused),
          isArchived: Boolean(row.is_archived),
          isPinned: Boolean(row.is_pinned),
          scheduleRevision: row.schedule_revision,
          effectiveDate: row.effective_date,
          serverRevision: row.server_revision,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          deletedAt: null,
        })
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async upsertRoutine(routine: RoutineRecord): Promise<void> {
    const valid = validateRoutineRecord(routine);
    this.ensureNamespace(valid.workspaceId);
    return this.runWithLock(async () => {
      try {
        await this.upsertRoutineDirect(valid);
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async deleteRoutine(workspaceId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.runAsync(
          `DELETE FROM routines WHERE workspace_id = ? AND id = ?;`,
          workspaceId,
          id
        );
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async getRoutineOccurrence(
    workspaceId: string,
    id: string
  ): Promise<RoutineOccurrenceRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    try {
      const row = await db.getFirstAsync<{
        id: string;
        workspace_id: string;
        routine_id: string;
        scheduled_date: string;
        schedule_revision: number;
        planned_instant: string | null;
        timezone: string;
        status: string;
        completed_at: string | null;
        completed_by: string | null;
        history_json: string;
        server_revision: number;
        created_at: string;
        updated_at: string;
      }>(`SELECT * FROM routine_occurrences WHERE workspace_id = ? AND id = ?;`, workspaceId, id);

      if (!row) return null;
      return validateRoutineOccurrenceRecord({
        id: row.id,
        workspaceId: row.workspace_id,
        routineId: row.routine_id,
        scheduledDate: row.scheduled_date,
        scheduleRevision: row.schedule_revision,
        plannedInstant: row.planned_instant ?? undefined,
        timezone: row.timezone,
        status: row.status,
        completedAt: row.completed_at ?? undefined,
        completedBy: row.completed_by ?? undefined,
        history: JSON.parse(row.history_json),
        serverRevision: row.server_revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async listRoutineOccurrences(
    workspaceId: string,
    routineId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<RoutineOccurrenceRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    try {
      let sql = `SELECT * FROM routine_occurrences WHERE workspace_id = ?`;
      const params: unknown[] = [workspaceId];
      if (routineId) {
        sql += ` AND routine_id = ?`;
        params.push(routineId);
      }
      if (startDate) {
        sql += ` AND scheduled_date >= ?`;
        params.push(startDate);
      }
      if (endDate) {
        sql += ` AND scheduled_date <= ?`;
        params.push(endDate);
      }
      sql += ` ORDER BY scheduled_date ASC;`;

      const rows = await db.getAllAsync<{
        id: string;
        workspace_id: string;
        routine_id: string;
        scheduled_date: string;
        schedule_revision: number;
        planned_instant: string | null;
        timezone: string;
        status: string;
        completed_at: string | null;
        completed_by: string | null;
        history_json: string;
        server_revision: number;
        created_at: string;
        updated_at: string;
      }>(sql, ...params);

      return rows.map((row) =>
        validateRoutineOccurrenceRecord({
          id: row.id,
          workspaceId: row.workspace_id,
          routineId: row.routine_id,
          scheduledDate: row.scheduled_date,
          scheduleRevision: row.schedule_revision,
          plannedInstant: row.planned_instant ?? undefined,
          timezone: row.timezone,
          status: row.status,
          completedAt: row.completed_at ?? undefined,
          completedBy: row.completed_by ?? undefined,
          history: JSON.parse(row.history_json),
          serverRevision: row.server_revision,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async upsertRoutineOccurrence(occurrence: RoutineOccurrenceRecord): Promise<void> {
    const valid = validateRoutineOccurrenceRecord(occurrence);
    this.ensureNamespace(valid.workspaceId);
    return this.runWithLock(async () => {
      try {
        await this.upsertRoutineOccurrenceDirect(valid);
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async deleteRoutineOccurrence(workspaceId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.runAsync(
          `DELETE FROM routine_occurrences WHERE workspace_id = ? AND id = ?;`,
          workspaceId,
          id
        );
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  // --- 9. Sync Cursors ---

  private async saveCursorDirect(valid: SyncCursorRecord): Promise<void> {
    const db = this.ensureOpen();
    await db.runAsync(
      `INSERT INTO sync_cursors (workspace_id, user_id, last_server_revision, cursor, last_synced_at, epoch)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET
        last_server_revision = excluded.last_server_revision,
        cursor = excluded.cursor,
        last_synced_at = excluded.last_synced_at,
        epoch = excluded.epoch;`,
      valid.workspaceId,
      valid.userId,
      valid.lastServerRevision,
      valid.cursor,
      valid.lastSyncedAt,
      valid.epoch
    );
  }

  async getCursor(workspaceId: string, userId: string): Promise<SyncCursorRecord | null> {
    this.ensureNamespace(workspaceId, userId);
    const db = this.ensureOpen();
    try {
      const row = await db.getFirstAsync<{
        workspace_id: string;
        user_id: string;
        last_server_revision: number;
        cursor: string;
        last_synced_at: string;
        epoch: string;
      }>(`SELECT * FROM sync_cursors WHERE workspace_id = ? AND user_id = ?;`, workspaceId, userId);

      if (!row) return null;
      return {
        workspaceId: row.workspace_id,
        userId: row.user_id,
        lastServerRevision: row.last_server_revision,
        cursor: row.cursor,
        lastSyncedAt: row.last_synced_at,
        epoch: row.epoch,
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async saveCursor(cursor: SyncCursorRecord): Promise<void> {
    const valid = validateSyncCursorRecord(cursor);
    this.ensureNamespace(valid.workspaceId, valid.userId);
    return this.runWithLock(async () => {
      try {
        await this.saveCursorDirect(valid);
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  // --- 6. Preference Snapshots ---

  async getPreferenceSnapshot(userId: string): Promise<PreferenceSnapshotRecord | null> {
    this.ensureNamespace(undefined, userId);
    const db = this.ensureOpen();
    try {
      const row = await db.getFirstAsync<{
        user_id: string;
        preferences_json: string;
        schema_version: number;
        revision: number;
        updated_at: string;
      }>(`SELECT * FROM preference_snapshots WHERE user_id = ?;`, userId);

      if (!row) return null;
      return {
        userId: row.user_id,
        preferences: JSON.parse(row.preferences_json),
        schemaVersion: row.schema_version,
        revision: row.revision,
        updatedAt: row.updated_at,
      };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async savePreferenceSnapshot(snapshot: PreferenceSnapshotRecord): Promise<void> {
    const valid = validatePreferenceSnapshotRecord(snapshot);
    this.ensureNamespace(undefined, valid.userId);
    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.runAsync(
          `INSERT INTO preference_snapshots (user_id, preferences_json, schema_version, revision, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (user_id) DO UPDATE SET
            preferences_json = excluded.preferences_json,
            schema_version = excluded.schema_version,
            revision = excluded.revision,
            updated_at = excluded.updated_at;`,
          valid.userId,
          JSON.stringify(valid.preferences),
          valid.schemaVersion,
          valid.revision,
          valid.updatedAt
        );
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  // --- 11. Boundary Lifecycle & Data Erasure ---

  async clearWorkspaceData(workspaceId: string): Promise<void> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return this.runWithLock(async () => {
      try {
        await db.withTransactionAsync(async () => {
          await db.runAsync(`DELETE FROM item_headers WHERE workspace_id = ?;`, workspaceId);
          await db.runAsync(`DELETE FROM drafts WHERE workspace_id = ?;`, workspaceId);
          await db.runAsync(`DELETE FROM pending_mutations WHERE workspace_id = ?;`, workspaceId);
          await db.runAsync(`DELETE FROM sync_cursors WHERE workspace_id = ?;`, workspaceId);
          await db.runAsync(`DELETE FROM conflicts WHERE workspace_id = ?;`, workspaceId);
          await db.runAsync(`DELETE FROM notes WHERE workspace_id = ?;`, workspaceId);
          await db.runAsync(`DELETE FROM tasks WHERE workspace_id = ?;`, workspaceId);
          await db.runAsync(`DELETE FROM routines WHERE workspace_id = ?;`, workspaceId);
          await db.runAsync(`DELETE FROM routine_occurrences WHERE workspace_id = ?;`, workspaceId);
        });
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }

  async clearAccountData(userId: string): Promise<void> {
    this.ensureNamespace(undefined, userId);
    const db = this.ensureOpen();
    const wsId = this.currentNamespace?.workspaceId;
    return this.runWithLock(async () => {
      try {
        await db.withTransactionAsync(async () => {
          // Erase all account-owned data including item headers, notes, tasks, routines, and occurrences
          await db.runAsync(`DELETE FROM item_headers;`);
          await db.runAsync(`DELETE FROM drafts WHERE user_id = ?;`, userId);
          await db.runAsync(`DELETE FROM pending_mutations WHERE user_id = ?;`, userId);
          await db.runAsync(`DELETE FROM sync_cursors WHERE user_id = ?;`, userId);
          await db.runAsync(`DELETE FROM preference_snapshots WHERE user_id = ?;`, userId);
          await db.runAsync(`DELETE FROM conflicts WHERE user_id = ?;`, userId);
          await db.runAsync(`DELETE FROM notes;`);
          await db.runAsync(`DELETE FROM tasks;`);
          await db.runAsync(`DELETE FROM routines;`);
          await db.runAsync(`DELETE FROM routine_occurrences;`);
        });

        // Clear all keys from KeyStore
        await this.keyManager.clearAccountKeys(userId);

        // Close handle and reset state
        await this.close();

        // Delete database file if deletion adapter is provided
        if (wsId && this.dbDeleteFn) {
          const dbName = this.getDatabaseFileName(userId, wsId);
          await this.dbDeleteFn(dbName);
        }
      } catch (err) {
        throw this.mapError(err);
      }
    });
  }
}
