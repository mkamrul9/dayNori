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
  RoutineFrequency,
  Weekday,
  RoutineOccurrenceStatus,
  RoutineOccurrenceTransition,
  JournalPromptEntry,
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

export interface RoutineRecord {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  details: string | null;
  frequency: RoutineFrequency;
  weekdays: Weekday[];
  timezone: string;
  scheduledTime: string | null;
  activeFrom: string;
  activeTo: string | null;
  isPaused: boolean;
  isArchived: boolean;
  isPinned: boolean;
  scheduleRevision: number;
  effectiveDate: string;
  serverRevision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function validateRoutineRecord(input: unknown): RoutineRecord {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: RoutineRecord must be an object.');
  }
  const r = input as Record<string, unknown>;
  const freq: RoutineFrequency = r.frequency === 'weekdays' ? 'weekdays' : 'daily';
  const weekdays = Array.isArray(r.weekdays) ? (r.weekdays as Weekday[]) : [];

  return {
    id: assertNonEmptyString(r.id, 'id'),
    workspaceId: assertNonEmptyString(r.workspaceId, 'workspaceId'),
    folderId: r.folderId !== null && r.folderId !== undefined ? String(r.folderId) : null,
    title:
      typeof r.title === 'string' && r.title.trim().length > 0
        ? r.title.trim()
        : 'Untitled Routine',
    details: typeof r.details === 'string' ? r.details : null,
    frequency: freq,
    weekdays,
    timezone: typeof r.timezone === 'string' && r.timezone.length > 0 ? r.timezone : 'UTC',
    scheduledTime: typeof r.scheduledTime === 'string' ? r.scheduledTime : null,
    activeFrom: assertNonEmptyString(r.activeFrom, 'activeFrom', 64),
    activeTo: r.activeTo !== null && r.activeTo !== undefined ? String(r.activeTo) : null,
    isPaused: Boolean(r.isPaused),
    isArchived: Boolean(r.isArchived),
    isPinned: Boolean(r.isPinned),
    scheduleRevision: typeof r.scheduleRevision === 'number' ? r.scheduleRevision : 1,
    effectiveDate: assertNonEmptyString(r.effectiveDate, 'effectiveDate', 64),
    serverRevision: typeof r.serverRevision === 'number' ? r.serverRevision : 1,
    createdAt: assertNonEmptyString(r.createdAt, 'createdAt', 64),
    updatedAt: assertNonEmptyString(r.updatedAt, 'updatedAt', 64),
    deletedAt: r.deletedAt ? String(r.deletedAt) : null,
  };
}

export interface RoutineOccurrenceRecord {
  id: string;
  workspaceId: string;
  routineId: string;
  scheduledDate: string;
  scheduleRevision: number;
  plannedInstant: string | null;
  timezone: string;
  status: RoutineOccurrenceStatus;
  completedAt: string | null;
  completedBy: string | null;
  history: RoutineOccurrenceTransition[];
  serverRevision: number;
  createdAt: string;
  updatedAt: string;
}

export function validateRoutineOccurrenceRecord(input: unknown): RoutineOccurrenceRecord {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: RoutineOccurrenceRecord must be an object.');
  }
  const r = input as Record<string, unknown>;
  const status: RoutineOccurrenceStatus =
    r.status === 'done' || r.status === 'skipped' || r.status === 'cancelled'
      ? r.status
      : 'pending';

  const history = Array.isArray(r.history) ? (r.history as RoutineOccurrenceTransition[]) : [];

  return {
    id: assertNonEmptyString(r.id, 'id'),
    workspaceId: assertNonEmptyString(r.workspaceId, 'workspaceId'),
    routineId: assertNonEmptyString(r.routineId, 'routineId'),
    scheduledDate: assertNonEmptyString(r.scheduledDate, 'scheduledDate', 32),
    scheduleRevision: typeof r.scheduleRevision === 'number' ? r.scheduleRevision : 1,
    plannedInstant: r.plannedInstant ? String(r.plannedInstant) : null,
    timezone: typeof r.timezone === 'string' && r.timezone.length > 0 ? r.timezone : 'UTC',
    status,
    completedAt: r.completedAt ? String(r.completedAt) : null,
    completedBy: r.completedBy ? String(r.completedBy) : null,
    history,
    serverRevision: typeof r.serverRevision === 'number' ? r.serverRevision : 1,
    createdAt: assertNonEmptyString(r.createdAt, 'createdAt', 64),
    updatedAt: assertNonEmptyString(r.updatedAt, 'updatedAt', 64),
  };
}

