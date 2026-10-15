/**
 * Phase 11: Foundation Storage Records & Runtime Invariant Validators
 *
 * Scoped strictly to item headers, drafts, pending mutations, sync cursors,
 * and preference snapshots as specified in the Phase 11 roadmap.
 */

export const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1 MiB max serialized payload size
export const MAX_ID_LENGTH = 128;
export const MAX_TITLE_LENGTH = 500;

export interface ItemHeaderRecord {
  id: string;
  workspaceId: string;
  kind: string;
  folderId: string | null;
  rank: string;
  isArchived: boolean;
  isPinned: boolean;
  securityScope: 'standard' | 'vault';
  serverRevision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DraftRecord {
  id: string;
  workspaceId: string;
  userId: string;
  entityType: string;
  entityId: string | null;
  title: string;
  payload: Record<string, unknown>;
  savedAt: string;
  isQuarantined: boolean;
  quarantinedAt: string | null;
}

export interface PendingMutationRecord {
  operationId: string;
  deviceId: string;
  workspaceId: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  baseRevision: number;
  dependencyOperationIds: string[];
  clientTimestamp: string;
  retryCount: number;
  status: 'pending' | 'in_flight' | 'failed';
  lastError: string | null;
}

export interface SyncCursorRecord {
  workspaceId: string;
  userId: string;
  lastServerRevision: number;
  cursor: string;
  lastSyncedAt: string;
  epoch: string;
}

export interface PreferenceSnapshotRecord {
  userId: string;
  preferences: Record<string, unknown>;
  schemaVersion: number;
  revision: number;
  updatedAt: string;
}

export interface AccountNamespace {
  userId: string;
  workspaceId: string;
}

// ============================================================================
// Runtime Validators & Invariants
// ============================================================================

function assertNonEmptyString(val: unknown, fieldName: string, maxLen = MAX_ID_LENGTH): string {
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new TypeError(`Validation failed: ${fieldName} must be a non-empty string.`);
  }
  if (val.length > maxLen) {
    throw new TypeError(`Validation failed: ${fieldName} exceeds maximum length of ${maxLen}.`);
  }
  return val;
}

function assertPayloadBounded(payload: unknown, fieldName: string): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError(`Validation failed: ${fieldName} must be an object.`);
  }
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_PAYLOAD_BYTES) {
    throw new RangeError(
      `Validation failed: ${fieldName} exceeds maximum allowed size of ${MAX_PAYLOAD_BYTES} bytes (${serialized.length} bytes).`
    );
  }
  return payload as Record<string, unknown>;
}

export function validateAccountNamespace(input: unknown): AccountNamespace {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: AccountNamespace must be an object.');
  }
  const obj = input as Record<string, unknown>;
  return {
    userId: assertNonEmptyString(obj.userId, 'userId'),
    workspaceId: assertNonEmptyString(obj.workspaceId, 'workspaceId'),
  };
}

export function validateItemHeaderRecord(input: unknown): ItemHeaderRecord {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: ItemHeaderRecord must be an object.');
  }
  const r = input as Record<string, unknown>;
  const securityScope = r.securityScope;
  if (securityScope !== 'standard' && securityScope !== 'vault') {
    throw new TypeError('Validation failed: securityScope must be "standard" or "vault".');
  }

  return {
    id: assertNonEmptyString(r.id, 'id'),
    workspaceId: assertNonEmptyString(r.workspaceId, 'workspaceId'),
    kind: assertNonEmptyString(r.kind, 'kind', 64),
    folderId:
      r.folderId === null || r.folderId === undefined
        ? null
        : assertNonEmptyString(r.folderId, 'folderId'),
    rank: typeof r.rank === 'string' ? r.rank : '0',
    isArchived: Boolean(r.isArchived),
    isPinned: Boolean(r.isPinned),
    securityScope,
    serverRevision: typeof r.serverRevision === 'number' ? r.serverRevision : 0,
    createdAt: assertNonEmptyString(r.createdAt, 'createdAt', 64),
    updatedAt: assertNonEmptyString(r.updatedAt, 'updatedAt', 64),
    deletedAt:
      r.deletedAt === null || r.deletedAt === undefined
        ? null
        : assertNonEmptyString(r.deletedAt, 'deletedAt', 64),
  };
}

