import zlib from 'node:zlib';

export interface ZipEntry {
  path: string;
  data: Buffer | string;
  modTime?: Date;
}

export interface ZipArchiveOptions {
  maxEntries?: number;
  maxTotalBytes?: number;
  maxSingleEntryBytes?: number;
  maxCompressionRatio?: number;
}

export const DEFAULT_ZIP_OPTIONS: Required<ZipArchiveOptions> = {
  maxEntries: 5000,
  maxTotalBytes: 200 * 1024 * 1024, // 200 MiB
  maxSingleEntryBytes: 50 * 1024 * 1024, // 50 MiB
  maxCompressionRatio: 100,
};

/**
 * Validates that an archive relative path is safe:
 * - Reject path traversal segments (.. or /..)
 * - Reject absolute paths (/foo, \foo, C:\foo)
 * - Reject UNC network paths (\\server\share)
 * - Reject null bytes or ASCII control characters
 */
export function assertSafePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new Error('ARCHIVE_SECURITY_VIOLATION: Empty or non-string file path in archive');
  }

  // Null byte or control character rejection (ASCII 0-31 and 127)
  for (let i = 0; i < rawPath.length; i++) {
    const code = rawPath.charCodeAt(i);
    if (code < 32 || code === 127) {
      throw new Error('ARCHIVE_SECURITY_VIOLATION: File path contains null bytes or control characters');
    }
  }

  // Windows drive letter check (e.g. C:, D:)
  if (/^[a-zA-Z]:/.test(rawPath)) {
    throw new Error(`ARCHIVE_SECURITY_VIOLATION: Absolute Windows drive path rejected: "${rawPath}"`);
  }

  // Normalize backslashes to forward slashes
  const normalized = rawPath.replace(/\\/g, '/');

  // Leading slash (absolute POSIX path or UNC)
  if (normalized.startsWith('/') || rawPath.startsWith('\\\\')) {
    throw new Error(`ARCHIVE_SECURITY_VIOLATION: Absolute path rejected: "${rawPath}"`);
  }

  // Split segments and verify no traversal
  const segments = normalized.split('/');
  for (const seg of segments) {
    if (seg === '..' || seg === '.') {
      throw new Error(`ARCHIVE_SECURITY_VIOLATION: Path traversal segment rejected in "${rawPath}"`);
    }
  }

  return normalized;
}

function dateToDosTime(date: Date): { dosTime: number; dosDate: number } {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = Math.max(0, ((year - 1980) << 9) | (month << 5) | day);

  return { dosTime, dosDate };
}

/**
 * Creates a standard, portable ZIP archive from a list of entries.
 */
