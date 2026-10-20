/**
 * Phase 52 — Room revocation domain and sync classification unit tests.
 * Tests revocation reason mapping, confirmed vs transient classification,
 * and purge scope planning without touching databases.
 */

import { describe, it, expect } from 'vitest';
import {
  isConfirmedRevocation,
  mapRevocationReason,
  type RoomRevocationReason,
} from '@daynori/domain';
import {
  classifyRoomSyncFailure,
  planRoomRevocationPurge,
  type ClassifiedRoomSyncFailure,
  type RoomRevocationPurgeScope,
} from '@daynori/sync';

describe('Phase 52 — Room Revocation Domain', () => {
  describe('isConfirmedRevocation', () => {
    it('recognizes MEMBERSHIP_REVOKED code', () => {
      expect(isConfirmedRevocation({ code: 'MEMBERSHIP_REVOKED' })).toBe(true);
    });

    it('recognizes ROOM_ARCHIVED code', () => {
      expect(isConfirmedRevocation({ code: 'ROOM_ARCHIVED' })).toBe(true);
    });

    it('recognizes SYNC_RESET_REQUIRED with 403 status', () => {
      expect(isConfirmedRevocation({ code: 'SYNC_RESET_REQUIRED', statusCode: 403 })).toBe(true);
    });

    it('recognizes access revoked message patterns', () => {
      expect(isConfirmedRevocation({ message: 'access revoked' })).toBe(true);
      expect(isConfirmedRevocation({ message: 'membership revoked' })).toBe(true);
      expect(isConfirmedRevocation({ message: 'Room is archived' })).toBe(true);
    });

    it('recognizes access_epoch mismatch messages', () => {
      expect(
        isConfirmedRevocation({
          message: 'access_epoch changed',
          accessEpoch: 'new-epoch',
        })
      ).toBe(true);
    });

    it('rejects plain network errors', () => {
      expect(isConfirmedRevocation({ code: 'NETWORK_ERROR' })).toBe(false);
      expect(isConfirmedRevocation({ statusCode: 500 })).toBe(false);
      expect(isConfirmedRevocation({ message: 'fetch failed' })).toBe(false);
    });

    it('rejects generic 403 without revocation signals', () => {
      expect(isConfirmedRevocation({ statusCode: 403 })).toBe(false);
    });
  });

  describe('mapRevocationReason', () => {
    it('maps MEMBERSHIP_REVOKED to membership_removed', () => {
      expect(mapRevocationReason({ code: 'MEMBERSHIP_REVOKED' })).toBe('membership_removed');
    });

    it('maps ROOM_ARCHIVED to room_archived', () => {
      expect(mapRevocationReason({ code: 'ROOM_ARCHIVED' })).toBe('room_archived');
    });

    it('maps access_epoch messages to access_epoch_changed', () => {
      expect(mapRevocationReason({ message: 'access_epoch mismatch' })).toBe(
        'access_epoch_changed'
      );
    });

    it('maps SYNC_RESET_REQUIRED to cursor_invalid', () => {
      expect(mapRevocationReason({ code: 'SYNC_RESET_REQUIRED' })).toBe('cursor_invalid');
    });

    it('maps cursor messages to cursor_invalid', () => {
      expect(mapRevocationReason({ message: 'invalid cursor' })).toBe('cursor_invalid');
    });

    it('defaults to membership_removed for unrecognized patterns', () => {
      expect(mapRevocationReason({ message: 'unknown error' })).toBe('membership_removed');
    });
  });

  describe('classifyRoomSyncFailure', () => {
    it('classifies MEMBERSHIP_REVOKED as revocation', () => {
      const error = {
        statusCode: 403,
        code: 'MEMBERSHIP_REVOKED',
        message: 'Membership revoked',
      };
      const classified = classifyRoomSyncFailure(error);

      expect(classified.isMembershipRevoked).toBe(true);
      expect(classified.isAuthError).toBe(true);
      expect(classified.revocationReason).toBe('membership_removed');
    });

    it('classifies ROOM_ARCHIVED as revocation', () => {
      const error = {
        statusCode: 403,
        code: 'ROOM_ARCHIVED',
        message: 'Room is archived',
      };
      const classified = classifyRoomSyncFailure(error);

      expect(classified.isMembershipRevoked).toBe(true);
      expect(classified.revocationReason).toBe('room_archived');
    });

    it('classifies network errors as non-revocation', () => {
      const error = {
        code: 'NETWORK_ERROR',
        message: 'Network request failed',
      };
      const classified = classifyRoomSyncFailure(error);

      expect(classified.isMembershipRevoked).toBe(false);
      expect(classified.isNetworkError).toBe(true);
      expect(classified.revocationReason).toBeUndefined();
    });

    it('classifies access revoked messages as revocation', () => {
      const error = {
        statusCode: 403,
        message: 'Access revoked: membership removed',
      };
      const classified = classifyRoomSyncFailure(error);

      expect(classified.isMembershipRevoked).toBe(true);
      expect(classified.isAuthError).toBe(true);
    });

    it('preserves base classification properties', () => {
      const error = {
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'Too many requests',
      };
      const classified = classifyRoomSyncFailure(error);

      expect(classified.isMembershipRevoked).toBe(false);
      expect(classified.isRateLimited).toBe(true);
      expect(classified.statusCode).toBe(429);
    });
  });

  describe('planRoomRevocationPurge', () => {
    it('plans full workspace purge for membership_removed', () => {
      const scope = planRoomRevocationPurge({
        workspaceId: 'ws-123',
        userId: 'user-456',
        reason: 'membership_removed',
      });

      expect(scope.workspaceId).toBe('ws-123');
      expect(scope.userId).toBe('user-456');
      expect(scope.reason).toBe('membership_removed');
      expect(scope.operations.clearHeaders).toBe(true);
      expect(scope.operations.clearNotes).toBe(true);
      expect(scope.operations.clearTasks).toBe(true);
      expect(scope.operations.clearPendingMutations).toBe(true);
      expect(scope.operations.clearSyncCursor).toBe(true);
    });

    it('plans purge for room_archived', () => {
      const scope = planRoomRevocationPurge({
        workspaceId: 'ws-789',
        userId: 'user-abc',
        reason: 'room_archived',
      });

      expect(scope.reason).toBe('room_archived');
      expect(scope.operations.clearHeaders).toBe(true);
      expect(scope.operations.clearDrafts).toBe(true);
    });

    it('enables in-flight cancellation', () => {
      const scope = planRoomRevocationPurge({
        workspaceId: 'ws-123',
        userId: 'user-456',
        reason: 'access_epoch_changed',
      });

      expect(scope.operations.cancelInFlight).toBe(true);
    });

    it('clears all content types', () => {
      const scope = planRoomRevocationPurge({
        workspaceId: 'ws-123',
        userId: 'user-456',
        reason: 'membership_removed',
      });

      expect(scope.operations.clearNotes).toBe(true);
      expect(scope.operations.clearTasks).toBe(true);
      expect(scope.operations.clearRoutines).toBe(true);
      expect(scope.operations.clearOccurrences).toBe(true);
      expect(scope.operations.clearFiles).toBe(true);
      expect(scope.operations.clearCalendarEvents).toBe(true);
    });
  });
});

