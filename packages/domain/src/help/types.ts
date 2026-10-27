/**
 * Shared Help catalog contracts (Phase 78).
 * Content is localization-ready via keys + default English text.
 * Restricted operator guidance must not live in this ordinary-user catalog.
 */

export type HelpPlatform = 'web' | 'installedPwa' | 'android' | 'iosNative';

export type HelpCapability =
  | 'core'
  | 'attachments'
  | 'audio'
  | 'reminders'
  | 'vault'
  | 'drive'
  | 'rooms'
  | 'billing'
  | 'assistant'
  | 'hostedPreviewLimited';

export interface LocalizedText {
  /** Stable message key for future catalogs (e.g. help.notes.write.title). */
  key: string;
  /** English default until a translated catalog is wired. */
  defaultText: string;
}

export interface HelpArticleStep {
  instruction: LocalizedText;
}

export interface HelpArticleFailure {
  symptom: LocalizedText;
  recovery: LocalizedText;
}

export interface HelpArticle {
  id: string;
  contentVersion: number;
  categoryId: string;
  title: LocalizedText;
  summary: LocalizedText;
  keywords: readonly string[];
  relatedActionIds: readonly string[];
  platforms: readonly HelpPlatform[];
  capabilities: readonly HelpCapability[];
  prerequisites: readonly LocalizedText[];
  steps: readonly HelpArticleStep[];
  expectedResult: LocalizedText;
  failures: readonly HelpArticleFailure[];
  platformDifferences?: LocalizedText;
  relatedArticleIds: readonly string[];
  learningChapterId?: string;
  /** Public essential recovery subset safe for Cache Storage / offline shell. */
  essentialOffline: boolean;
  /** When true, UI must explain gated/unavailable honestly. */
  gatedFeature?: boolean;
}

export interface HelpCategory {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  sortOrder: number;
}

export type LearningChapterState = 'available_replay' | 'coming_later' | 'gated_unavailable';

export interface LearningChapter {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  relatedArticleIds: readonly string[];
  /** Phase 79 tour engine target — not runnable in Phase 78. */
  state: LearningChapterState;
  stateExplanation: LocalizedText;
}

export interface HelpSearchHit {
  articleId: string;
  score: number;
  title: string;
  summary: string;
}

export interface HelpCatalogValidationIssue {
  code: string;
  message: string;
  subjectId?: string;
}
