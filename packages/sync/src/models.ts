/**
 * Phase 11: Foundation Storage Records
 *
 * Scoped strictly to item headers, drafts, pending mutations, sync cursors,
 * and preference snapshots as specified in the Phase 11 roadmap.
 */

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
