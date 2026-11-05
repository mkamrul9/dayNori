import type { TourEvidenceReporter } from './TourContext';
import type { TourEntityType } from '@daynori/domain';

type Navigation = {
  accountUserId: string;
  workspaceId: string;
  entityId: string;
  entityType: TourEntityType;
  source: 'calendar' | 'search';
  report: TourEvidenceReporter;
};
const pending = new Map<string, Navigation>();
const key = (
  scope: Pick<Navigation, 'accountUserId' | 'workspaceId' | 'entityId' | 'entityType'>
) => JSON.stringify([scope.accountUserId, scope.workspaceId, scope.entityType, scope.entityId]);

/** Capture at the real link click, then confirm only when the destination loads that record. */
export function beginTourRecordNavigation(navigation: Navigation): void {
  if (pending.size >= 30) pending.delete(pending.keys().next().value!);
  pending.set(key(navigation), navigation);
}

export async function confirmTourRecordLoaded(
  scope: Omit<Navigation, 'source' | 'report'>
): Promise<boolean> {
  const ticket = pending.get(key(scope));
  if (!ticket) return false;
  pending.delete(key(scope));
  return ticket.report({
    type: ticket.source === 'calendar' ? 'calendar_projection_opened' : 'search_result_opened',
    entityId: scope.entityId,
    entityType: scope.entityType,
    recordLoaded: true,
  });
}
