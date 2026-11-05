import type { HelpArticle, HelpSearchHit } from './types.js';

/** Normalize Help query text — instructional search only (never private notes/journal). */
export function normalizeHelpQuery(raw: string): string {
  return String(raw || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function haystack(article: HelpArticle): string {
  const parts = [
    article.id,
    article.title.defaultText,
    article.summary.defaultText,
    ...article.keywords,
    ...article.steps.map((s) => s.instruction.defaultText),
    ...article.prerequisites.map((p) => p.defaultText),
    article.expectedResult.defaultText,
    ...article.failures.flatMap((f) => [f.symptom.defaultText, f.recovery.defaultText]),
    article.platformDifferences?.defaultText ?? '',
  ];
  return normalizeHelpQuery(parts.join(' '));
}

/**
 * Rank articles for instructional Help search.
 * Empty query returns []. Callers show categories/common tasks instead.
 */
export function searchHelpArticles(
  articles: readonly HelpArticle[],
  query: string,
  options?: { limit?: number; essentialOfflineOnly?: boolean }
): HelpSearchHit[] {
  const q = normalizeHelpQuery(query);
  if (!q) return [];
  const tokens = q.split(' ').filter(Boolean);
  const limit = options?.limit ?? 40;
  const pool = options?.essentialOfflineOnly
    ? articles.filter((a) => a.essentialOffline)
    : articles;

  const hits: HelpSearchHit[] = [];
  for (const article of pool) {
    const text = haystack(article);
    let score = 0;
    if (text.includes(q)) score += 10;
    for (const token of tokens) {
      if (article.id.includes(token)) score += 5;
      if (normalizeHelpQuery(article.title.defaultText).includes(token)) score += 4;
      if (article.keywords.some((k) => normalizeHelpQuery(k).includes(token))) score += 3;
      if (text.includes(token)) score += 1;
    }
    if (score > 0) {
      hits.push({
        articleId: article.id,
        score,
        title: article.title.defaultText,
        summary: article.summary.defaultText,
      });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.articleId.localeCompare(b.articleId));
  return hits.slice(0, limit);
}
