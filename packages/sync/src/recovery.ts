import type { LocalRepositoryPort } from './ports.js';
import type { SyncDiagnostics, TaskRecord } from './models.js';

export const MAX_OFFLINE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds

export interface RecoveryExportSummary {
  pendingMutationsCount: number;
  draftsCount: number;
  conflictsCount: number;
  unfinalizedFilesCount: number;
}

export interface RecoveryExportAttachmentItem {
  id: string;
  fileName: string;
  declaredMimeType: string;
  byteSize: number;
  isBinaryCachedLocally: boolean;
}

export interface RecoveryExport {
  schemaVersion: 1;
  app: 'daynori';
  purpose: 'offline_recovery';
  exportedAt: string;
  workspaceId: string;
  userId: string;
  deviceId?: string;
  notice: string;
  summary: RecoveryExportSummary;
  pendingMutations: Array<{
    operationId: string;
    entityType: string;
    entityId: string;
    action: string;
    command?: string;
    clientTimestamp: string;
    baseRevision: number;
    payload: Record<string, unknown>;
  }>;
  drafts: Array<{
    id: string;
    entityType: string;
    entityId: string | null;
    title: string;
    savedAt: string;
    payload: Record<string, unknown>;
  }>;
  conflicts: Array<{
    id: string;
    entityType: string;
    entityId: string;
    operationId: string;
    baseRevision: number;
    serverRevision: number;
    conflictReason: string;
    detectedAt: string;
    localPayload: Record<string, unknown>;
    serverState?: Record<string, unknown>;
  }>;
  attachments: {
    files: RecoveryExportAttachmentItem[];
  };
}

/**
 * Sanitizes a payload dictionary by omitting credentials, session tokens, secrets,
 * and masked vault plaintexts.
 */
