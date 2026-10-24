import type { LocalRepositoryPort } from './ports.js';
import type { SyncDiagnostics, TaskRecord, FileRecord } from './models.js';

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

const FORBIDDEN_CREDENTIAL_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'pass',
  'secret',
  'secrettoken',
  'secret_token',
  'secretkey',
  'secret_key',
  'credential',
  'credentials',
  'token',
  'authtoken',
  'auth_token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'sessiontoken',
  'session_token',
  'sessionid',
  'session_id',
  'authorization',
  'authorizationheader',
  'bearer',
  'bearertoken',
  'bearer_token',
  'clientsecret',
  'client_secret',
  'apikey',
  'api_key',
  'signedurl',
  'signed_url',
  'uploadurl',
  'upload_url',
  'downloadurl',
  'download_url',
  'capability',
  'capabilityurl',
  'capability_url',
  'privatekey',
  'private_key',
  'salt',
  'csrf',
  'csrftoken',
  'csrf_token',
]);

export interface RecoveryExportAttachmentItem {
  id: string;
  fileName: string;
  declaredMimeType: string;
  byteSize: number;
  quarantineStatus: string;
  isBinaryCachedLocally: boolean;
  availability: 'locally_cached' | 'metadata_only' | 'unavailable';
}

/**
 * Recursively sanitizes arbitrary values (objects, arrays, primitives)
 * ensuring tokens and capabilities inside nested structures are stripped
 * while ordinary user text is preserved.
 */
function sanitizeUnknownValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((elem) => sanitizeUnknownValue(elem));
  }
  if (typeof value === 'object') {
    return sanitizePayload(value as Record<string, unknown>);
  }
  return String(value);
}

/**
 * Sanitizes a payload dictionary by omitting credentials, session tokens, capabilities,
 * and masked vault plaintexts. Ordinary user-authored strings containing words like
 * 'password' or 'secret' are preserved.
 */
function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  if (payload.securityScope === 'vault') {
    return {
      securityScope: 'vault',
      _masked: true,
      notice: 'Vault plaintext is strictly excluded from recovery export.',
    };
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_CREDENTIAL_KEYS.has(lowerKey)) {
      continue;
    }
    sanitized[key] = sanitizeUnknownValue(value);
  }

  return sanitized;
}

/**
 * Generates an auditable, versioned export of recoverable local drafts,
 * pending mutations, and active conflicts without leaking secrets, credentials,
 * or vault contents, and truthfully verifying attachment local byte availability.
 */
