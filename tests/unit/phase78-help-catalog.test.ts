import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HELP_ARTICLES,
  HELP_COMMON_TASK_ARTICLE_IDS,
  findHelpArticle,
  getEssentialOfflineHelp,
  getLearningChapters,
  normalizeHelpQuery,
  searchCatalogHelp,
  validateAgainstActionIds,
} from '../../packages/domain/src/help/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Help catalog (Phase 78)', () => {
  const register = JSON.parse(
    fs.readFileSync(path.join(root, 'docs/roadmap/v2/function-register.json'), 'utf8')
  ) as { actions: Array<{ id: string }> };
  const actionIds = register.actions.map((a) => a.id);

  it('validates schema, references, and full action coverage', () => {
    const issues = validateAgainstActionIds(actionIds);
    expect(issues).toEqual([]);
    expect(HELP_ARTICLES.length).toBeGreaterThan(10);
    expect(actionIds.length).toBe(109);
  });

  it('keeps stable article IDs unique and findable', () => {
    const ids = HELP_ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findHelpArticle('help.tasks-vs-routines')?.title.defaultText).toMatch(/Tasks versus/);
    expect(findHelpArticle('help.missing-never')).toBeNull();
    expect(findHelpArticle('')).toBeNull();
  });

  it('searches instructional content and returns empty for no matches', () => {
    expect(normalizeHelpQuery('  Sync!!  ')).toBe('sync');
    const syncHits = searchCatalogHelp('saved on this device');
    expect(syncHits.some((h) => h.articleId === 'help.save-and-sync')).toBe(true);
    expect(searchCatalogHelp('zzzz-no-such-term-xyz')).toEqual([]);
    expect(searchCatalogHelp('')).toEqual([]);
  });

  it('exposes essential offline subset without private destinations', () => {
    const essential = getEssentialOfflineHelp();
    expect(essential.length).toBeGreaterThan(3);
    expect(essential.every((a) => a.essentialOffline)).toBe(true);
    for (const article of essential) {
      expect(article.steps.length).toBeGreaterThan(0);
      expect(JSON.stringify(article)).not.toMatch(/\/api\/|signedUrl|Bearer /i);
    }
  });

  it('Learn the app chapters stay honest about runnable state', () => {
    const chapters = getLearningChapters();
    expect(chapters.some((c) => c.state === 'coming_later')).toBe(true);
    expect(chapters.some((c) => c.state === 'available_replay')).toBe(true);
    expect(chapters.some((c) => c.id === 'chapter.task-create-save' && c.state === 'runnable')).toBe(
      true
    );
    expect(chapters.filter((c) => c.state === 'runnable').length).toBeGreaterThanOrEqual(5);
    expect(chapters.some((c) => c.state === 'gated_unavailable')).toBe(true);
    for (const chapter of chapters) {
      expect(chapter.stateExplanation.defaultText.length).toBeGreaterThan(10);
      expect(chapter.stateExplanation.defaultText.toLowerCase()).not.toMatch(
        /you completed practice|practice is complete/
      );
    }
  });

  it('common tasks reference real articles', () => {
    for (const id of HELP_COMMON_TASK_ARTICLE_IDS) {
      expect(findHelpArticle(id)).not.toBeNull();
    }
  });

  it('gated features are labeled and do not claim privileged operator runbooks', () => {
    const gated = HELP_ARTICLES.filter((a) => a.gatedFeature);
    expect(gated.length).toBeGreaterThan(5);
    const userFacing = HELP_ARTICLES.find((a) => a.id === 'help.developer-surfaces');
    expect(userFacing?.summary.defaultText.toLowerCase()).toMatch(/restricted|not ordinary/);
  });
});
