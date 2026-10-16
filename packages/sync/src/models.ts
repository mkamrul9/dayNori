/**
 * Phase 11: Foundation Storage Records & Runtime Invariant Validators
 *
 * Scoped strictly to item headers, drafts, pending mutations, sync cursors,
 * and preference snapshots as specified in the Phase 11 roadmap.
 */

import { type NoteDocument, validateNoteDocument } from '@daynori/domain';
import type {
  TaskPriority,
  TaskStatus,
  TaskDeadline,
  TaskCompletionHistoryItem,
} from '@daynori/contracts';

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
  title?: string;
  name?: string;
  color?: string | null;
  icon?: string | null;
  parentId?: string | null;
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
  command?: string;
  commandVersion?: number;
  schemaVersion?: number;
  payload: Record<string, unknown>;
  baseRevision: number;
  dependencyOperationIds: string[];
  clientTimestamp: string;
  retryCount: number;
  status: 'pending' | 'in_flight' | 'failed';
  lastError: string | null;
}

export type CloudSyncStatus =
  'saved_locally' | 'syncing' | 'synced' | 'conflict' | 'error' | 'needs_attention';

export interface ItemSyncState {
  savedOnDevice: boolean;
  cloudSyncStatus: CloudSyncStatus;
  pendingOperationId?: string;
  lastSyncedRevision?: number;
  lastError?: string;
}

export interface ConflictRecord {
  id: string;
  entityId: string;
  entityType: string;
  operationId: string;
  workspaceId: string;
  userId: string;
  localPayload: Record<string, unknown>;
  baseRevision: number;
  serverRevision: number;
  serverState?: Record<string, unknown>;
  conflictReason: string;
  detectedAt: string;
  resolved: boolean;
}

export interface SyncDiagnostics {
  workspaceId: string;
  userId: string;
  deviceId: string;
  isLeader: boolean;
  networkStatus: 'online' | 'offline';
  cloudSyncStatus: CloudSyncStatus;
  queueLength: number;
  inFlightCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  lastSyncSequence: number;
  accessEpoch: string | null;
  consecutiveFailures: number;
  activeConflictsCount: number;
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

  const res: ItemHeaderRecord = {
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

  if (typeof r.title === 'string') {
    res.title = r.title;
  }
  if (typeof r.name === 'string') {
    res.name = r.name;
  }
  if (typeof r.color === 'string' || r.color === null) {
    res.color = r.color;
  }
  if (typeof r.icon === 'string' || r.icon === null) {
    res.icon = r.icon;
  }
  if (typeof r.parentId === 'string') {
    res.parentId = r.parentId;
  } else if (r.parentId === null && (r.name !== undefined || r.kind === 'folder')) {
    res.parentId = null;
  }

  return res;
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
    command: typeof r.command === 'string' ? r.command : undefined,
    commandVersion: typeof r.commandVersion === 'number' ? r.commandVersion : 1,
    schemaVersion: typeof r.schemaVersion === 'number' ? r.schemaVersion : 1,
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

export function validateConflictRecord(input: unknown): ConflictRecord {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: ConflictRecord must be an object.');
  }
  const r = input as Record<string, unknown>;

  return {
    id: assertNonEmptyString(r.id, 'id'),
    entityId: assertNonEmptyString(r.entityId, 'entityId'),
    entityType: assertNonEmptyString(r.entityType, 'entityType', 64),
    operationId: assertNonEmptyString(r.operationId, 'operationId'),
    workspaceId: assertNonEmptyString(r.workspaceId, 'workspaceId'),
    userId: assertNonEmptyString(r.userId, 'userId'),
    localPayload: assertPayloadBounded(r.localPayload, 'localPayload'),
    baseRevision: typeof r.baseRevision === 'number' ? r.baseRevision : 0,
    serverRevision: typeof r.serverRevision === 'number' ? r.serverRevision : 0,
    serverState:
      r.serverState && typeof r.serverState === 'object'
        ? (r.serverState as Record<string, unknown>)
        : undefined,
    conflictReason: assertNonEmptyString(r.conflictReason, 'conflictReason', 500),
    detectedAt: assertNonEmptyString(r.detectedAt, 'detectedAt', 64),
    resolved: Boolean(r.resolved),
  };
}

export interface NoteRecord {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  document: NoteDocument;
  plainText: string;
  wordCount: number;
  charCount: number;
  serverRevision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function validateNoteRecord(input: unknown): NoteRecord {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: NoteRecord must be an object.');
  }
  const r = input as Record<string, unknown>;
  const doc = validateNoteDocument(r.document);

