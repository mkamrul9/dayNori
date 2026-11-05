import {
  createPracticeArtifact,
  getTourPracticeEntityId,
  getTourPracticeTaskId,
} from './practice.js';
import type {
  TourChapterProgress,
  TourEntityType,
  TourEvidenceEvent,
  TourStepDefinition,
} from './types.js';

export interface TourMutationResult {
  workspaceId: string;
  entityType: string;
  entityId: string;
  operationId: string;
  command: string;
  parentEntityId?: string;
  occurrenceDate?: string;
  occurrenceAction?: 'complete' | 'skip' | 'undo';
}

/** Project only command metadata from an actual durable commit, never UI clicks or field bodies. */
export function tourEvidenceForMutation(
  step: TourStepDefinition,
  chapter: TourChapterProgress,
  scope: { accountUserId: string; workspaceId: string },
  mutation: TourMutationResult
):
  | (Pick<TourEvidenceEvent, 'type' | 'entityId' | 'entityType' | 'operationId' | 'command'> &
      Partial<TourEvidenceEvent>)
  | null {
  if (mutation.workspaceId !== scope.workspaceId) return null;
  const command = mutation.command;
  const kind =
    mutation.entityType === 'todo'
      ? 'task'
      : mutation.entityType === 'journal'
        ? 'journal_entry'
        : mutation.entityType;
  const value: Partial<TourEvidenceEvent> = {
    entityId: mutation.entityId,
    entityType: kind,
    operationId: mutation.operationId,
    command,
    persistence: 'local',
    expectedAction: step.expectedAction,
  };
  let type: TourEvidenceEvent['type'];
  if (step.completionPredicate === 'practice_task_completed' && command === 'completeTask')
    type = 'entity_completed';
  else if (
    step.completionPredicate === 'practice_task_completion_undone' &&
    command === 'reopenTask'
  )
    type = 'entity_completion_undone';
  else if (
    step.completionPredicate === 'occurrence_action_verified' &&
    mutation.parentEntityId &&
    ((step.expectedAction === 'occurrence_complete' && command === 'completeOccurrence') ||
      (step.expectedAction === 'occurrence_undo' && command === 'reopenOccurrence'))
  ) {
    type = 'occurrence_action';
    value.entityId = mutation.parentEntityId;
    value.entityType = 'routine';
    value.occurrenceDate = mutation.occurrenceDate;
    value.occurrenceAction = mutation.occurrenceAction;
  } else if (
    (step.completionPredicate === 'practice_task_saved_locally' ||
      step.completionPredicate === 'entity_saved_locally') &&
    command.startsWith('create') &&
    (!step.entityType || step.entityType === kind)
  )
    type = 'local_mutation_committed';
  else if (
    step.completionPredicate === 'entity_updated_locally' &&
    command.startsWith('update') &&
    (!step.entityType || step.entityType === kind)
  )
    type = 'local_mutation_committed';
  else return null;

  if (chapter.practiceOptIn && command.startsWith('create')) {
    const expected =
      kind === 'task'
        ? getTourPracticeTaskId(scope.workspaceId, scope.accountUserId, chapter.chapterId)
        : getTourPracticeEntityId(
            scope.workspaceId,
            scope.accountUserId,
            chapter.chapterId,
            kind as TourEntityType
          );
    if (mutation.entityId === expected)
      value.practiceArtifact = createPracticeArtifact({
        entityId: mutation.entityId,
        entityType: kind as TourEntityType,
        chapterId: chapter.chapterId,
        createdByTour: true,
        userOwned: false,
        creationOperationId: mutation.operationId,
      });
  }
  return {
    ...value,
    type,
    entityId: value.entityId!,
    entityType: value.entityType!,
    operationId: mutation.operationId,
    command,
  };
}
