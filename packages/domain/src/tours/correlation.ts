import type {
  TourChapterDefinition,
  TourEvidenceEvent,
  TourStepDefinition,
  TourPracticeArtifact,
} from './types.js';

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
  | 'record_not_loaded'
  | 'missing_operation'
  | 'wrong_occurrence'
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
  practiceArtifacts?: TourPracticeArtifact[];
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

function requireEntityMatch(
  event: TourEvidenceEvent,
  ctx: CorrelationContext
): CorrelationResult | null {
  const expected = ctx.expectedEntityId;
  if (!event.entityId || (expected && event.entityId !== expected)) {
    return { accepted: false, reason: 'wrong_entity' };
  }
  if (
    !expected &&
    event.entityId &&
    ctx.practiceEntityIds &&
    ctx.practiceEntityIds.length > 0 &&
    !ctx.practiceEntityIds.includes(event.entityId)
  ) {
    return { accepted: false, reason: 'wrong_entity' };
  }
  return null;
}

function requireLocalMutation(event: TourEvidenceEvent, entityType?: string): CorrelationResult {
  if (event.type !== 'local_mutation_committed') {
    return { accepted: false, reason: 'wrong_action' };
  }
  if (entityType && event.entityType !== entityType) {
    return { accepted: false, reason: 'wrong_entity' };
  }
  if (event.persistence !== 'local') {
    return { accepted: false, reason: 'cloud_required' };
  }
  if (!event.operationId || !event.entityId) {
    return { accepted: false, reason: 'missing_operation' };
  }
  return { accepted: true };
}

/**
 * Returns whether an evidence event may complete the current step.
 * Tour correlation is never authorization — API membership remains authoritative.
 * Target clicks prove activation only — never save/preference/completion success.
 */
