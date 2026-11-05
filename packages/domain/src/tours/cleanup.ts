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
  creationOperationId?: string;
  createdAt: string;
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
          createdByTour: false,
          userOwned: true,
          labeledPractice: false,
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
    creationOperationId: a.creationOperationId,
    createdAt: a.createdAt,
    defaultKeep: a.linkedOrEdited || a.userOwned || !a.creationOperationId,
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
    if (!item.creationOperationId || item.linkedOrEdited) {
      return {
        ok: false,
        error: 'Keep edited, linked, or unverified practice records.',
        code: 'protected_artifact',
      };
    }
  }
  return { ok: true };
}

export interface TourCleanupPort {
  workspaceId: string;
  /** Rechecked after every await so an account replacement cannot continue cleanup. */
  isScopeCurrent(): boolean;
  load(item: TourCleanupReviewItem): Promise<{
    id: string;
    workspaceId: string;
    linkedOrEdited: boolean;
    deleted: boolean;
  } | null>;
  trash(item: TourCleanupReviewItem): Promise<{ operationId: string }>;
  verifyTrashed(item: TourCleanupReviewItem, operationId: string): Promise<boolean>;
}

export interface TourCleanupResult {
  entityId: string;
  status: 'trashed' | 'already_trashed' | 'failed';
  operationId?: string;
  code?:
    'scope_changed' | 'protected_artifact' | 'record_missing' | 'command_failed' | 'not_durable';
}

/** Forget provenance only after an authorized normal trash command is durably observed. */
export async function executeTourCleanup(
  state: TourProgressState,
  selectedIds: readonly string[],
  port: TourCleanupPort
): Promise<{ state: TourProgressState; results: TourCleanupResult[] }> {
  const review = buildTourCleanupReview(state);
  const selection = validateCleanupSelection(review, selectedIds);
  if (!selection.ok) throw new Error(selection.code);
  const results: TourCleanupResult[] = [];
  for (const id of new Set(selectedIds)) {
    const item = review.find((row) => row.entityId === id)!;
    try {
      if (!port.isScopeCurrent()) throw new Error('scope_changed');
      const record = await port.load(item);
      if (!port.isScopeCurrent()) throw new Error('scope_changed');
      if (!record || record.id !== id || record.workspaceId !== port.workspaceId) {
        results.push({ entityId: id, status: 'failed', code: 'record_missing' });
        continue;
      }
      if (record.deleted) {
        results.push({ entityId: id, status: 'already_trashed' });
        continue;
      }
      if (record.linkedOrEdited) {
        results.push({ entityId: id, status: 'failed', code: 'protected_artifact' });
        continue;
      }
      const receipt = await port.trash(item);
      if (!port.isScopeCurrent()) throw new Error('scope_changed');
      const durable = receipt.operationId && (await port.verifyTrashed(item, receipt.operationId));
      if (!port.isScopeCurrent()) throw new Error('scope_changed');
      results.push(
        durable
          ? { entityId: id, status: 'trashed', operationId: receipt.operationId }
          : { entityId: id, status: 'failed', code: 'not_durable' }
      );
    } catch (error) {
      results.push({
        entityId: id,
        status: 'failed',
        code:
          error instanceof Error && error.message === 'scope_changed'
            ? 'scope_changed'
            : 'command_failed',
      });
    }
  }
  // On replacement, leave the old scope's metadata intact for recovery by its owner.
  const removed = port.isScopeCurrent()
    ? results.filter((r) => r.status !== 'failed').map((r) => r.entityId)
    : [];
  return { state: applyCleanupDecisionsToProgress(state, removed), results };
}
