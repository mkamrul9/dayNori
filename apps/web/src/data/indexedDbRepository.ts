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
  TrustedDeviceConsentRequiredError,
} from '@daynori/sync';

export const TRUSTED_DEVICE_CONSENT_KEY = 'daynori_trusted_device_consent';
export const DB_NAME = 'daynori_web_storage';
export const DB_VERSION = 1;

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  const globalStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
  if (typeof globalThis !== 'undefined' && globalStorage) {
    return globalStorage;
  }
  return null;
}

/**
 * Checks whether the user has granted explicit trusted-device consent
 * for local persistence on this browser.
 */
export function getTrustedDeviceConsent(): boolean {
  const storage = getStorage();
  if (!storage) {
    return false;
  }
  return storage.getItem(TRUSTED_DEVICE_CONSENT_KEY) === 'granted';
}

/**
 * Sets trusted-device consent. If revoked, local storage should be purged.
 */
export function setTrustedDeviceConsent(granted: boolean): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  if (granted) {
    storage.setItem(TRUSTED_DEVICE_CONSENT_KEY, 'granted');
  } else {
    storage.removeItem(TRUSTED_DEVICE_CONSENT_KEY);
  }
}

/**
 * Explicitly clears trusted-device consent.
 */
export function clearTrustedDeviceConsent(): void {
  setTrustedDeviceConsent(false);
}

/**
 * Completely erases local IndexedDB databases and consent markers.
 */
export async function clearAllLocalData(): Promise<void> {
  clearTrustedDeviceConsent();
  if (typeof indexedDB !== 'undefined') {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new StorageUnavailableError('Failed to delete local database.'));
      req.onblocked = () => {
        // Continue resolve on blocked to prevent hanging
        resolve();
      };
    });
  }
}

export class IndexedDbLocalRepository implements LocalRepositoryPort {
  private db: IDBDatabase | null = null;
  private currentNamespace: AccountNamespace | null = null;
  private isClosed = false;

  constructor(private customIndexedDb?: IDBFactory) {}

  getCurrentNamespace(): AccountNamespace | null {
    return this.currentNamespace;
  }

  private get idb(): IDBFactory {
    return this.customIndexedDb || indexedDB;
  }

