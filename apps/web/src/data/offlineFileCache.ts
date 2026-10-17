import { getOfflineBinaryCacheKey } from '@daynori/domain';

export interface OfflineFileEntry {
  cacheKey: string;
  accountId: string;
  workspaceId: string;
  fileId: string;
  version: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256Checksum: string;
  binaryData: ArrayBuffer;
  cachedAt: string;
}

const OFFLINE_DB_NAME = 'daynori_offline_file_cache';
const OFFLINE_DB_VERSION = 1;
const STORE_NAME = 'binaries';

/**
 * In-memory fallback cache for environments without IndexedDB (e.g., node tests).
 */
const inMemoryCache = new Map<string, OfflineFileEntry>();

function getIndexedDB(): IDBFactory | null {
  if (typeof indexedDB !== 'undefined') {
    return indexedDB;
  }
  return null;
}

function openOfflineDb(): Promise<IDBDatabase | null> {
  const idb = getIndexedDB();
  if (!idb) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = idb.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
        store.createIndex('by_account', 'accountId', { unique: false });
        store.createIndex('by_workspace', 'workspaceId', { unique: false });
        store.createIndex('by_file', ['workspaceId', 'fileId'], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Computes SHA-256 hex string of ArrayBuffer for integrity verification.
 */
export async function computeBufferSha256(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node / test fallback if crypto.subtle is absent
  try {
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');
  } catch {
    return '';
  }
}

export class OfflineFileCache {
  /**
   * Saves a verified file binary into offline storage.
   * Rejects if the binary does not match the expected SHA-256 checksum.
   */
  static async saveBinary(params: {
    accountId: string;
    workspaceId: string;
    fileId: string;
    version: number;
    fileName: string;
    mimeType: string;
    expectedSha256: string;
    data: ArrayBuffer;
  }): Promise<OfflineFileEntry> {
    const computedHash = await computeBufferSha256(params.data);
    if (computedHash && params.expectedSha256 && computedHash !== params.expectedSha256) {
      throw new Error(
        `INTEGRITY_CHECK_FAILED: File hash ${computedHash} does not match expected checksum ${params.expectedSha256}.`
      );
    }

    const cacheKey = getOfflineBinaryCacheKey(
      params.accountId,
      params.workspaceId,
      params.fileId,
      params.version
    );

    const entry: OfflineFileEntry = {
      cacheKey,
      accountId: params.accountId,
      workspaceId: params.workspaceId,
      fileId: params.fileId,
      version: params.version,
      fileName: params.fileName,
      mimeType: params.mimeType,
      byteSize: params.data.byteLength,
      sha256Checksum: params.expectedSha256 || computedHash,
      binaryData: params.data,
      cachedAt: new Date().toISOString(),
    };

    const db = await openOfflineDb();
    if (!db) {
      inMemoryCache.set(cacheKey, entry);
      return entry;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);

      req.onsuccess = () => resolve(entry);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Retrieves an offline file binary and validates its integrity before returning.
   */
  static async getBinary(
    accountId: string,
    workspaceId: string,
    fileId: string,
    version: number
  ): Promise<OfflineFileEntry | null> {
    const cacheKey = getOfflineBinaryCacheKey(accountId, workspaceId, fileId, version);

    const db = await openOfflineDb();
    if (!db) {
      const entry = inMemoryCache.get(cacheKey) || null;
      if (entry) {
        const hash = await computeBufferSha256(entry.binaryData);
        if (hash && entry.sha256Checksum && hash !== entry.sha256Checksum) {
          inMemoryCache.delete(cacheKey);
          throw new Error('OFFLINE_FILE_CORRUPTED: Stored bytes failed integrity check.');
        }
      }
      return entry;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);

      req.onsuccess = async () => {
        const entry = req.result as OfflineFileEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        const hash = await computeBufferSha256(entry.binaryData);
        if (hash && entry.sha256Checksum && hash !== entry.sha256Checksum) {
          // Corrupted binary: evict from cache immediately
          const delTx = db.transaction(STORE_NAME, 'readwrite');
          delTx.objectStore(STORE_NAME).delete(cacheKey);
          reject(new Error('OFFLINE_FILE_CORRUPTED: Stored bytes failed integrity check.'));
          return;
        }

        resolve(entry);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Checks whether a file version is available offline.
   */
  static async hasBinary(
    accountId: string,
    workspaceId: string,
    fileId: string,
    version: number
  ): Promise<boolean> {
    const entry = await this.getBinary(accountId, workspaceId, fileId, version);
    return entry !== null;
  }

  /**
   * Removes a specific file binary from offline cache.
   */
  static async deleteBinary(
    accountId: string,
    workspaceId: string,
    fileId: string,
    version: number
  ): Promise<void> {
    const cacheKey = getOfflineBinaryCacheKey(accountId, workspaceId, fileId, version);
    inMemoryCache.delete(cacheKey);

    const db = await openOfflineDb();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(cacheKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Cleans up all cached files for a specific workspace (on workspace switch or removal).
   */
  static async clearWorkspace(workspaceId: string): Promise<void> {
    for (const [key, entry] of inMemoryCache.entries()) {
      if (entry.workspaceId === workspaceId) {
        inMemoryCache.delete(key);
      }
    }

    const db = await openOfflineDb();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_workspace');
      const req = index.getAllKeys(workspaceId);

      req.onsuccess = () => {
        const keys = req.result;
        for (const key of keys) {
          store.delete(key);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Cleans up all cached files for a specific account (on logout or account switch).
   */
  static async clearAccount(accountId: string): Promise<void> {
    for (const [key, entry] of inMemoryCache.entries()) {
      if (entry.accountId === accountId) {
        inMemoryCache.delete(key);
      }
    }

    const db = await openOfflineDb();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_account');
      const req = index.getAllKeys(accountId);

      req.onsuccess = () => {
        const keys = req.result;
        for (const key of keys) {
          store.delete(key);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
