'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, Feedback } from '@daynori/ui-web';
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  HELP_COMMON_TASK_ARTICLE_IDS,
  HELP_TROUBLESHOOT_ARTICLE_IDS,
  articleSummary,
  articleTitle,
  findHelpArticle,
  getLearningChapters,
  resolveHelpText,
  searchCatalogHelp,
  type HelpArticle,
  type LearningChapter,
} from '@daynori/domain';
import { useShell } from '../../components/ShellContext';
import { useAuth } from '../../components/AuthContext';
import { isCorePreview } from '../../config/preview';
import {
  clearHelpReturnContext,
  readContinueLearning,
  readHelpReturnContext,
  saveContinueLearning,
} from '../../help/helpReturnContext';
import { useTourOptional, PROOF_LEARNING_CHAPTER_ID, PROOF_TOUR_CHAPTER_ID } from '../../tours/TourContext';

type HelpView = 'home' | 'article' | 'learn' | 'category';

function ArticleBody({ article, themeMode }: { article: HelpArticle; themeMode: 'light' | 'dark' }) {
  const palette = colors[themeMode];
  return (
    <div className="daynori-break">
      <h2
        style={{
          margin: '0 0 8px',
          fontSize: `${typography.webScale.sectionHeading}px`,
          color: palette.text.primary,
        }}
      >
        {articleTitle(article)}
      </h2>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: palette.text.secondary, lineHeight: 1.45 }}>
        {articleSummary(article)}
      </p>
      {article.gatedFeature ? (
        <div style={{ marginBottom: 12 }}>
          <Feedback
            severity="info"
            message="This feature may be unavailable or limited in your current build. Steps describe intended behavior when the capability is on."
            themeMode={themeMode}
          />
        </div>
      ) : null}
      {article.prerequisites.length > 0 ? (
        <>
          <h3 style={{ margin: '12px 0 6px', fontSize: 14, color: palette.text.primary }}>Prerequisites</h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: palette.text.secondary, fontSize: 13 }}>
            {article.prerequisites.map((p) => (
              <li key={p.key}>{resolveHelpText(p)}</li>
            ))}
          </ul>
        </>
      ) : null}
      <h3 style={{ margin: '12px 0 6px', fontSize: 14, color: palette.text.primary }}>Steps</h3>
      <ol style={{ margin: 0, paddingLeft: 18, color: palette.text.primary, fontSize: 14, lineHeight: 1.5 }}>
        {article.steps.map((s) => (
          <li key={s.instruction.key} style={{ marginBottom: 6 }}>
            {resolveHelpText(s.instruction)}
          </li>
        ))}
      </ol>
      <h3 style={{ margin: '12px 0 6px', fontSize: 14, color: palette.text.primary }}>Expected result</h3>
      <p style={{ margin: 0, fontSize: 14, color: palette.text.secondary, lineHeight: 1.45 }}>
        {resolveHelpText(article.expectedResult)}
      </p>
      {article.failures.length > 0 ? (
        <>
          <h3 style={{ margin: '12px 0 6px', fontSize: 14, color: palette.text.primary }}>
            If something goes wrong
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: palette.text.secondary }}>
            {article.failures.map((f) => (
              <li key={f.symptom.key} style={{ marginBottom: 8 }}>
                <strong style={{ color: palette.text.primary }}>{resolveHelpText(f.symptom)}:</strong>{' '}
                {resolveHelpText(f.recovery)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {article.platformDifferences ? (
        <>
          <h3 style={{ margin: '12px 0 6px', fontSize: 14, color: palette.text.primary }}>
            Platform differences
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: palette.text.secondary }}>
            {resolveHelpText(article.platformDifferences)}
          </p>
        </>
      ) : null}
    </div>
  );
}

