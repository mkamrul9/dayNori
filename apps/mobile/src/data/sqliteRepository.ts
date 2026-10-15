import type {
  ItemHeaderRecord,
  DraftRecord,
  PendingMutationRecord,
  SyncCursorRecord,
  PreferenceSnapshotRecord,
  AccountNamespace,
  LocalRepositoryPort,
} from '@daynori/sync';
import {
  StorageQuotaError,
  StorageUnavailableError,
  StorageMigrationError,
  StorageKeyError,
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
}

export class SqliteLocalRepository implements LocalRepositoryPort {
  private keyManager: MobileKeyManager;
  private openDbFn: OpenDatabaseFn;
  private db: SqliteDatabaseContract | null = null;
  private currentNamespace: AccountNamespace | null = null;
  private isClosed = false;

  constructor(options: SqliteLocalRepositoryOptions) {
    this.keyManager = options.keyManager;
    this.openDbFn =
      options.openDatabaseAsync ||
      (async (dbName: string) => {
        // Dynamic import of expo-sqlite when running on mobile
        const SQLite = await import('expo-sqlite');
        return SQLite.openDatabaseAsync(dbName) as unknown as SqliteDatabaseContract;
      });
  }

  getDatabaseFileName(userId: string, workspaceId: string): string {
    return `daynori_${userId}_${workspaceId}.db`;
  }

  getCurrentNamespace(): AccountNamespace | null {
    return this.currentNamespace;
  }

