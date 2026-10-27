import type { TourPracticeArtifact, TourProgressState } from './types.js';
import { listCleanupCandidates } from './practice.js';

export interface TourCleanupReviewItem {
  entityId: string;
  entityType: TourPracticeArtifact['entityType'];
  chapterId: string;
  role: string;
  labeledPractice: boolean;
  linkedOrEdited: boolean;
  userOwned: boolean;
  /** Default keep when linked/edited or user-owned. */
  defaultKeep: boolean;
}

/**
 * Build a reviewable selective cleanup list. Never implies bulk name-prefix deletion.
 */
export function buildTourCleanupReview(
  state: TourProgressState,
  options?: { includeLinkedOrEdited?: boolean }
): TourCleanupReviewItem[] {
  const all: TourPracticeArtifact[] = [];
  for (const ch of state.chapters) {
    if (ch.practiceArtifacts?.length) {
      all.push(...ch.practiceArtifacts);
    } else {
      for (const id of ch.practiceEntityIds) {
        all.push({
          entityId: id,
          entityType: 'task',
          chapterId: ch.chapterId,
          role: 'legacy',
          createdByTour: true,
          userOwned: false,
          labeledPractice: true,
          linkedOrEdited: false,
          createdAt: ch.updatedAt,
        });
      }
    }
  }
  // Show all tour-tracked non-user-owned artifacts for review; linked/edited default to keep.
  const includeLinked = options?.includeLinkedOrEdited !== false;
  const candidates = listCleanupCandidates(all, { includeLinkedOrEdited: includeLinked });
  return candidates.map((a) => ({
    entityId: a.entityId,
    entityType: a.entityType,
    chapterId: a.chapterId,
    role: a.role,
    labeledPractice: a.labeledPractice,
    linkedOrEdited: a.linkedOrEdited,
    userOwned: a.userOwned,
    defaultKeep: a.linkedOrEdited || a.userOwned,
  }));
}

/**
 * Apply selective keep/remove decisions to progress metadata only.
 * Actual entity deletion must use normal authorized application commands.
 */
export function applyCleanupDecisionsToProgress(
  state: TourProgressState,
  removeEntityIds: readonly string[],
  at: string = new Date().toISOString()
): TourProgressState {
  const remove = new Set(removeEntityIds);
  return {
    ...state,
    chapters: state.chapters.map((ch) => ({
      ...ch,
      practiceEntityIds: ch.practiceEntityIds.filter((id) => !remove.has(id)),
      practiceArtifacts: (ch.practiceArtifacts ?? []).filter((a) => {
        if (!remove.has(a.entityId)) return true;
        // Never drop user-owned from progress without explicit path — safety net.
        return a.userOwned;
      }),
      updatedAt: at,
    })),
  };
}

export function validateCleanupSelection(
  review: readonly TourCleanupReviewItem[],
  requestedRemoveIds: readonly string[]
): { ok: true } | { ok: false; error: string; code: string } {
  const byId = new Map(review.map((r) => [r.entityId, r]));
  for (const id of requestedRemoveIds) {
    const item = byId.get(id);
    if (!item) {
      return {
        ok: false,
        error: 'Cleanup selection includes an unknown or non-tracked record.',
        code: 'unknown_artifact',
      };
    }
    if (item.userOwned) {
      return {
        ok: false,
        error: 'Cannot remove a user-owned item through tour cleanup.',
        code: 'user_owned',
      };
    }
  }
  return { ok: true };
}