function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitivePattern =
    /(token|secret|password|credential|authorization|sessionid|refreshtoken|signedurl|capability|apikey|api_key)/i;

  for (const [key, value] of Object.entries(payload)) {
    if (sensitivePattern.test(key)) {
      continue;
    }
    if (key === 'securityScope' && value === 'vault') {
      return {
        securityScope: 'vault',
        _masked: true,
        notice: 'Vault plaintext is strictly excluded from recovery export.',
      };
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizePayload(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Generates an auditable, versioned export of recoverable local drafts,
 * pending mutations, and active conflicts without leaking secrets or claiming
 * uncached file binaries.
 */
export async function exportRecoveryData(options: {
  workspaceId: string;
  userId: string;
  repository: LocalRepositoryPort;
  deviceId?: string;
}): Promise<RecoveryExport> {
  const { workspaceId, userId, repository, deviceId } = options;

  // Retrieve pending records from local repository
  const [pendingMutations, drafts, conflicts, files] = await Promise.all([
    repository.getPendingMutations(workspaceId, userId),
    repository.listDrafts(workspaceId, userId),
    repository.listConflicts(workspaceId),
    repository.listFiles(workspaceId),
  ]);

  const sanitizedMutations = pendingMutations.map((m) => ({
    operationId: m.operationId,
    entityType: m.entityType,
    entityId: m.entityId,
    action: m.action,
    command: m.command,
    clientTimestamp: m.clientTimestamp,
    baseRevision: m.baseRevision,
    payload: sanitizePayload(m.payload),
  }));

  const sanitizedDrafts = drafts.map((d) => ({
    id: d.id,
    entityType: d.entityType,
    entityId: d.entityId,
    title: d.title,
    savedAt: d.savedAt,
    payload: sanitizePayload(d.payload),
  }));

  const sanitizedConflicts = conflicts.map((c) => ({
    id: c.id,
    entityType: c.entityType,
    entityId: c.entityId,
    operationId: c.operationId,
    baseRevision: c.baseRevision,
    serverRevision: c.serverRevision,
    conflictReason: c.conflictReason,
    detectedAt: c.detectedAt,
    localPayload: sanitizePayload(c.localPayload),
    serverState: c.serverState ? sanitizePayload(c.serverState) : undefined,
  }));

  const attachmentItems: RecoveryExportAttachmentItem[] = files.map((f) => ({
    id: f.id,
    fileName: f.fileName,
    declaredMimeType: f.declaredMimeType,
    byteSize: f.byteSize,
    isBinaryCachedLocally: Boolean(f.quarantineStatus === 'verified'),
  }));

  return {
    schemaVersion: 1,
    app: 'daynori',
    purpose: 'offline_recovery',
    exportedAt: new Date().toISOString(),
    workspaceId,
    userId,
    deviceId,
    notice:
      'Notice: This recovery export contains unencrypted workspace drafts, pending mutations, and conflict records. Store it securely. Ordinary exported content is readable outside the app in plain JSON.',
    summary: {
      pendingMutationsCount: sanitizedMutations.length,
      draftsCount: sanitizedDrafts.length,
      conflictsCount: sanitizedConflicts.length,
      unfinalizedFilesCount: attachmentItems.filter((a) => !a.isBinaryCachedLocally).length,
    },
    pendingMutations: sanitizedMutations,
    drafts: sanitizedDrafts,
    conflicts: sanitizedConflicts,
    attachments: {
      files: attachmentItems,
    },
  };
}

export interface RedactedSyncDiagnostics {
  workspaceId: string;
  userIdRedacted: string;
  deviceIdRedacted: string;
  isLeader: boolean;
  networkStatus: 'online' | 'offline';
  cloudSyncStatus: string;
  queueLength: number;
  inFlightCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  lastSyncSequence: number;
  accessEpochRedacted: string | null;
  consecutiveFailures: number;
  activeConflictsCount: number;
}

/**
 * Strips private document bodies, filenames, search queries, user IDs, and endpoint
 * paths from diagnostics while preserving actionable health and sync queue metrics.
 */
export function getRedactedSyncDiagnostics(diag: SyncDiagnostics): RedactedSyncDiagnostics {
  return {
    workspaceId: diag.workspaceId,
    userIdRedacted: diag.userId ? `${diag.userId.slice(0, 4)}...${diag.userId.slice(-4)}` : 'anon',
    deviceIdRedacted: diag.deviceId
      ? `${diag.deviceId.slice(0, 4)}...${diag.deviceId.slice(-4)}`
      : 'device',
    isLeader: diag.isLeader,
    networkStatus: diag.networkStatus,
    cloudSyncStatus: diag.cloudSyncStatus,
    queueLength: diag.queueLength,
    inFlightCount: diag.inFlightCount,
    failedCount: diag.failedCount,
    lastSyncedAt: diag.lastSyncedAt,
    lastSyncSequence: diag.lastSyncSequence,
    accessEpochRedacted: diag.accessEpoch ? 'epoch-set' : null,
    consecutiveFailures: diag.consecutiveFailures,
    activeConflictsCount: diag.activeConflictsCount,
  };
}

/**
 * Maps the internal sync status to the canonical user-facing string.
 */
export function formatSyncStateLabel(
  status: 'saved_locally' | 'syncing' | 'synced' | 'conflict' | 'error' | 'needs_attention' | string
): 'Saved on this device' | 'Syncing' | 'Synced' | 'Conflict' | 'Needs attention' {
  switch (status) {
    case 'saved_locally':
      return 'Saved on this device';
    case 'syncing':
      return 'Syncing';
    case 'synced':
      return 'Synced';
    case 'conflict':
      return 'Conflict';
    case 'needs_attention':
    case 'error':
    default:
      return 'Needs attention';
  }
}

/**
 * Performs a 3-way field merge for structured Task records where local and server
 * modified non-overlapping scalar fields against the common base.
 */
export function mergeTaskFields(
  base: TaskRecord | null,
  local: Partial<TaskRecord>,
  server: Partial<TaskRecord>
): { merged: Partial<TaskRecord>; conflictingFields: string[] } {
  const merged: Partial<TaskRecord> = base
    ? { ...base, ...server, ...local }
    : { ...server, ...local };
  const conflictingFields: string[] = [];

  const scalarKeys: Array<keyof TaskRecord> = [
    'title',
    'details',
    'priority',
    'status',
    'folderId',
    'parentId',
  ];

  for (const key of scalarKeys) {
    const bVal = base ? base[key] : undefined;
    const lVal = local[key];
    const sVal = server[key];

    const localChanged = lVal !== undefined && lVal !== bVal;
    const serverChanged = sVal !== undefined && sVal !== bVal;

    if (localChanged && serverChanged && lVal !== sVal) {
      conflictingFields.push(key);
      // Conflict: default to server value in merged output unless user chooses
      merged[key] = sVal as never;
    } else if (localChanged) {
      merged[key] = lVal as never;
    } else if (serverChanged) {
      merged[key] = sVal as never;
    }
  }

  return { merged, conflictingFields };
}

/**
 * Validates a folder move or reorder against parent cycles and maximum hierarchy depth.
 */
export function validateFolderMovePolicy(options: {
  folderId: string;
  targetParentId: string | null;
  existingFolders: Array<{ id: string; parentId: string | null }>;
  maxDepth?: number;
}): { valid: boolean; reason?: string } {
  const { folderId, targetParentId, existingFolders, maxDepth = 5 } = options;

  if (targetParentId === folderId) {
    return { valid: false, reason: 'Folder cannot be its own parent.' };
  }

  // Detect cycle
  let curr = targetParentId;
  const visited = new Set<string>([folderId]);
  while (curr !== null) {
    if (visited.has(curr)) {
      return { valid: false, reason: 'Folder move would create a circular dependency cycle.' };
    }
    visited.add(curr);
    const parentNode = existingFolders.find((f) => f.id === curr);
    curr = parentNode ? parentNode.parentId : null;
  }

  // Calculate target depth
  let depth = 1;
  curr = targetParentId;
  while (curr !== null) {
    depth++;
    const p = existingFolders.find((f) => f.id === curr);
    curr = p ? p.parentId : null;
  }

  if (depth > maxDepth) {
    return {
      valid: false,
      reason: `Folder move exceeds maximum allowed hierarchy depth of ${maxDepth}.`,
    };
  }

  return { valid: true };
}