  async initialize(namespace: AccountNamespace): Promise<void> {
    this.currentNamespace = namespace;
    this.isClosed = false;

    const dbName = this.getDatabaseFileName(namespace.userId, namespace.workspaceId);

    // 1. Retrieve or generate the encryption key from Android KeyStore
    const key = await this.keyManager.getOrCreateKey(namespace.userId, namespace.workspaceId);

    try {
      // 2. Open the SQLite database
      this.db = await this.openDbFn(dbName);

      // 3. Apply the SQLCipher encryption key immediately
      await this.db.execAsync(`PRAGMA key = '${key}';`);

      // 4. Verify that the database unlocked successfully by testing a query
      try {
        await this.db.getAllAsync('SELECT 1;');
      } catch {
        throw new StorageKeyError(
          `KEY_INVALIDATED_OR_MISMATCH: Database file "${dbName}" exists but could not be decrypted with the provided KeyStore key.`
        );
      }

      // 5. Run transaction-safe migrations
      await this.runMigrations();
    } catch (err: unknown) {
      if (err instanceof StorageKeyError) {
        throw err;
      }
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
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>(`SELECT * FROM item_headers WHERE workspace_id = ? AND id = ?;`, workspaceId, id);

      if (!row) return null;
      return {
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
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async listItemHeaders(workspaceId: string): Promise<ItemHeaderRecord[]> {
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
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>(
        `SELECT * FROM item_headers WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY rank ASC;`,
        workspaceId
      );

      return rows.map((r) => ({
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
      }));
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async upsertItemHeader(header: ItemHeaderRecord): Promise<void> {
    const db = this.ensureOpen();
    try {
      await db.runAsync(
        `INSERT INTO item_headers (
          id, workspace_id, kind, folder_id, rank, is_archived, is_pinned,
          security_scope, server_revision, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, id) DO UPDATE SET
          kind = excluded.kind,
          folder_id = excluded.folder_id,
          rank = excluded.rank,
          is_archived = excluded.is_archived,
          is_pinned = excluded.is_pinned,
          security_scope = excluded.security_scope,
          server_revision = excluded.server_revision,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at;`,
        header.id,
        header.workspaceId,
        header.kind,
        header.folderId ?? null,
        header.rank,
        header.isArchived ? 1 : 0,
        header.isPinned ? 1 : 0,
        header.securityScope,
        header.serverRevision,
        header.createdAt,
        header.updatedAt,
        header.deletedAt ?? null
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async deleteItemHeader(workspaceId: string, id: string): Promise<void> {
    const db = this.ensureOpen();
    try {
      await db.runAsync(
        `DELETE FROM item_headers WHERE workspace_id = ? AND id = ?;`,
        workspaceId,
        id
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  // --- 2. Drafts & Quarantine ---

  async getDraft(workspaceId: string, userId: string, id: string): Promise<DraftRecord | null> {
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
        `SELECT * FROM drafts WHERE workspace_id = ? AND user_id = ? AND id = ? AND is_quarantined = 0;`,
        workspaceId,
        userId,
        id
      );

      if (!row) return null;
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

  async saveDraft(draft: DraftRecord): Promise<void> {
    const db = this.ensureOpen();
    try {
      await db.runAsync(
        `INSERT INTO drafts (
          id, workspace_id, user_id, entity_type, entity_id, title, payload_json, saved_at, is_quarantined, quarantined_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, user_id, id) DO UPDATE SET
          entity_type = excluded.entity_type,
          entity_id = excluded.entity_id,
          title = excluded.title,
          payload_json = excluded.payload_json,
          saved_at = excluded.saved_at,
          is_quarantined = excluded.is_quarantined,
          quarantined_at = excluded.quarantined_at;`,
        draft.id,
        draft.workspaceId,
        draft.userId,
        draft.entityType,
        draft.entityId,
        draft.title,
        JSON.stringify(draft.payload),
        draft.savedAt,
        draft.isQuarantined ? 1 : 0,
        draft.quarantinedAt
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async deleteDraft(workspaceId: string, userId: string, id: string): Promise<void> {
    const db = this.ensureOpen();
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
  }

  async quarantineUserDrafts(userId: string): Promise<void> {
    const db = this.ensureOpen();
    try {
      await db.runAsync(
        `UPDATE drafts SET is_quarantined = 1, quarantined_at = datetime('now') WHERE user_id = ? AND is_quarantined = 0;`,
        userId
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async listQuarantinedDrafts(userId: string): Promise<DraftRecord[]> {
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
    const db = this.ensureOpen();
    try {
      await db.runAsync(
        `UPDATE drafts SET is_quarantined = 0, quarantined_at = NULL WHERE user_id = ? AND id = ?;`,
        userId,
        id
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async purgeQuarantinedDrafts(userId: string): Promise<void> {
    const db = this.ensureOpen();
    try {
      await db.runAsync(`DELETE FROM drafts WHERE user_id = ? AND is_quarantined = 1;`, userId);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  // --- 3. Pending Operations / Mutations ---

  async enqueueMutation(mutation: PendingMutationRecord): Promise<void> {
    const db = this.ensureOpen();
    try {
      await db.runAsync(
        `INSERT INTO pending_mutations (
          operation_id, device_id, workspace_id, user_id, entity_type, entity_id, action,
          payload_json, base_revision, dependency_operation_ids_json, client_timestamp, retry_count, status, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (operation_id) DO UPDATE SET
          retry_count = excluded.retry_count,
          status = excluded.status,
          last_error = excluded.last_error;`,
        mutation.operationId,
        mutation.deviceId,
        mutation.workspaceId,
        mutation.userId,
        mutation.entityType,
        mutation.entityId,
        mutation.action,
        JSON.stringify(mutation.payload),
        mutation.baseRevision,
        JSON.stringify(mutation.dependencyOperationIds),
        mutation.clientTimestamp,
        mutation.retryCount,
        mutation.status,
        mutation.lastError
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async getPendingMutations(workspaceId: string, userId: string): Promise<PendingMutationRecord[]> {
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
    const db = this.ensureOpen();
    try {
      await db.runAsync(`DELETE FROM pending_mutations WHERE operation_id = ?;`, operationId);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  // --- 4. Atomic Multi-Store Writes ---

  async saveDraftAndMutation(draft: DraftRecord, mutation: PendingMutationRecord): Promise<void> {
    const db = this.ensureOpen();
    try {
      await db.withTransactionAsync(async () => {
        await this.saveDraft(draft);
        await this.enqueueMutation(mutation);
      });
    } catch (err) {
      throw this.mapError(err);
    }
  }

  // --- 5. Sync Cursors ---

  async getCursor(workspaceId: string, userId: string): Promise<SyncCursorRecord | null> {
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
    const db = this.ensureOpen();
    try {
      await db.runAsync(
        `INSERT INTO sync_cursors (workspace_id, user_id, last_server_revision, cursor, last_synced_at, epoch)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET
          last_server_revision = excluded.last_server_revision,
          cursor = excluded.cursor,
          last_synced_at = excluded.last_synced_at,
          epoch = excluded.epoch;`,
        cursor.workspaceId,
        cursor.userId,
        cursor.lastServerRevision,
        cursor.cursor,
        cursor.lastSyncedAt,
        cursor.epoch
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  // --- 6. Preference Snapshots ---

  async getPreferenceSnapshot(userId: string): Promise<PreferenceSnapshotRecord | null> {
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
    const db = this.ensureOpen();
    try {
      await db.runAsync(
        `INSERT INTO preference_snapshots (user_id, preferences_json, schema_version, revision, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET
          preferences_json = excluded.preferences_json,
          schema_version = excluded.schema_version,
          revision = excluded.revision,
          updated_at = excluded.updated_at;`,
        snapshot.userId,
        JSON.stringify(snapshot.preferences),
        snapshot.schemaVersion,
        snapshot.revision,
        snapshot.updatedAt
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  // --- 7. Boundary Lifecycle & Data Erasure ---

  async clearWorkspaceData(workspaceId: string): Promise<void> {
    const db = this.ensureOpen();
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync(`DELETE FROM item_headers WHERE workspace_id = ?;`, workspaceId);
        await db.runAsync(`DELETE FROM drafts WHERE workspace_id = ?;`, workspaceId);
        await db.runAsync(`DELETE FROM pending_mutations WHERE workspace_id = ?;`, workspaceId);
        await db.runAsync(`DELETE FROM sync_cursors WHERE workspace_id = ?;`, workspaceId);
      });
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async clearAccountData(userId: string): Promise<void> {
    const db = this.ensureOpen();
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync(`DELETE FROM drafts WHERE user_id = ?;`, userId);
        await db.runAsync(`DELETE FROM pending_mutations WHERE user_id = ?;`, userId);
        await db.runAsync(`DELETE FROM sync_cursors WHERE user_id = ?;`, userId);
        await db.runAsync(`DELETE FROM preference_snapshots WHERE user_id = ?;`, userId);
      });
    } catch (err) {
      throw this.mapError(err);
    }
  }
}
