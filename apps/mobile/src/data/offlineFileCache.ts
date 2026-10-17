import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getOfflineBinaryCacheKey, computeSha256 } from '@daynori/domain';

export interface MobileOfflineFileEntry {
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

export interface MobileOfflineFileMetadata {
  cacheKey: string;
  accountId: string;
  workspaceId: string;
  fileId: string;
  version: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256Checksum: string;
  cachedAt: string;
}

export interface MobileOfflineStorageAdapter {
  save(entry: MobileOfflineFileEntry): Promise<void>;
  get(cacheKey: string): Promise<MobileOfflineFileEntry | null>;
  has(cacheKey: string): Promise<boolean>;
  delete(cacheKey: string): Promise<void>;
  clearWorkspace(workspaceId: string): Promise<void>;
  clearAccount(accountId: string): Promise<void>;
  clear(): Promise<void>;
  getTotalBytes(): Promise<number>;
}

/**
 * Computes SHA-256 hex string of ArrayBuffer for integrity verification.
 * Fails explicitly if hash computation fails or returns invalid result.
 */
export async function computeMobileBufferSha256(buffer: ArrayBuffer): Promise<string> {
  const hash = await computeSha256(buffer);
  if (!hash) {
    throw new Error('INTEGRITY_CHECK_UNAVAILABLE: Checksum calculation returned empty result.');
  }
  return hash;
}

function sanitizeKeyForFs(cacheKey: string): string {
  return cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Persistent, crash-safe platform storage adapter for mobile offline files.
 * Enforces namespaced metadata, immutable versioning, bounded storage quotas (LRU eviction),
 * atomic rename writes, and SHA-256 integrity verification that survives process restart.
 */
export class PersistentMobileOfflineStorageAdapter implements MobileOfflineStorageAdapter {
  private baseDir: string;
  private maxStorageBytes: number;

  constructor(options?: { baseDir?: string; maxStorageBytes?: number }) {
    this.baseDir =
      options?.baseDir ||
      process.env['MOBILE_OFFLINE_STORAGE_DIR'] ||
      path.join(os.tmpdir(), 'daynori_mobile_offline_cache');
    this.maxStorageBytes = options?.maxStorageBytes || 50 * 1024 * 1024; // 50MB default

    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getPaths(cacheKey: string) {
    const safeKey = sanitizeKeyForFs(cacheKey);
    return {
      binPath: path.join(this.baseDir, `${safeKey}.bin`),
      metaPath: path.join(this.baseDir, `${safeKey}.meta.json`),
      tmpBinPath: path.join(this.baseDir, `${safeKey}.bin.tmp.${Date.now()}`),
      tmpMetaPath: path.join(this.baseDir, `${safeKey}.meta.tmp.${Date.now()}`),
    };
  }

  async getTotalBytes(): Promise<number> {
    if (!fs.existsSync(this.baseDir)) return 0;
    let total = 0;
    const files = fs.readdirSync(this.baseDir);
    for (const f of files) {
      if (f.endsWith('.meta.json')) {
        try {
          const raw = fs.readFileSync(path.join(this.baseDir, f), 'utf-8');
          const meta = JSON.parse(raw) as MobileOfflineFileMetadata;
          total += meta.byteSize || 0;
        } catch {
          /* ignore corrupted meta in count */
        }
      }
    }
    return total;
  }

  private async evictIfNecessary(incomingBytes: number): Promise<void> {
    const files = fs.readdirSync(this.baseDir);
    const metaList: { meta: MobileOfflineFileMetadata; safeKey: string }[] = [];

    for (const f of files) {
      if (f.endsWith('.meta.json')) {
        try {
          const raw = fs.readFileSync(path.join(this.baseDir, f), 'utf-8');
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
        const binFile = path.join(this.baseDir, `${item.safeKey}.bin`);
        const metaFile = path.join(this.baseDir, `${item.safeKey}.meta.json`);
        if (fs.existsSync(binFile)) fs.unlinkSync(binFile);
        if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
        currentTotal -= item.meta.byteSize || 0;
      } catch {
        /* ignore eviction file delete errors */
      }
    }
  }

  async save(entry: MobileOfflineFileEntry): Promise<void> {
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
    const buffer = Buffer.from(entry.binaryData);
    fs.writeFileSync(tmpBinPath, buffer);
    fs.writeFileSync(tmpMetaPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // 2. Atomic rename to target paths
    fs.renameSync(tmpBinPath, binPath);
    fs.renameSync(tmpMetaPath, metaPath);
  }

  async get(cacheKey: string): Promise<MobileOfflineFileEntry | null> {
    const { binPath, metaPath } = this.getPaths(cacheKey);

    if (!fs.existsSync(binPath) || !fs.existsSync(metaPath)) {
      return null;
    }

    try {
      const metaRaw = fs.readFileSync(metaPath, 'utf-8');
      const meta = JSON.parse(metaRaw) as MobileOfflineFileMetadata;
      const binBuffer = fs.readFileSync(binPath);

      const arrayBuffer = binBuffer.buffer.slice(
        binBuffer.byteOffset,
        binBuffer.byteOffset + binBuffer.byteLength
      );

      // Verify integrity on read
      const hash = await computeMobileBufferSha256(arrayBuffer);
      if (!hash || (meta.sha256Checksum && hash !== meta.sha256Checksum)) {
        // Corrupted file on disk: evict immediately
        try {
          if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
          if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
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
    const { binPath, metaPath } = this.getPaths(cacheKey);
    if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  }

  async clearWorkspace(workspaceId: string): Promise<void> {
    if (!fs.existsSync(this.baseDir)) return;
    const files = fs.readdirSync(this.baseDir);
    for (const f of files) {
      if (f.endsWith('.meta.json')) {
        try {
          const metaPath = path.join(this.baseDir, f);
          const raw = fs.readFileSync(metaPath, 'utf-8');
          const meta = JSON.parse(raw) as MobileOfflineFileMetadata;
          if (meta.workspaceId === workspaceId) {
            const safeKey = f.replace('.meta.json', '');
            const binPath = path.join(this.baseDir, `${safeKey}.bin`);
            if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
            if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  async clearAccount(accountId: string): Promise<void> {
    if (!fs.existsSync(this.baseDir)) return;
    const files = fs.readdirSync(this.baseDir);
    for (const f of files) {
      if (f.endsWith('.meta.json')) {
        try {
          const metaPath = path.join(this.baseDir, f);
          const raw = fs.readFileSync(metaPath, 'utf-8');
          const meta = JSON.parse(raw) as MobileOfflineFileMetadata;
          if (meta.accountId === accountId) {
            const safeKey = f.replace('.meta.json', '');
            const binPath = path.join(this.baseDir, `${safeKey}.bin`);
            if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
            if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  async clear(): Promise<void> {
    if (!fs.existsSync(this.baseDir)) return;
    const files = fs.readdirSync(this.baseDir);
    for (const f of files) {
      try {
        fs.unlinkSync(path.join(this.baseDir, f));
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * In-memory fallback adapter for tests.
 */
export class MemoryMobileOfflineStorageAdapter implements MobileOfflineStorageAdapter {
  private map = new Map<string, MobileOfflineFileEntry>();

  async save(entry: MobileOfflineFileEntry): Promise<void> {
    this.map.set(entry.cacheKey, entry);
  }

  async get(cacheKey: string): Promise<MobileOfflineFileEntry | null> {
    const entry = this.map.get(cacheKey) || null;
    if (entry) {
      const hash = await computeMobileBufferSha256(entry.binaryData);
      if (!hash || (entry.sha256Checksum && hash !== entry.sha256Checksum)) {
        this.map.delete(cacheKey);
        throw new Error('OFFLINE_FILE_CORRUPTED: Mobile stored bytes failed integrity check.');
      }
    }
    return entry;
  }

  async has(cacheKey: string): Promise<boolean> {
    return this.map.has(cacheKey);
  }

  async delete(cacheKey: string): Promise<void> {
    this.map.delete(cacheKey);
  }

  async clearWorkspace(workspaceId: string): Promise<void> {
    for (const [key, entry] of this.map.entries()) {
      if (entry.workspaceId === workspaceId) {
        this.map.delete(key);
      }
    }
  }

  async clearAccount(accountId: string): Promise<void> {
    for (const [key, entry] of this.map.entries()) {
      if (entry.accountId === accountId) {
        this.map.delete(key);
      }
    }
  }

  async clear(): Promise<void> {
    this.map.clear();
  }

  async getTotalBytes(): Promise<number> {
    let sum = 0;
    for (const entry of this.map.values()) {
      sum += entry.byteSize;
    }
    return sum;
  }
}

let activeAdapter: MobileOfflineStorageAdapter = new PersistentMobileOfflineStorageAdapter();

export class MobileOfflineFileCache {
  static setAdapter(adapter: MobileOfflineStorageAdapter): void {
    activeAdapter = adapter;
  }

  static getAdapter(): MobileOfflineStorageAdapter {
    return activeAdapter;
  }

  static async saveBinary(params: {
    accountId: string;
    workspaceId: string;
    fileId: string;
    version: number;
    fileName: string;
    mimeType: string;
    expectedSha256: string;
    data: ArrayBuffer;
  }): Promise<MobileOfflineFileEntry> {
    const computedHash = await computeMobileBufferSha256(params.data);
    if (!computedHash) {
      throw new Error(
        'INTEGRITY_CHECK_UNAVAILABLE: Checksum could not be calculated for mobile offline persistence.'
      );
    }
    if (params.expectedSha256 && computedHash !== params.expectedSha256) {
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

    const entry: MobileOfflineFileEntry = {
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

    await activeAdapter.save(entry);
    return entry;
  }

  static async getBinary(
    accountId: string,
    workspaceId: string,
    fileId: string,
    version: number
  ): Promise<MobileOfflineFileEntry | null> {
    const cacheKey = getOfflineBinaryCacheKey(accountId, workspaceId, fileId, version);
    return activeAdapter.get(cacheKey);
  }

  static async hasBinary(
    accountId: string,
    workspaceId: string,
    fileId: string,
    version: number
  ): Promise<boolean> {
    const cacheKey = getOfflineBinaryCacheKey(accountId, workspaceId, fileId, version);
    return activeAdapter.has(cacheKey);
  }

  static async deleteBinary(
    accountId: string,
    workspaceId: string,
    fileId: string,
    version: number
  ): Promise<void> {
    const cacheKey = getOfflineBinaryCacheKey(accountId, workspaceId, fileId, version);
    await activeAdapter.delete(cacheKey);
  }

  static async clearWorkspace(workspaceId: string): Promise<void> {
    await activeAdapter.clearWorkspace(workspaceId);
  }

  static async clearAccount(accountId: string): Promise<void> {
    await activeAdapter.clearAccount(accountId);
  }

  static async clear(): Promise<void> {
    await activeAdapter.clear();
  }
}