export function correlateTourEvidence(
  step: TourStepDefinition,
  event: TourEvidenceEvent,
  ctx: CorrelationContext
): CorrelationResult {
  const scope = matchesScope(event, ctx);
  if (!scope.accepted) return scope;
  if (event.expectedAction && step.expectedAction && event.expectedAction !== step.expectedAction) {
    return { accepted: false, reason: 'wrong_action' };
  }
  if (event.type === 'practice_reused') {
    const owned = ctx.practiceArtifacts?.find(
      (a) =>
        a.entityId === event.entityId &&
        a.creationOperationId === event.operationId &&
        a.createdByTour &&
        !a.userOwned
    );
    return ['entity_saved_locally', 'practice_task_saved_locally'].includes(
      step.completionPredicate
    ) &&
      event.recordLoaded === true &&
      owned
      ? (requireEntityMatch(event, ctx) ?? { accepted: true })
      : { accepted: false, reason: 'stale_or_unrelated' };
  }

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
    case 'create_type_selected': {
      if (event.type !== 'create_type_selected') {
        return { accepted: false, reason: 'wrong_action' };
      }
      const want =
        step.createType ??
        (step.completionPredicate === 'create_sheet_task_selected' ? 'task' : undefined);
      if (want && event.createType !== want) {
        return { accepted: false, reason: 'wrong_create_type' };
      }
      return { accepted: true };
    }

    case 'practice_task_saved_locally': {
      const base = requireLocalMutation(event, 'task');
      if (!base.accepted) return base;
      return requireEntityMatch(event, ctx) ?? { accepted: true };
    }

    case 'entity_saved_locally':
    case 'entity_updated_locally': {
      const base = requireLocalMutation(event, step.entityType);
      if (!base.accepted) return base;
      return requireEntityMatch(event, ctx) ?? { accepted: true };
    }

    case 'practice_task_visible_in_plan':
      // Legacy Phase 79 predicate — prefer practice_task_opened / entity_opened.
      if (
        event.type !== 'entity_visible' &&
        event.type !== 'target_activated' &&
        event.type !== 'entity_opened'
      ) {
        return { accepted: false, reason: 'wrong_action' };
      }
      return requireEntityMatch(event, ctx) ?? { accepted: true };

    case 'practice_task_opened':
    case 'entity_opened':
    case 'calendar_projection_opened': {
      if (
        step.completionPredicate === 'calendar_projection_opened' &&
        event.type !== 'calendar_projection_opened'
      ) {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (
        event.type !== 'entity_opened' &&
        event.type !== 'calendar_projection_opened' &&
        !(step.completionPredicate === 'practice_task_opened' && event.type === 'entity_visible')
      ) {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (event.recordLoaded === false) {
        return { accepted: false, reason: 'record_not_loaded' };
      }
      // Require explicit loaded flag for reopen/edit steps (row visibility alone is insufficient).
      if (event.type === 'entity_opened' || event.type === 'calendar_projection_opened') {
        if (event.recordLoaded !== true) {
          return { accepted: false, reason: 'record_not_loaded' };
        }
      }
      return requireEntityMatch(event, ctx) ?? { accepted: true };
    }

    case 'practice_task_completed':
      if (event.type !== 'entity_completed' && event.type !== 'local_mutation_committed') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (!event.operationId) {
        return { accepted: false, reason: 'missing_operation' };
      }
      return requireEntityMatch(event, ctx) ?? { accepted: true };

    case 'practice_task_completion_undone':
      if (event.type !== 'entity_completion_undone' && event.type !== 'local_mutation_committed') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (!event.operationId) {
        return { accepted: false, reason: 'missing_operation' };
      }
      return requireEntityMatch(event, ctx) ?? { accepted: true };

    case 'occurrence_action_verified': {
      if (event.type !== 'occurrence_action' && event.type !== 'local_mutation_committed') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (!event.operationId) {
        return { accepted: false, reason: 'missing_operation' };
      }
      if (!event.occurrenceDate || !/^\d{4}-\d{2}-\d{2}$/.test(event.occurrenceDate)) {
        return { accepted: false, reason: 'wrong_occurrence' };
      }
      const wanted = step.expectedAction === 'occurrence_undo' ? 'undo' : 'complete';
      if (event.occurrenceAction !== wanted) {
        return { accepted: false, reason: 'wrong_occurrence' };
      }
      return requireEntityMatch(event, ctx) ?? { accepted: true };
    }

    case 'preference_changed':
      if (event.type !== 'preference_changed') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (
        !event.preferenceKey ||
        !Number.isInteger(event.preferenceRevision) ||
        event.preferenceRevision! < 0
      ) {
        return { accepted: false, reason: 'stale_or_unrelated' };
      }
      if (
        step.expectedAction === 'pin_module' &&
        event.preferenceKey !== 'featurePersonalization.pinnedFeatureIds'
      ) {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (
        step.expectedAction === 'hide_journal_tab' &&
        event.preferenceValue !== 'journal:hidden'
      ) {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (step.expectedAction === 'restore_module' && event.preferenceValue !== 'journal:visible') {
        return { accepted: false, reason: 'wrong_action' };
      }
      return { accepted: true };

    case 'search_result_opened':
      if (event.type !== 'search_result_opened') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (event.recordLoaded !== true) {
        return { accepted: false, reason: 'record_not_loaded' };
      }
      return requireEntityMatch(event, ctx) ?? { accepted: true };

    case 'help_article_opened':
      if (event.type !== 'help_article_opened') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (!event.articleId) {
        return { accepted: false, reason: 'stale_or_unrelated' };
      }
      return { accepted: true };

    case 'help_return_to_editor':
      if (event.type !== 'help_return_to_editor') {
        return { accepted: false, reason: 'wrong_action' };
      }
      return event.recordLoaded === true && event.draftPreserved === true
        ? { accepted: true }
        : { accepted: false, reason: 'record_not_loaded' };

    case 'filter_view_changed':
      if (event.type !== 'filter_changed') {
        return { accepted: false, reason: 'wrong_action' };
      }
      if (!event.filterId || (step.expectedAction === 'clear_filter' && !event.filterCleared)) {
        return { accepted: false, reason: 'stale_or_unrelated' };
      }
      return { accepted: true };

    case 'cleanup_selection_confirmed':
      if (event.type !== 'cleanup_confirmed') {
        return { accepted: false, reason: 'wrong_action' };
      }
      return Array.isArray(event.cleanupEntityIds)
        ? { accepted: true }
        : { accepted: false, reason: 'stale_or_unrelated' };

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
