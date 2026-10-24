/**
 * Abstract repository ports and types for Daynori domain entities.
 */

export interface ItemHeader {
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
