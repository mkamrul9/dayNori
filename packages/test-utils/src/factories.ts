import { parseWorkspaceId, parseUserId, type WorkspaceId, type UserId } from '@daynori/domain';

export function createSyntheticWorkspaceId(suffix = '001'): WorkspaceId {
  const padded = suffix.padStart(12, '0');
  return parseWorkspaceId(`00000000-0000-4000-8000-${padded}`);
}

export function createSyntheticUserId(suffix = '001'): UserId {
  const padded = suffix.padStart(12, '0');
  return parseUserId(`11111111-1111-4000-8000-${padded}`);
}

export function createSyntheticWorkspaceFixture(name = 'Personal Test Workspace') {
  return {
    id: createSyntheticWorkspaceId(),
    ownerId: createSyntheticUserId(),
    name,
    createdAt: '2026-10-13T20:00:00.000Z',
    tier: 'free' as const,
  };
}
