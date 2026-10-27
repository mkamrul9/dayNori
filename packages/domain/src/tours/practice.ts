import { createDeterministicUuid } from '../onboarding.js';
import type { TourEntityType, TourPracticeArtifact } from './types.js';

/** Distinct from Phase 31 beginner practice task ID namespace. */
export const TOUR_PRACTICE_TASK_NAMESPACE = 'daynori-tour-practice-task-v1';
export const TOUR_PRACTICE_ENTITY_NAMESPACE = 'daynori-tour-practice-entity-v1';

export const TOUR_PRACTICE_TASK_TITLE = 'Tour practice task';
export const TOUR_PRACTICE_ROUTINE_TITLE = 'Tour practice routine';
export const TOUR_PRACTICE_NOTE_TITLE = 'Tour practice note';
export const TOUR_PRACTICE_JOURNAL_TITLE = 'Tour practice journal';
export const TOUR_PRACTICE_EVENT_TITLE = 'Tour practice event';
export const TOUR_PRACTICE_FOLDER_NAME = 'Tour practice folder';

export function getTourPracticeTaskId(workspaceId: string, userId: string, chapterId: string): string {
  return createDeterministicUuid(
    TOUR_PRACTICE_TASK_NAMESPACE,
    `${workspaceId}:${userId}:${chapterId}`
  );
}

/**
 * Deterministic practice ID scoped to actor, workspace, chapter, entity type, and role.
 */
export function getTourPracticeEntityId(
  workspaceId: string,
  userId: string,
  chapterId: string,
  entityType: TourEntityType,
  role: string = 'primary'
): string {
  return createDeterministicUuid(
    TOUR_PRACTICE_ENTITY_NAMESPACE,
    `${workspaceId}:${userId}:${chapterId}:${entityType}:${role}`
  );
}

export function isTourPracticeTaskTitle(title: string): boolean {
  return title.trim() === TOUR_PRACTICE_TASK_TITLE || title.trim().startsWith('Tour practice task');
}

export function isLabeledTourPracticeTitle(title: string): boolean {
  const t = title.trim();
  return (
    t === TOUR_PRACTICE_TASK_TITLE ||
    t === TOUR_PRACTICE_ROUTINE_TITLE ||
    t === TOUR_PRACTICE_NOTE_TITLE ||
    t === TOUR_PRACTICE_JOURNAL_TITLE ||
    t === TOUR_PRACTICE_EVENT_TITLE ||
    t === TOUR_PRACTICE_FOLDER_NAME ||
    t.startsWith('Tour practice ')
  );
}

export function createPracticeArtifact(input: {
  entityId: string;
  entityType: TourEntityType;
  chapterId: string;
  role?: string;
  createdByTour: boolean;
  userOwned: boolean;
  labeledPractice?: boolean;
  linkedOrEdited?: boolean;
  at?: string;
}): TourPracticeArtifact {
  return {
    entityId: input.entityId,
    entityType: input.entityType,
    chapterId: input.chapterId,
    role: input.role ?? 'primary',
    createdByTour: input.createdByTour,
    userOwned: input.userOwned,
    labeledPractice: input.labeledPractice ?? input.createdByTour,
    linkedOrEdited: input.linkedOrEdited ?? false,
    createdAt: input.at ?? new Date().toISOString(),
  };
}

export function upsertPracticeArtifact(
  artifacts: readonly TourPracticeArtifact[],
  next: TourPracticeArtifact
): TourPracticeArtifact[] {
  const others = artifacts.filter(
    (a) => !(a.entityId === next.entityId && a.chapterId === next.chapterId && a.role === next.role)
  );
  return [...others, next].slice(0, 80);
}

/** Records eligible for selective cleanup (never auto-delete userOwned). */
export function listCleanupCandidates(
  artifacts: readonly TourPracticeArtifact[],
  options?: { includeLinkedOrEdited?: boolean }
): TourPracticeArtifact[] {
  const includeLinked = options?.includeLinkedOrEdited === true;
  return artifacts.filter((a) => {
    if (a.userOwned) return false;
    if (!a.createdByTour && !a.labeledPractice) return false;
    if (a.linkedOrEdited && !includeLinked) return false;
    return true;
  });
}