export function createZipArchive(
  entries: ZipEntry[],
  options?: { allowUnsafePathsForTesting?: boolean }
): Buffer {
  const localHeaderChunks: Buffer[] = [];
  const cdHeaderChunks: Buffer[] = [];
  let currentOffset = 0;

  for (const entry of entries) {
    const safePath = options?.allowUnsafePathsForTesting ? entry.path : assertSafePath(entry.path);
    const uncompressedData =
      typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data;

    const crc = zlib.crc32(uncompressedData);
    const compressedData = zlib.deflateRawSync(uncompressedData);
    const isDeflated = compressedData.length < uncompressedData.length;

    const method = isDeflated ? 8 : 0;
    const finalData = isDeflated ? compressedData : uncompressedData;
    const compressedSize = finalData.length;
    const uncompressedSize = uncompressedData.length;

    const pathBytes = Buffer.from(safePath, 'utf8');
    const { dosTime, dosDate } = dateToDosTime(entry.modTime || new Date());

    // Local file header (30 bytes + path length)
    const localHeader = Buffer.alloc(30 + pathBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
    localHeader.writeUInt16LE(20, 4); // Min version to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // General purpose flags (bit 11 = UTF-8 filename)
    localHeader.writeUInt16LE(method, 8); // Compression method (0 or 8)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(pathBytes.length, 26);
    localHeader.writeUInt16LE(0, 28); // Extra field length
    pathBytes.copy(localHeader, 30);

    localHeaderChunks.push(localHeader, finalData);

    // Central directory header (46 bytes + path length)
    const cdHeader = Buffer.alloc(46 + pathBytes.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // CD header signature
    cdHeader.writeUInt16LE(20, 4); // Version made by
    cdHeader.writeUInt16LE(20, 6); // Min version to extract
    cdHeader.writeUInt16LE(0x0800, 8); // Flags (UTF-8)
    cdHeader.writeUInt16LE(method, 10);
    cdHeader.writeUInt16LE(dosTime, 12);
    cdHeader.writeUInt16LE(dosDate, 14);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(compressedSize, 20);
    cdHeader.writeUInt32LE(uncompressedSize, 24);
    cdHeader.writeUInt16LE(pathBytes.length, 28);
    cdHeader.writeUInt16LE(0, 30); // Extra field length
    cdHeader.writeUInt16LE(0, 32); // File comment length
    cdHeader.writeUInt16LE(0, 34); // Disk number start
    cdHeader.writeUInt16LE(0, 36); // Internal file attributes
    cdHeader.writeUInt32LE(0, 38); // External file attributes
    cdHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header
    pathBytes.copy(cdHeader, 46);

    cdHeaderChunks.push(cdHeader);
    currentOffset += localHeader.length + finalData.length;
  }

  const centralDirectoryOffset = currentOffset;
  const centralDirectoryBuffer = Buffer.concat(cdHeaderChunks);
  const centralDirectorySize = centralDirectoryBuffer.length;

  // End of Central Directory (EOCD - 22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(entries.length, 8); // Number of records on this disk
  eocd.writeUInt16LE(entries.length, 10); // Total number of records
  eocd.writeUInt32LE(centralDirectorySize, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localHeaderChunks, centralDirectoryBuffer, eocd]);
}

/**
 * Safely parses and unpacks a ZIP archive with:
 * - Traversal and path safety checks
 * - Zip-bomb defenses (total decompressed byte ceiling, compression ratio guard)
 * - Maximum entry count limits
 * - Malformed header and CRC-32 integrity validation
 */
export function parseZipArchive(
  archiveBuffer: Buffer,
  options?: ZipArchiveOptions
): Map<string, Buffer> {
  const opts = { ...DEFAULT_ZIP_OPTIONS, ...options };

  if (!Buffer.isBuffer(archiveBuffer) || archiveBuffer.length < 22) {
    throw new Error('MALFORMED_ARCHIVE: Archive buffer is too small to be a valid ZIP');
  }

  // 1. Locate End of Central Directory (EOCD) signature 0x06054b50
  // Search backward from end of buffer (EOCD has minimum 22 bytes, max 65535 comment bytes + 22)
  let eocdOffset = -1;
  const maxSearch = Math.min(archiveBuffer.length, 65535 + 22);
  for (let i = archiveBuffer.length - 22; i >= archiveBuffer.length - maxSearch; i--) {
    if (archiveBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('MALFORMED_ARCHIVE: Could not find valid End of Central Directory record');
  }

  const totalEntries = archiveBuffer.readUInt16LE(eocdOffset + 10);
  const cdSize = archiveBuffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = archiveBuffer.readUInt32LE(eocdOffset + 16);

  if (totalEntries > opts.maxEntries) {
    throw new Error(
      `ARCHIVE_LIMIT_EXCEEDED: Archive entry count (${totalEntries}) exceeds maximum permitted (${opts.maxEntries})`
    );
  }

  if (cdOffset + cdSize > archiveBuffer.length) {
    throw new Error('MALFORMED_ARCHIVE: Central directory offset exceeds archive buffer size');
  }

  const results = new Map<string, Buffer>();
  let currentCdOffset = cdOffset;
  let cumulativeDecompressedBytes = 0;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (currentCdOffset + 46 > archiveBuffer.length) {
      throw new Error('MALFORMED_ARCHIVE: Truncated central directory header');
    }

    const cdSig = archiveBuffer.readUInt32LE(currentCdOffset);
    if (cdSig !== 0x02014b50) {
      throw new Error(
        `MALFORMED_ARCHIVE: Invalid central directory header signature at index ${idx}`
      );
    }

    const method = archiveBuffer.readUInt16LE(currentCdOffset + 10);
    const expectedCrc = archiveBuffer.readUInt32LE(currentCdOffset + 16);
    const compressedSize = archiveBuffer.readUInt32LE(currentCdOffset + 20);
    const uncompressedSize = archiveBuffer.readUInt32LE(currentCdOffset + 24);
    const filenameLen = archiveBuffer.readUInt16LE(currentCdOffset + 28);
    const extraLen = archiveBuffer.readUInt16LE(currentCdOffset + 30);
    const commentLen = archiveBuffer.readUInt16LE(currentCdOffset + 32);
    const localHeaderOffset = archiveBuffer.readUInt32LE(currentCdOffset + 42);

    if (uncompressedSize > opts.maxSingleEntryBytes) {
      throw new Error(
        `ARCHIVE_LIMIT_EXCEEDED: Entry exceeds single entry limit of ${opts.maxSingleEntryBytes} bytes`
      );
    }

    const filenameBytes = archiveBuffer.subarray(
      currentCdOffset + 46,
      currentCdOffset + 46 + filenameLen
    );
    const rawPath = filenameBytes.toString('utf8');

    // Skip directory-only entries (ending in '/')
    if (rawPath.endsWith('/')) {
      currentCdOffset += 46 + filenameLen + extraLen + commentLen;
      continue;
    }

    // Path traversal & security assert
    const safePath = assertSafePath(rawPath);

    // Read local file header
    if (localHeaderOffset + 30 > archiveBuffer.length) {
      throw new Error('MALFORMED_ARCHIVE: Local header offset out of bounds');
    }

    const localSig = archiveBuffer.readUInt32LE(localHeaderOffset);
    if (localSig !== 0x04034b50) {
      throw new Error(`MALFORMED_ARCHIVE: Invalid local header signature for "${safePath}"`);
    }

    const localFilenameLen = archiveBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = archiveBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localFilenameLen + localExtraLen;

    if (dataOffset + compressedSize > archiveBuffer.length) {
      throw new Error(`MALFORMED_ARCHIVE: Compressed data out of bounds for "${safePath}"`);
    }

    const compressedPayload = archiveBuffer.subarray(dataOffset, dataOffset + compressedSize);

    // Decompress payload
    let decompressed: Buffer;
    if (method === 0) {
      decompressed = compressedPayload;
    } else if (method === 8) {
      try {
        decompressed = zlib.inflateRawSync(compressedPayload);
      } catch (err) {
        throw new Error(
          `MALFORMED_ARCHIVE: Failed to decompress "${safePath}": ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    } else {
      throw new Error(
        `UNSUPPORTED_ARCHIVE_FEATURE: Unsupported compression method ${method} in "${safePath}"`
      );
    }

    // Integrity check
    if (decompressed.length !== uncompressedSize) {
      throw new Error(
        `MALFORMED_ARCHIVE: Uncompressed size mismatch for "${safePath}": expected ${uncompressedSize}, got ${decompressed.length}`
      );
    }

    const actualCrc = zlib.crc32(decompressed);
    if (actualCrc !== expectedCrc) {
      throw new Error(
        `INTEGRITY_CHECK_FAILED: CRC-32 mismatch for "${safePath}": expected ${expectedCrc.toString(
          16
        )}, got ${actualCrc.toString(16)}`
      );
    }

    // Zip bomb defenses
    cumulativeDecompressedBytes += decompressed.length;
    if (cumulativeDecompressedBytes > opts.maxTotalBytes) {
      throw new Error(
        `ZIP_BOMB_DETECTED: Total decompressed size exceeds safety ceiling of ${opts.maxTotalBytes} bytes`
      );
    }

    if (
      compressedSize > 0 &&
      decompressed.length > 10 * 1024 * 1024 &&
      decompressed.length / compressedSize > opts.maxCompressionRatio
    ) {
      throw new Error(
        `ZIP_BOMB_DETECTED: Suspicious compression ratio (${(
          decompressed.length / compressedSize
        ).toFixed(1)}:1) for "${safePath}" exceeds safety threshold`
      );
    }

    results.set(safePath, decompressed);
    currentCdOffset += 46 + filenameLen + extraLen + commentLen;
  }

  return results;
}