export interface JournalEntryRecord {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string | null;
  entryDate: string; // YYYY-MM-DD
  timezone: string;
  document: NoteDocument;
  plainText: string;
  wordCount: number;
  charCount: number;
  mood: string | null;
  prompts: JournalPromptEntry[];
  tags: string[];
  isDraft: boolean;
  isArchived: boolean;
  isPinned: boolean;
  securityScope: 'standard' | 'vault';
  serverRevision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function validateJournalEntryRecord(input: unknown): JournalEntryRecord {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: JournalEntryRecord must be an object.');
  }
  const r = input as Record<string, unknown>;
  const doc = validateNoteDocument(r.document);
  const securityScope = r.securityScope === 'vault' ? 'vault' : 'standard';

  const prompts = Array.isArray(r.prompts)
    ? (r.prompts as JournalPromptEntry[]).map((p) => ({
        id: typeof p?.id === 'string' ? p.id : undefined,
        prompt: assertNonEmptyString(p?.prompt, 'prompt', 500),
        response: typeof p?.response === 'string' ? p.response.slice(0, 5000) : undefined,
      }))
    : [];

  const tags = Array.isArray(r.tags) ? r.tags.map(String) : [];

  return {
    id: assertNonEmptyString(r.id, 'id'),
    workspaceId: assertNonEmptyString(r.workspaceId, 'workspaceId'),
    folderId: r.folderId !== null && r.folderId !== undefined ? String(r.folderId) : null,
    title: typeof r.title === 'string' ? r.title : null,
    entryDate: assertNonEmptyString(r.entryDate, 'entryDate', 10),
    timezone: typeof r.timezone === 'string' && r.timezone.length > 0 ? r.timezone : 'UTC',
    document: doc,
    plainText: typeof r.plainText === 'string' ? r.plainText : '',
    wordCount: typeof r.wordCount === 'number' ? r.wordCount : 0,
    charCount: typeof r.charCount === 'number' ? r.charCount : 0,
    mood: typeof r.mood === 'string' ? r.mood : null,
    prompts,
    tags,
    isDraft: Boolean(r.isDraft),
    isArchived: Boolean(r.isArchived),
    isPinned: Boolean(r.isPinned),
    securityScope,
    serverRevision: typeof r.serverRevision === 'number' ? r.serverRevision : 1,
    createdAt: assertNonEmptyString(r.createdAt, 'createdAt', 64),
    updatedAt: assertNonEmptyString(r.updatedAt, 'updatedAt', 64),
    deletedAt: r.deletedAt ? String(r.deletedAt) : null,
  };
}

export interface FileRecord {
  id: string;
  workspaceId: string;
  folderId: string | null;
  fileName: string;
  declaredMimeType: string;
  detectedMimeType: string;
  byteSize: number;
  sha256Checksum: string;
  version: string;
  quarantineStatus: 'quarantined' | 'verified' | 'rejected' | 'deleted';
  rejectionReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
}

export function validateFileRecord(input: unknown): FileRecord {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Validation failed: FileRecord must be an object.');
  }
  const r = input as Record<string, unknown>;
  const status = r.quarantineStatus;
  if (
    status !== 'quarantined' &&
    status !== 'verified' &&
    status !== 'rejected' &&
    status !== 'deleted'
  ) {
    throw new TypeError('Validation failed: quarantineStatus must be valid.');
  }

  return {
    id: assertNonEmptyString(r.id, 'id'),
    workspaceId: assertNonEmptyString(r.workspaceId, 'workspaceId'),
    folderId: r.folderId !== null && r.folderId !== undefined ? String(r.folderId) : null,
    fileName: assertNonEmptyString(r.fileName, 'fileName', 255),
    declaredMimeType: assertNonEmptyString(r.declaredMimeType, 'declaredMimeType', 100),
    detectedMimeType: assertNonEmptyString(r.detectedMimeType, 'detectedMimeType', 100),
    byteSize: typeof r.byteSize === 'number' ? r.byteSize : Number(r.byteSize) || 0,
    sha256Checksum: assertNonEmptyString(r.sha256Checksum, 'sha256Checksum', 128),
    version: typeof r.version === 'string' ? r.version : '1',
    quarantineStatus: status,
    rejectionReason: r.rejectionReason ? String(r.rejectionReason) : null,
    createdBy: assertNonEmptyString(r.createdBy, 'createdBy'),
    createdAt: assertNonEmptyString(r.createdAt, 'createdAt', 64),
    updatedAt: assertNonEmptyString(r.updatedAt, 'updatedAt', 64),
    verifiedAt: r.verifiedAt ? String(r.verifiedAt) : null,
  };
}
