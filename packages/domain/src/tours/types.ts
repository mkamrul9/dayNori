/**
 * Action-verified tour engine contracts (Phase 79 / ADR 0079).
 * Predicates are typed enums implemented in trusted code — never user scripts.
 */

export type TourPlatform = 'web' | 'installedPwa' | 'android' | 'iosNative';

export type TourStepKind = 'informational' | 'action';

/** Trusted completion predicates — evaluated by platform adapters / engine helpers. */
export type TourCompletionPredicate =
  | 'informational_acknowledged'
  | 'target_activated'
  | 'create_sheet_task_selected'
  | 'practice_task_saved_locally'
  | 'practice_task_visible_in_plan'
  | 'practice_task_completed'
  | 'practice_task_completion_undone';

export type TourExpectedAction =
  | 'acknowledge'
  | 'open_create'
  | 'select_task_type'
  | 'save_practice_task'
  | 'reopen_practice_task'
  | 'complete_practice_task'
  | 'undo_practice_task_completion';

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

export interface TourChapterProgress {
  chapterId: string;
  definitionVersion: number;
  contentVersion: number;
  lifecycle: TourChapterLifecycle;
  currentStepId: string | null;
  runId: string | null;
  steps: TourStepRecord[];
  practiceEntityIds: string[];
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
    | 'entity_completed'
    | 'entity_completion_undone';
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
