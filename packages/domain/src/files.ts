export type FileQuarantineStatus = 'quarantined' | 'verified' | 'rejected' | 'deleted';

export type FilePreviewKind = 'image' | 'pdf' | 'office' | 'text' | 'audio' | 'unsupported';

export type ClientUploadStatus =
  | 'idle'
  | 'selecting'
  | 'reserving'
  | 'uploading'
  | 'verifying'
  | 'ready'
  | 'rejected'
  | 'failed'
  | 'cancelled';

export interface StorageUsageSummary {
  storedBytes: number;
  reservedBytes: number;
  maxBytes: number;
  totalAccountedBytes: number;
  percentUsed: number;
  formattedStored: string;
  formattedReserved: string;
  formattedTotal: string;
  formattedMax: string;
  isNearLimit: boolean; // >= 80%
  isExceeded: boolean; // >= 100%
}

/**
 * Formats a byte size into a human-readable string (B, KB, MB, GB).
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 0 || !Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1).replace(/\.0$/, '')} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1).replace(/\.0$/, '')} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(2).replace(/\.00$/, '')} GB`;
}

/**
 * Determines the preview strategy for a detected MIME type.
 */
export function getFilePreviewKind(mimeType: string): FilePreviewKind {
  const normalized = mimeType.toLowerCase().trim();

  if (
    normalized === 'image/jpeg' ||
    normalized === 'image/png' ||
    normalized === 'image/webp' ||
    normalized === 'image/gif'
  ) {
    return 'image';
  }

  if (normalized === 'application/pdf') {
    return 'pdf';
  }

  if (
    normalized === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    normalized === 'application/msword' ||
    normalized === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'office';
  }

  if (normalized === 'text/plain' || normalized === 'text/markdown') {
    return 'text';
  }

  if (normalized.startsWith('audio/')) {
    return 'audio';
  }

  return 'unsupported';
}

/**
 * Verifies whether a file is safe to preview.
 * ONLY files with quarantineStatus === 'verified' and a non-empty detected MIME type may be rendered.
 * Files in 'quarantined', 'rejected', or 'deleted' state must never be rendered as previews.
 */
export function isSafeToPreview(
  quarantineStatus: FileQuarantineStatus,
  mimeType?: string
): boolean {
  if (quarantineStatus !== 'verified') {
    return false;
  }
  if (!mimeType) {
    return false;
  }
  const kind = getFilePreviewKind(mimeType);
  return kind !== 'unsupported';
}

/**
 * Computes storage quota usage and visual progress indicators.
 */
export function computeStorageUsage(
  storedBytes: number,
  reservedBytes: number,
  maxBytes: number
): StorageUsageSummary {
  const safeStored = Math.max(0, storedBytes || 0);
  const safeReserved = Math.max(0, reservedBytes || 0);
  const safeMax = Math.max(1, maxBytes || 100 * 1024 * 1024);
  const totalAccounted = safeStored + safeReserved;
  const percentUsed = Math.min(100, Math.round((totalAccounted / safeMax) * 100));

  return {
    storedBytes: safeStored,
    reservedBytes: safeReserved,
    maxBytes: safeMax,
    totalAccountedBytes: totalAccounted,
    percentUsed,
    formattedStored: formatByteSize(safeStored),
    formattedReserved: formatByteSize(safeReserved),
    formattedTotal: formatByteSize(totalAccounted),
    formattedMax: formatByteSize(safeMax),
    isNearLimit: percentUsed >= 80,
    isExceeded: totalAccounted >= safeMax,
  };
}

/**
 * Namespaces an offline binary cache key by account, workspace, file ID, and immutable version.
 */
export function getOfflineBinaryCacheKey(
  accountId: string,
  workspaceId: string,
  fileId: string,
  version: number
): string {
  return `${accountId}:${workspaceId}:${fileId}:v${version}`;
}

/**
 * Parses a namespaced offline binary cache key.
 */
export function parseOfflineBinaryCacheKey(key: string): {
  accountId: string;
  workspaceId: string;
  fileId: string;
  version: number;
} | null {
  const parts = key.split(':');
  if (parts.length !== 4) return null;
  const [accountId, workspaceId, fileId, versionPart] = parts;
  if (!accountId || !workspaceId || !fileId || !versionPart?.startsWith('v')) return null;
  const version = parseInt(versionPart.slice(1), 10);
  if (!Number.isFinite(version) || version < 1) return null;
  return { accountId, workspaceId, fileId, version };
}
