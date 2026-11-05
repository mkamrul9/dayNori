import { getDefaultTourProgress, validateTourProgressState } from './progress.js';
import type { TourProgressState } from './types.js';

export type TourScope = NonNullable<TourProgressState['scope']>;

function sameScope(a: TourProgressState['scope'], b: TourScope): boolean {
  return a?.accountUserId === b.accountUserId && a.workspaceId === b.workspaceId;
}

/** Only a local key already bound to the actor/workspace may import unscoped V1 progress. */
export function selectTourScope(
  raw: unknown,
  scope: TourScope,
  allowUnscopedLocal = false
): TourProgressState {
  const stored = validateTourProgressState(raw);
  const selected =
    [stored, ...(stored.otherScopes ?? [])].find((s) => sameScope(s.scope, scope)) ??
    (allowUnscopedLocal && !stored.scope ? stored : undefined);
  return { ...(selected ?? getDefaultTourProgress()), scope, otherScopes: undefined };
}

/** A preference update must preserve other workspace progress, including unbound legacy data. */
export function storeTourScope(current: TourProgressState, rawStored: unknown): TourProgressState {
  if (!current.scope) throw new Error('tour_scope_required');
  const stored = validateTourProgressState(rawStored);
  const snapshots = [stored, ...(stored.otherScopes ?? [])].filter(
    (s) => s.chapters.length > 0 && !sameScope(s.scope, current.scope!)
  );
  const unique = new Map<string, Omit<TourProgressState, 'otherScopes'>>();
  for (const snapshot of snapshots) {
    const { otherScopes: _ignored, ...rest } = snapshot as TourProgressState;
    unique.set(
      rest.scope ? `${rest.scope.accountUserId}:${rest.scope.workspaceId}` : 'unbound-legacy',
      rest
    );
  }
  if (unique.size > 12) throw new Error('tour_scope_storage_limit');
  return { ...current, otherScopes: [...unique.values()] };
}
