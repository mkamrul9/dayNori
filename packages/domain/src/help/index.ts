export * from './types.js';
export * from './text.js';
export * from './search.js';
export * from './validate.js';
export * from './chapters.js';
export { HELP_ARTICLES, HELP_CATEGORIES } from './catalogData.js';

import { HELP_ARTICLES, HELP_CATEGORIES } from './catalogData.js';
import { LEARNING_CHAPTERS } from './chapters.js';
import { searchHelpArticles } from './search.js';
import {
  getArticleById,
  listEssentialOfflineArticles,
  validateHelpCatalog,
} from './validate.js';
import type { HelpArticle, HelpSearchHit, LearningChapter } from './types.js';
import { resolveHelpText } from './text.js';

export function getHelpCatalog() {
  return {
    articles: HELP_ARTICLES,
    categories: HELP_CATEGORIES,
    chapters: LEARNING_CHAPTERS,
  };
}

export function searchCatalogHelp(
  query: string,
  options?: { limit?: number; essentialOfflineOnly?: boolean }
): HelpSearchHit[] {
  return searchHelpArticles(HELP_ARTICLES, query, options);
}

export function findHelpArticle(id: string | null | undefined): HelpArticle | null {
  return getArticleById(HELP_ARTICLES, id);
}

export function getEssentialOfflineHelp(): readonly HelpArticle[] {
  return listEssentialOfflineArticles(HELP_ARTICLES);
}

export function getLearningChapters(): readonly LearningChapter[] {
  return LEARNING_CHAPTERS;
}

export function validateAgainstActionIds(knownActionIds: readonly string[]) {
  return validateHelpCatalog({
    articles: HELP_ARTICLES,
    categories: HELP_CATEGORIES,
    chapters: LEARNING_CHAPTERS,
    knownActionIds,
  });
}

/** Common-task shortlist for Help home (stable order). */
export const HELP_COMMON_TASK_ARTICLE_IDS: readonly string[] = [
  'help.welcome-and-sign-in',
  'help.tasks-vs-routines',
  'help.notes-and-library',
  'help.journal-privacy',
  'help.save-and-sync',
  'help.offline-reopen',
  'help.expenses',
  'help.files-upload',
  'help.reminders-and-install',
  'help.support-and-feedback',
] as const;

export const HELP_TROUBLESHOOT_ARTICLE_IDS: readonly string[] = [
  'help.save-and-sync',
  'help.offline-reopen',
  'help.files-upload',
  'help.audio-recording',
  'help.export-import',
  'help.reminders-and-install',
  'help.support-and-feedback',
] as const;

export function articleTitle(article: HelpArticle): string {
  return resolveHelpText(article.title);
}

export function articleSummary(article: HelpArticle): string {
  return resolveHelpText(article.summary);
}
