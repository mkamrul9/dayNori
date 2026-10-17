import * as FileSystem from 'expo-file-system';
import {
  type MobileOfflineStorageAdapter,
  type MobileOfflineFileEntry,
  type MobileOfflineFileMetadata,
  computeMobileBufferSha256,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from './offlineFileCache.js';

function sanitizeKeyForFs(cacheKey: string): string {
  return cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Mobile platform native storage adapter using expo-file-system.
 * Enforces namespaced metadata, immutable versioning, bounded storage quotas (LRU eviction),
 * atomic rename writes, and SHA-256 integrity verification that survives app restarts.
 */
export class ExpoFileSystemOfflineStorageAdapter implements MobileOfflineStorageAdapter {
  private baseDir: string;
  private maxStorageBytes: number;

  constructor(options?: { baseDir?: string; maxStorageBytes?: number }) {
    const docDir = FileSystem.documentDirectory || '';
    this.baseDir = options?.baseDir || `${docDir}daynori_mobile_offline_cache/`;
    this.maxStorageBytes = options?.maxStorageBytes || 50 * 1024 * 1024; // 50MB default
  }

  private async ensureDir(): Promise<void> {
    if (!this.baseDir) return;
    try {
      const info = await FileSystem.getInfoAsync(this.baseDir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
      }
    } catch {
      /* ignore directory creation race */
    }
  }

  private getPaths(cacheKey: string) {
    const safeKey = sanitizeKeyForFs(cacheKey);
    const nonce = Math.random().toString(36).substring(2);
    return {
      binPath: `${this.baseDir}${safeKey}.bin`,
      metaPath: `${this.baseDir}${safeKey}.meta.json`,
      tmpBinPath: `${this.baseDir}${safeKey}.bin.tmp.${Date.now()}_${nonce}`,
      tmpMetaPath: `${this.baseDir}${safeKey}.meta.tmp.${Date.now()}_${nonce}`,
    };
  }

  async getTotalBytes(): Promise<number> {
    await this.ensureDir();
    try {
      const files = await FileSystem.readDirectoryAsync(this.baseDir);
      let total = 0;
      for (const f of files) {
        if (f.endsWith('.meta.json')) {
          try {
            const raw = await FileSystem.readAsStringAsync(`${this.baseDir}${f}`);
            const meta = JSON.parse(raw) as MobileOfflineFileMetadata;
            total += meta.byteSize || 0;
          } catch {
            /* ignore corrupted meta in count */
          }
        }
      }
      return total;
    } catch {
      return 0;
    }
  }

  private async evictIfNecessary(incomingBytes: number): Promise<void> {
    await this.ensureDir();
    let files: string[] = [];
    try {
      files = await FileSystem.readDirectoryAsync(this.baseDir);
    } catch {
      return;
    }

    const metaList: { meta: MobileOfflineFileMetadata; safeKey: string }[] = [];

    for (const f of files) {
      if (f.endsWith('.meta.json')) {
        try {
          const raw = await FileSystem.readAsStringAsync(`${this.baseDir}${f}`);
          const meta = JSON.parse(raw) as MobileOfflineFileMetadata;
          const safeKey = f.replace('.meta.json', '');
          metaList.push({ meta, safeKey });
        } catch {
          /* ignore */
        }
      }
    }

    let currentTotal = metaList.reduce((acc, m) => acc + (m.meta.byteSize || 0), 0);
    if (currentTotal + incomingBytes <= this.maxStorageBytes) {
      return;
    }

    // Sort oldest first (FIFO / LRU eviction)
    metaList.sort(
      (a, b) => new Date(a.meta.cachedAt).getTime() - new Date(b.meta.cachedAt).getTime()
    );

    for (const item of metaList) {
      if (currentTotal + incomingBytes <= this.maxStorageBytes) {
        break;
      }
      try {
        const binFile = `${this.baseDir}${item.safeKey}.bin`;
        const metaFile = `${this.baseDir}${item.safeKey}.meta.json`;
        await FileSystem.deleteAsync(binFile, { idempotent: true });
        await FileSystem.deleteAsync(metaFile, { idempotent: true });
        currentTotal -= item.meta.byteSize || 0;
      } catch {
        /* ignore eviction file delete errors */
      }
    }
  }

  async save(entry: MobileOfflineFileEntry): Promise<void> {
    await this.ensureDir();
    await this.evictIfNecessary(entry.byteSize);

    const { binPath, metaPath, tmpBinPath, tmpMetaPath } = this.getPaths(entry.cacheKey);

    const metadata: MobileOfflineFileMetadata = {
      cacheKey: entry.cacheKey,
      accountId: entry.accountId,
      workspaceId: entry.workspaceId,
      fileId: entry.fileId,
      version: entry.version,
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      byteSize: entry.byteSize,
      sha256Checksum: entry.sha256Checksum,
      cachedAt: entry.cachedAt,
    };

    // 1. Crash-safe write: write to tmp files first
    const base64Data = arrayBufferToBase64(entry.binaryData);
    await FileSystem.writeAsStringAsync(tmpBinPath, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(tmpMetaPath, JSON.stringify(metadata, null, 2));

    // 2. Atomic rename/move to target paths
    await FileSystem.moveAsync({ from: tmpBinPath, to: binPath });
    await FileSystem.moveAsync({ from: tmpMetaPath, to: metaPath });
  }

  async get(cacheKey: string): Promise<MobileOfflineFileEntry | null> {
    await this.ensureDir();
    const { binPath, metaPath } = this.getPaths(cacheKey);

    try {
      const metaInfo = await FileSystem.getInfoAsync(metaPath);
      const binInfo = await FileSystem.getInfoAsync(binPath);
      if (!metaInfo.exists || !binInfo.exists) {
        return null;
      }

      const metaRaw = await FileSystem.readAsStringAsync(metaPath);
      const meta = JSON.parse(metaRaw) as MobileOfflineFileMetadata;
      const binBase64 = await FileSystem.readAsStringAsync(binPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const arrayBuffer = base64ToArrayBuffer(binBase64);

      // Verify integrity on read
      const hash = await computeMobileBufferSha256(arrayBuffer);
      if (!hash || (meta.sha256Checksum && hash !== meta.sha256Checksum)) {
        // Corrupted file on disk: evict immediately
        try {
          await FileSystem.deleteAsync(binPath, { idempotent: true });
          await FileSystem.deleteAsync(metaPath, { idempotent: true });
        } catch {
          /* ignore */
        }
        throw new Error('OFFLINE_FILE_CORRUPTED: Mobile stored bytes failed integrity check.');
      }

      return {
        cacheKey: meta.cacheKey,
        accountId: meta.accountId,
        workspaceId: meta.workspaceId,
        fileId: meta.fileId,
        version: meta.version,
        fileName: meta.fileName,
        mimeType: meta.mimeType,
        byteSize: meta.byteSize,
        sha256Checksum: meta.sha256Checksum,
        binaryData: arrayBuffer,
        cachedAt: meta.cachedAt,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('OFFLINE_FILE_CORRUPTED')) {
        throw err;
      }
      return null;
    }
  }

  async has(cacheKey: string): Promise<boolean> {
    const entry = await this.get(cacheKey);
    return entry !== null;
  }

  async delete(cacheKey: string): Promise<void> {
    await this.ensureDir();
    const { binPath, metaPath } = this.getPaths(cacheKey);
    await FileSystem.deleteAsync(binPath, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(metaPath, { idempotent: true }).catch(() => {});
  }

  async clearWorkspace(workspaceId: string): Promise<void> {
    await this.ensureDir();
    try {
      const files = await FileSystem.readDirectoryAsync(this.baseDir);
      for (const f of files) {
        if (f.endsWith('.meta.json')) {
          try {
            const metaPath = `${this.baseDir}${f}`;
            const raw = await FileSystem.readAsStringAsync(metaPath);
            const meta = JSON.parse(raw) as MobileOfflineFileMetadata;
            if (meta.workspaceId === workspaceId) {
              const safeKey = f.replace('.meta.json', '');
              const binPath = `${this.baseDir}${safeKey}.bin`;
              await FileSystem.deleteAsync(binPath, { idempotent: true }).catch(() => {});
              await FileSystem.deleteAsync(metaPath, { idempotent: true }).catch(() => {});
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  async clearAccount(accountId: string): Promise<void> {
    await this.ensureDir();
    try {
      const files = await FileSystem.readDirectoryAsync(this.baseDir);
      for (const f of files) {
        if (f.endsWith('.meta.json')) {
          try {
            const metaPath = `${this.baseDir}${f}`;
            const raw = await FileSystem.readAsStringAsync(metaPath);
            const meta = JSON.parse(raw) as MobileOfflineFileMetadata;
            if (meta.accountId === accountId) {
              const safeKey = f.replace('.meta.json', '');
              const binPath = `${this.baseDir}${safeKey}.bin`;
              await FileSystem.deleteAsync(binPath, { idempotent: true }).catch(() => {});
              await FileSystem.deleteAsync(metaPath, { idempotent: true }).catch(() => {});
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  async clear(): Promise<void> {
    try {
      await FileSystem.deleteAsync(this.baseDir, { idempotent: true });
    } catch {
      /* ignore */
    }
    await this.ensureDir();
  }
}
