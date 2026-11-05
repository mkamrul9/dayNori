import { describe, expect, it } from 'vitest';
import {
  TOUR_AVAILABLE_ADVANCED_CHAPTERS,
  TOUR_CHAPTER_DEFINITIONS,
  TOUR_GATED_CHAPTERS,
  TOUR_SAFE_TREATMENT_CHAPTERS,
  applyTourControl,
  applyTourEvidence,
  buildTourCleanupReview,
  correlateTourEvidence,
  createPracticeArtifact,
  getDefaultTourProgress,
  getStepDefinition,
  getTourChapterDefinition,
  getTourPracticeEntityId,
  isChapterGated,
  listRunnableTourChapterIds,
  listTourChaptersForLearningChapter,
  validateCleanupSelection,
  validateTourProgressState,
} from '@daynori/domain';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const WS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Phase 81 advanced tours catalog', () => {
  it('registers all available advanced, safe treatment, and dormant gated chapters', () => {
    const runnableIds = listRunnableTourChapterIds();

    // Available advanced chapters
    expect(runnableIds).toContain('tour.files-audio');
    expect(runnableIds).toContain('tour.expenses');
    expect(runnableIds).toContain('tour.custom-sections');
    expect(runnableIds).toContain('tour.offline-sync');
    expect(runnableIds).toContain('tour.trash-recovery');

    // Safe explanatory treatments
    expect(runnableIds).toContain('tour.account-deletion-safe');
    expect(runnableIds).toContain('tour.recovery-secrets-safe');
    expect(runnableIds).toContain('tour.billing-safe');
    expect(runnableIds).toContain('tour.sharing-safe');

    // Dormant capability-gated chapters must be excluded from runnable IDs
    expect(runnableIds).not.toContain('tour.reminders-gated');
    expect(runnableIds).not.toContain('tour.vault-gated');
    expect(runnableIds).not.toContain('tour.drive-gated');
    expect(runnableIds).not.toContain('tour.rooms-gated');
    expect(runnableIds).not.toContain('tour.billing-gated');
    expect(runnableIds).not.toContain('tour.assistant-gated');

    expect(TOUR_AVAILABLE_ADVANCED_CHAPTERS).toHaveLength(5);
    expect(TOUR_SAFE_TREATMENT_CHAPTERS).toHaveLength(4);
    expect(TOUR_GATED_CHAPTERS).toHaveLength(6);
    expect(TOUR_CHAPTER_DEFINITIONS.length).toBeGreaterThanOrEqual(25);
  });

  it('correctly classifies gated chapters with isChapterGated', () => {
    for (const gated of TOUR_GATED_CHAPTERS) {
      expect(isChapterGated(gated)).toBe(true);
    }
    for (const available of TOUR_AVAILABLE_ADVANCED_CHAPTERS) {
      expect(isChapterGated(available)).toBe(false);
    }
    for (const safe of TOUR_SAFE_TREATMENT_CHAPTERS) {
      expect(isChapterGated(safe)).toBe(false);
    }
  });

  it('fails closed when attempting to launch dormant capability-gated practice', () => {
    const state = getDefaultTourProgress();
    const ctx = { accountUserId: USER_A, workspaceId: WS_A };

    const vaultRes = applyTourControl(state, 'tour.vault-gated', 'start', ctx);
    expect(vaultRes.ok).toBe(false);
    if (!vaultRes.ok) {
      expect(vaultRes.code).toBe('feature_gated');
      expect(vaultRes.error).toMatch(/capability-gated.*fake live practice is prohibited/i);
    }

    const remindersRes = applyTourControl(state, 'tour.reminders-gated', 'start', ctx);
    expect(remindersRes.ok).toBe(false);
    if (!remindersRes.ok) {
      expect(remindersRes.code).toBe('feature_gated');
    }

    const assistantRes = applyTourControl(state, 'tour.assistant-gated', 'start', ctx);
    expect(assistantRes.ok).toBe(false);
    if (!assistantRes.ok) {
      expect(assistantRes.code).toBe('feature_gated');
    }
  });

  it('maps advanced learning chapters in Help to tour definitions', () => {
    const filesTours = listTourChaptersForLearningChapter('chapter.files-audio');
    expect(filesTours.map((t) => t.id)).toContain('tour.files-audio');

    const expensesTours = listTourChaptersForLearningChapter('chapter.expenses');
    expect(expensesTours.map((t) => t.id)).toContain('tour.expenses');

    const sectionsTours = listTourChaptersForLearningChapter('chapter.custom-sections');
    expect(sectionsTours.map((t) => t.id)).toContain('tour.custom-sections');

    const syncTours = listTourChaptersForLearningChapter('chapter.offline-sync');
    expect(syncTours.map((t) => t.id)).toContain('tour.offline-sync');

    const libraryTours = listTourChaptersForLearningChapter('chapter.notes-library');
    expect(libraryTours.map((t) => t.id)).toContain('tour.trash-recovery');

    const accountTours = listTourChaptersForLearningChapter('chapter.account-first-use');
    expect(accountTours.map((t) => t.id)).toContain('tour.account-deletion-safe');
    expect(accountTours.map((t) => t.id)).toContain('tour.recovery-secrets-safe');
  });

  it('correlates file attachment local mutation evidence and rejects target activation', () => {
    const chapter = getTourChapterDefinition('tour.files-audio')!;
    const saveStep = getStepDefinition(chapter, 'save-practice-file')!;
    const fileId = getTourPracticeEntityId(WS_A, USER_A, chapter.id, 'file');

    const baseEvent = {
      at: new Date().toISOString(),
      accountUserId: USER_A,
      workspaceId: WS_A,
      chapterId: chapter.id,
      definitionVersion: 1,
      runId: 'run-files',
      stepId: 'save-practice-file',
      attemptId: 'att-1',
    };

    const corrCtx = {
      accountUserId: USER_A,
      workspaceId: WS_A,
      chapterId: chapter.id,
      definitionVersion: 1,
      runId: 'run-files',
      stepId: 'save-practice-file',
      attemptId: 'att-1',
      expectedEntityId: fileId,
    };

    // Target activation alone must NOT complete save step
    const clickRes = correlateTourEvidence(
      saveStep,
      { ...baseEvent, type: 'target_activated', targetId: 'create.file.save' },
      corrCtx
    );
    expect(clickRes.accepted).toBe(false);

    // Correlated local mutation with operation ID must be accepted
    const saveRes = correlateTourEvidence(
      saveStep,
      {
        ...baseEvent,
        type: 'local_mutation_committed',
        persistence: 'local',
        entityType: 'file',
        entityId: fileId,
        operationId: 'op-file-save-1',
      },
      corrCtx
    );
    expect(saveRes.accepted).toBe(true);
  });

  it('correlates expense creation with exact entityType and currency receipt', () => {
    const chapter = getTourChapterDefinition('tour.expenses')!;
    const saveStep = getStepDefinition(chapter, 'save-practice-expense')!;
    const expenseId = getTourPracticeEntityId(WS_A, USER_A, chapter.id, 'expense');

    const corrCtx = {
      accountUserId: USER_A,
      workspaceId: WS_A,
      chapterId: chapter.id,
      definitionVersion: 1,
      runId: 'run-expense',
      stepId: 'save-practice-expense',
      attemptId: 'att-expense-1',
      expectedEntityId: expenseId,
    };

    const baseEvent = {
      at: new Date().toISOString(),
      accountUserId: USER_A,
      workspaceId: WS_A,
      chapterId: chapter.id,
      definitionVersion: 1,
      runId: 'run-expense',
      stepId: 'save-practice-expense',
      attemptId: 'att-expense-1',
    };

    // Wrong entity type (e.g. task instead of expense) is rejected
    const wrongEntityRes = correlateTourEvidence(
      saveStep,
      {
        ...baseEvent,
        type: 'local_mutation_committed',
        persistence: 'local',
        entityType: 'task',
        entityId: expenseId,
        operationId: 'op-wrong-1',
      },
      corrCtx
    );
    expect(wrongEntityRes.accepted).toBe(false);
    expect(wrongEntityRes.reason).toBe('wrong_entity');

    // Correct expense entity mutation is accepted
    const validRes = correlateTourEvidence(
      saveStep,
      {
        ...baseEvent,
        type: 'local_mutation_committed',
        persistence: 'local',
        entityType: 'expense',
        entityId: expenseId,
        operationId: 'op-expense-1',
      },
      corrCtx
    );
    expect(validRes.accepted).toBe(true);
  });

  it('exercises trash and recovery step correlation', () => {
    const chapter = getTourChapterDefinition('tour.trash-recovery')!;
    const moveTrashStep = getStepDefinition(chapter, 'move-to-trash')!;
    const restoreStep = getStepDefinition(chapter, 'restore-practice-note')!;
    const noteId = getTourPracticeEntityId(WS_A, USER_A, chapter.id, 'note');

    const moveCtx = {
      accountUserId: USER_A,
      workspaceId: WS_A,
      chapterId: chapter.id,
      definitionVersion: 1,
      runId: 'run-trash',
      stepId: 'move-to-trash',
      attemptId: 'att-trash-1',
      expectedEntityId: noteId,
    };

    const moveRes = correlateTourEvidence(
      moveTrashStep,
      {
        at: new Date().toISOString(),
        accountUserId: USER_A,
        workspaceId: WS_A,
        chapterId: chapter.id,
        definitionVersion: 1,
        runId: 'run-trash',
        stepId: 'move-to-trash',
        attemptId: 'att-trash-1',
        type: 'local_mutation_committed',
        persistence: 'local',
        entityType: 'note',
        entityId: noteId,
        operationId: 'op-trash-move',
      },
      moveCtx
    );
    expect(moveRes.accepted).toBe(true);

    const restoreCtx = {
      ...moveCtx,
      stepId: 'restore-practice-note',
      attemptId: 'att-trash-2',
    };

    const restoreRes = correlateTourEvidence(
      restoreStep,
      {
        at: new Date().toISOString(),
        accountUserId: USER_A,
        workspaceId: WS_A,
        chapterId: chapter.id,
        definitionVersion: 1,
        runId: 'run-trash',
        stepId: 'restore-practice-note',
        attemptId: 'att-trash-2',
        type: 'local_mutation_committed',
        persistence: 'local',
        entityType: 'note',
        entityId: noteId,
        operationId: 'op-trash-restore',
      },
      restoreCtx
    );
    expect(restoreRes.accepted).toBe(true);
  });

  it('guarantees safe explanatory treatments never call destructive APIs', () => {
    const safeChapters = [
      'tour.account-deletion-safe',
      'tour.recovery-secrets-safe',
      'tour.billing-safe',
      'tour.sharing-safe',
    ];

    for (const chapterId of safeChapters) {
      const def = getTourChapterDefinition(chapterId)!;
      expect(def).toBeDefined();
      expect(def.isSafeTreatment).toBe(true);

      // Verify that no step in safe treatments performs irreversible mutations
      for (const step of def.steps) {
        expect(step.completionPredicate).not.toBe('practice_task_saved_locally');
        expect(step.expectedAction).not.toBe('complete_practice_task');
        // Steps must be purely informational or navigation
        expect([
          'informational_acknowledged',
          'target_activated',
          'preference_changed',
        ]).toContain(step.completionPredicate);
      }
    }
  });

  it('enforces strict cross-workspace and cross-account isolation', () => {
    const chapter = getTourChapterDefinition('tour.offline-sync')!;
    const step = getStepDefinition(chapter, 'queue-offline-mutation')!;
    const taskId = getTourPracticeEntityId(WS_A, USER_A, chapter.id, 'task');

    const expectedCtx = {
      accountUserId: USER_A,
      workspaceId: WS_A,
      chapterId: chapter.id,
      definitionVersion: 1,
      runId: 'run-sync-1',
      stepId: 'queue-offline-mutation',
      attemptId: 'att-1',
      expectedEntityId: taskId,
    };

    // Event from different workspace is rejected
    const wrongWsRes = correlateTourEvidence(
      step,
      {
        at: new Date().toISOString(),
        accountUserId: USER_A,
        workspaceId: WS_B,
        chapterId: chapter.id,
        definitionVersion: 1,
        runId: 'run-sync-1',
        stepId: 'queue-offline-mutation',
        attemptId: 'att-1',
        type: 'local_mutation_committed',
        persistence: 'local',
        entityType: 'task',
        entityId: taskId,
        operationId: 'op-diff-ws',
      },
      expectedCtx
    );
    expect(wrongWsRes.accepted).toBe(false);
    expect(wrongWsRes.reason).toBe('wrong_workspace');

    // Event from different user account is rejected
    const wrongUserRes = correlateTourEvidence(
      step,
      {
        at: new Date().toISOString(),
        accountUserId: USER_B,
        workspaceId: WS_A,
        chapterId: chapter.id,
        definitionVersion: 1,
        runId: 'run-sync-1',
        stepId: 'queue-offline-mutation',
        attemptId: 'att-1',
        type: 'local_mutation_committed',
        persistence: 'local',
        entityType: 'task',
        entityId: taskId,
        operationId: 'op-diff-user',
      },
      expectedCtx
    );
    expect(wrongUserRes.accepted).toBe(false);
    expect(wrongUserRes.reason).toBe('wrong_account');
  });

  it('preserves user-owned and linked records during practice cleanup review', () => {
    let state = getDefaultTourProgress();
    const ctx = { accountUserId: USER_A, workspaceId: WS_A };

    const startRes = applyTourControl(state, 'tour.files-audio', 'start', ctx);
    expect(startRes.ok).toBe(true);
    if (!startRes.ok) return;
    state = startRes.state;

    const fileId = getTourPracticeEntityId(WS_A, USER_A, 'tour.files-audio', 'file');

    // Add practice artifact created by tour
    const artifact1 = createPracticeArtifact({
      entityId: fileId,
      entityType: 'file',
      chapterId: 'tour.files-audio',
      createdByTour: true,
      userOwned: false,
      creationOperationId: 'op-file-create-1',
    });

    // Add linked or edited practice artifact
    const linkedId = 'linked-practice-note-888';
    const artifact2 = createPracticeArtifact({
      entityId: linkedId,
      entityType: 'note',
      chapterId: 'tour.files-audio',
      createdByTour: true,
      userOwned: false,
      linkedOrEdited: true,
      creationOperationId: 'op-linked-1',
    });

    // Add user-owned existing item reused in tour (must never appear in cleanup candidates)
    const userOwnedId = 'user-personal-note-999';
    const artifact3 = createPracticeArtifact({
      entityId: userOwnedId,
      entityType: 'note',
      chapterId: 'tour.files-audio',
      createdByTour: false,
      userOwned: true,
    });

    state = {
      ...state,
      chapters: state.chapters.map((ch) =>
        ch.chapterId === 'tour.files-audio'
          ? {
              ...ch,
              practiceEntityIds: [fileId, linkedId, userOwnedId],
              practiceArtifacts: [artifact1, artifact2, artifact3],
            }
          : ch
      ),
    };

    const review = buildTourCleanupReview(state, { includeLinkedOrEdited: true });
    const tourItem = review.find((r) => r.entityId === fileId);
    const linkedItem = review.find((r) => r.entityId === linkedId);
    const userItem = review.find((r) => r.entityId === userOwnedId);

    expect(tourItem).toBeDefined();
    expect(tourItem?.defaultKeep).toBe(false); // Standalone practice item defaults to remove

    expect(linkedItem).toBeDefined();
    expect(linkedItem?.defaultKeep).toBe(true); // Linked/edited practice item defaults to keep

    expect(userItem).toBeUndefined(); // User-owned item is filtered out completely from deletion candidates

    // Validate that selection of an untracked record fails
    const invalidSel = validateCleanupSelection(review, ['non-existent-entity-id']);
    expect(invalidSel.ok).toBe(false);

    // Validate that selecting the tour practice file succeeds
    const validSel = validateCleanupSelection(review, [fileId]);
    expect(validSel.ok).toBe(true);
  });
});
