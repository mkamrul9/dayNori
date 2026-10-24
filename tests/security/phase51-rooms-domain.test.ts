import { describe, expect, it } from 'vitest';
import {
  canInviteWithRole,
  isBlockedShareKind,
  isShareableItemKind,
  mapInviteExceptionMessage,
  roomPermissionsFor,
  validateInvitationTtlHours,
} from '@daynori/domain';

describe('Phase 51 rooms domain rules', () => {
  it('encodes owner/editor/viewer permission matrix', () => {
    expect(roomPermissionsFor('owner').manageInvitations).toBe(true);
    expect(roomPermissionsFor('editor').manageInvitations).toBe(false);
    expect(roomPermissionsFor('editor').editContent).toBe(true);
    expect(roomPermissionsFor('viewer').editContent).toBe(false);
    expect(roomPermissionsFor('viewer').readContent).toBe(true);
    expect(roomPermissionsFor(null).readContent).toBe(false);
  });

  it('blocks journal/vault shares and allows notes/tasks', () => {
    expect(isShareableItemKind('note')).toBe(true);
    expect(isShareableItemKind('task')).toBe(true);
    expect(isBlockedShareKind('journal_entry')).toBe(true);
    expect(isBlockedShareKind('note', 'vault')).toBe(true);
    expect(canInviteWithRole('owner', 'editor')).toBe(true);
    expect(canInviteWithRole('editor', 'viewer')).toBe(false);
  });

  it('validates TTL and maps invite errors generically', () => {
    expect(validateInvitationTtlHours(72).ok).toBe(true);
    expect(validateInvitationTtlHours(999).ok).toBe(false);
    expect(mapInviteExceptionMessage('ROOM_INVITE_REVOKED')).toBe('ROOM_INVITE_REVOKED');
    expect(mapInviteExceptionMessage('something else')).toBe('ROOM_INVITE_INVALID');
  });
});
