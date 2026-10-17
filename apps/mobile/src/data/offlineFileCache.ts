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

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
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

/**
 * In-memory fallback adapter for testing and environments where file system is not initialized.
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

let activeAdapter: MobileOfflineStorageAdapter = new MemoryMobileOfflineStorageAdapter();

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
