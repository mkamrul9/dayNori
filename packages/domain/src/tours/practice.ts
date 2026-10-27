import { createDeterministicUuid } from '../onboarding.js';

/** Distinct from Phase 31 beginner practice task ID namespace. */
export const TOUR_PRACTICE_TASK_NAMESPACE = 'daynori-tour-practice-task-v1';

export const TOUR_PRACTICE_TASK_TITLE = 'Tour practice task';

export function getTourPracticeTaskId(workspaceId: string, userId: string, chapterId: string): string {
  return createDeterministicUuid(
    TOUR_PRACTICE_TASK_NAMESPACE,
    `${workspaceId}:${userId}:${chapterId}`
  );
}

export function isTourPracticeTaskTitle(title: string): boolean {
  return title.trim() === TOUR_PRACTICE_TASK_TITLE || title.trim().startsWith('Tour practice task');
}
