import { createDeterministicUuid } from '../onboarding.js';
import { correlateTourEvidence, getStepDefinition } from './correlation.js';
import { getTourChapterDefinition } from './definitions.js';
import { createPracticeArtifact, upsertPracticeArtifact } from './practice.js';
import {
  emptyChapterProgress,
  findChapterProgress,
  TOUR_PROGRESS_MAX_PRACTICE_IDS,
  upsertChapterProgress,
} from './progress.js';
import type {
  TourChapterProgress,
  TourControl,
  TourEntityType,
  TourEvidenceEvent,
  TourProgressState,
  TourStepRecord,
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function newRunId(workspaceId: string, userId: string, chapterId: string): string {
  return createDeterministicUuid(
    'daynori-tour-run',
    `${workspaceId}:${userId}:${chapterId}:${Date.now()}`
  );
}

function newAttemptId(runId: string, stepId: string): string {
  return createDeterministicUuid('daynori-tour-attempt', `${runId}:${stepId}:${Date.now()}`);
}

function patchStep(
  chapter: TourChapterProgress,
  stepId: string,
  patch: Partial<TourStepRecord>
): TourChapterProgress {
  return {
    ...chapter,
    steps: chapter.steps.map((s) => (s.stepId === stepId ? { ...s, ...patch } : s)),
    updatedAt: nowIso(),
  };
}

function currentStepIndex(
  chapter: TourChapterProgress,
  defSteps: readonly { id: string }[]
): number {
  if (!chapter.currentStepId) return 0;
  const idx = defSteps.findIndex((s) => s.id === chapter.currentStepId);
  return idx >= 0 ? idx : 0;
}

export interface TourMachineContext {
  accountUserId: string;
  workspaceId: string;
  expectedPracticeEntityId?: string | null;
}

export type TourMachineResult =
  | { ok: true; state: TourProgressState; chapter: TourChapterProgress; message?: string }
  | { ok: false; state: TourProgressState; error: string; code?: string };

/**
 * Apply a tour control. Next cannot complete an unverified action step.
 */
export function applyTourControl(
  state: TourProgressState,
  chapterId: string,
  control: TourControl,
  ctx: TourMachineContext
): TourMachineResult {
  const def = getTourChapterDefinition(chapterId);
  if (!def) {
    return { ok: false, state, error: 'Unknown tour chapter.', code: 'unknown_chapter' };
  }

  let chapter = findChapterProgress(state, chapterId) ?? emptyChapterProgress(def);

  switch (control) {
    case 'start': {
      if (chapter.lifecycle === 'completed' || chapter.lifecycle === 'skipped') {
        // Restart semantics for explicit Start after finish — caller may use restart_chapter.
        return {
          ok: false,
          state,
          error: 'Chapter already finished. Use Restart chapter to replay without duplicating practice.',
          code: 'already_finished',
        };
      }
      const runId =
        chapter.runId || newRunId(ctx.workspaceId, ctx.accountUserId, chapterId);
      const firstUnfinished =
        chapter.steps.find((s) => s.outcome === 'unfinished' || s.outcome === 'blocked')?.stepId ??
        def.steps[0]?.id ??
        null;
      chapter = {
        ...chapter,
        lifecycle: 'active',
        runId,
        currentStepId: firstUnfinished,
        blockedReason: null,
        updatedAt: nowIso(),
      };
      if (chapter.currentStepId) {
        chapter = patchStep(chapter, chapter.currentStepId, {
          attemptId: newAttemptId(runId, chapter.currentStepId),
        });
      }
      return {
        ok: true,
        state: upsertChapterProgress(state, chapter),
        chapter,
      };
    }
    case 'pause': {
      if (chapter.lifecycle !== 'active') {
        return { ok: false, state, error: 'Nothing to pause.', code: 'not_active' };
      }
      chapter = { ...chapter, lifecycle: 'paused', updatedAt: nowIso() };
      return { ok: true, state: upsertChapterProgress(state, chapter), chapter };
    }
    case 'resume': {
      if (chapter.lifecycle !== 'paused' && chapter.lifecycle !== 'blocked') {
        return { ok: false, state, error: 'Nothing to resume.', code: 'not_paused' };
      }
      chapter = {
        ...chapter,
        lifecycle: 'active',
        blockedReason: null,
        updatedAt: nowIso(),
      };
      if (chapter.currentStepId && chapter.runId) {
        chapter = patchStep(chapter, chapter.currentStepId, {
          attemptId: newAttemptId(chapter.runId, chapter.currentStepId),
        });
      }
      return { ok: true, state: upsertChapterProgress(state, chapter), chapter };
    }
    case 'exit': {
      if (chapter.lifecycle === 'active') {
        chapter = { ...chapter, lifecycle: 'paused', updatedAt: nowIso() };
      }
      return {
        ok: true,
        state: upsertChapterProgress(state, chapter),
        chapter,
        message: 'Progress preserved.',
      };
    }
    case 'back': {
      const idx = currentStepIndex(chapter, def.steps);
      if (idx <= 0) {
        return { ok: true, state: upsertChapterProgress(state, chapter), chapter };
      }
      const prev = def.steps[idx - 1]!;
      chapter = {
        ...chapter,
        currentStepId: prev.id,
        lifecycle: chapter.lifecycle === 'not_started' ? 'active' : chapter.lifecycle,
        updatedAt: nowIso(),
      };
      if (chapter.runId) {
        chapter = patchStep(chapter, prev.id, {
          attemptId: newAttemptId(chapter.runId, prev.id),
          outcome:
            chapter.steps.find((s) => s.stepId === prev.id)?.outcome === 'completed'
              ? 'completed'
              : 'unfinished',
        });
      }
      return { ok: true, state: upsertChapterProgress(state, chapter), chapter };
    }
    case 'next': {
      const stepId = chapter.currentStepId;
      if (!stepId) {
        return { ok: false, state, error: 'No current step.', code: 'no_step' };
      }
      const stepDef = getStepDefinition(def, stepId);
      if (!stepDef) {
        return { ok: false, state, error: 'Unknown step.', code: 'unknown_step' };
      }
      if (stepDef.kind === 'action' && !stepDef.allowInformationalNext) {
        const record = chapter.steps.find((s) => s.stepId === stepId);
        if (record?.outcome !== 'completed' && record?.outcome !== 'skipped') {
          return {
            ok: false,
            state,
            error: 'Complete the highlighted action before Next. Next cannot fake success.',
            code: 'action_not_verified',
          };
        }
      }
      if (stepDef.kind === 'informational' && stepDef.allowInformationalNext) {
        chapter = patchStep(chapter, stepId, {
          outcome: 'completed',
          completedAt: nowIso(),
        });
      }
      return advanceToFollowingStep(state, chapter, def.steps.map((s) => s.id));
    }
    case 'skip_step': {
      const stepId = chapter.currentStepId;
      if (!stepId) {
        return { ok: false, state, error: 'No current step.', code: 'no_step' };
      }
      const stepDef = getStepDefinition(def, stepId);
      if (!stepDef?.allowSkip) {
        return {
          ok: false,
          state,
          error: 'This step cannot be skipped.',
          code: 'skip_forbidden',
        };
      }
      chapter = patchStep(chapter, stepId, {
        outcome: 'skipped',
        skippedAt: nowIso(),
      });
      return advanceToFollowingStep(state, chapter, def.steps.map((s) => s.id));
    }
    case 'skip_chapter': {
      chapter = {
        ...chapter,
        lifecycle: 'skipped',
        currentStepId: null,
        updatedAt: nowIso(),
      };
      return { ok: true, state: upsertChapterProgress(state, chapter), chapter };
    }
    case 'restart_chapter': {
      const preservedIds = chapter.practiceEntityIds;
      chapter = {
        ...emptyChapterProgress(def),
        practiceEntityIds: preservedIds,
        lifecycle: 'active',
        runId: newRunId(ctx.workspaceId, ctx.accountUserId, chapterId),
        currentStepId: def.steps[0]?.id ?? null,
      };
      if (chapter.currentStepId && chapter.runId) {
        chapter = patchStep(chapter, chapter.currentStepId, {
          attemptId: newAttemptId(chapter.runId, chapter.currentStepId),
        });
      }
      return {
        ok: true,
        state: upsertChapterProgress(state, chapter),
        chapter,
        message: 'Replay started without duplicating prior practice IDs.',
      };
    }
    default:
      return { ok: false, state, error: 'Unknown control.', code: 'unknown_control' };
  }
}

function advanceToFollowingStep(
  state: TourProgressState,
  chapter: TourChapterProgress,
  stepIds: string[]
): TourMachineResult {
  const idx = chapter.currentStepId ? stepIds.indexOf(chapter.currentStepId) : -1;
  const nextId = idx >= 0 && idx + 1 < stepIds.length ? stepIds[idx + 1]! : null;
  if (!nextId) {
    chapter = {
      ...chapter,
      lifecycle: 'completed',
      currentStepId: null,
      updatedAt: nowIso(),
    };
    return { ok: true, state: upsertChapterProgress(state, chapter), chapter };
  }
  chapter = {
    ...chapter,
    currentStepId: nextId,
    lifecycle: 'active',
    updatedAt: nowIso(),
  };
  if (chapter.runId) {
    chapter = patchStep(chapter, nextId, {
      attemptId: newAttemptId(chapter.runId, nextId),
    });
  }
  return { ok: true, state: upsertChapterProgress(state, chapter), chapter };
}

/**
 * Apply verified evidence. Rejects stale/cross-scope/unrelated events.
 * Persists operation/entity refs on the step before advancing.
 */
export function applyTourEvidence(
  state: TourProgressState,
  chapterId: string,
  event: TourEvidenceEvent,
  ctx: TourMachineContext
): TourMachineResult {
  const def = getTourChapterDefinition(chapterId);
  if (!def) {
    return { ok: false, state, error: 'Unknown tour chapter.', code: 'unknown_chapter' };
  }
  let chapter = findChapterProgress(state, chapterId);
  if (!chapter || chapter.lifecycle !== 'active') {
    return { ok: false, state, error: 'Chapter is not active.', code: 'not_active' };
  }
  if (!chapter.currentStepId || !chapter.runId) {
    return { ok: false, state, error: 'No active step/run.', code: 'no_step' };
  }
  const stepDef = getStepDefinition(def, chapter.currentStepId);
  if (!stepDef) {
    return { ok: false, state, error: 'Unknown step.', code: 'unknown_step' };
  }
  const stepRecord = chapter.steps.find((s) => s.stepId === chapter!.currentStepId);
  if (!stepRecord?.attemptId) {
    return { ok: false, state, error: 'Missing attempt correlation.', code: 'no_attempt' };
  }

  // Prefer explicit practice ID from the adapter; otherwise the entity recorded on a
  // prior completed save step for this chapter (never arbitrary first list entry alone).
  const savedEntityId =
    chapter.steps.find((s) => s.stepId === 'save-task' && s.outcome === 'completed')?.entityId ??
    null;
  const expectedEntityId =
    ctx.expectedPracticeEntityId ?? savedEntityId ?? chapter.practiceEntityIds[0] ?? null;

  const correlation = correlateTourEvidence(stepDef, event, {
    accountUserId: ctx.accountUserId,
    workspaceId: ctx.workspaceId,
    chapterId,
    definitionVersion: chapter.definitionVersion,
    runId: chapter.runId,
    stepId: chapter.currentStepId,
    attemptId: stepRecord.attemptId,
    expectedEntityId,
    practiceEntityIds: chapter.practiceEntityIds,
  });

  if (!correlation.accepted) {
    return {
      ok: false,
      state,
      error: `Evidence rejected (${correlation.reason}).`,
      code: correlation.reason,
    };
  }

  // Idempotent: already completed this step with same operation — resume without duplicate advance.
  if (
    stepRecord.outcome === 'completed' &&
    event.operationId &&
    stepRecord.operationId === event.operationId
  ) {
    return {
      ok: true,
      state,
      chapter,
      message: 'Resumed from matching persisted operation receipt.',
    };
  }

  const practiceIds = [...chapter.practiceEntityIds];
  if (event.entityId && !practiceIds.includes(event.entityId)) {
    practiceIds.push(event.entityId);
  }

  let artifacts = [...(chapter.practiceArtifacts ?? [])];
  if (event.entityId) {
    const entityType = (event.entityType as TourEntityType | undefined) ?? stepDef.entityType ?? 'task';
    artifacts = upsertPracticeArtifact(
      artifacts,
      createPracticeArtifact({
        entityId: event.entityId,
        entityType,
        chapterId,
        role: 'primary',
        createdByTour: true,
        userOwned: false,
        labeledPractice: true,
        linkedOrEdited: event.type === 'entity_opened' || event.type === 'local_mutation_committed'
          ? false
          : false,
      })
    );
  }

  chapter = patchStep(chapter, chapter.currentStepId, {
    outcome: 'completed',
    completedAt: nowIso(),
    operationId: event.operationId ?? stepRecord.operationId ?? null,
    entityId: event.entityId ?? stepRecord.entityId ?? null,
  });
  chapter = {
    ...chapter,
    practiceEntityIds: practiceIds.slice(0, TOUR_PROGRESS_MAX_PRACTICE_IDS),
    practiceArtifacts: artifacts,
  };

  return advanceToFollowingStep(state, chapter, def.steps.map((s) => s.id));
}

export function getActiveAttemptId(chapter: TourChapterProgress): string | null {
  if (!chapter.currentStepId) return null;
  return chapter.steps.find((s) => s.stepId === chapter.currentStepId)?.attemptId ?? null;
}
