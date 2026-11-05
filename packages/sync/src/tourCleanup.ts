import type { TourCleanupPort, TourCleanupReviewItem } from '@daynori/domain';
import type { SyncEngine } from './engine.js';
import type { ItemHeaderRecord } from './models.js';
import type { SyncCommandType } from '@daynori/contracts';

/** Uses the same durable commands and receipt checks as ordinary Plan/Library deletion. */
export function createSyncTourCleanupPort(
  engine: SyncEngine,
  isScopeCurrent: () => boolean,
  hasLinks: (id: string) => Promise<boolean>
): TourCleanupPort {
  const namespace = engine.getAccountNamespace();
  const loaded = new Map<string, ItemHeaderRecord>();
  return {
    workspaceId: namespace.workspaceId,
    isScopeCurrent,
    async load(item) {
      const header = await engine.getItemHeader(item.entityId);
      if (!header || header.workspaceId !== namespace.workspaceId) return null;
      loaded.set(item.entityId, header);
      const expectedKind = item.entityType;
      const kindMatches =
        header.kind === expectedKind ||
        (expectedKind === 'journal_entry' && header.kind === 'journal');
      const children =
        expectedKind === 'folder'
          ? (await engine.listItemHeaders()).some(
              (h) => !h.deletedAt && (h.folderId === item.entityId || h.parentId === item.entityId)
            )
          : false;
      const pending = await engine.getPendingOperation(header.id);
      const changedAfterCreation =
        Date.parse(header.updatedAt) > Date.parse(item.createdAt) &&
        !(header.deletedAt && pending?.action === 'delete');
      return {
        id: header.id,
        workspaceId: header.workspaceId,
        linkedOrEdited:
          !kindMatches ||
          header.securityScope !== 'standard' ||
          children ||
          changedAfterCreation ||
          (await hasLinks(header.id)),
        deleted: Boolean(header.deletedAt) && !pending,
      };
    },
    async trash(item: TourCleanupReviewItem) {
      const pending = await engine.getPendingOperation(item.entityId);
      if (pending) {
        if (pending.action !== 'delete') throw new Error('pending_edit');
        return { operationId: pending.operationId };
      }
      const header = loaded.get(item.entityId);
      if (!header || !isScopeCurrent()) throw new Error('scope_changed');
      const command: SyncCommandType =
        item.entityType === 'folder'
          ? 'trashFolder'
          : item.entityType === 'calendar_event'
            ? 'deleteCalendarEvent'
            : 'trashItem';
      const now = new Date().toISOString();
      const receipt = await engine.saveItem(
        { ...header, deletedAt: now, updatedAt: now },
        undefined,
        command,
        item.entityType === 'folder' ? { payload: { policy: 'preserve_to_parent' } } : undefined
      );
      return { operationId: receipt.operationId };
    },
    async verifyTrashed(item) {
      await engine.syncNow();
      const header = await engine.getItemHeader(item.entityId);
      return (
        isScopeCurrent() &&
        Boolean(header?.deletedAt) &&
        !(await engine.getPendingOperation(item.entityId)) &&
        engine.getItemSyncState(item.entityId).cloudSyncStatus === 'synced'
      );
    },
  };
}