export async function exportRecoveryData(options: {
  workspaceId: string;
  userId: string;
  repository: LocalRepositoryPort;
  deviceId?: string;
  checkAttachmentCached?: (file: FileRecord) => Promise<boolean> | boolean;
}): Promise<RecoveryExport> {
  const { workspaceId, userId, repository, deviceId, checkAttachmentCached } = options;

  // Retrieve pending records and authoritative headers from local repository
  const [pendingMutations, drafts, conflicts, files, headers] = await Promise.all([
    repository.getPendingMutations(workspaceId, userId),
    repository.listDrafts(workspaceId, userId),
    repository.listConflicts(workspaceId),
    repository.listFiles(workspaceId),
    repository.listItemHeaders(workspaceId),
  ]);

  const vaultEntityIds = new Set<string>();
  for (const h of headers) {
    if (h.securityScope === 'vault') {
      vaultEntityIds.add(h.id);
    }
  }

  const isVaultItem = (
    entityId: string | null | undefined,
    entityType: string | undefined,
    payload?: Record<string, unknown>
  ): boolean => {
    if (entityId && vaultEntityIds.has(entityId)) return true;
    if (entityType && (entityType === 'vault' || entityType.startsWith('vault_'))) return true;
    if (payload && payload.securityScope === 'vault') return true;
    return false;
  };

  const sanitizedMutations = pendingMutations.map((m) => {
    const isVault = isVaultItem(m.entityId, m.entityType, m.payload);
    return {
      operationId: m.operationId,
      entityType: m.entityType,
      entityId: m.entityId,
      action: m.action,
      command: m.command,
      clientTimestamp: m.clientTimestamp,
      baseRevision: m.baseRevision,
      payload: isVault
        ? {
            securityScope: 'vault',
            _masked: true,
            notice: 'Vault plaintext is strictly excluded from recovery export.',
          }
        : sanitizePayload(m.payload),
    };
  });

  const sanitizedDrafts = drafts.map((d) => {
    const isVault = isVaultItem(d.entityId, d.entityType, d.payload);
    return {
      id: d.id,
      entityType: d.entityType,
      entityId: d.entityId,
      title: isVault ? '[Vault item excluded]' : d.title,
      savedAt: d.savedAt,
      payload: isVault
        ? {
            securityScope: 'vault',
            _masked: true,
            notice: 'Vault plaintext is strictly excluded from recovery export.',
          }
        : sanitizePayload(d.payload),
    };
  });

  const sanitizedConflicts = conflicts.map((c) => {
    const isVault = isVaultItem(c.entityId, c.entityType, c.localPayload);
    return {
      id: c.id,
      entityType: c.entityType,
      entityId: c.entityId,
      operationId: c.operationId,
      baseRevision: c.baseRevision,
      serverRevision: c.serverRevision,
      conflictReason: c.conflictReason,
      detectedAt: c.detectedAt,
      localPayload: isVault
        ? {
            securityScope: 'vault',
            _masked: true,
            notice: 'Vault plaintext is strictly excluded from recovery export.',
          }
        : sanitizePayload(c.localPayload),
      serverState: c.serverState
        ? isVault
          ? {
              securityScope: 'vault',
              _masked: true,
              notice: 'Vault plaintext is strictly excluded from recovery export.',
            }
          : sanitizePayload(c.serverState)
        : undefined,
    };
  });

  const attachmentItems: RecoveryExportAttachmentItem[] = await Promise.all(
    files.map(async (f) => {
      const isVault = vaultEntityIds.has(f.id) || (f as unknown as { securityScope?: string }).securityScope === 'vault';
      let isCached = false;
      if (checkAttachmentCached) {
        try {
          isCached = Boolean(await checkAttachmentCached(f));
        } catch {
          isCached = false;
        }
      } else if (typeof (repository as unknown as { hasLocalFileBinary?: (w: string, id: string, v?: string) => Promise<boolean> }).hasLocalFileBinary === 'function') {
        try {
          isCached = Boolean(
            await (repository as unknown as { hasLocalFileBinary: (w: string, id: string, v?: string) => Promise<boolean> }).hasLocalFileBinary(
              workspaceId,
              f.id,
              f.version
            )
          );
        } catch {
          isCached = false;
        }
      }

      let availability: 'locally_cached' | 'metadata_only' | 'unavailable';
      if (isCached) {
        availability = 'locally_cached';
      } else if (f.quarantineStatus === 'verified') {
        availability = 'metadata_only';
      } else {
        availability = 'unavailable';
      }

      return {
        id: f.id,
        fileName: isVault ? '[Vault file excluded]' : f.fileName,
        declaredMimeType: isVault ? 'application/octet-stream' : f.declaredMimeType,
        byteSize: f.byteSize,
        quarantineStatus: f.quarantineStatus,
        isBinaryCachedLocally: isCached,
        availability,
      };
    })
  );

  return {
    schemaVersion: 1,
    app: 'daynori',
    purpose: 'offline_recovery',
    exportedAt: new Date().toISOString(),
    workspaceId,
    userId,
    deviceId,
    notice:
      'Notice: This recovery export is an unencrypted emergency local draft dump, NOT a full or portable backup. Passwords, session tokens, capabilities, and all vault plaintexts and private metadata are strictly excluded. Uncached binary files are listed as metadata-only and not included. This data cannot replace server synchronization or portable import.',
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