function HelpPageInner() {
  const { themeMode, openModal } = useShell();
  const tour = useTourOptional();
  const { user, workspaceId } = useAuth();
  const palette = colors[themeMode];
  const router = useRouter();
  const searchParams = useSearchParams();
  const articleParam = searchParams.get('article');
  const categoryParam = searchParams.get('category');
  const viewParam = searchParams.get('view');

  const [query, setQuery] = useState('');
  const [view, setView] = useState<HelpView>('home');
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const chapters = useMemo(() => getLearningChapters(), []);
  const continueChapterId = readContinueLearning(user?.id);

  useEffect(() => {
    if (articleParam) {
      setActiveArticleId(articleParam);
      setView('article');
      return;
    }
    if (viewParam === 'learn') {
      setView('learn');
      return;
    }
    if (categoryParam) {
      setActiveCategoryId(categoryParam);
      setView('category');
      return;
    }
    setView('home');
    setActiveArticleId(null);
  }, [articleParam, categoryParam, viewParam]);

  const searchHits = useMemo(() => searchCatalogHelp(query), [query]);
  const activeArticle = findHelpArticle(activeArticleId);

  const openArticle = (id: string) => {
    router.push(`/help?article=${encodeURIComponent(id)}`);
  };

  const returnFromArticle = () => {
    const ctx = readHelpReturnContext(user?.id);
    clearHelpReturnContext();
    if (ctx && ctx.userId === user?.id && ctx.returnPath && ctx.returnPath !== '/help') {
      router.push(ctx.returnPath);
      return;
    }
    router.push('/help');
  };

  const shortcuts = [
    { key: '?', action: 'Open shortcuts' },
    { key: '/', action: 'Search' },
    { key: 'C', action: 'Create' },
    { key: 'T', action: 'Today' },
    { key: 'P', action: 'Plan' },
    { key: 'L', action: 'Library' },
    { key: 'J', action: 'Journal' },
    { key: ',', action: 'Settings' },
    { key: 'Esc', action: 'Close dialog' },
  ];

  return (
    <div className="daynori-page">
      <div style={{ marginBottom: `${spacing.base}px` }}>
        <h1
          className="daynori-break"
          style={{
            margin: 0,
            fontSize: `${typography.webScale.welcomeTitle}px`,
            fontWeight: 800,
            color: palette.text.primary,
          }}
        >
          Help
        </h1>
        <p
          className="daynori-break"
          style={{ margin: '4px 0 0 0', color: palette.text.secondary, fontSize: '14px' }}
        >
          Task-based instructions for Daynori. Search never looks inside your notes or journal.
        </p>
      </div>

      {view === 'article' && activeArticle ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <Card themeMode={themeMode}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <Button variant="secondary" size="compact" themeMode={themeMode} onClick={returnFromArticle}>
                Back
              </Button>
            </div>
            <ArticleBody article={activeArticle} themeMode={themeMode} />
            {activeArticle.relatedArticleIds.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, color: palette.text.primary }}>
                  Related articles
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {activeArticle.relatedArticleIds.map((id) => {
                    const related = findHelpArticle(id);
                    if (!related) return null;
                    return (
                      <Button
                        key={id}
                        variant="secondary"
                        size="compact"
                        themeMode={themeMode}
                        onClick={() => openArticle(id)}
                      >
                        {articleTitle(related)}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {view === 'learn' ? (
        <Card themeMode={themeMode}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <Button variant="secondary" size="compact" themeMode={themeMode} onClick={() => router.push('/help')}>
              Back to Help
            </Button>
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: `${typography.webScale.sectionHeading}px` }}>
            Learn the app
          </h2>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: palette.text.secondary }}>
            Chapters prepare for guided practice. Opening an article does not mark practice complete.
            Only chapters marked runnable use the action-verified tour engine; others stay coming later
            or gated.
          </p>
          {continueChapterId ? (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: palette.text.secondary }}>
              Continue learning: <strong>{continueChapterId}</strong>
            </p>
          ) : null}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {chapters.map((chapter: LearningChapter) => (
              <li
                key={chapter.id}
                style={{
                  padding: `${spacing.sm}px 0`,
                  borderBottom: `1px solid ${palette.border.subtle}`,
                }}
              >
                <strong style={{ color: palette.text.primary, display: 'block' }}>
                  {resolveHelpText(chapter.title)}
                </strong>
                <p style={{ margin: '4px 0', fontSize: 13, color: palette.text.secondary }}>
                  {resolveHelpText(chapter.summary)}
                </p>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: palette.text.secondary }}>
                  Status: {chapter.state.replace(/_/g, ' ')}. {resolveHelpText(chapter.stateExplanation)}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {chapter.state === 'runnable' ? (
                    <Button
                      variant="primary"
                      size="compact"
                      themeMode={themeMode}
                      id={
                        chapter.id === PROOF_LEARNING_CHAPTER_ID
                          ? 'help-start-tour-task-create-save'
                          : undefined
                      }
                      onClick={() => {
                        if (user?.id) saveContinueLearning(user.id, chapter.id);
                        void tour?.startChapter(
                          chapter.id === PROOF_LEARNING_CHAPTER_ID
                            ? PROOF_TOUR_CHAPTER_ID
                            : PROOF_TOUR_CHAPTER_ID
                        );
                        router.push('/');
                      }}
                    >
                      Start guided chapter
                    </Button>
                  ) : chapter.state === 'available_replay' ? (
                    <Button
                      variant="secondary"
                      size="compact"
                      themeMode={themeMode}
                      onClick={() => {
                        if (user?.id) saveContinueLearning(user.id, chapter.id);
                        openModal('onboarding-replay');
                      }}
                    >
                      Replay beginner guide
                    </Button>
                  ) : (
                    <span style={{ fontSize: 12, color: palette.text.secondary }}>
                      Guided practice unavailable
                    </span>
                  )}
                  {chapter.relatedArticleIds.map((aid) => {
                    const a = findHelpArticle(aid);
                    if (!a) return null;
                    return (
                      <Button
                        key={aid}
                        variant="secondary"
                        size="compact"
                        themeMode={themeMode}
                        onClick={() => {
                          if (user?.id) saveContinueLearning(user.id, chapter.id);
                          openArticle(aid);
                        }}
                      >
                        {articleTitle(a)}
                      </Button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {view === 'category' && activeCategoryId ? (
        <Card themeMode={themeMode}>
          <Button variant="secondary" size="compact" themeMode={themeMode} onClick={() => router.push('/help')}>
            Back to Help
          </Button>
          <h2 style={{ margin: '12px 0 8px', fontSize: `${typography.webScale.sectionHeading}px` }}>
            {HELP_CATEGORIES.find((c) => c.id === activeCategoryId)?.title.defaultText || 'Category'}
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {HELP_ARTICLES.filter((a) => a.categoryId === activeCategoryId).map((a) => (
              <li key={a.id} style={{ padding: '8px 0', borderBottom: `1px solid ${palette.border.subtle}` }}>
                <button
                  type="button"
                  onClick={() => openArticle(a.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: palette.brand.primary,
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {articleTitle(a)}
                </button>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: palette.text.secondary }}>
                  {articleSummary(a)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {view === 'home' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <Card themeMode={themeMode} className="daynori-break">
            <h2
              style={{
                margin: '0 0 8px 0',
                fontSize: `${typography.webScale.sectionHeading}px`,
                color: palette.text.primary,
              }}
            >
              Getting started
            </h2>
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: palette.text.secondary }}>
              Replay the short beginner guide anytime. It does not reset settings or duplicate samples.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button
                variant="secondary"
                size="compact"
                themeMode={themeMode}
                onClick={() => openModal('onboarding-replay')}
                id="help-replay-onboarding-btn"
              >
                Replay beginner guide
              </Button>
              <Button
                variant="secondary"
                size="compact"
                themeMode={themeMode}
                onClick={() => router.push('/help?view=learn')}
              >
                Learn the app
              </Button>
            </div>
          </Card>

          <Card themeMode={themeMode}>
            <label
              htmlFor="help-howto-search"
              style={{
                display: 'block',
                fontWeight: 700,
                fontSize: '14px',
                color: palette.text.primary,
                marginBottom: '8px',
              }}
            >
              Search how-to
            </label>
            <input
              id="help-howto-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. routine, sync, offline, expense"
              className="daynori-break"
              style={{
                width: '100%',
                minHeight: `${touchTargets.webMin}px`,
                boxSizing: 'border-box',
                padding: `0 ${spacing.sm}px`,
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
                background: palette.surface,
                color: palette.text.primary,
                fontSize: '14px',
                marginBottom: `${spacing.sm}px`,
              }}
            />
            {query.trim() ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {searchHits.map((hit) => (
                  <li
                    key={hit.articleId}
                    style={{
                      padding: `${spacing.sm}px 0`,
                      borderBottom: `1px solid ${palette.border.subtle}`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openArticle(hit.articleId)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: palette.brand.primary,
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      {hit.title}
                    </button>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: palette.text.secondary }}>
                      {hit.summary}
                    </p>
                  </li>
                ))}
                {searchHits.length === 0 ? (
                  <li style={{ fontSize: 13, color: palette.text.secondary }}>
                    No matching Help articles. Try another word, or browse categories below.
                  </li>
                ) : null}
              </ul>
            ) : (
              <>
                <h3 style={{ margin: '8px 0', fontSize: 14, color: palette.text.primary }}>Common tasks</h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {HELP_COMMON_TASK_ARTICLE_IDS.map((id) => {
                    const a = findHelpArticle(id);
                    if (!a) return null;
                    return (
                      <li key={id} style={{ padding: '8px 0', borderBottom: `1px solid ${palette.border.subtle}` }}>
                        <button
                          type="button"
                          onClick={() => openArticle(id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: palette.brand.primary,
                            fontWeight: 700,
                            fontSize: 14,
                          }}
                        >
                          {articleTitle(a)}
                        </button>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: palette.text.secondary }}>
                          {articleSummary(a)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Card>

          <Card themeMode={themeMode}>
            <h2 style={{ margin: '0 0 8px', fontSize: `${typography.webScale.sectionHeading}px` }}>
              Categories
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[...HELP_CATEGORIES]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((cat) => (
                  <Button
                    key={cat.id}
                    variant="secondary"
                    size="compact"
                    themeMode={themeMode}
                    onClick={() => router.push(`/help?category=${encodeURIComponent(cat.id)}`)}
                  >
                    {resolveHelpText(cat.title)}
                  </Button>
                ))}
            </div>
          </Card>

          <Card themeMode={themeMode}>
            <h2 style={{ margin: '0 0 8px', fontSize: `${typography.webScale.sectionHeading}px` }}>
              Troubleshoot
            </h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {HELP_TROUBLESHOOT_ARTICLE_IDS.map((id) => {
                const a = findHelpArticle(id);
                if (!a) return null;
                return (
                  <li key={id} style={{ padding: '6px 0' }}>
                    <button
                      type="button"
                      onClick={() => openArticle(id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: palette.brand.primary,
                        fontWeight: 600,
                        fontSize: 14,
                      }}
                    >
                      {articleTitle(a)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card themeMode={themeMode}>
            <h2 style={{ margin: '0 0 8px', fontSize: `${typography.webScale.sectionHeading}px` }}>
              Keyboard shortcuts
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${palette.border.strong}` }}>
                  <th style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>Key</th>
                  <th style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {shortcuts.map((row) => (
                  <tr key={row.key} style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                    <td style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>
                      <kbd
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: palette.surfaceRaised,
                          border: `1px solid ${palette.border.strong}`,
                          fontWeight: 700,
                        }}
                      >
                        {row.key}
                      </kbd>
                    </td>
                    <td className="daynori-break" style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>
                      {row.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: `${spacing.sm}px` }}>
              <Feedback
                severity="info"
                message="Shortcuts pause while you type in a field or note."
                themeMode={themeMode}
              />
            </div>
          </Card>

          <Card themeMode={themeMode}>
            <h2 style={{ margin: '0 0 8px', fontSize: `${typography.webScale.sectionHeading}px` }}>
              Need more help?
            </h2>
            <p className="daynori-break" style={{ margin: '0 0 12px', fontSize: 13, color: palette.text.secondary }}>
              See Support for troubleshooting and current contact status. No monitored inbox is invented here.
              {workspaceId ? null : null}
              {isCorePreview
                ? ' This free testing preview keeps uploads, live AI, rooms, and billing off.'
                : null}
            </p>
            <Button
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() => {
                window.location.href = '/support';
              }}
            >
              Open Support
            </Button>
          </Card>
        </div>
      ) : null}

      {view === 'article' && !activeArticle ? (
        <Card themeMode={themeMode}>
          <Feedback
            severity="warning"
            message="That Help article was not found or the link is outdated."
            themeMode={themeMode}
          />
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" size="compact" themeMode={themeMode} onClick={() => router.push('/help')}>
              Back to Help
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export default function HelpPage() {
  return (
    <Suspense fallback={<div className="daynori-page">Loading Help…</div>}>
      <HelpPageInner />
    </Suspense>
  );
}
