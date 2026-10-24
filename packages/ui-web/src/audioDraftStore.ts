export interface DurableAudioDraft {
  key: string;
  workspaceId: string;
  accountId?: string;
  mimeType: string;
  durationSeconds: number;
  byteSize: number;
  audioBuffer: ArrayBuffer;
  updatedAt: string;
  storageTier?: 'indexeddb' | 'memory';
}

export interface SaveDraftResult {
  success: boolean;
  storageTier: 'indexeddb' | 'memory';
  key: string;
  warning?: string;
}

const DB_NAME = 'daynori_audio_drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

// In-memory fallback for SSR / headless test environments without indexedDB
const memoryDraftStore = new Map<string, DurableAudioDraft>();

function getDraftKey(workspaceId: string, accountId?: string): string {
  if (!workspaceId) throw new Error('workspaceId is required to scope audio draft');
  return accountId ? `${accountId}:${workspaceId}` : workspaceId;
}

function openDraftDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDurableAudioDraft(params: {
  workspaceId: string;
  accountId?: string;
  mimeType: string;
  durationSeconds: number;
  byteSize: number;
  audioBuffer: ArrayBuffer;
}): Promise<SaveDraftResult> {
  const key = getDraftKey(params.workspaceId, params.accountId);
  const draft: DurableAudioDraft = {
    key,
    workspaceId: params.workspaceId,
    accountId: params.accountId,
    mimeType: params.mimeType,
    durationSeconds: Math.max(1, Math.round(params.durationSeconds)),
    byteSize: params.byteSize,
    audioBuffer: params.audioBuffer,
    updatedAt: new Date().toISOString(),
    storageTier: 'indexeddb',
  };

  try {
    const db = await openDraftDb();
    if (!db) {
      draft.storageTier = 'memory';
      memoryDraftStore.set(key, draft);
      return {
        success: true,
        storageTier: 'memory',
        key,
        warning: 'IndexedDB not available in current environment; draft stored in memory only.',
      };
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(draft);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });

    return {
      success: true,
      storageTier: 'indexeddb',
      key,
    };
  } catch (err: unknown) {
    draft.storageTier = 'memory';
    memoryDraftStore.set(key, draft);
    return {
      success: false,
      storageTier: 'memory',
      key,
      warning: `IndexedDB persistence failed: ${err instanceof Error ? err.message : String(err)}; draft preserved in temporary memory only.`,
    };
  }
}

export async function getDurableAudioDraft(
  workspaceId: string,
  accountId?: string
): Promise<DurableAudioDraft | null> {
  const key = getDraftKey(workspaceId, accountId);

  try {
    const db = await openDraftDb();
    if (!db) {
      return memoryDraftStore.get(key) || null;
    }

    return await new Promise<DurableAudioDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return memoryDraftStore.get(key) || null;
  }
}

export async function clearDurableAudioDraft(
  workspaceId: string,
  accountId?: string
): Promise<void> {
  const key = getDraftKey(workspaceId, accountId);
  memoryDraftStore.delete(key);

  try {
    const db = await openDraftDb();
    if (!db) return;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    void 0;
  }
}
