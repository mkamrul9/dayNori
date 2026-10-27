import { describe, expect, it } from 'vitest';
import {
  TOUR_CHAPTER_DEFINITIONS,
  TOUR_CHAPTER_TASK_CREATE_SAVE,
  applyTourControl,
  applyTourEvidence,
  buildTourCleanupReview,
  correlateTourEvidence,
  createPracticeArtifact,
  getDefaultTourProgress,
  getStepDefinition,
  getTourPracticeEntityId,
  listRunnableTourChapterIds,
  listStarterTourChapterIds,
  listTourChaptersForLearningChapter,
  validateCleanupSelection,
  validateTourProgressState,
} from '@daynori/domain';

const USER = '11111111-1111-4111-8111-111111111111';
const WS = '22222222-2222-4222-8222-222222222222';

describe('Phase 80 everyday tour catalog', () => {
  it('ships starter plus everyday runnable chapters without Phase 81 gated families', () => {
    const ids = listRunnableTourChapterIds();
    expect(ids).toContain('tour.task-create-save');
    expect(ids).toContain('tour.navigation');
    expect(ids).toContain('tour.personalization');
    expect(ids).toContain('tour.tasks');
    expect(ids).toContain('tour.routines');
    expect(ids).toContain('tour.calendar');
    expect(ids).toContain('tour.notes-library');
    expect(ids).toContain('tour.journal');
    expect(ids).toContain('tour.folders-search');
    expect(ids).toContain('tour.help-return');
    expect(listStarterTourChapterIds()).toEqual(['tour.task-create-save']);
    expect(ids.some((id) => id.includes('vault') || id.includes('files'))).toBe(false);
    expect(TOUR_CHAPTER_DEFINITIONS.length).toBeGreaterThanOrEqual(10);
  });

  it('maps Help learning chapters to one or more tour definitions', () => {
    expect(listTourChaptersForLearningChapter('chapter.task-create-save').map((c) => c.id)).toEqual([
      'tour.task-create-save',
    ]);
    const taskFamily = listTourChaptersForLearningChapter('chapter.tasks-routines').map((c) => c.id);
    expect(taskFamily).toContain('tour.tasks');
    expect(taskFamily).toContain('tour.routines');
  });

  it('rejects target clicks as proof of save and requires loaded reopen', () => {
    const step = getStepDefinition(TOUR_CHAPTER_TASK_CREATE_SAVE, 'save-task')!;
    const base = {
      at: new Date().toISOString(),
      accountUserId: USER,
      workspaceId: WS,
      chapterId: TOUR_CHAPTER_TASK_CREATE_SAVE.id,
      definitionVersion: 1,
      runId: 'run-1',
      stepId: 'save-task',
      attemptId: 'att-1',
    };
    expect(
      correlateTourEvidence(
        step,
        { ...base, type: 'target_activated', targetId: 'create.task.save' },
        {
          accountUserId: USER,
          workspaceId: WS,
          chapterId: TOUR_CHAPTER_TASK_CREATE_SAVE.id,
          definitionVersion: 1,
          runId: 'run-1',
          stepId: 'save-task',
          attemptId: 'att-1',
        }
      ).accepted
    ).toBe(false);

    const reopen = getStepDefinition(TOUR_CHAPTER_TASK_CREATE_SAVE, 'reopen-task')!;
    expect(
      correlateTourEvidence(
        reopen,
        {
          ...base,
          stepId: 'reopen-task',
          type: 'entity_opened',
          entityId: 'task-1',
          recordLoaded: false,
        },
        {
          accountUserId: USER,
          workspaceId: WS,
          chapterId: TOUR_CHAPTER_TASK_CREATE_SAVE.id,
          definitionVersion: 1,
          runId: 'run-1',
          stepId: 'reopen-task',
          attemptId: 'att-1',
          expectedEntityId: 'task-1',
        }
      ).reason
    ).toBe('record_not_loaded');
  });

  it('uses deterministic practice IDs per entity role and scopes cleanup', () => {
    const noteA = getTourPracticeEntityId(WS, USER, 'tour.notes-library', 'note', 'primary');
    const noteB = getTourPracticeEntityId(WS, USER, 'tour.notes-library', 'note', 'primary');
    const noteOther = getTourPracticeEntityId(WS, USER, 'tour.notes-library', 'note', 'alt');
    expect(noteA).toBe(noteB);
    expect(noteA).not.toBe(noteOther);

    const state = validateTourProgressState({
      version: 1,
      migratedFromOnboardingV1: true,
      chapters: [
        {
          chapterId: 'tour.notes-library',
          definitionVersion: 1,
          contentVersion: 1,
          lifecycle: 'completed',
          currentStepId: null,
          runId: 'r1',
          updatedAt: '2026-10-27T12:00:00.000Z',
          practiceEntityIds: [noteA, 'user-owned-1'],
          practiceArtifacts: [
            createPracticeArtifact({
              entityId: noteA,
              entityType: 'note',
              chapterId: 'tour.notes-library',
              createdByTour: true,
              userOwned: false,
            }),
            createPracticeArtifact({
              entityId: 'user-owned-1',
              entityType: 'note',
              chapterId: 'tour.notes-library',
              createdByTour: false,
              userOwned: true,
            }),
            createPracticeArtifact({
              entityId: 'edited-1',
              entityType: 'note',
              chapterId: 'tour.notes-library',
              createdByTour: true,
              userOwned: false,
              linkedOrEdited: true,
            }),
          ],
          steps: [],
        },
      ],
    });
    const review = buildTourCleanupReview(state);
    expect(review.some((r) => r.entityId === noteA)).toBe(true);
    expect(review.some((r) => r.entityId === 'user-owned-1')).toBe(false);
    expect(review.find((r) => r.entityId === 'edited-1')?.defaultKeep).toBe(true);
    expect(validateCleanupSelection(review, ['user-owned-1']).ok).toBe(false);
  });

  it('does not fabricate completion of new everyday chapters from starter progress', () => {
    let state = getDefaultTourProgress();
    const started = applyTourControl(state, 'tour.task-create-save', 'start', {
      accountUserId: USER,
      workspaceId: WS,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    state = started.state;
    expect(state.chapters.find((c) => c.chapterId === 'tour.navigation')).toBeUndefined();
    const navStart = applyTourControl(state, 'tour.navigation', 'start', {
      accountUserId: USER,
      workspaceId: WS,
    });
    expect(navStart.ok).toBe(true);
    if (!navStart.ok) return;
    expect(navStart.chapter.lifecycle).toBe('active');
    expect(navStart.chapter.steps.every((s) => s.outcome === 'unfinished')).toBe(true);
  });

  it('rejects cross-attempt mutation evidence', () => {
    let state = getDefaultTourProgress();
    const started = applyTourControl(state, 'tour.tasks', 'start', {
      accountUserId: USER,
      workspaceId: WS,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    state = started.state;
    // skip intro
    const next = applyTourControl(state, 'tour.tasks', 'next', {
      accountUserId: USER,
      workspaceId: WS,
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    state = next.state;
    const ch = state.chapters.find((c) => c.chapterId === 'tour.tasks')!;
    const attempt = ch.steps.find((s) => s.stepId === ch.currentStepId)?.attemptId;
    const practiceId = getTourPracticeEntityId(WS, USER, 'tour.tasks', 'task', 'primary');
    const rejected = applyTourEvidence(
      state,
      'tour.tasks',
      {
        type: 'local_mutation_committed',
        at: new Date().toISOString(),
        accountUserId: USER,
        workspaceId: WS,
        chapterId: 'tour.tasks',
        definitionVersion: 1,
        runId: ch.runId!,
        stepId: ch.currentStepId!,
        attemptId: 'stale-attempt',
        entityId: practiceId,
        entityType: 'task',
        operationId: 'op-x',
        persistence: 'local',
      },
      { accountUserId: USER, workspaceId: WS, expectedPracticeEntityId: practiceId }
    );
    expect(rejected.ok).toBe(false);
    expect(attempt).toBeTruthy();
  });
});
