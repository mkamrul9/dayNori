import { describe, expect, it } from 'vitest';
import {
  applyTourControl,
  applyTourEvidence,
  buildTourCleanupReview,
  correlateTourEvidence,
  createPracticeArtifact,
  executeTourCleanup,
  getDefaultTourProgress,
  getStepDefinition,
  getTourChapterDefinition,
  validateTourProgressState,
  selectTourScope,
  storeTourScope,
  mergeTourProgressStates,
  type TourCleanupPort,
  type TourEvidenceEvent,
} from '@daynori/domain';

const scope = { accountUserId: 'actor-a', workspaceId: 'workspace-a' };
const ctx = {
  ...scope,
  chapterId: 'tour.routines',
  definitionVersion: 1,
  runId: 'run',
  stepId: 'occurrence',
  attemptId: 'attempt',
  expectedEntityId: 'routine-a',
};
const base: TourEvidenceEvent = {
  ...ctx,
  at: '2026-10-28T12:00:00Z',
  type: 'occurrence_action',
  entityId: 'routine-a',
  entityType: 'routine',
  operationId: 'operation-a',
  occurrenceDate: '2026-10-28',
  occurrenceAction: 'complete',
};

function cleanupState() {
  return validateTourProgressState({
    version: 1,
    chapters: [
      {
        chapterId: 'tour.notes-library',
        lifecycle: 'completed',
        steps: [],
        practiceEntityIds: ['note-a', 'note-b'],
        practiceArtifacts: ['note-a', 'note-b'].map((id) =>
          createPracticeArtifact({
            entityId: id,
            entityType: 'note',
            chapterId: 'tour.notes-library',
            createdByTour: true,
            userOwned: false,
            creationOperationId: `create-${id}`,
          })
        ),
      },
    ],
  });
}

function cleanupPort(overrides: Partial<TourCleanupPort> = {}): TourCleanupPort {
  return {
    workspaceId: scope.workspaceId,
    isScopeCurrent: () => true,
    load: async (item) => ({
      id: item.entityId,
      workspaceId: scope.workspaceId,
      linkedOrEdited: false,
      deleted: false,
    }),
    trash: async (item) => ({ operationId: `trash-${item.entityId}` }),
    verifyTrashed: async () => true,
    ...overrides,
  };
}