describe('Phase 52 — Room Content Blocking', () => {
  // Import after domain exports are available
  const { isRoomContentBlocked, isRoomSyncableItemKind } = require('@daynori/domain');

  describe('isRoomSyncableItemKind', () => {
    it('accepts note', () => {
      expect(isRoomSyncableItemKind('note')).toBe(true);
    });

    it('accepts task', () => {
      expect(isRoomSyncableItemKind('task')).toBe(true);
    });

    it('accepts todo', () => {
      expect(isRoomSyncableItemKind('todo')).toBe(true);
    });

    it('accepts file_item', () => {
      expect(isRoomSyncableItemKind('file_item')).toBe(true);
    });

    it('rejects journal_entry', () => {
      expect(isRoomSyncableItemKind('journal_entry')).toBe(false);
    });

    it('rejects vault', () => {
      expect(isRoomSyncableItemKind('vault')).toBe(false);
    });

    it('rejects unknown kinds', () => {
      expect(isRoomSyncableItemKind('unknown')).toBe(false);
    });
  });

  describe('isRoomContentBlocked', () => {
    it('blocks vault security scope', () => {
      expect(isRoomContentBlocked({ securityScope: 'vault' })).toBe(true);
      expect(isRoomContentBlocked({ kind: 'note', securityScope: 'vault' })).toBe(true);
    });

    it('blocks journal entry kind', () => {
      expect(isRoomContentBlocked({ kind: 'journal_entry' })).toBe(true);
      expect(isRoomContentBlocked({ type: 'journal_entry' })).toBe(true);
    });

    it('blocks vault kind', () => {
      expect(isRoomContentBlocked({ kind: 'vault_item' })).toBe(true);
      expect(isRoomContentBlocked({ type: 'vault' })).toBe(true);
    });

    it('allows standard note', () => {
      expect(isRoomContentBlocked({ kind: 'note', securityScope: 'standard' })).toBe(false);
    });

    it('allows standard task', () => {
      expect(isRoomContentBlocked({ kind: 'task', securityScope: 'standard' })).toBe(false);
    });

    it('case-insensitive blocking', () => {
      expect(isRoomContentBlocked({ kind: 'JOURNAL_ENTRY' })).toBe(true);
      expect(isRoomContentBlocked({ kind: 'VAULT_ITEM' })).toBe(true);
      expect(isRoomContentBlocked({ securityScope: 'VAULT' })).toBe(true);
    });
  });
});