  async initialize(namespace: AccountNamespace): Promise<void> {
    if (!getTrustedDeviceConsent()) {
      throw new TrustedDeviceConsentRequiredError(
        'Persistent local browser storage requires explicit trusted-device consent.'
      );
    }

    this.currentNamespace = namespace;
    this.isClosed = false;

    return new Promise((resolve, reject) => {
      const request = this.idb.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        try {
          if (!db.objectStoreNames.contains('item_headers')) {
            db.createObjectStore('item_headers', { keyPath: ['workspaceId', 'id'] });
          }

          if (!db.objectStoreNames.contains('drafts')) {
            const draftStore = db.createObjectStore('drafts', {
              keyPath: ['workspaceId', 'userId', 'id'],
            });
            draftStore.createIndex('by_user', 'userId', { unique: false });
            draftStore.createIndex('by_quarantine', ['userId', 'isQuarantined'], { unique: false });
          }

          if (!db.objectStoreNames.contains('pending_mutations')) {
            const mutationStore = db.createObjectStore('pending_mutations', {
              keyPath: 'operationId',
            });
            mutationStore.createIndex('by_workspace_user', ['workspaceId', 'userId'], {
              unique: false,
            });
            mutationStore.createIndex('by_time', 'clientTimestamp', { unique: false });
          }

          if (!db.objectStoreNames.contains('sync_cursors')) {
            db.createObjectStore('sync_cursors', { keyPath: ['workspaceId', 'userId'] });
          }

          if (!db.objectStoreNames.contains('preference_snapshots')) {
            db.createObjectStore('preference_snapshots', { keyPath: 'userId' });
          }
        } catch (err: unknown) {
          reject(
            new StorageMigrationError(
              `IndexedDB schema upgrade failed: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        }
      };

      request.onsuccess = () => {
        this.db = request.result;

        this.db.onversionchange = () => {
          this.close();
        };

        resolve();
      };

      request.onerror = () => {
        reject(
          new StorageUnavailableError(
            request.error?.message || 'Failed to open local IndexedDB database.'
          )
        );
      };

      request.onblocked = () => {
        reject(
          new StorageUnavailableError(
            'IndexedDB upgrade blocked by open connection in another browser tab.'
          )
        );
      };
    });
  }

  async close(): Promise<void> {
    this.isClosed = true;
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private ensureOpen(): IDBDatabase {
    if (this.isClosed || !this.db) {
      throw new StorageUnavailableError('Local storage is closed or uninitialized.');
    }
    if (!getTrustedDeviceConsent()) {
      throw new TrustedDeviceConsentRequiredError(
        'Trusted-device consent was revoked. Local operations are disabled.'
      );
    }
    return this.db;
  }

  // --- 1. Item Headers ---

  async getItemHeader(workspaceId: string, id: string): Promise<ItemHeaderRecord | null> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('item_headers', 'readonly');
      const store = tx.objectStore('item_headers');
      const req = store.get([workspaceId, id]);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async listItemHeaders(workspaceId: string): Promise<ItemHeaderRecord[]> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('item_headers', 'readonly');
      const store = tx.objectStore('item_headers');
      const req = store.getAll();

      req.onsuccess = () => {
        const results = (req.result as ItemHeaderRecord[]).filter(
          (h) => h.workspaceId === workspaceId && !h.deletedAt
        );
        resolve(results);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async upsertItemHeader(header: ItemHeaderRecord): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('item_headers', 'readwrite');
      const store = tx.objectStore('item_headers');
      store.put(header);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async deleteItemHeader(workspaceId: string, id: string): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('item_headers', 'readwrite');
      const store = tx.objectStore('item_headers');
      store.delete([workspaceId, id]);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 2. Drafts & Quarantine ---

  async getDraft(workspaceId: string, userId: string, id: string): Promise<DraftRecord | null> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly');
      const store = tx.objectStore('drafts');
      const req = store.get([workspaceId, userId, id]);

      req.onsuccess = () => {
        const draft = req.result as DraftRecord | undefined;
        if (!draft || draft.isQuarantined) {
          resolve(null);
        } else {
          resolve(draft);
        }
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async listDrafts(workspaceId: string, userId: string): Promise<DraftRecord[]> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly');
      const store = tx.objectStore('drafts');
      const req = store.getAll();

      req.onsuccess = () => {
        const drafts = (req.result as DraftRecord[]).filter(
          (d) => d.workspaceId === workspaceId && d.userId === userId && !d.isQuarantined
        );
        resolve(drafts);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async saveDraft(draft: DraftRecord): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      store.put(draft);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async deleteDraft(workspaceId: string, userId: string, id: string): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      store.delete([workspaceId, userId, id]);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async quarantineUserDrafts(userId: string): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const req = store.getAll();

      req.onsuccess = () => {
        const drafts = req.result as DraftRecord[];
        const now = new Date().toISOString();
        for (const draft of drafts) {
          if (draft.userId === userId && !draft.isQuarantined) {
            draft.isQuarantined = true;
            draft.quarantinedAt = now;
            store.put(draft);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async listQuarantinedDrafts(userId: string): Promise<DraftRecord[]> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly');
      const store = tx.objectStore('drafts');
      const req = store.getAll();

      req.onsuccess = () => {
        const drafts = (req.result as DraftRecord[]).filter(
          (d) => d.userId === userId && d.isQuarantined
        );
        resolve(drafts);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async restoreQuarantinedDraft(userId: string, id: string): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const req = store.getAll();

      req.onsuccess = () => {
        const drafts = req.result as DraftRecord[];
        const target = drafts.find((d) => d.userId === userId && d.id === id);
        if (target) {
          target.isQuarantined = false;
          target.quarantinedAt = null;
          store.put(target);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async purgeQuarantinedDrafts(userId: string): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const req = store.getAll();

      req.onsuccess = () => {
        const drafts = req.result as DraftRecord[];
        for (const draft of drafts) {
          if (draft.userId === userId && draft.isQuarantined) {
            store.delete([draft.workspaceId, draft.userId, draft.id]);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 3. Pending Operations / Mutations ---

  async enqueueMutation(mutation: PendingMutationRecord): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_mutations', 'readwrite');
      const store = tx.objectStore('pending_mutations');
      store.put(mutation);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async getPendingMutations(workspaceId: string, userId: string): Promise<PendingMutationRecord[]> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_mutations', 'readonly');
      const store = tx.objectStore('pending_mutations');
      const req = store.getAll();

      req.onsuccess = () => {
        try {
          const mutations = (req.result as PendingMutationRecord[])
            .filter((m) => m.workspaceId === workspaceId && m.userId === userId)
            .sort((a, b) => (a.clientTimestamp ?? '').localeCompare(b.clientTimestamp ?? ''));
          resolve(mutations);
        } catch (err) {
          reject(err);
        }
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async removePendingMutation(operationId: string): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_mutations', 'readwrite');
      const store = tx.objectStore('pending_mutations');
      store.delete(operationId);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 4. Atomic Multi-Store Writes ---

  async saveDraftAndMutation(draft: DraftRecord, mutation: PendingMutationRecord): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['drafts', 'pending_mutations'], 'readwrite');
      const draftStore = tx.objectStore('drafts');
      const mutationStore = tx.objectStore('pending_mutations');

      draftStore.put(draft);
      mutationStore.put(mutation);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 5. Sync Cursors ---

  async getCursor(workspaceId: string, userId: string): Promise<SyncCursorRecord | null> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sync_cursors', 'readonly');
      const store = tx.objectStore('sync_cursors');
      const req = store.get([workspaceId, userId]);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async saveCursor(cursor: SyncCursorRecord): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sync_cursors', 'readwrite');
      const store = tx.objectStore('sync_cursors');
      store.put(cursor);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 6. Preference Snapshots ---

  async getPreferenceSnapshot(userId: string): Promise<PreferenceSnapshotRecord | null> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('preference_snapshots', 'readonly');
      const store = tx.objectStore('preference_snapshots');
      const req = store.get(userId);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async savePreferenceSnapshot(snapshot: PreferenceSnapshotRecord): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('preference_snapshots', 'readwrite');
      const store = tx.objectStore('preference_snapshots');
      store.put(snapshot);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 7. Boundary Lifecycle & Data Erasure ---

  async clearWorkspaceData(workspaceId: string): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        ['item_headers', 'drafts', 'pending_mutations', 'sync_cursors'],
        'readwrite'
      );

      // 1. Clear item headers for workspace
      const headerStore = tx.objectStore('item_headers');
      const headerReq = headerStore.getAll();
      headerReq.onsuccess = () => {
        for (const h of headerReq.result as ItemHeaderRecord[]) {
          if (h.workspaceId === workspaceId) {
            headerStore.delete([h.workspaceId, h.id]);
          }
        }
      };

      // 2. Clear drafts for workspace
      const draftStore = tx.objectStore('drafts');
      const draftReq = draftStore.getAll();
      draftReq.onsuccess = () => {
        for (const d of draftReq.result as DraftRecord[]) {
          if (d.workspaceId === workspaceId) {
            draftStore.delete([d.workspaceId, d.userId, d.id]);
          }
        }
      };

      // 3. Clear pending mutations for workspace
      const mutationStore = tx.objectStore('pending_mutations');
      const mutationReq = mutationStore.getAll();
      mutationReq.onsuccess = () => {
        for (const m of mutationReq.result as PendingMutationRecord[]) {
          if (m.workspaceId === workspaceId) {
            mutationStore.delete(m.operationId);
          }
        }
      };

      // 4. Clear sync cursors for workspace
      const cursorStore = tx.objectStore('sync_cursors');
      const cursorReq = cursorStore.getAll();
      cursorReq.onsuccess = () => {
        for (const c of cursorReq.result as SyncCursorRecord[]) {
          if (c.workspaceId === workspaceId) {
            cursorStore.delete([c.workspaceId, c.userId]);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async clearAccountData(userId: string): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        ['drafts', 'pending_mutations', 'sync_cursors', 'preference_snapshots'],
        'readwrite'
      );

      // 1. Clear drafts for user
      const draftStore = tx.objectStore('drafts');
      const draftReq = draftStore.getAll();
      draftReq.onsuccess = () => {
        for (const d of draftReq.result as DraftRecord[]) {
          if (d.userId === userId) {
            draftStore.delete([d.workspaceId, d.userId, d.id]);
          }
        }
      };

      // 2. Clear mutations for user
      const mutationStore = tx.objectStore('pending_mutations');
      const mutationReq = mutationStore.getAll();
      mutationReq.onsuccess = () => {
        for (const m of mutationReq.result as PendingMutationRecord[]) {
          if (m.userId === userId) {
            mutationStore.delete(m.operationId);
          }
        }
      };

      // 3. Clear cursors for user
      const cursorStore = tx.objectStore('sync_cursors');
      const cursorReq = cursorStore.getAll();
      cursorReq.onsuccess = () => {
        for (const c of cursorReq.result as SyncCursorRecord[]) {
          if (c.userId === userId) {
            cursorStore.delete([c.workspaceId, c.userId]);
          }
        }
      };

      // 4. Clear preference snapshot for user
      const prefStore = tx.objectStore('preference_snapshots');
      prefStore.delete(userId);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  private mapError(err: DOMException | Error | null): Error {
    if (!err) {
      return new StorageUnavailableError('Unknown database error');
    }
    if (err.name === 'QuotaExceededError') {
      return new StorageQuotaError(err.message || 'Browser storage quota exceeded.');
    }
    return new StorageUnavailableError(err.message);
  }
}
