import type { WorkspaceId } from '@daynori/domain';

export type MutationStatus = 'pending' | 'in_flight' | 'acknowledged' | 'failed';

export interface ClientMutation<TPayload = unknown> {
  id: string;
  workspaceId: WorkspaceId;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  payload: TPayload;
  clientTimestamp: string;
  baseRevision: number;
}

export interface MutationReceipt {
  mutationId: string;
  workspaceId: WorkspaceId;
  serverRevision: number;
  serverTimestamp: string;
  acknowledged: boolean;
  conflict?: {
    resolvedWith: 'server_wins' | 'client_wins' | 'manual';
    serverData?: unknown;
  };
}

export interface SyncCursor {
  workspaceId: WorkspaceId;
  lastServerRevision: number;
  lastSyncAt: string;
}
