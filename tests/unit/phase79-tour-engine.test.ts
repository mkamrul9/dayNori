import { describe, expect, it } from 'vitest';
import {
  TOUR_CHAPTER_TASK_CREATE_SAVE,
  applyTourControl,
  applyTourEvidence,
  correlateTourEvidence,
  ensureTourProgressMigrated,
  getDefaultTourProgress,
  getTourPracticeTaskId,
  mergeTourProgressStates,
  validateTourProgressState,
  getStepDefinition,
} from '@daynori/domain';

const USER = '11111111-1111-4111-8111-111111111111';
const WS = '22222222-2222-4222-8222-222222222222';
const CHAPTER = TOUR_CHAPTER_TASK_CREATE_SAVE.id;

describe('Phase 79 tour engine', () => {
  it('starts a chapter and refuses Next on unverified action steps', () => {
    let state = getDefaultTourProgress();
    const started = applyTourControl(state, CHAPTER, 'start', {
      accountUserId: USER,
      workspaceId: WS,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    state = started.state;
    expect(started.chapter.lifecycle).toBe('active');
    expect(started.chapter.currentStepId).toBe('intro');

    // Informational Next OK
    const nextIntro = applyTourControl(state, CHAPTER, 'next', {
      accountUserId: USER,
      workspaceId: WS,
    });
    expect(nextIntro.ok).toBe(true);
    if (!nextIntro.ok) return;
    state = nextIntro.state;
    expect(nextIntro.chapter.currentStepId).toBe('open-create');

    const blocked = applyTourControl(state, CHAPTER, 'next', {
      accountUserId: USER,
      workspaceId: WS,
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.code).toBe('action_not_verified');
  });

  it('rejects stale, cross-scope, and unrelated entity evidence', () => {
    let state = getDefaultTourProgress();
    const started = applyTourControl(state, CHAPTER, 'start', {
      accountUserId: USER,
      workspaceId: WS,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    state = started.state;
    // advance to save-task
    for (const _ of ['intro']) {
      const n = applyTourControl(state, CHAPTER, 'next', {
        accountUserId: USER,
        workspaceId: WS,
      });
      expect(n.ok).toBe(true);
      if (!n.ok) return;
      state = n.state;
    }
    // force position to save-task for correlation unit via skip of prior action steps
    for (const control of ['skip_step', 'skip_step'] as const) {
      const r = applyTourControl(state, CHAPTER, control, {
        accountUserId: USER,
        workspaceId: WS,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      state = r.state;
    }
    expect(state.chapters[0]?.currentStepId).toBe('save-task');
    const chapter = state.chapters[0]!;
    const attemptId = chapter.steps.find((s) => s.stepId === 'save-task')?.attemptId;
    expect(attemptId).toBeTruthy();
    const step = getStepDefinition(TOUR_CHAPTER_TASK_CREATE_SAVE, 'save-task')!;
    const practiceId = getTourPracticeTaskId(WS, USER, CHAPTER);

    const base = {
      type: 'local_mutation_committed' as const,
      at: new Date().toISOString(),
      accountUserId: USER,
      workspaceId: WS,
      chapterId: CHAPTER,
      definitionVersion: 1,
      runId: chapter.runId!,
      stepId: 'save-task',
      attemptId: attemptId!,
      entityId: practiceId,
      entityType: 'task',
      operationId: 'op_1',
      persistence: 'local' as const,
    };

    expect(
      correlateTourEvidence(step, { ...base, accountUserId: 'other' }, {
        accountUserId: USER,
        workspaceId: WS,
        chapterId: CHAPTER,
        definitionVersion: 1,
        runId: chapter.runId!,
        stepId: 'save-task',
        attemptId: attemptId!,
        expectedEntityId: practiceId,
      }).reason
    ).toBe('wrong_account');

    expect(
      correlateTourEvidence(step, { ...base, entityId: 'unrelated-task' }, {
        accountUserId: USER,
        workspaceId: WS,
        chapterId: CHAPTER,
        definitionVersion: 1,
        runId: chapter.runId!,
        stepId: 'save-task',
        attemptId: attemptId!,
        expectedEntityId: practiceId,
      }).reason
    ).toBe('wrong_entity');

    const applied = applyTourEvidence(state, CHAPTER, base, {
      accountUserId: USER,
      workspaceId: WS,
      expectedPracticeEntityId: practiceId,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.chapter.steps.find((s) => s.stepId === 'save-task')?.outcome).toBe(
      'completed'
    );
    expect(applied.chapter.steps.find((s) => s.stepId === 'save-task')?.operationId).toBe(
      'op_1'
    );
    expect(applied.chapter.currentStepId).toBe('reopen-task');

    // Duplicate same operation resumes without double-advance chaos
    const again = applyTourEvidence(applied.state, CHAPTER, base, {
      accountUserId: USER,
      workspaceId: WS,
      expectedPracticeEntityId: practiceId,
    });
    // After advance, save-task is no longer current — rejected as wrong_step / not matching
    expect(again.ok).toBe(false);
  });

  it('migrates V1 onboarding without fabricating tour chapter completion', () => {
    const migrated = ensureTourProgressMigrated({
      onboarding: {
        version: 1,
        step: 'completed',
        completed: true,
        skipped: false,
        selectedInterests: ['planning'],
        createdSampleItemIds: ['aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa'],
      },
      tourProgress: null,
    });
    expect(migrated.migratedFromOnboardingV1).toBe(true);
    const proof = migrated.chapters.find((c) => c.chapterId === CHAPTER);
    expect(proof).toBeUndefined();
    expect(migrated.chapters.every((c) => c.lifecycle !== 'completed')).toBe(true);
    const again = ensureTourProgressMigrated({
      onboarding: { version: 1, step: 'completed', completed: true, skipped: false, selectedInterests: [], createdSampleItemIds: [] },
      tourProgress: migrated,
    });
    expect(again.migratedAt).toBe(migrated.migratedAt);
  });

  it('merges concurrent progress without taking the largest step number as truth', () => {
    const a = validateTourProgressState({
      version: 1,
      migratedFromOnboardingV1: true,
      chapters: [
        {
          chapterId: CHAPTER,
          definitionVersion: 1,
          contentVersion: 1,
          lifecycle: 'active',
          currentStepId: 'open-create',
          runId: 'run-a',
          updatedAt: '2026-10-27T10:00:00.000Z',
          practiceEntityIds: [],
          steps: [
            { stepId: 'intro', outcome: 'completed', completedAt: '2026-10-27T10:00:00.000Z' },
            { stepId: 'open-create', outcome: 'unfinished' },
          ],
        },
      ],
    });
    const b = validateTourProgressState({
      version: 1,
      migratedFromOnboardingV1: true,
      chapters: [
        {
          chapterId: CHAPTER,
          definitionVersion: 1,
          contentVersion: 1,
          lifecycle: 'active',
          currentStepId: 'save-task',
          runId: 'run-b',
          updatedAt: '2026-10-27T09:00:00.000Z',
          practiceEntityIds: ['task-1'],
          steps: [
            { stepId: 'intro', outcome: 'completed' },
            { stepId: 'open-create', outcome: 'skipped', skippedAt: '2026-10-27T09:00:00.000Z' },
            { stepId: 'save-task', outcome: 'unfinished' },
          ],
        },
      ],
    });
    const merged = mergeTourProgressStates(a, b);
    const ch = merged.chapters[0]!;
    // Newer updatedAt wins position (a), while completed/skipped outcomes are unioned.
    expect(ch.currentStepId).toBe('open-create');
    expect(ch.steps.find((s) => s.stepId === 'intro')?.outcome).toBe('completed');
    expect(ch.steps.find((s) => s.stepId === 'open-create')?.outcome).toBe('skipped');
    expect(ch.practiceEntityIds).toContain('task-1');
  });

  it('preserves progress on pause/exit and practice IDs on restart', () => {
    let state = getDefaultTourProgress();
    const started = applyTourControl(state, CHAPTER, 'start', {
      accountUserId: USER,
      workspaceId: WS,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    state = started.state;
    state = upsertPractice(state, 'task-practice-1');
    const paused = applyTourControl(state, CHAPTER, 'pause', {
      accountUserId: USER,
      workspaceId: WS,
    });
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    const exited = applyTourControl(paused.state, CHAPTER, 'exit', {
      accountUserId: USER,
      workspaceId: WS,
    });
    expect(exited.ok).toBe(true);
    if (!exited.ok) return;
    expect(exited.chapter.lifecycle).toBe('paused');

    // Complete chapter then restart
    let ch = exited.chapter;
    ch = { ...ch, lifecycle: 'completed', practiceEntityIds: ['task-practice-1'] };
    state = { ...exited.state, chapters: [ch] };
    const restarted = applyTourControl(state, CHAPTER, 'restart_chapter', {
      accountUserId: USER,
      workspaceId: WS,
    });
    expect(restarted.ok).toBe(true);
    if (!restarted.ok) return;
    expect(restarted.chapter.lifecycle).toBe('active');
    expect(restarted.chapter.practiceEntityIds).toContain('task-practice-1');
    expect(restarted.chapter.steps.every((s) => s.outcome === 'unfinished')).toBe(true);
  });
});

function upsertPractice(state: ReturnType<typeof getDefaultTourProgress>, id: string) {
  const ch = state.chapters[0];
  if (!ch) return state;
  return {
    ...state,
    chapters: [{ ...ch, practiceEntityIds: [...ch.practiceEntityIds, id] }],
  };
}