  return {
    id: assertNonEmptyString(r.id, 'id'),
    workspaceId: assertNonEmptyString(r.workspaceId, 'workspaceId'),
    folderId: r.folderId !== null && r.folderId !== undefined ? String(r.folderId) : null,
    title: typeof r.title === 'string' ? r.title : 'Untitled',
    document: doc,
    plainText: typeof r.plainText === 'string' ? r.plainText : '',
    wordCount: typeof r.wordCount === 'number' ? r.wordCount : 0,
    charCount: typeof r.charCount === 'number' ? r.charCount : 0,
    serverRevision: typeof r.serverRevision === 'number' ? r.serverRevision : 1,
    createdAt: assertNonEmptyString(r.createdAt, 'createdAt', 64),
    updatedAt: assertNonEmptyString(r.updatedAt, 'updatedAt', 64),
    deletedAt: r.deletedAt ? String(r.deletedAt) : null,
  };
}

export interface TaskRecord {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  details: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: TaskDeadline;
  completedAt: string | null;
  reopenedAt: string | null;
  completionHistory: TaskCompletionHistoryItem[];
  parentId: string | null;
  subtaskOrder: number;
  tags: string[];
  serverRevision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function validateTaskRecord(input: unknown): TaskRecord {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: TaskRecord must be an object.');
  }
  const r = input as Record<string, unknown>;

  const priority = r.priority as TaskPriority;
  const validPriorities = ['low', 'normal', 'high', 'urgent'];
  const safePriority: TaskPriority = validPriorities.includes(priority) ? priority : 'normal';

  const status = r.status as TaskStatus;
  const validStatuses = ['todo', 'in_progress', 'completed', 'cancelled'];
  const safeStatus: TaskStatus = validStatuses.includes(status) ? status : 'todo';

  const deadline =
    r.deadline && typeof r.deadline === 'object' && 'type' in r.deadline
      ? (r.deadline as TaskDeadline)
      : { type: 'none' as const };

  const history = Array.isArray(r.completionHistory)
    ? (r.completionHistory as TaskCompletionHistoryItem[])
    : [];

  const tags = Array.isArray(r.tags) ? r.tags.map(String) : [];

  return {
    id: assertNonEmptyString(r.id, 'id'),
    workspaceId: assertNonEmptyString(r.workspaceId, 'workspaceId'),
    folderId: r.folderId !== null && r.folderId !== undefined ? String(r.folderId) : null,
    title: typeof r.title === 'string' && r.title.trim().length > 0 ? r.title.trim() : 'Untitled',
    details: typeof r.details === 'string' ? r.details : null,
    priority: safePriority,
    status: safeStatus,
    deadline,
    completedAt: r.completedAt ? String(r.completedAt) : null,
    reopenedAt: r.reopenedAt ? String(r.reopenedAt) : null,
    completionHistory: history,
    parentId: r.parentId ? String(r.parentId) : null,
    subtaskOrder: typeof r.subtaskOrder === 'number' ? r.subtaskOrder : 0,
    tags,
    serverRevision: typeof r.serverRevision === 'number' ? r.serverRevision : 1,
    createdAt: assertNonEmptyString(r.createdAt, 'createdAt', 64),
    updatedAt: assertNonEmptyString(r.updatedAt, 'updatedAt', 64),
    deletedAt: r.deletedAt ? String(r.deletedAt) : null,
  };
}
