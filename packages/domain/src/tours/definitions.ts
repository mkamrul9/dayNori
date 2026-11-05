import type { TourChapterDefinition } from './types.js';
import { TOUR_EVERYDAY_CHAPTERS_WITHOUT_STARTER } from './everydayChapters.js';

const L = (key: string, defaultText: string) => ({ key, defaultText });

/**
 * Phase 79 proof / Phase 80 starter — create/save/reopen/complete/undo one practice task.
 * Stable ID `tour.task-create-save` preserved for progress continuity.
 */
export const TOUR_CHAPTER_TASK_CREATE_SAVE: TourChapterDefinition = {
  id: 'tour.task-create-save',
  definitionVersion: 1,
  contentVersion: 1,
  isStarter: true,
  coverageFamilies: ['tasks'],
  title: L('tour.task-create-save.title', 'Your first task'),
  summary: L(
    'tour.task-create-save.summary',
    'Create, save, reopen, complete, and undo one practice task using real controls.'
  ),
  platforms: ['web', 'installedPwa', 'android'],
  featurePrerequisites: ['tasks'],
  learningChapterId: 'chapter.task-create-save',
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.task-create-save.intro.title', 'Practice with a real task'),
      instruction: L(
        'tour.task-create-save.intro.instruction',
        'This short guide uses the normal Create flow. You may use a labeled practice task. Progress saves with your account.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L(
        'tour.task-create-save.intro.recovery',
        'Tap Next when you are ready. Exit anytime — progress is kept.'
      ),
      allowSkip: true,
      allowInformationalNext: true,
    },
    {
      id: 'open-create',
      kind: 'action',
      title: L('tour.task-create-save.open-create.title', 'Open Create'),
      instruction: L(
        'tour.task-create-save.open-create.instruction',
        'Tap Create (+) to start a new item.'
      ),
      route: '/',
      targetId: 'shell.create',
      expectedAction: 'open_create',
      completionPredicate: 'target_activated',
      recovery: L(
        'tour.task-create-save.open-create.recovery',
        'If Create is missing, open Today or Plan, then try again. Or pause and resume later.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'select-task',
      kind: 'action',
      title: L('tour.task-create-save.select-task.title', 'Choose Task'),
      instruction: L(
        'tour.task-create-save.select-task.instruction',
        'Choose Task (not Note or Routine) in the create sheet.'
      ),
      targetId: 'create.type.task',
      expectedAction: 'select_task_type',
      completionPredicate: 'create_sheet_task_selected',
      createType: 'task',
      recovery: L(
        'tour.task-create-save.select-task.recovery',
        'Re-open Create if the sheet closed. Skip only if you already have a practice task and choose to reuse it later.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'save-task',
      kind: 'action',
      title: L('tour.task-create-save.save-task.title', 'Save the practice task'),
      instruction: L(
        'tour.task-create-save.save-task.instruction',
        'Enter a short title and save. Wait until the app shows it saved on this device — not merely that Save was tapped.'
      ),
      targetId: 'create.task.save',
      expectedAction: 'save_practice_task',
      completionPredicate: 'practice_task_saved_locally',
      entityType: 'task',
      recovery: L(
        'tour.task-create-save.save-task.recovery',
        'If save failed, fix the error and retry. A successful local save that lost its toast can still resume from the saved receipt.'
      ),
      allowSkip: false,
      allowInformationalNext: false,
    },
    {
      id: 'reopen-task',
      kind: 'action',
      title: L('tour.task-create-save.reopen-task.title', 'Find it in Plan'),
      instruction: L(
        'tour.task-create-save.reopen-task.instruction',
        'Open Plan and open the same practice task you just saved until the editor loads.'
      ),
      route: '/plan',
      targetId: 'plan.task.practice',
      expectedAction: 'reopen_practice_task',
      completionPredicate: 'practice_task_opened',
      entityType: 'task',
      recovery: L(
        'tour.task-create-save.reopen-task.recovery',
        'Use Plan search or the list. Do not create a second task — reopen the same one.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'complete-task',
      kind: 'action',
      title: L('tour.task-create-save.complete-task.title', 'Mark complete'),
      instruction: L(
        'tour.task-create-save.complete-task.instruction',
        'Mark the practice task complete using the normal complete control.'
      ),
      targetId: 'task.complete',
      expectedAction: 'complete_practice_task',
      completionPredicate: 'practice_task_completed',
      entityType: 'task',
      recovery: L(
        'tour.task-create-save.complete-task.recovery',
        'Open the practice task again if the editor closed. Completion must save locally before this step advances.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'undo-complete',
      kind: 'action',
      title: L('tour.task-create-save.undo-complete.title', 'Undo completion'),
      instruction: L(
        'tour.task-create-save.undo-complete.instruction',
        'Undo the completion so the practice task is active again.'
      ),
      targetId: 'task.undo-complete',
      expectedAction: 'undo_practice_task_completion',
      completionPredicate: 'practice_task_completion_undone',
      entityType: 'task',
      recovery: L(
        'tour.task-create-save.undo-complete.recovery',
        'Use Undo on the completion toast or reopen the task and clear completion.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.task-create-save.done.title', 'Nice work'),
      instruction: L(
        'tour.task-create-save.done.instruction',
        'You used real Create, save, Plan, complete, and undo. More Learn the app chapters are available. Replay without duplicating the practice task.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.task-create-save.done.recovery', 'Tap Next to finish the chapter.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.tasks-vs-routines'],
    },
  ],
};

/**
 * All runnable tour chapters (starter + everyday). Phase 81 chapters stay out until gated features pass.
 */
export const TOUR_CHAPTER_DEFINITIONS: readonly TourChapterDefinition[] = [
  TOUR_CHAPTER_TASK_CREATE_SAVE,
  ...TOUR_EVERYDAY_CHAPTERS_WITHOUT_STARTER,
];

export function getTourChapterDefinition(chapterId: string): TourChapterDefinition | undefined {
  return TOUR_CHAPTER_DEFINITIONS.find((c) => c.id === chapterId);
}

export function listRunnableTourChapterIds(): string[] {
  return TOUR_CHAPTER_DEFINITIONS.map((c) => c.id);
}

export function listStarterTourChapterIds(): string[] {
  return TOUR_CHAPTER_DEFINITIONS.filter((c) => c.isStarter).map((c) => c.id);
}

/** Map Help Learn chapter → runnable tour definitions (may be multiple). */
export function listTourChaptersForLearningChapter(
  learningChapterId: string
): TourChapterDefinition[] {
  return TOUR_CHAPTER_DEFINITIONS.filter((c) => c.learningChapterId === learningChapterId);
}

export function learningChapterHasRunnableTour(learningChapterId: string): boolean {
  return listTourChaptersForLearningChapter(learningChapterId).length > 0;
}
