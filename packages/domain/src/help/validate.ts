import type {
  HelpArticle,
  HelpCatalogValidationIssue,
  HelpCategory,
  LearningChapter,
} from './types.js';

const PLATFORMS = new Set(['web', 'installedPwa', 'android', 'iosNative']);
const CAPABILITIES = new Set([
  'core',
  'attachments',
  'audio',
  'reminders',
  'vault',
  'drive',
  'rooms',
  'billing',
  'assistant',
  'hostedPreviewLimited',
]);

export function validateHelpCatalog(input: {
  articles: readonly HelpArticle[];
  categories: readonly HelpCategory[];
  chapters: readonly LearningChapter[];
  knownActionIds: readonly string[];
}): HelpCatalogValidationIssue[] {
  const issues: HelpCatalogValidationIssue[] = [];
  const articleIds = new Set<string>();
  const categoryIds = new Set(input.categories.map((c) => c.id));
  const chapterIds = new Set(input.chapters.map((c) => c.id));
  const knownActions = new Set(input.knownActionIds);
  const coveredActions = new Set<string>();

  for (const cat of input.categories) {
    if (!cat.id || !cat.title?.key || !cat.title.defaultText) {
      issues.push({ code: 'category_invalid', message: 'Invalid category', subjectId: cat.id });
    }
  }

  for (const article of input.articles) {
    if (!article.id || articleIds.has(article.id)) {
      issues.push({
        code: 'duplicate_or_missing_article_id',
        message: `Duplicate or missing article id: ${article.id}`,
        subjectId: article.id,
      });
      continue;
    }
    articleIds.add(article.id);

    if (!categoryIds.has(article.categoryId)) {
      issues.push({
        code: 'unknown_category',
        message: `Article ${article.id} references unknown category ${article.categoryId}`,
        subjectId: article.id,
      });
    }
    if (!article.title?.key || !article.title.defaultText) {
      issues.push({
        code: 'missing_title',
        message: `Article ${article.id} missing title`,
        subjectId: article.id,
      });
    }
    if (!article.steps?.length) {
      issues.push({
        code: 'missing_steps',
        message: `Article ${article.id} needs numbered steps`,
        subjectId: article.id,
      });
    }
    if (!article.relatedActionIds?.length) {
      issues.push({
        code: 'missing_actions',
        message: `Article ${article.id} maps no actions`,
        subjectId: article.id,
      });
    }
    for (const actionId of article.relatedActionIds || []) {
      if (!knownActions.has(actionId)) {
        issues.push({
          code: 'unknown_action',
          message: `Article ${article.id} references unknown action ${actionId}`,
          subjectId: article.id,
        });
      } else {
        coveredActions.add(actionId);
      }
    }
    for (const related of article.relatedArticleIds || []) {
      // Related may forward-reference; checked after full pass via second loop below.
      void related;
    }
    for (const platform of article.platforms || []) {
      if (!PLATFORMS.has(platform)) {
        issues.push({
          code: 'invalid_platform',
          message: `Article ${article.id} has invalid platform ${platform}`,
          subjectId: article.id,
        });
      }
    }
    for (const cap of article.capabilities || []) {
      if (!CAPABILITIES.has(cap)) {
        issues.push({
          code: 'invalid_capability',
          message: `Article ${article.id} has invalid capability ${cap}`,
          subjectId: article.id,
        });
      }
    }
    if (article.learningChapterId && !chapterIds.has(article.learningChapterId)) {
      issues.push({
        code: 'unknown_chapter',
        message: `Article ${article.id} references unknown chapter ${article.learningChapterId}`,
        subjectId: article.id,
      });
    }
  }

  for (const article of input.articles) {
    for (const related of article.relatedArticleIds || []) {
      if (!articleIds.has(related)) {
        issues.push({
          code: 'broken_related_article',
          message: `Article ${article.id} relatedArticleIds missing ${related}`,
          subjectId: article.id,
        });
      }
    }
  }

  for (const chapter of input.chapters) {
    if (!chapter.id || !chapter.title?.defaultText) {
      issues.push({
        code: 'invalid_chapter',
        message: `Invalid chapter ${chapter.id}`,
        subjectId: chapter.id,
      });
    }
    for (const aid of chapter.relatedArticleIds || []) {
      if (!articleIds.has(aid)) {
        issues.push({
          code: 'chapter_broken_article',
          message: `Chapter ${chapter.id} references missing article ${aid}`,
          subjectId: chapter.id,
        });
      }
    }
    // coming_later / gated must not pretend to be runnable practice
    if (chapter.state === 'available_replay') {
      /* beginner replay allowed */
    }
  }

  for (const actionId of knownActions) {
    if (!coveredActions.has(actionId)) {
      issues.push({
        code: 'uncovered_action',
        message: `Action ${actionId} has no Help article mapping`,
        subjectId: actionId,
      });
    }
  }

  return issues;
}

export function getArticleById(
  articles: readonly HelpArticle[],
  id: string | null | undefined
): HelpArticle | null {
  if (!id) return null;
  return articles.find((a) => a.id === id) ?? null;
}

export function listEssentialOfflineArticles(
  articles: readonly HelpArticle[]
): readonly HelpArticle[] {
  return articles.filter((a) => a.essentialOffline);
}
