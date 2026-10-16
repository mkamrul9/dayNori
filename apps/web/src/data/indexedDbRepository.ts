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
  JournalEntryRecord,
} from '@daynori/sync';
import {
  StorageQuotaError,
  StorageUnavailableError,
  StorageMigrationError,
  TrustedDeviceConsentRequiredError,
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
  validateJournalEntryRecord,
} from '@daynori/sync';

export const TRUSTED_DEVICE_CONSENT_KEY = 'daynori_trusted_device_consent';
export const DB_NAME = 'daynori_web_storage';
export const DB_VERSION = 6;
export const COORDINATION_CHANNEL_NAME = 'daynori_storage_coordination';

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

function broadcastCoordination(message: { type: string; payload?: unknown }): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(COORDINATION_CHANNEL_NAME);
      channel.postMessage(message);
      channel.close();
    }
  } catch {
    /* ignore */
  }
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
 * Sets trusted-device consent. If revoked, notifies other tabs and disables storage.
 */
export function setTrustedDeviceConsent(granted: boolean): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  if (granted) {
    storage.setItem(TRUSTED_DEVICE_CONSENT_KEY, 'granted');
    broadcastCoordination({ type: 'CONSENT_GRANTED' });
  } else {
    storage.removeItem(TRUSTED_DEVICE_CONSENT_KEY);
    broadcastCoordination({ type: 'REVOKE_CONSENT' });
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
 * Notifies other open tabs to close connections first.
 * Reports onblocked failure honestly instead of silently ignoring.
 */
export async function clearAllLocalData(customIndexedDb?: IDBFactory): Promise<void> {
  clearTrustedDeviceConsent();
  broadcastCoordination({ type: 'CLOSE_STORAGE' });

  const idb = customIndexedDb || (typeof indexedDB !== 'undefined' ? indexedDB : null);
  if (idb) {
    return new Promise((resolve, reject) => {
      const req = idb.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () =>
        reject(
          new StorageUnavailableError(req.error?.message || 'Failed to delete local database.')
        );
      req.onblocked = () => {
        reject(
          new StorageUnavailableError(
            'Database deletion was blocked by open connections in other tabs. Close all Daynori tabs and retry.'
          )
        );
      };
    });
  }
}

export class IndexedDbLocalRepository implements LocalRepositoryPort {
  private db: IDBDatabase | null = null;
  private currentNamespace: AccountNamespace | null = null;
  private isClosed = false;
  private coordinationChannel: BroadcastChannel | null = null;

  constructor(private customIndexedDb?: IDBFactory) {
    this.setupCoordination();
  }

  private setupCoordination(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.coordinationChannel = new BroadcastChannel(COORDINATION_CHANNEL_NAME);
        this.coordinationChannel.onmessage = (event) => {
          if (event.data?.type === 'CLOSE_STORAGE' || event.data?.type === 'REVOKE_CONSENT') {
            void this.close();
          }
        };
      } catch {
        /* ignore */
      }
    }
  }

  getCurrentNamespace(): AccountNamespace | null {
    return this.currentNamespace;
  }

  private get idb(): IDBFactory {
    return this.customIndexedDb || indexedDB;
  }

  private ensureNamespace(workspaceId?: string, userId?: string): AccountNamespace {
    this.ensureOpen();
    if (!this.currentNamespace) {
      throw new StorageUnavailableError('Database is not initialized. Call initialize() first.');
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
    if (!getTrustedDeviceConsent()) {
      throw new TrustedDeviceConsentRequiredError(
        'Persistent local browser storage requires explicit trusted-device consent.'
      );
    }

    const validatedNs = validateAccountNamespace(namespace);

    // If an existing DB handle is open, close it before switching
    if (this.db) {
      await this.close();
    }

    this.currentNamespace = validatedNs;
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

          if (!db.objectStoreNames.contains('conflicts')) {
            const conflictStore = db.createObjectStore('conflicts', {
              keyPath: ['workspaceId', 'id'],
            });
            conflictStore.createIndex('by_workspace_user', ['workspaceId', 'userId'], {
              unique: false,
            });
            conflictStore.createIndex('by_entity', ['workspaceId', 'entityId'], {
              unique: false,
            });
          }

          if (!db.objectStoreNames.contains('notes')) {
            db.createObjectStore('notes', { keyPath: ['workspaceId', 'id'] });
          }

          if (!db.objectStoreNames.contains('tasks')) {
            db.createObjectStore('tasks', { keyPath: ['workspaceId', 'id'] });
          }

          if (!db.objectStoreNames.contains('routines')) {
            db.createObjectStore('routines', { keyPath: ['workspaceId', 'id'] });
          }

          if (!db.objectStoreNames.contains('routine_occurrences')) {
            const occStore = db.createObjectStore('routine_occurrences', {
              keyPath: ['workspaceId', 'id'],
            });
            occStore.createIndex('by_routine_date', ['workspaceId', 'routineId', 'scheduledDate'], {
              unique: true,
            });
            occStore.createIndex('by_date', ['workspaceId', 'scheduledDate'], {
              unique: false,
            });
          }

          if (!db.objectStoreNames.contains('journal_entries')) {
            const journalStore = db.createObjectStore('journal_entries', {
              keyPath: ['workspaceId', 'id'],
            });
            journalStore.createIndex('by_date', ['workspaceId', 'entryDate'], {
              unique: false,
            });
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
          void this.close();
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
    this.currentNamespace = null;
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

  private mapError(err: DOMException | Error | null): Error {
    if (!err) {
      return new StorageUnavailableError('Unknown database error');
    }
    if (err.name === 'QuotaExceededError') {
      return new StorageQuotaError(err.message || 'Browser storage quota exceeded.');
    }
    return new StorageUnavailableError(err.message);
  }

  // --- 1. Item Headers ---

  async getItemHeader(workspaceId: string, id: string): Promise<ItemHeaderRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('item_headers', 'readonly');
      const store = tx.objectStore('item_headers');
      const req = store.get([workspaceId, id]);

      req.onsuccess = () => resolve(req.result ? validateItemHeaderRecord(req.result) : null);
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async listItemHeaders(workspaceId: string): Promise<ItemHeaderRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('item_headers', 'readonly');
      const store = tx.objectStore('item_headers');
      const req = store.getAll();

      req.onsuccess = () => {
        const raw = (req.result as unknown[]) || [];
        const results: ItemHeaderRecord[] = raw
          .map((h) => validateItemHeaderRecord(h))
          .filter((h) => h.workspaceId === workspaceId && !h.deletedAt);
        resolve(results);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async upsertItemHeader(header: ItemHeaderRecord): Promise<void> {
    const valid = validateItemHeaderRecord(header);
    this.ensureNamespace(valid.workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('item_headers', 'readwrite');
      const store = tx.objectStore('item_headers');
      store.put(valid);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async deleteItemHeader(workspaceId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId);
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
    this.ensureNamespace(workspaceId, userId);
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
          resolve(validateDraftRecord(draft));
        }
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async listDrafts(workspaceId: string, userId: string): Promise<DraftRecord[]> {
    this.ensureNamespace(workspaceId, userId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly');
      const store = tx.objectStore('drafts');
      const req = store.getAll();

      req.onsuccess = () => {
        const raw = (req.result as unknown[]) || [];
        const drafts: DraftRecord[] = raw
          .map((d) => validateDraftRecord(d))
          .filter((d) => d.workspaceId === workspaceId && d.userId === userId && !d.isQuarantined);
        resolve(drafts);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async saveDraft(draft: DraftRecord): Promise<void> {
    const valid = validateDraftRecord(draft);
    this.ensureNamespace(valid.workspaceId, valid.userId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      store.put(valid);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async deleteDraft(workspaceId: string, userId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId, userId);
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
    this.ensureNamespace(undefined, userId);
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
    this.ensureNamespace(undefined, userId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly');
      const store = tx.objectStore('drafts');
      const req = store.getAll();

      req.onsuccess = () => {
        const raw = (req.result as unknown[]) || [];
        const drafts: DraftRecord[] = raw
          .map((d) => validateDraftRecord(d))
          .filter((d) => d.userId === userId && d.isQuarantined);
        resolve(drafts);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async restoreQuarantinedDraft(userId: string, id: string): Promise<void> {
    this.ensureNamespace(undefined, userId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const req = store.getAll();

      req.onsuccess = () => {
        const drafts = req.result as DraftRecord[];
        for (const draft of drafts) {
          if (draft.userId === userId && draft.id === id) {
            draft.isQuarantined = false;
            draft.quarantinedAt = null;
            store.put(draft);
            break;
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async purgeQuarantinedDrafts(userId: string): Promise<void> {
    this.ensureNamespace(undefined, userId);
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
    const valid = validatePendingMutationRecord(mutation);
    this.ensureNamespace(valid.workspaceId, valid.userId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_mutations', 'readwrite');
      const store = tx.objectStore('pending_mutations');
      store.put(valid);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async getPendingMutations(workspaceId: string, userId: string): Promise<PendingMutationRecord[]> {
    this.ensureNamespace(workspaceId, userId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_mutations', 'readonly');
      const store = tx.objectStore('pending_mutations');
      const req = store.getAll();

      req.onsuccess = () => {
        const raw = (req.result as unknown[]) || [];
        const mutations: PendingMutationRecord[] = raw
          .map((m) => validatePendingMutationRecord(m))
          .filter((m) => m.workspaceId === workspaceId && m.userId === userId)
          .sort((a, b) => a.clientTimestamp.localeCompare(b.clientTimestamp));
        resolve(mutations);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async removePendingMutation(operationId: string): Promise<void> {
    const ns = this.ensureNamespace();
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_mutations', 'readwrite');
      const store = tx.objectStore('pending_mutations');
      const getReq = store.get(operationId);

      getReq.onsuccess = () => {
        const item = getReq.result as PendingMutationRecord | undefined;
        if (!item) {
          return;
        }
        if (item.workspaceId !== ns.workspaceId || item.userId !== ns.userId) {
          tx.abort();
          reject(new StorageUnavailableError('Cross-workspace mutation removal rejected.'));
          return;
        }
        store.delete(operationId);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 4. Atomic Multi-Store Writes ---

  async saveDraftAndMutation(draft: DraftRecord, mutation: PendingMutationRecord): Promise<void> {
    const validDraft = validateDraftRecord(draft);
    const validMut = validatePendingMutationRecord(mutation);
    this.ensureNamespace(validDraft.workspaceId, validDraft.userId);
    this.ensureNamespace(validMut.workspaceId, validMut.userId);

    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['drafts', 'pending_mutations'], 'readwrite');
      const draftStore = tx.objectStore('drafts');
      const mutationStore = tx.objectStore('pending_mutations');

      draftStore.put(validDraft);
      mutationStore.put(validMut);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async saveItemTransaction(
    item: ItemHeaderRecord,
    mutation: PendingMutationRecord,
    draft?: DraftRecord,
    note?: NoteRecord,
    task?: TaskRecord,
    routine?: RoutineRecord,
    occurrence?: RoutineOccurrenceRecord,
    journalEntry?: JournalEntryRecord
  ): Promise<void> {
    const validItem = validateItemHeaderRecord(item);
    const validMut = validatePendingMutationRecord(mutation);
    const validDraft = draft ? validateDraftRecord(draft) : undefined;
    const validNote = note ? validateNoteRecord(note) : undefined;
    const validTask = task ? validateTaskRecord(task) : undefined;
    const validRoutine = routine ? validateRoutineRecord(routine) : undefined;
    const validOccurrence = occurrence ? validateRoutineOccurrenceRecord(occurrence) : undefined;
    const validJournal = journalEntry ? validateJournalEntryRecord(journalEntry) : undefined;

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
    if (validJournal) {
      this.ensureNamespace(validJournal.workspaceId);
    }

    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const stores = ['item_headers', 'pending_mutations'];
      if (validDraft) stores.push('drafts');
      if (validNote) stores.push('notes');
      if (validTask) stores.push('tasks');
      if (validRoutine) stores.push('routines');
      if (validOccurrence) stores.push('routine_occurrences');
      if (validJournal) stores.push('journal_entries');
      const tx = db.transaction(stores, 'readwrite');
      tx.objectStore('item_headers').put(validItem);
      tx.objectStore('pending_mutations').put(validMut);
      if (validDraft) {
        tx.objectStore('drafts').put(validDraft);
      }
      if (validNote) {
        tx.objectStore('notes').put(validNote);
      }
      if (validTask) {
        tx.objectStore('tasks').put(validTask);
      }
      if (validRoutine) {
        tx.objectStore('routines').put(validRoutine);
      }
      if (validOccurrence) {
        tx.objectStore('routine_occurrences').put(validOccurrence);
      }
      if (validJournal) {
        tx.objectStore('journal_entries').put(validJournal);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async applyAcknowledgment(
    header: ItemHeaderRecord,
    operationId: string,
    note?: NoteRecord,
    task?: TaskRecord,
    routine?: RoutineRecord,
    occurrence?: RoutineOccurrenceRecord,
    journalEntry?: JournalEntryRecord
  ): Promise<void> {
    const valid = validateItemHeaderRecord(header);
    const validNote = note ? validateNoteRecord(note) : undefined;
    const validTask = task ? validateTaskRecord(task) : undefined;
    const validRoutine = routine ? validateRoutineRecord(routine) : undefined;
    const validOccurrence = occurrence ? validateRoutineOccurrenceRecord(occurrence) : undefined;
    const validJournal = journalEntry ? validateJournalEntryRecord(journalEntry) : undefined;
    this.ensureNamespace(valid.workspaceId);
    if (validNote) this.ensureNamespace(validNote.workspaceId);
    if (validTask) this.ensureNamespace(validTask.workspaceId);
    if (validRoutine) this.ensureNamespace(validRoutine.workspaceId);
    if (validOccurrence) this.ensureNamespace(validOccurrence.workspaceId);
    if (validJournal) this.ensureNamespace(validJournal.workspaceId);

    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const stores = ['item_headers', 'pending_mutations'];
      if (validNote) stores.push('notes');
      if (validTask) stores.push('tasks');
      if (validRoutine) stores.push('routines');
      if (validOccurrence) stores.push('routine_occurrences');
      if (validJournal) stores.push('journal_entries');
      const tx = db.transaction(stores, 'readwrite');
      tx.objectStore('item_headers').put(valid);
      tx.objectStore('pending_mutations').delete(operationId);
      if (validNote) {
        tx.objectStore('notes').put(validNote);
      }
      if (validTask) {
        tx.objectStore('tasks').put(validTask);
      }
      if (validRoutine) {
        tx.objectStore('routines').put(validRoutine);
      }
      if (validOccurrence) {
        tx.objectStore('routine_occurrences').put(validOccurrence);
      }
      if (validJournal) {
        tx.objectStore('journal_entries').put(validJournal);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async applyPullPage(
    changes: ItemHeaderRecord[],
    newCursor: SyncCursorRecord,
    notes?: NoteRecord[],
    tasks?: TaskRecord[],
    routines?: RoutineRecord[],
    occurrences?: RoutineOccurrenceRecord[],
    journalEntries?: JournalEntryRecord[]
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
    const validatedJournalEntries = (journalEntries || []).map((j) =>
      validateJournalEntryRecord(j)
    );
    for (const j of validatedJournalEntries) {
      this.ensureNamespace(j.workspaceId);
    }

    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const stores = ['item_headers', 'sync_cursors'];
      if (validatedNotes.length > 0) stores.push('notes');
      if (validatedTasks.length > 0) stores.push('tasks');
      if (validatedRoutines.length > 0) stores.push('routines');
      if (validatedOccurrences.length > 0) stores.push('routine_occurrences');
      if (validatedJournalEntries.length > 0) stores.push('journal_entries');
      const tx = db.transaction(stores, 'readwrite');
      const itemStore = tx.objectStore('item_headers');
      const cursorStore = tx.objectStore('sync_cursors');
      const noteStore = validatedNotes.length > 0 ? tx.objectStore('notes') : null;
      const taskStore = validatedTasks.length > 0 ? tx.objectStore('tasks') : null;
      const routineStore = validatedRoutines.length > 0 ? tx.objectStore('routines') : null;
      const occStore =
        validatedOccurrences.length > 0 ? tx.objectStore('routine_occurrences') : null;
      const journalStore =
        validatedJournalEntries.length > 0 ? tx.objectStore('journal_entries') : null;

      // 1. Process each item change under protection against stale concurrent overwrites
      for (const change of validatedChanges) {
        const getReq = itemStore.get([change.workspaceId, change.id]);
        getReq.onsuccess = () => {
          const existing = getReq.result ? validateItemHeaderRecord(getReq.result) : null;
          if (existing) {
            // Never overwrite with a stale/older revision
            if (existing.serverRevision > change.serverRevision) {
              return;
            }
            // Explicit newer restore check: if existing is deleted, but change is not deleted and newer, restore!
            if (
              existing.deletedAt !== null &&
              change.deletedAt === null &&
              change.serverRevision <= existing.serverRevision
            ) {
              return;
            }
          }
          // Put the updated or new item (including tombstones)
          itemStore.put(change);
        };
      }

      // 2. Process notes in the same transaction
      if (noteStore) {
        for (const n of validatedNotes) {
          const getNoteReq = noteStore.get([n.workspaceId, n.id]);
          getNoteReq.onsuccess = () => {
            const existing = getNoteReq.result ? validateNoteRecord(getNoteReq.result) : null;
            if (existing && existing.serverRevision > n.serverRevision) {
              return;
            }
            noteStore.put(n);
          };
        }
      }

      // 3. Process tasks in the same transaction
      if (taskStore) {
        for (const t of validatedTasks) {
          const getTaskReq = taskStore.get([t.workspaceId, t.id]);
          getTaskReq.onsuccess = () => {
            const existing = getTaskReq.result ? validateTaskRecord(getTaskReq.result) : null;
            if (existing && existing.serverRevision > t.serverRevision) {
              return;
            }
            taskStore.put(t);
          };
        }
      }

      // 4. Process routines in the same transaction
      if (routineStore) {
        for (const r of validatedRoutines) {
          const getRoutineReq = routineStore.get([r.workspaceId, r.id]);
          getRoutineReq.onsuccess = () => {
            const existing = getRoutineReq.result
              ? validateRoutineRecord(getRoutineReq.result)
              : null;
            if (existing && existing.serverRevision > r.serverRevision) {
              return;
            }
            routineStore.put(r);
          };
        }
      }

      // 5. Process occurrences in the same transaction
      if (occStore) {
        for (const o of validatedOccurrences) {
          const getOccReq = occStore.get([o.workspaceId, o.id]);
          getOccReq.onsuccess = () => {
            const existing = getOccReq.result
              ? validateRoutineOccurrenceRecord(getOccReq.result)
              : null;
            if (existing && existing.serverRevision > o.serverRevision) {
              return;
            }
            occStore.put(o);
          };
        }
      }

      // 6. Process journal entries in the same transaction
      if (journalStore) {
        for (const j of validatedJournalEntries) {
          const getJournalReq = journalStore.get([j.workspaceId, j.id]);
          getJournalReq.onsuccess = () => {
            const existing = getJournalReq.result
              ? validateJournalEntryRecord(getJournalReq.result)
              : null;
            if (existing && existing.serverRevision > j.serverRevision) {
              return;
            }
            journalStore.put(j);
          };
        }
      }

      // 7. Cursor advancement: protect against moving cursor backward
      const cursorGetReq = cursorStore.get([validCursor.workspaceId, validCursor.userId]);
      cursorGetReq.onsuccess = () => {
        const existingCursor = cursorGetReq.result
          ? validateSyncCursorRecord(cursorGetReq.result)
          : null;
        if (existingCursor && existingCursor.lastServerRevision > validCursor.lastServerRevision) {
          // Do not move cursor backward
          return;
        }
        cursorStore.put(validCursor);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async installBootstrapGeneration(
    items: ItemHeaderRecord[],
    watermarkCursor: SyncCursorRecord,
    preserveLocalItemIds: Set<string>,
    notes?: NoteRecord[],
    tasks?: TaskRecord[],
    routines?: RoutineRecord[],
    occurrences?: RoutineOccurrenceRecord[],
    journalEntries?: JournalEntryRecord[]
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
    const validatedJournalEntries = (journalEntries || []).map((j) =>
      validateJournalEntryRecord(j)
    );
    for (const j of validatedJournalEntries) {
      this.ensureNamespace(j.workspaceId);
    }

    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const stores = ['item_headers', 'sync_cursors'];
      if (validatedNotes.length > 0) stores.push('notes');
      if (validatedTasks.length > 0) stores.push('tasks');
      if (validatedRoutines.length > 0) stores.push('routines');
      if (validatedOccurrences.length > 0) stores.push('routine_occurrences');
      if (validatedJournalEntries.length > 0) stores.push('journal_entries');
      const tx = db.transaction(stores, 'readwrite');
      const itemStore = tx.objectStore('item_headers');
      const cursorStore = tx.objectStore('sync_cursors');
      const noteStore = validatedNotes.length > 0 ? tx.objectStore('notes') : null;
      const taskStore = validatedTasks.length > 0 ? tx.objectStore('tasks') : null;
      const routineStore = validatedRoutines.length > 0 ? tx.objectStore('routines') : null;
      const occStore =
        validatedOccurrences.length > 0 ? tx.objectStore('routine_occurrences') : null;
      const journalStore =
        validatedJournalEntries.length > 0 ? tx.objectStore('journal_entries') : null;

      const snapshotIds = new Set(validItems.map((i) => i.id));

      // 1. Scan existing items to replace obsolete server projections
      const getAllReq = itemStore.getAll();
      getAllReq.onsuccess = () => {
        const existing = (getAllReq.result as unknown[]) || [];
        for (const raw of existing) {
          const header = validateItemHeaderRecord(raw);
          if (header.workspaceId === validCursor.workspaceId) {
            // If not in new snapshot:
            if (!snapshotIds.has(header.id)) {
              // Preserve if has local uncommitted changes or drafts or is in preserveLocalItemIds
              if (preserveLocalItemIds.has(header.id) || header.serverRevision === 0) {
                continue;
              }
              // Obsolete server projection: delete
              itemStore.delete([header.workspaceId, header.id]);
            }
          }
        }

        // 2. Upsert snapshot items
        for (const item of validItems) {
          itemStore.put(item);
        }

        // 3. Upsert snapshot notes
        if (noteStore) {
          for (const n of validatedNotes) {
            noteStore.put(n);
          }
        }

        // 4. Upsert snapshot tasks
        if (taskStore) {
          for (const t of validatedTasks) {
            taskStore.put(t);
          }
        }

        // 5. Upsert snapshot routines
        if (routineStore) {
          for (const r of validatedRoutines) {
            routineStore.put(r);
          }
        }

        // 6. Upsert snapshot occurrences
        if (occStore) {
          for (const o of validatedOccurrences) {
            occStore.put(o);
          }
        }

        // 7. Upsert snapshot journal entries
        if (journalStore) {
          for (const j of validatedJournalEntries) {
            journalStore.put(j);
          }
        }

        // 8. Update watermark cursor
        cursorStore.put(validCursor);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 5. Conflicts ---

  async getConflict(workspaceId: string, conflictId: string): Promise<ConflictRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('conflicts', 'readonly');
      const store = tx.objectStore('conflicts');
      const req = store.get([workspaceId, conflictId]);

      req.onsuccess = () => resolve(req.result ? validateConflictRecord(req.result) : null);
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async listConflicts(workspaceId: string): Promise<ConflictRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('conflicts', 'readonly');
      const store = tx.objectStore('conflicts');
      const req = store.getAll();

      req.onsuccess = () => {
        const raw = (req.result as unknown[]) || [];
        const results = raw
          .map((c) => validateConflictRecord(c))
          .filter((c) => c.workspaceId === workspaceId && !c.resolved);
        resolve(results);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async saveConflict(
    conflict: ConflictRecord,
    updatedMutation?: PendingMutationRecord
  ): Promise<void> {
    const validConflict = validateConflictRecord(conflict);
    this.ensureNamespace(validConflict.workspaceId, validConflict.userId);
    const validMut = updatedMutation ? validatePendingMutationRecord(updatedMutation) : undefined;
    if (validMut) {
      this.ensureNamespace(validMut.workspaceId, validMut.userId);
    }

    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const stores = validMut ? ['conflicts', 'pending_mutations'] : ['conflicts'];
      const tx = db.transaction(stores, 'readwrite');
      tx.objectStore('conflicts').put(validConflict);
      if (validMut) {
        tx.objectStore('pending_mutations').put(validMut);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
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
    updatedOccurrence?: RoutineOccurrenceRecord,
    updatedJournalEntry?: JournalEntryRecord
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
    const validJournal = updatedJournalEntry
      ? validateJournalEntryRecord(updatedJournalEntry)
      : undefined;

    const existingConflict = await this.getConflict(ns.workspaceId, conflictId);
    if (existingConflict) {
      existingConflict.resolved = true;
    }

    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const stores = ['conflicts', 'item_headers', 'pending_mutations'];
      if (validNote) stores.push('notes');
      if (validDraft) stores.push('drafts');
      if (validTask) stores.push('tasks');
      if (validRoutine) stores.push('routines');
      if (validOccurrence) stores.push('routine_occurrences');
      if (validJournal) stores.push('journal_entries');
      const tx = db.transaction(stores, 'readwrite');
      const conflictStore = tx.objectStore('conflicts');
      const itemStore = tx.objectStore('item_headers');
      const mutStore = tx.objectStore('pending_mutations');
      const noteStore = validNote ? tx.objectStore('notes') : null;
      const draftStore = validDraft ? tx.objectStore('drafts') : null;
      const taskStore = validTask ? tx.objectStore('tasks') : null;
      const routineStore = validRoutine ? tx.objectStore('routines') : null;
      const occStore = validOccurrence ? tx.objectStore('routine_occurrences') : null;
      const journalStore = validJournal ? tx.objectStore('journal_entries') : null;

      // 1. Mark conflict resolved
      if (existingConflict) {
        conflictStore.put(existingConflict);
      }

      // 2. Remove old operation if specified
      if (removeOperationId) {
        mutStore.delete(removeOperationId);
      }

      // 3. Enqueue replacement mutation if specified (keep_local, custom, or save_copy)
      if (validNewMut) {
        mutStore.put(validNewMut);
      }

      // 4. Update header if specified (e.g. keep_server, custom, or save_copy)
      if (validHeader) {
        itemStore.put(validHeader);
      }

      // 5. Update note if specified
      if (validNote && noteStore) {
        noteStore.put(validNote);
      }

      // 6. Update task if specified
      if (validTask && taskStore) {
        taskStore.put(validTask);
      }

      // 7. Update routine if specified
      if (validRoutine && routineStore) {
        routineStore.put(validRoutine);
      }

      // 8. Update occurrence if specified
      if (validOccurrence && occStore) {
        occStore.put(validOccurrence);
      }

      // 9. Update journal if specified
      if (validJournal && journalStore) {
        journalStore.put(validJournal);
      }

      // 10. Save recovery draft if specified
      if (validDraft && draftStore) {
        draftStore.put(validDraft);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 6. Notes & Documents ---

  async getNote(workspaceId: string, id: string): Promise<NoteRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readonly');
      const store = tx.objectStore('notes');
      const req = store.get([workspaceId, id]);

      req.onsuccess = () => resolve(req.result ? validateNoteRecord(req.result) : null);
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async listNotes(workspaceId: string): Promise<NoteRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readonly');
      const store = tx.objectStore('notes');
      const req = store.getAll();

      req.onsuccess = () => {
        const raw = (req.result as unknown[]) || [];
        const results = raw
          .map((n) => validateNoteRecord(n))
          .filter((n) => n.workspaceId === workspaceId && n.deletedAt === null);
        resolve(results);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async upsertNote(note: NoteRecord): Promise<void> {
    const valid = validateNoteRecord(note);
    this.ensureNamespace(valid.workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readwrite');
      const store = tx.objectStore('notes');
      store.put(valid);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async deleteNote(workspaceId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readwrite');
      const store = tx.objectStore('notes');
      store.delete([workspaceId, id]);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 7. Tasks & Deadlines ---

  async getTask(workspaceId: string, id: string): Promise<TaskRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tasks', 'readonly');
      const store = tx.objectStore('tasks');
      const req = store.get([workspaceId, id]);

      req.onsuccess = () => resolve(req.result ? validateTaskRecord(req.result) : null);
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async listTasks(workspaceId: string): Promise<TaskRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tasks', 'readonly');
      const store = tx.objectStore('tasks');
      const req = store.getAll();

      req.onsuccess = () => {
        const raw = (req.result as unknown[]) || [];
        const results = raw
          .map((t) => validateTaskRecord(t))
          .filter((t) => t.workspaceId === workspaceId && t.deletedAt === null);
        resolve(results);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async upsertTask(task: TaskRecord): Promise<void> {
    const valid = validateTaskRecord(task);
    this.ensureNamespace(valid.workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tasks', 'readwrite');
      const store = tx.objectStore('tasks');
      store.put(valid);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async deleteTask(workspaceId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tasks', 'readwrite');
      const store = tx.objectStore('tasks');
      store.delete([workspaceId, id]);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 8. Routines & Routine Occurrences ---

  async getRoutine(workspaceId: string, id: string): Promise<RoutineRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('routines', 'readonly');
      const store = tx.objectStore('routines');
      const req = store.get([workspaceId, id]);

      req.onsuccess = () => resolve(req.result ? validateRoutineRecord(req.result) : null);
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async listRoutines(workspaceId: string): Promise<RoutineRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('routines', 'readonly');
      const store = tx.objectStore('routines');
      const req = store.getAll();

      req.onsuccess = () => {
        const raw = (req.result as unknown[]) || [];
        const results = raw
          .map((r) => validateRoutineRecord(r))
          .filter((r) => r.workspaceId === workspaceId && r.deletedAt === null);
        resolve(results);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async upsertRoutine(routine: RoutineRecord): Promise<void> {
    const valid = validateRoutineRecord(routine);
    this.ensureNamespace(valid.workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('routines', 'readwrite');
      const store = tx.objectStore('routines');
      store.put(valid);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async deleteRoutine(workspaceId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('routines', 'readwrite');
      const store = tx.objectStore('routines');
      store.delete([workspaceId, id]);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async getRoutineOccurrence(
    workspaceId: string,
    id: string
  ): Promise<RoutineOccurrenceRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('routine_occurrences', 'readonly');
      const store = tx.objectStore('routine_occurrences');
      const req = store.get([workspaceId, id]);

      req.onsuccess = () =>
        resolve(req.result ? validateRoutineOccurrenceRecord(req.result) : null);
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async listRoutineOccurrences(
    workspaceId: string,
    routineId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<RoutineOccurrenceRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('routine_occurrences', 'readonly');
      const store = tx.objectStore('routine_occurrences');
      const req = store.getAll();

      req.onsuccess = () => {
        const raw = (req.result as unknown[]) || [];
        const results = raw
          .map((o) => validateRoutineOccurrenceRecord(o))
          .filter((o) => {
            if (o.workspaceId !== workspaceId) return false;
            if (routineId && o.routineId !== routineId) return false;
            if (startDate && o.scheduledDate < startDate) return false;
            if (endDate && o.scheduledDate > endDate) return false;
            return true;
          })
          .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
        resolve(results);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async upsertRoutineOccurrence(occurrence: RoutineOccurrenceRecord): Promise<void> {
    const valid = validateRoutineOccurrenceRecord(occurrence);
    this.ensureNamespace(valid.workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('routine_occurrences', 'readwrite');
      const store = tx.objectStore('routine_occurrences');
      store.put(valid);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async deleteRoutineOccurrence(workspaceId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('routine_occurrences', 'readwrite');
      const store = tx.objectStore('routine_occurrences');
      store.delete([workspaceId, id]);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 9. Journal Entries ---

  async getJournalEntry(workspaceId: string, id: string): Promise<JournalEntryRecord | null> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('journal_entries', 'readonly');
      const store = tx.objectStore('journal_entries');
      const req = store.get([workspaceId, id]);

      req.onsuccess = () => resolve(req.result ? validateJournalEntryRecord(req.result) : null);
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async listJournalEntries(
    workspaceId: string,
    options?: {
      entryDate?: string;
      startDate?: string;
      endDate?: string;
      includeDeleted?: boolean;
    }
  ): Promise<JournalEntryRecord[]> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('journal_entries', 'readonly');
      const store = tx.objectStore('journal_entries');
      const req = store.getAll();

      req.onsuccess = () => {
        const raw = (req.result as unknown[]) || [];
        let results = raw
          .map((j) => validateJournalEntryRecord(j))
          .filter(
            (j) =>
              j.workspaceId === workspaceId &&
              (options?.includeDeleted ? true : j.deletedAt === null)
          );

        if (options?.entryDate) {
          results = results.filter((j) => j.entryDate === options.entryDate);
        }
        if (options?.startDate) {
          results = results.filter((j) => j.entryDate >= options.startDate!);
        }
        if (options?.endDate) {
          results = results.filter((j) => j.entryDate <= options.endDate!);
        }

        results.sort((a, b) => {
          if (a.entryDate !== b.entryDate) return b.entryDate.localeCompare(a.entryDate);
          return b.createdAt.localeCompare(a.createdAt);
        });
        resolve(results);
      };
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async upsertJournalEntry(entry: JournalEntryRecord): Promise<void> {
    const valid = validateJournalEntryRecord(entry);
    this.ensureNamespace(valid.workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('journal_entries', 'readwrite');
      const store = tx.objectStore('journal_entries');
      store.put(valid);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async deleteJournalEntry(workspaceId: string, id: string): Promise<void> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('journal_entries', 'readwrite');
      const store = tx.objectStore('journal_entries');
      store.delete([workspaceId, id]);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 10. Sync Cursors ---

  async getCursor(workspaceId: string, userId: string): Promise<SyncCursorRecord | null> {
    this.ensureNamespace(workspaceId, userId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sync_cursors', 'readonly');
      const store = tx.objectStore('sync_cursors');
      const req = store.get([workspaceId, userId]);

      req.onsuccess = () => resolve(req.result ? validateSyncCursorRecord(req.result) : null);
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async saveCursor(cursor: SyncCursorRecord): Promise<void> {
    const valid = validateSyncCursorRecord(cursor);
    this.ensureNamespace(valid.workspaceId, valid.userId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sync_cursors', 'readwrite');
      const store = tx.objectStore('sync_cursors');
      store.put(valid);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 9. Preference Snapshots ---

  async getPreferenceSnapshot(userId: string): Promise<PreferenceSnapshotRecord | null> {
    this.ensureNamespace(undefined, userId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('preference_snapshots', 'readonly');
      const store = tx.objectStore('preference_snapshots');
      const req = store.get(userId);

      req.onsuccess = () =>
        resolve(req.result ? validatePreferenceSnapshotRecord(req.result) : null);
      req.onerror = () => reject(this.mapError(req.error));
    });
  }

  async savePreferenceSnapshot(snapshot: PreferenceSnapshotRecord): Promise<void> {
    const valid = validatePreferenceSnapshotRecord(snapshot);
    this.ensureNamespace(undefined, valid.userId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('preference_snapshots', 'readwrite');
      const store = tx.objectStore('preference_snapshots');
      store.put(valid);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  // --- 11. Boundary Lifecycle & Data Erasure ---

  async clearWorkspaceData(workspaceId: string): Promise<void> {
    this.ensureNamespace(workspaceId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [
          'item_headers',
          'drafts',
          'pending_mutations',
          'sync_cursors',
          'conflicts',
          'notes',
          'tasks',
          'routines',
          'routine_occurrences',
          'journal_entries',
        ],
        'readwrite'
      );

      // 1. Clear item headers
      const itemStore = tx.objectStore('item_headers');
      const itemReq = itemStore.getAll();
      itemReq.onsuccess = () => {
        for (const item of itemReq.result as ItemHeaderRecord[]) {
          if (item.workspaceId === workspaceId) {
            itemStore.delete([item.workspaceId, item.id]);
          }
        }
      };

      // 2. Clear drafts
      const draftStore = tx.objectStore('drafts');
      const draftReq = draftStore.getAll();
      draftReq.onsuccess = () => {
        for (const d of draftReq.result as DraftRecord[]) {
          if (d.workspaceId === workspaceId) {
            draftStore.delete([d.workspaceId, d.userId, d.id]);
          }
        }
      };

      // 3. Clear pending mutations
      const mutStore = tx.objectStore('pending_mutations');
      const mutReq = mutStore.getAll();
      mutReq.onsuccess = () => {
        for (const m of mutReq.result as PendingMutationRecord[]) {
          if (m.workspaceId === workspaceId) {
            mutStore.delete(m.operationId);
          }
        }
      };

      // 4. Clear sync cursors
      const cursorStore = tx.objectStore('sync_cursors');
      const cursorReq = cursorStore.getAll();
      cursorReq.onsuccess = () => {
        for (const c of cursorReq.result as SyncCursorRecord[]) {
          if (c.workspaceId === workspaceId) {
            cursorStore.delete([c.workspaceId, c.userId]);
          }
        }
      };

      // 5. Clear conflicts
      const conflictStore = tx.objectStore('conflicts');
      const conflictReq = conflictStore.getAll();
      conflictReq.onsuccess = () => {
        for (const c of conflictReq.result as ConflictRecord[]) {
          if (c.workspaceId === workspaceId) {
            conflictStore.delete([c.workspaceId, c.id]);
          }
        }
      };

      // 6. Clear notes
      const noteStore = tx.objectStore('notes');
      const noteReq = noteStore.getAll();
      noteReq.onsuccess = () => {
        for (const n of noteReq.result as NoteRecord[]) {
          if (n.workspaceId === workspaceId) {
            noteStore.delete([n.workspaceId, n.id]);
          }
        }
      };

      // 7. Clear tasks
      const taskStore = tx.objectStore('tasks');
      const taskReq = taskStore.getAll();
      taskReq.onsuccess = () => {
        for (const t of taskReq.result as TaskRecord[]) {
          if (t.workspaceId === workspaceId) {
            taskStore.delete([t.workspaceId, t.id]);
          }
        }
      };

      // 8. Clear routines
      const routineStore = tx.objectStore('routines');
      const routineReq = routineStore.getAll();
      routineReq.onsuccess = () => {
        for (const r of routineReq.result as RoutineRecord[]) {
          if (r.workspaceId === workspaceId) {
            routineStore.delete([r.workspaceId, r.id]);
          }
        }
      };

      // 9. Clear routine occurrences
      const occStore = tx.objectStore('routine_occurrences');
      const occReq = occStore.getAll();
      occReq.onsuccess = () => {
        for (const o of occReq.result as RoutineOccurrenceRecord[]) {
          if (o.workspaceId === workspaceId) {
            occStore.delete([o.workspaceId, o.id]);
          }
        }
      };

      // 10. Clear journal entries
      const journalStore = tx.objectStore('journal_entries');
      const journalReq = journalStore.getAll();
      journalReq.onsuccess = () => {
        for (const j of journalReq.result as JournalEntryRecord[]) {
          if (j.workspaceId === workspaceId) {
            journalStore.delete([j.workspaceId, j.id]);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }

  async clearAccountData(userId: string): Promise<void> {
    this.ensureNamespace(undefined, userId);
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [
          'item_headers',
          'drafts',
          'pending_mutations',
          'sync_cursors',
          'preference_snapshots',
          'conflicts',
          'notes',
          'tasks',
          'routines',
          'routine_occurrences',
          'journal_entries',
        ],
        'readwrite'
      );

      // 1. Clear item headers
      const itemStore = tx.objectStore('item_headers');
      itemStore.clear();

      // 2. Clear drafts for user
      const draftStore = tx.objectStore('drafts');
      const draftReq = draftStore.getAll();
      draftReq.onsuccess = () => {
        for (const d of draftReq.result as DraftRecord[]) {
          if (d.userId === userId) {
            draftStore.delete([d.workspaceId, d.userId, d.id]);
          }
        }
      };

      // 3. Clear mutations for user
      const mutationStore = tx.objectStore('pending_mutations');
      const mutationReq = mutationStore.getAll();
      mutationReq.onsuccess = () => {
        for (const m of mutationReq.result as PendingMutationRecord[]) {
          if (m.userId === userId) {
            mutationStore.delete(m.operationId);
          }
        }
      };

      // 4. Clear cursors for user
      const cursorStore = tx.objectStore('sync_cursors');
      const cursorReq = cursorStore.getAll();
      cursorReq.onsuccess = () => {
        for (const c of cursorReq.result as SyncCursorRecord[]) {
          if (c.userId === userId) {
            cursorStore.delete([c.workspaceId, c.userId]);
          }
        }
      };

      // 5. Clear preference snapshot for user
      const prefStore = tx.objectStore('preference_snapshots');
      prefStore.delete(userId);

      // 6. Clear conflicts for user
      const conflictStore = tx.objectStore('conflicts');
      const conflictReq = conflictStore.getAll();
      conflictReq.onsuccess = () => {
        for (const c of conflictReq.result as ConflictRecord[]) {
          if (c.userId === userId) {
            conflictStore.delete([c.workspaceId, c.id]);
          }
        }
      };

      // 7. Clear notes
      const noteStore = tx.objectStore('notes');
      noteStore.clear();

      // 8. Clear tasks
      const taskStore = tx.objectStore('tasks');
      taskStore.clear();

      // 9. Clear routines
      const routineStore = tx.objectStore('routines');
      routineStore.clear();

      // 10. Clear routine occurrences
      const occStore = tx.objectStore('routine_occurrences');
      occStore.clear();

      // 11. Clear journal entries
      const journalStore = tx.objectStore('journal_entries');
      journalStore.clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(this.mapError(tx.error));
      tx.onabort = () => reject(this.mapError(tx.error));
    });
  }
}