export function validateDraftRecord(input: unknown): DraftRecord {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: DraftRecord must be an object.');
  }
  const r = input as Record<string, unknown>;

  return {
    id: assertNonEmptyString(r.id, 'id'),
    workspaceId: assertNonEmptyString(r.workspaceId, 'workspaceId'),
    userId: assertNonEmptyString(r.userId, 'userId'),
    entityType: assertNonEmptyString(r.entityType, 'entityType', 64),
    entityId:
      r.entityId === null || r.entityId === undefined
        ? null
        : assertNonEmptyString(r.entityId, 'entityId'),
    title: typeof r.title === 'string' ? r.title.slice(0, MAX_TITLE_LENGTH) : '',
    payload: assertPayloadBounded(r.payload, 'payload'),
    savedAt: assertNonEmptyString(r.savedAt, 'savedAt', 64),
    isQuarantined: Boolean(r.isQuarantined),
    quarantinedAt:
      r.quarantinedAt === null || r.quarantinedAt === undefined
        ? null
        : assertNonEmptyString(r.quarantinedAt, 'quarantinedAt', 64),
  };
}

export function validatePendingMutationRecord(input: unknown): PendingMutationRecord {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: PendingMutationRecord must be an object.');
  }
  const r = input as Record<string, unknown>;
  const action = r.action;
  if (action !== 'create' && action !== 'update' && action !== 'delete') {
    throw new TypeError('Validation failed: action must be "create", "update", or "delete".');
  }
  const status = r.status;
  if (status !== 'pending' && status !== 'in_flight' && status !== 'failed') {
    throw new TypeError('Validation failed: status must be "pending", "in_flight", or "failed".');
  }

  const depIds = Array.isArray(r.dependencyOperationIds)
    ? r.dependencyOperationIds.map((id, idx) =>
        assertNonEmptyString(id, `dependencyOperationIds[${idx}]`)
      )
    : [];

  return {
    operationId: assertNonEmptyString(r.operationId, 'operationId'),
    deviceId: assertNonEmptyString(r.deviceId, 'deviceId'),
    workspaceId: assertNonEmptyString(r.workspaceId, 'workspaceId'),
    userId: assertNonEmptyString(r.userId, 'userId'),
    entityType: assertNonEmptyString(r.entityType, 'entityType', 64),
    entityId: assertNonEmptyString(r.entityId, 'entityId'),
    action,
    payload: assertPayloadBounded(r.payload, 'payload'),
    baseRevision: typeof r.baseRevision === 'number' ? r.baseRevision : 0,
    dependencyOperationIds: depIds,
    clientTimestamp: assertNonEmptyString(r.clientTimestamp, 'clientTimestamp', 64),
    retryCount: typeof r.retryCount === 'number' ? r.retryCount : 0,
    status,
    lastError:
      r.lastError === null || r.lastError === undefined ? null : String(r.lastError).slice(0, 500),
  };
}

export function validateSyncCursorRecord(input: unknown): SyncCursorRecord {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: SyncCursorRecord must be an object.');
  }
  const r = input as Record<string, unknown>;

  return {
    workspaceId: assertNonEmptyString(r.workspaceId, 'workspaceId'),
    userId: assertNonEmptyString(r.userId, 'userId'),
    lastServerRevision: typeof r.lastServerRevision === 'number' ? r.lastServerRevision : 0,
    cursor: assertNonEmptyString(r.cursor, 'cursor', 512),
    lastSyncedAt: assertNonEmptyString(r.lastSyncedAt, 'lastSyncedAt', 64),
    epoch: assertNonEmptyString(r.epoch, 'epoch', 64),
  };
}

export function validatePreferenceSnapshotRecord(input: unknown): PreferenceSnapshotRecord {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: PreferenceSnapshotRecord must be an object.');
  }
  const r = input as Record<string, unknown>;

  return {
    userId: assertNonEmptyString(r.userId, 'userId'),
    preferences: assertPayloadBounded(r.preferences, 'preferences'),
    schemaVersion: typeof r.schemaVersion === 'number' ? r.schemaVersion : 1,
    revision: typeof r.revision === 'number' ? r.revision : 1,
    updatedAt: assertNonEmptyString(r.updatedAt, 'updatedAt', 64),
  };
}