describe('Phase 80 durable results and cleanup safety', () => {
  it('preserves edited practice provenance on restart without inheriting an old completed run', () => {
    const state = cleanupState();
    const finished = state.chapters[0];
    finished.runId = 'old-run';
    finished.updatedAt = '2026-10-28T10:00:00Z';
    finished.practiceArtifacts![0].linkedOrEdited = true;
    const restarted = applyTourControl(state, finished.chapterId, 'restart_chapter', scope);
    expect(restarted.ok).toBe(true);
    if (!restarted.ok) return;
    expect(restarted.chapter.practiceArtifacts).toEqual(finished.practiceArtifacts);
    const merged = mergeTourProgressStates(restarted.state, state);
    expect(merged.chapters[0].runId).toBe(restarted.chapter.runId);
    expect(merged.chapters[0].lifecycle).toBe('active');
    expect(merged.chapters[0].steps.some((step) => step.outcome === 'completed')).toBe(false);
    expect(
      buildTourCleanupReview(merged).find((item) => item.entityId === 'note-a')?.defaultKeep
    ).toBe(true);
  });
  it('preserves server progress across two workspaces without hydrating the wrong scope', () => {
    const a = { ...cleanupState(), scope };
    const bScope = { accountUserId: scope.accountUserId, workspaceId: 'workspace-b' };
    const b = { ...getDefaultTourProgress(), scope: bScope };
    const stored = storeTourScope(b, a);
    expect(selectTourScope(stored, bScope).chapters).toEqual([]);
    expect(selectTourScope(stored, scope).chapters[0].practiceEntityIds).toEqual([
      'note-a',
      'note-b',
    ]);
    expect(selectTourScope(stored, { ...scope, accountUserId: 'another-actor' }).chapters).toEqual(
      []
    );
    expect(selectTourScope(cleanupState(), scope).chapters).toEqual([]);
    expect(selectTourScope(cleanupState(), scope, true).chapters).toHaveLength(1);
  });
  it('requires an occurrence date, action, entity, and durable operation', () => {
    const step = getStepDefinition(getTourChapterDefinition('tour.routines')!, 'occurrence')!;
    expect(correlateTourEvidence(step, base, ctx).accepted).toBe(true);
    for (const patch of [
      { entityId: undefined },
      { operationId: undefined },
      { occurrenceDate: undefined },
      { occurrenceAction: 'undo' as const },
      { entityId: 'another-routine' },
      { attemptId: 'old-attempt' },
    ]) {
      expect(correlateTourEvidence(step, { ...base, ...patch }, ctx).accepted).toBe(false);
    }
  });

  it('never converts a searched/opened personal item into cleanup-owned practice', () => {
    let state = getDefaultTourProgress();
    const start = applyTourControl(state, 'tour.journal', 'start', scope);
    if (!start.ok) throw new Error(start.error);
    state = start.state;
    const next = applyTourControl(state, 'tour.journal', 'next', scope);
    if (!next.ok) throw new Error(next.error);
    const ch = next.chapter;
    const result = applyTourEvidence(
      next.state,
      ch.chapterId,
      {
        at: '2026-10-28T12:00:00Z',
        ...scope,
        chapterId: ch.chapterId,
        definitionVersion: ch.definitionVersion,
        runId: ch.runId!,
        stepId: ch.currentStepId!,
        attemptId: ch.steps.find((s) => s.stepId === ch.currentStepId)!.attemptId!,
        type: 'local_mutation_committed',
        persistence: 'local',
        command: 'createJournalEntry',
        entityId: 'personal-entry',
        entityType: 'journal_entry',
        operationId: 'saved-personal-entry',
      },
      scope
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chapter.practiceEntityIds).toEqual([]);
    expect(buildTourCleanupReview(result.state)).toEqual([]);
  });

  it('forgets only successful deletions and retries failed candidates without deleting twice', async () => {
    const calls: string[] = [];
    const first = await executeTourCleanup(
      cleanupState(),
      ['note-a', 'note-b'],
      cleanupPort({
        trash: async (item) => {
          calls.push(item.entityId);
          if (item.entityId === 'note-b') throw new Error('offline');
          return { operationId: 'trash-a' };
        },
      })
    );
    expect(first.results.map((r) => r.status)).toEqual(['trashed', 'failed']);
    expect(first.state.chapters[0].practiceEntityIds).toEqual(['note-b']);
    const second = await executeTourCleanup(
      first.state,
      ['note-b'],
      cleanupPort({
        trash: async (item) => {
          calls.push(item.entityId);
          return { operationId: 'trash-b' };
        },
      })
    );
    expect(second.state.chapters[0].practiceEntityIds).toEqual([]);
    expect(calls).toEqual(['note-a', 'note-b', 'note-b']);
  });

  it('retains provenance when verification fails or the account changes', async () => {
    const state = cleanupState();
    const failed = await executeTourCleanup(
      state,
      ['note-a'],
      cleanupPort({ verifyTrashed: async () => false })
    );
    expect(failed.state.chapters[0].practiceEntityIds).toEqual(['note-a', 'note-b']);
    let current = true;
    const switched = await executeTourCleanup(
      state,
      ['note-a'],
      cleanupPort({
        isScopeCurrent: () => current,
        trash: async () => {
          current = false;
          return { operationId: 'trash-a' };
        },
      })
    );
    expect(switched.results[0].code).toBe('scope_changed');
    expect(switched.state.chapters[0].practiceEntityIds).toEqual(['note-a', 'note-b']);
  });

  it('rechecks current links/edits and rejects legacy ownership without a create receipt', async () => {
    const state = cleanupState();
    const protectedResult = await executeTourCleanup(
      state,
      ['note-a'],
      cleanupPort({
        load: async (item) => ({
          id: item.entityId,
          workspaceId: scope.workspaceId,
          linkedOrEdited: true,
          deleted: false,
        }),
      })
    );
    expect(protectedResult.results[0].code).toBe('protected_artifact');
    const artifact = state.chapters[0].practiceArtifacts![0];
    delete artifact.creationOperationId;
    await expect(executeTourCleanup(state, ['note-a'], cleanupPort())).rejects.toThrow(
      'protected_artifact'
    );
  });
});
