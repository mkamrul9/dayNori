import { getOfflineBinaryCacheKey } from '@daynori/domain';

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

/**
 * In-memory storage for mobile offline file binaries with namespacing by account, workspace, and version.
 * Can be integrated with local file storage / SQLite in hardware execution environments.
 */
const mobileFileCache = new Map<string, MobileOfflineFileEntry>();

export async function computeMobileBufferSha256(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  try {
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');
  } catch {
    return '';
  }
}

export class MobileOfflineFileCache {
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

    mobileFileCache.set(cacheKey, entry);
    return entry;
  }

  static async getBinary(
    accountId: string,
    workspaceId: string,
    fileId: string,
    version: number
  ): Promise<MobileOfflineFileEntry | null> {
    const cacheKey = getOfflineBinaryCacheKey(accountId, workspaceId, fileId, version);
    const entry = mobileFileCache.get(cacheKey) || null;
    if (entry) {
      const hash = await computeMobileBufferSha256(entry.binaryData);
      if (hash && entry.sha256Checksum && hash !== entry.sha256Checksum) {
        mobileFileCache.delete(cacheKey);
        throw new Error('OFFLINE_FILE_CORRUPTED: Mobile stored bytes failed integrity check.');
      }
    }
    return entry;
  }

  static async hasBinary(
    accountId: string,
    workspaceId: string,
    fileId: string,
    version: number
  ): Promise<boolean> {
    const entry = await this.getBinary(accountId, workspaceId, fileId, version);
    return entry !== null;
  }

  static async deleteBinary(
    accountId: string,
    workspaceId: string,
    fileId: string,
    version: number
  ): Promise<void> {
    const cacheKey = getOfflineBinaryCacheKey(accountId, workspaceId, fileId, version);
    mobileFileCache.delete(cacheKey);
  }

  static async clearWorkspace(workspaceId: string): Promise<void> {
    for (const [key, entry] of mobileFileCache.entries()) {
      if (entry.workspaceId === workspaceId) {
        mobileFileCache.delete(key);
      }
    }
  }

  static async clearAccount(accountId: string): Promise<void> {
    for (const [key, entry] of mobileFileCache.entries()) {
      if (entry.accountId === accountId) {
        mobileFileCache.delete(key);
      }
    }
  }
}
