import type { TourChapterDefinition, TourEvidenceEvent, TourStepDefinition } from './types.js';

export type CorrelationRejectReason =
  | 'wrong_account'
  | 'wrong_workspace'
  | 'wrong_chapter'
  | 'wrong_definition_version'
  | 'wrong_run'
  | 'wrong_step'
  | 'wrong_attempt'
  | 'wrong_action'
  | 'wrong_entity'
  | 'wrong_target'
  | 'wrong_create_type'
  | 'cloud_required'
  | 'stale_or_unrelated';

export interface CorrelationContext {
  accountUserId: string;
  workspaceId: string;
  chapterId: string;
  definitionVersion: number;
  runId: string;
  stepId: string;
  attemptId: string;
  expectedEntityId?: string | null;
  practiceEntityIds?: string[];
}

export interface CorrelationResult {
  accepted: boolean;
  reason?: CorrelationRejectReason;
}

function matchesScope(event: TourEvidenceEvent, ctx: CorrelationContext): CorrelationResult {
  if (event.accountUserId !== ctx.accountUserId) {
    return { accepted: false, reason: 'wrong_account' };
  }
  if (event.workspaceId !== ctx.workspaceId) {
    return { accepted: false, reason: 'wrong_workspace' };
  }
  if (event.chapterId !== ctx.chapterId) {
    return { accepted: false, reason: 'wrong_chapter' };
  }
  if (event.definitionVersion !== ctx.definitionVersion) {
    return { accepted: false, reason: 'wrong_definition_version' };
  }
  if (event.runId !== ctx.runId) {
    return { accepted: false, reason: 'wrong_run' };
  }
  if (event.stepId !== ctx.stepId) {
    return { accepted: false, reason: 'wrong_step' };
  }
  if (event.attemptId !== ctx.attemptId) {
    return { accepted: false, reason: 'wrong_attempt' };
  }
  return { accepted: true };
}

/**
 * Returns whether an evidence event may complete the current step.
 * Tour correlation is never authorization — API membership remains authoritative.
 */
export function correlateTourEvidence(
  step: TourStepDefinition,
  event: TourEvidenceEvent,
  ctx: CorrelationContext
): CorrelationResult {
  const scope = matchesScope(event, ctx);
  if (!scope.accepted) return scope;

  switch (step.completionPredicate) {
    case 'informational_acknowledged':
      return event.type === 'informational_next'
        ? { accepted: true }
        : { accepted: false, reason: 'wrong_action' };

    case 'target_activated':
      if (event.type !== 'target_activated') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (step.targetId && event.targetId !== step.targetId) {
        return { accepted: false, reason: 'wrong_target' };
      }
      return { accepted: true };

    case 'create_sheet_task_selected':
      if (event.type !== 'create_type_selected') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (event.createType !== 'task') {
        return { accepted: false, reason: 'wrong_create_type' };
      }
      return { accepted: true };

    case 'practice_task_saved_locally': {
      if (event.type !== 'local_mutation_committed') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (event.entityType && event.entityType !== 'task') {
        return { accepted: false, reason: 'wrong_entity' };
      }
      if (event.persistence === 'cloud') {
        // Cloud ack is fine after local; local-save step requires local durability.
        // Accept cloud only if we also know a local commit happened — adapters should emit local.
        return { accepted: false, reason: 'cloud_required' };
      }
      const expected = ctx.expectedEntityId;
      if (expected && event.entityId && event.entityId !== expected) {
        return { accepted: false, reason: 'wrong_entity' };
      }
      if (
        !expected &&
        event.entityId &&
        ctx.practiceEntityIds &&
        ctx.practiceEntityIds.length > 0 &&
        !ctx.practiceEntityIds.includes(event.entityId)
      ) {
        // Unrelated existing item — reject.
        return { accepted: false, reason: 'wrong_entity' };
      }
      if (!event.operationId) {
        return { accepted: false, reason: 'stale_or_unrelated' };
      }
      return { accepted: true };
    }

    case 'practice_task_visible_in_plan':
      if (event.type !== 'entity_visible' && event.type !== 'target_activated') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (ctx.expectedEntityId && event.entityId && event.entityId !== ctx.expectedEntityId) {
        return { accepted: false, reason: 'wrong_entity' };
      }
      return { accepted: true };

    case 'practice_task_completed':
      if (event.type !== 'entity_completed' && event.type !== 'local_mutation_committed') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (ctx.expectedEntityId && event.entityId && event.entityId !== ctx.expectedEntityId) {
        return { accepted: false, reason: 'wrong_entity' };
      }
      return { accepted: true };

    case 'practice_task_completion_undone':
      if (event.type !== 'entity_completion_undone' && event.type !== 'local_mutation_committed') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (ctx.expectedEntityId && event.entityId && event.entityId !== ctx.expectedEntityId) {
        return { accepted: false, reason: 'wrong_entity' };
      }
      return { accepted: true };

    default:
      return { accepted: false, reason: 'stale_or_unrelated' };
  }
}

export function getStepDefinition(
  chapter: TourChapterDefinition,
  stepId: string
): TourStepDefinition | undefined {
  return chapter.steps.find((s) => s.id === stepId);
}
