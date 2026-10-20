/**
 * Phase 52 repair — revocation classification must not treat SYNC_RESET as purge.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import {
  isConfirmedRevocation,
  isSyncResetRequired,
  isRoomRoleInsufficient,
  mapRevocationReason,
  requiresRoomContentPurge,
  createNoteDocumentFromPlainText,
} from '@daynori/domain';
import {
  classifyRoomSyncFailure,
  planRoomRevocationPurge,
  applyRoomRevocationPurge,
  type LocalRepositoryPort,
  type DraftRecord,
  type PendingMutationRecord,
  type SyncCursorRecord,
  type ConflictRecord,
  type NoteRecord,
  type ItemHeaderRecord,
} from '@daynori/sync';
import {
  IndexedDbLocalRepository,
  setTrustedDeviceConsent,
  clearAllLocalData,
} from '../../apps/web/src/data/indexedDbRepository.js';

const memoryStore = new Map<string, string>();
const globalWithStorage = globalThis as unknown as { localStorage?: Storage };
if (typeof globalWithStorage.localStorage === 'undefined') {
  globalWithStorage.localStorage = {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStore.set(key, value);
    },
    removeItem: (key: string) => {
      memoryStore.delete(key);
    },
    clear: () => memoryStore.clear(),
    key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
    get length() {
      return memoryStore.size;
    },
  };
}

describe('Phase 52 repair — Room Revocation Domain', () => {
  describe('isConfirmedRevocation', () => {
    it('recognizes MEMBERSHIP_REVOKED and ROOM_ARCHIVED codes only', () => {
      expect(isConfirmedRevocation({ code: 'MEMBERSHIP_REVOKED' })).toBe(true);
      expect(isConfirmedRevocation({ code: 'ROOM_ARCHIVED' })).toBe(true);
    });

    it('does not treat SYNC_RESET_REQUIRED as revocation', () => {
      expect(isConfirmedRevocation({ code: 'SYNC_RESET_REQUIRED', statusCode: 409 })).toBe(false);
      expect(isConfirmedRevocation({ code: 'SYNC_RESET_REQUIRED', statusCode: 403 })).toBe(false);
      expect(isSyncResetRequired({ code: 'SYNC_RESET_REQUIRED' })).toBe(true);
    });

    it('does not match bare archived substrings without ROOM_ARCHIVED code', () => {
      expect(isConfirmedRevocation({ message: 'Room is archived' })).toBe(false);
      expect(isConfirmedRevocation({ message: 'ROOM_ARCHIVED: Room is archived' })).toBe(true);
    });

    it('rejects network and generic forbidden', () => {
      expect(isConfirmedRevocation({ code: 'NETWORK_ERROR' })).toBe(false);
      expect(isConfirmedRevocation({ statusCode: 403 })).toBe(false);
      expect(isConfirmedRevocation({ statusCode: 401, code: 'UNAUTHORIZED' })).toBe(false);
      expect(isConfirmedRevocation({ message: 'fetch failed' })).toBe(false);
    });
  });

  describe('role downgrade', () => {
    it('detects ROOM_ROLE_INSUFFICIENT without purge', () => {
      expect(isRoomRoleInsufficient({ code: 'ROOM_ROLE_INSUFFICIENT' })).toBe(true);
      expect(requiresRoomContentPurge('role_downgraded')).toBe(false);
      expect(requiresRoomContentPurge('membership_removed')).toBe(true);
      expect(requiresRoomContentPurge('room_archived')).toBe(true);
      expect(requiresRoomContentPurge('cursor_invalid')).toBe(false);
    });
  });

  describe('mapRevocationReason', () => {
    it('maps structured codes', () => {
      expect(mapRevocationReason({ code: 'MEMBERSHIP_REVOKED' })).toBe('membership_removed');
      expect(mapRevocationReason({ code: 'ROOM_ARCHIVED' })).toBe('room_archived');
      expect(mapRevocationReason({ code: 'ROOM_ROLE_INSUFFICIENT' })).toBe('role_downgraded');
      expect(mapRevocationReason({ code: 'SYNC_RESET_REQUIRED' })).toBe('cursor_invalid');
    });
  });

  describe('classifyRoomSyncFailure', () => {
    it('classifies MEMBERSHIP_REVOKED as purge revocation', () => {
      const classified = classifyRoomSyncFailure({
        statusCode: 403,
        code: 'MEMBERSHIP_REVOKED',
        message: 'Membership revoked',
      });
      expect(classified.isMembershipRevoked).toBe(true);
      expect(classified.isSyncResetRequired).toBe(false);
      expect(classified.isRoleInsufficient).toBe(false);
    });

    it('classifies SYNC_RESET_REQUIRED as rebase, not purge', () => {
      const classified = classifyRoomSyncFailure({
        statusCode: 409,
        code: 'SYNC_RESET_REQUIRED',
        message: 'SYNC_RESET_REQUIRED: Workspace access epoch has changed',
      });
      expect(classified.isMembershipRevoked).toBe(false);
      expect(classified.isSyncResetRequired).toBe(true);
      expect(classified.isResetRequired).toBe(true);
    });

    it('classifies role insufficient without purge', () => {
      const classified = classifyRoomSyncFailure({
        statusCode: 403,
        code: 'ROOM_ROLE_INSUFFICIENT',
        message: 'ROOM_ROLE_INSUFFICIENT: editor required but user has viewer',
      });
      expect(classified.isMembershipRevoked).toBe(false);
      expect(classified.isRoleInsufficient).toBe(true);
    });

    it('classifies network errors as non-revocation', () => {
      const classified = classifyRoomSyncFailure({
        code: 'NETWORK_ERROR',
        message: 'Network request failed',
      });
      expect(classified.isMembershipRevoked).toBe(false);
      expect(classified.isNetworkError).toBe(true);
    });
  });

  describe('planRoomRevocationPurge / applyRoomRevocationPurge', () => {
    it('plans purge only for loss-of-access reasons', () => {
      expect(
        planRoomRevocationPurge({
          workspaceId: 'ws',
          userId: 'u',
          reason: 'membership_removed',
        }).shouldPurge
      ).toBe(true);
      expect(
        planRoomRevocationPurge({
          workspaceId: 'ws',
          userId: 'u',
          reason: 'role_downgraded',
        }).shouldPurge
      ).toBe(false);
      expect(
        planRoomRevocationPurge({
          workspaceId: 'ws',
          userId: 'u',
          reason: 'cursor_invalid',
        }).shouldPurge
      ).toBe(false);
    });

    it('invokes typed clearWorkspaceData for confirmed purge', async () => {
      const clearWorkspaceData = vi.fn(async () => undefined);
      const repo = { clearWorkspaceData } as unknown as LocalRepositoryPort;
      await applyRoomRevocationPurge(
        repo,
        planRoomRevocationPurge({
          workspaceId: 'ws-1',
          userId: 'u-1',
          reason: 'membership_removed',
        })
      );
      expect(clearWorkspaceData).toHaveBeenCalledWith('ws-1');
    });

    it('skips clearWorkspaceData when shouldPurge is false', async () => {
      const clearWorkspaceData = vi.fn(async () => undefined);
      const repo = { clearWorkspaceData } as unknown as LocalRepositoryPort;
      await applyRoomRevocationPurge(
        repo,
        planRoomRevocationPurge({
          workspaceId: 'ws-1',
          userId: 'u-1',
          reason: 'role_downgraded',
        })
      );
      expect(clearWorkspaceData).not.toHaveBeenCalled();
    });

    it('IndexedDb clearWorkspaceData removes cursor, conflicts, drafts, and notes for one room only', async () => {
      setTrustedDeviceConsent(true);
      const roomWs = crypto.randomUUID();
      const otherWs = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const now = new Date().toISOString();
      const noteId = crypto.randomUUID();
      const draftId = crypto.randomUUID();
      const doc = createNoteDocumentFromPlainText('secret room body');

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ workspaceId: roomWs, userId, deviceId: 'purge-device' });

      const header: ItemHeaderRecord = {
        id: noteId,
        workspaceId: roomWs,
        kind: 'note',
        folderId: null,
        rank: '0|hzzzzz:',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        title: 'revoked room note',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await repo.upsertItemHeader(header);

      const note: NoteRecord = {
        id: noteId,
        workspaceId: roomWs,
        folderId: null,
        title: 'revoked room note',
        document: doc,
        plainText: 'secret room body',
        wordCount: 3,
        charCount: 16,
        purpose: 'standard',
        serverRevision: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await repo.upsertNote(note);

      const draft: DraftRecord = {
        id: draftId,
        workspaceId: roomWs,
        userId,
        entityId: noteId,
        entityType: 'note',
        title: 'draft',
        payload: { title: 'draft' },
        savedAt: now,
        isQuarantined: false,
        quarantinedAt: null,
      };
      await repo.saveDraft(draft);

      const mutation: PendingMutationRecord = {
        operationId: crypto.randomUUID(),
        deviceId: 'purge-device',
        workspaceId: roomWs,
        userId,
        commandVersion: 1,
        schemaVersion: 1,
        command: 'updateItem',
        entityType: 'item',
        entityId: noteId,
        action: 'update',
        baseRevision: 1,
        dependencyOperationIds: [],
        clientTimestamp: now,
        payload: { isPinned: true },
        status: 'pending',
        retryCount: 0,
        lastError: null,
      };
      await repo.enqueueMutation(mutation);

      const cursor: SyncCursorRecord = {
        workspaceId: roomWs,
        userId,
        cursor: 'cursor-room-1',
        lastServerRevision: 1,
        epoch: 'epoch-1',
        lastSyncedAt: now,
      };
      await repo.saveCursor(cursor);

      const conflict: ConflictRecord = {
        id: crypto.randomUUID(),
        workspaceId: roomWs,
        userId,
        entityId: noteId,
        entityType: 'note',
        operationId: mutation.operationId,
        localPayload: { title: 'local' },
        baseRevision: 1,
        serverRevision: 2,
        serverState: { title: 'server' },
        conflictReason: 'revision_mismatch',
        detectedAt: now,
        resolved: false,
      };
      await repo.saveConflict(conflict);

      await repo.initialize({ workspaceId: otherWs, userId, deviceId: 'purge-device' });
      const otherCursor: SyncCursorRecord = {
        workspaceId: otherWs,
        userId,
        cursor: 'cursor-other',
        lastServerRevision: 1,
        epoch: 'epoch-other',
        lastSyncedAt: now,
      };
      await repo.saveCursor(otherCursor);
      const otherNoteId = crypto.randomUUID();
      const otherDoc = createNoteDocumentFromPlainText('keep me');
      const otherNote: NoteRecord = {
        id: otherNoteId,
        workspaceId: otherWs,
        folderId: null,
        title: 'personal note',
        document: otherDoc,
        plainText: 'keep me',
        wordCount: 2,
        charCount: 7,
        purpose: 'standard',
        serverRevision: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await repo.upsertNote(otherNote);

      // Purge must run in the revoked room's active namespace.
      await repo.initialize({ workspaceId: roomWs, userId, deviceId: 'purge-device' });
      await applyRoomRevocationPurge(
        repo,
        planRoomRevocationPurge({
          workspaceId: roomWs,
          userId,
          reason: 'membership_removed',
        })
      );

      expect(await repo.getCursor(roomWs, userId)).toBeNull();
      expect(await repo.getNote(roomWs, noteId)).toBeNull();
      expect(await repo.getDraft(roomWs, userId, draftId)).toBeNull();
      expect(await repo.getPendingMutations(roomWs, userId)).toHaveLength(0);
      expect(await repo.listConflicts(roomWs)).toHaveLength(0);

      await repo.initialize({ workspaceId: otherWs, userId, deviceId: 'purge-device' });
      expect(await repo.getCursor(otherWs, userId)).not.toBeNull();
      expect(await repo.getNote(otherWs, otherNoteId)).not.toBeNull();

      await repo.close();
      await clearAllLocalData();
    });
  });
});
