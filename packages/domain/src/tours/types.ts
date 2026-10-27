/**
 * Action-verified tour engine contracts (Phase 79–80 / ADR 0079–0080).
 * Predicates are typed enums implemented in trusted code — never user scripts.
 */

export type TourPlatform = 'web' | 'installedPwa' | 'android' | 'iosNative';

export type TourStepKind = 'informational' | 'action';

export type TourEntityType =
  | 'task'
  | 'routine'
  | 'note'
  | 'journal_entry'
  | 'calendar_event'
  | 'folder'
  | 'preference';

/** Trusted completion predicates — evaluated by platform adapters / engine helpers. */
export type TourCompletionPredicate =
  | 'informational_acknowledged'
  | 'target_activated'
  | 'create_sheet_task_selected'
  | 'create_type_selected'
  | 'practice_task_saved_locally'
  | 'practice_task_visible_in_plan'
  | 'practice_task_opened'
  | 'practice_task_completed'
  | 'practice_task_completion_undone'
  | 'entity_saved_locally'
  | 'entity_opened'
  | 'entity_updated_locally'
  | 'occurrence_action_verified'
  | 'preference_changed'
  | 'search_result_opened'
  | 'help_article_opened'
  | 'help_return_to_editor'
  | 'filter_view_changed'
  | 'calendar_projection_opened'
  | 'cleanup_selection_confirmed';

export type TourExpectedAction =
  | 'acknowledge'
  | 'open_create'
  | 'select_task_type'
  | 'select_create_type'
  | 'save_practice_task'
  | 'reopen_practice_task'
  | 'complete_practice_task'
  | 'undo_practice_task_completion'
  | 'save_practice_entity'
  | 'open_practice_entity'
  | 'update_practice_entity'
  | 'occurrence_complete'
  | 'occurrence_skip'
  | 'occurrence_undo'
  | 'pin_module'
  | 'unpin_module'
  | 'hide_module'
  | 'restore_module'
  | 'hide_journal_tab'
  | 'apply_filter'
  | 'clear_filter'
  | 'open_search_result'
  | 'open_help_article'
  | 'return_from_help'
  | 'open_calendar_projection'
  | 'confirm_cleanup'
  | 'navigate_shell';

export type TourChapterLifecycle =
  | 'not_started'
  | 'active'
  | 'paused'
  | 'completed'
  | 'skipped'
  | 'blocked';

export type TourStepOutcome = 'completed' | 'skipped' | 'blocked' | 'unfinished';

export interface TourLocalizedText {
  key: string;
  defaultText: string;
}

export interface TourStepDefinition {
  id: string;
  kind: TourStepKind;
  title: TourLocalizedText;
  instruction: TourLocalizedText;
  route?: string;
  targetId?: string;
  expectedAction?: TourExpectedAction;
  completionPredicate: TourCompletionPredicate;
  recovery: TourLocalizedText;
  allowSkip: boolean;
  /** When true, Next may advance without verified action (informational only). */
  allowInformationalNext: boolean;
  /** Optional entity type for mutation predicates. */
  entityType?: TourEntityType;
  /** Optional create-sheet type (task|routine|note|journal). */
  createType?: string;
  troubleshootingArticleIds?: readonly string[];
}

export interface TourChapterDefinition {
  id: string;
  definitionVersion: number;
  contentVersion: number;
  title: TourLocalizedText;
  summary: TourLocalizedText;
  platforms: readonly TourPlatform[];
  featurePrerequisites: readonly string[];
  learningChapterId: string;
  steps: readonly TourStepDefinition[];
  /** When true, offered as short optional starter. */
  isStarter?: boolean;
  /** Coverage family tags for register mapping. */
  coverageFamilies?: readonly string[];
}

export interface TourStepRecord {
  stepId: string;
  outcome: TourStepOutcome;
  completedAt?: string | null;
  skippedAt?: string | null;
  operationId?: string | null;
  entityId?: string | null;
  attemptId?: string | null;
}

/**
 * Explicit practice provenance — title alone is never ownership proof.
 */
export interface TourPracticeArtifact {
  entityId: string;
  entityType: TourEntityType;
  chapterId: string;
  role: string;
  createdByTour: boolean;
  /** User opted to use an existing personal item — cleanup must not auto-delete. */
  userOwned: boolean;
  labeledPractice: boolean;
  linkedOrEdited: boolean;
  createdAt: string;
}

export interface TourChapterProgress {
  chapterId: string;
  definitionVersion: number;
  contentVersion: number;
  lifecycle: TourChapterLifecycle;
  currentStepId: string | null;
  runId: string | null;
  steps: TourStepRecord[];
  /** Legacy flat IDs — keep for Phase 79 compatibility; prefer practiceArtifacts. */
  practiceEntityIds: string[];
  practiceArtifacts?: TourPracticeArtifact[];
  updatedAt: string;
  blockedReason?: string | null;
}

/**
 * Workspace-scoped tour progress. No note/journal bodies, credentials, or media.
 */
export interface TourProgressState {
  version: 1;
  chapters: TourChapterProgress[];
  /** Legacy V1 onboarding migration marker — never fabricates new chapter completion. */
  migratedFromOnboardingV1: boolean;
  migratedAt?: string | null;
}

export interface TourEvidenceEvent {
  type:
    | 'informational_next'
    | 'target_activated'
    | 'create_type_selected'
    | 'local_mutation_committed'
    | 'entity_visible'
    | 'entity_opened'
    | 'entity_completed'
    | 'entity_completion_undone'
    | 'occurrence_action'
    | 'preference_changed'
    | 'search_result_opened'
    | 'help_article_opened'
    | 'help_return_to_editor'
    | 'filter_changed'
    | 'calendar_projection_opened'
    | 'cleanup_confirmed';
  at: string;
  accountUserId: string;
  workspaceId: string;
  chapterId: string;
  definitionVersion: number;
  runId: string;
  stepId: string;
  attemptId: string;
  expectedAction?: TourExpectedAction;
  operationId?: string;
  entityId?: string;
  entityType?: string;
  command?: string;
  targetId?: string;
  createType?: string;
  /** Explicit local-save vs cloud — never invent synchronized. */
  persistence?: 'local' | 'cloud';
  /** True when the editor actually loaded the canonical record. */
  recordLoaded?: boolean;
  preferenceKey?: string;
  preferenceValue?: string;
  occurrenceDate?: string;
  occurrenceAction?: 'complete' | 'skip' | 'undo';
  articleId?: string;
  filterId?: string;
  filterCleared?: boolean;
  cleanupEntityIds?: string[];
}

export type TourControl =
  | 'start'
  | 'pause'
  | 'resume'
  | 'back'
  | 'next'
  | 'skip_step'
  | 'skip_chapter'
  | 'restart_chapter'
  | 'exit';
