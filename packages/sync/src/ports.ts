import type { ClientMutation, MutationReceipt, SyncCursor } from './types.js';
import type { WorkspaceId } from '@daynori/domain';

export interface SyncStoragePort {
  getPendingMutations(workspaceId: WorkspaceId): Promise<ClientMutation[]>;
  enqueueMutation(mutation: ClientMutation): Promise<void>;
  markAcknowledged(mutationId: string, receipt: MutationReceipt): Promise<void>;
  getCursor(workspaceId: WorkspaceId): Promise<SyncCursor | null>;
  saveCursor(cursor: SyncCursor): Promise<void>;
}

export interface SyncTransportPort {
  pushMutations(mutations: ClientMutation[]): Promise<MutationReceipt[]>;
  pullChanges(workspaceId: WorkspaceId, sinceRevision: number): Promise<{
    changes: unknown[];
    newRevision: number;
  }>;
}
