'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { colors, radii, spacing, touchTargets, typography, type ThemeMode } from '@daynori/design-tokens';
import { Button, Feedback, Icon, type FeedbackSeverity } from '@daynori/ui-web';
import type { AiCitation, AiSelectedSources } from '@daynori/contracts';
import {
  ASSISTANT_STARTER_SUGGESTIONS,
  sanitizeAssistantMarkdown,
  type StarterSuggestion,
} from '@daynori/domain';
import { createWebApiClient } from '../data/webApiClient';

export interface AssistantPanelProps {
  csrfToken: string | null;
  themeMode: ThemeMode;
  personalWorkspaceId: string | null;
  isOpen?: boolean;
  onClose?: () => void;
}

/**
 * Phase 92 — Grounded text assistant chat and contextual guidance.
 * Strict read-only guidance: zero automatic writes or proposal execution.
 * Real-time streaming transport, sanitized markdown, citation verification,
 * selected source toggles, and starter suggestion pills.
 */
export function AssistantPanel({
  csrfToken,
  themeMode,
  personalWorkspaceId,
  isOpen,
  onClose,
}: AssistantPanelProps) {
  if (isOpen === false) return null;

  const palette = colors[themeMode];
  const router = useRouter();
  const client = useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [citations, setCitations] = useState<AiCitation[]>([]);
  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [turnMeta, setTurnMeta] = useState<{
    turnId: string;
    providerMode: string;
    label: string;
    tokensReserved?: number;
    tokensSettled?: number;
  } | null>(null);

  const [selectedSources, setSelectedSources] = useState<AiSelectedSources>({
    help: true,
    notes: true,
    tasks: true,
    journal: true,
  });

  const [history, setHistory] = useState<
    Array<{ id: string; question: string; answer: string; abstained: boolean; createdAt: string }>
  >([]);

  const askAbortRef = useRef<AbortController | null>(null);

  const refreshHistory = useCallback(async () => {
    if (!personalWorkspaceId) return;
    try {
      const res = await client.listAssistantHistory(personalWorkspaceId);
      setHistory(
        res.data.map((t) => ({
          id: t.id,
          question: t.question,
          answer: t.answer,
          abstained: t.abstained,
          createdAt: t.createdAt,
        }))
      );
    } catch {
      /* history optional when AI disabled */
    }
  }, [client, personalWorkspaceId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (!personalWorkspaceId) {
      setQuestion('');
      setDraftReady(false);
      return;
    }
    let cancelled = false;
    void client
      .getAssistantDraft(personalWorkspaceId)
      .then((res) => {
        if (cancelled) return;
        if (res.data?.draftQuestion) setQuestion(res.data.draftQuestion);
        setDraftReady(true);
      })
      .catch(() => {
        if (!cancelled) setDraftReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client, personalWorkspaceId]);

  useEffect(() => {
    if (!personalWorkspaceId || !draftReady) return;
    const t = setTimeout(() => {
      if (!question.trim()) {
        void client
          .clearAssistantDraft({ workspaceId: personalWorkspaceId })
          .catch(() => undefined);
        return;
      }
      void client
        .saveAssistantDraft({ workspaceId: personalWorkspaceId, draftQuestion: question })
        .catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, [client, personalWorkspaceId, question, draftReady]);

  // Handle Escape key for slide-out drawer
  useEffect(() => {
    if (isOpen === undefined || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const ask = useCallback(
    async (overrideQuestion?: string) => {
      const q = (overrideQuestion ?? question).trim();
      if (!personalWorkspaceId || !q) return;

      askAbortRef.current?.abort();
      const ac = new AbortController();
      askAbortRef.current = ac;
      setBusy(true);
      setFeedback(null);
      setCitations([]);
      setStreamingText('');
      setAnswer(null);
      setTurnMeta(null);

      try {
        await client.streamAssistantAsk(
          {
            workspaceId: personalWorkspaceId,
            question: q,
            selectedSources,
          },
          {
            onEvent: (ev) => {
              if (ev.type === 'start') {
                setTurnMeta({
                  turnId: ev.turnId,
                  providerMode: ev.providerMode,
                  label: ev.label,
                });
              } else if (ev.type === 'context') {
                setCitations(ev.citations);
              } else if (ev.type === 'chunk') {
                setStreamingText((prev) => prev + ev.text);
              } else if (ev.type === 'done') {
                setAnswer(ev.answer);
                setStreamingText('');
                setCitations(ev.citations);
                setTurnMeta((prev) =>
                  prev
                    ? {
                        ...prev,
                        tokensReserved: ev.tokensReserved,
                        tokensSettled: ev.tokensSettled,
                      }
                    : null
                );
                void refreshHistory();
              } else if (ev.type === 'error') {
                setFeedback({
                  severity: 'danger',
                  message: `${ev.error.code}: ${ev.error.message}`,
                });
              }
            },
            onError: (err) => {
              if (ac.signal.aborted) {
                setFeedback({
                  severity: 'info',
                  message:
                    'Ask cancelled. Draft kept. Content already sent to a provider cannot be recalled.',
                });
              } else {
                setFeedback({
                  severity: 'danger',
                  message: err.message || 'Streaming ask failed',
                });
              }
            },
          },
          { signal: ac.signal }
        );
      } catch (err) {
        if (ac.signal.aborted) {
          setFeedback({
            severity: 'info',
            message:
              'Ask cancelled. Draft kept. Content already sent to a provider cannot be recalled.',
          });
        } else {
          setFeedback({
            severity: 'danger',
            message: err instanceof Error ? err.message : 'Ask failed',
          });
        }
      } finally {
        if (askAbortRef.current === ac) askAbortRef.current = null;
        setBusy(false);
      }
    },
    [client, personalWorkspaceId, question, selectedSources, refreshHistory]
  );

  const cancelAsk = useCallback(() => {
    askAbortRef.current?.abort();
    setFeedback({
      severity: 'info',
      message: 'Cancel requested for in-flight ask. Closing the drawer does not abort completed work.',
    });
  }, []);

  const openCitation = useCallback(
    async (c: AiCitation) => {
      if (!personalWorkspaceId) return;
      try {
        const access = await client.checkAiSourceAccess({
          workspaceId: personalWorkspaceId,
          itemId: c.itemId,
        });
        if (!access.data.accessible) {
          setFeedback({
            severity: 'danger',
            message: `Source unavailable (${access.data.reason ?? 'unknown'}). It may be deleted, vault-scoped, or no longer indexed.`,
          });
          return;
        }
        if (access.data.deepLink) {
          router.push(access.data.deepLink);
        } else if (c.itemId.startsWith('help:')) {
          const articleId = c.itemId.replace(/^help:/, '');
          router.push(`/help?article=${encodeURIComponent(articleId)}`);
        } else if (access.data.kind === 'task' || access.data.kind === 'todo') {
          router.push(`/plan?targetId=${encodeURIComponent(c.itemId)}&targetType=task`);
        } else if (access.data.kind === 'journal_entry' || access.data.kind === 'journal') {
          router.push(`/journal?entryId=${encodeURIComponent(c.itemId)}`);
        } else {
          router.push(`/library?noteId=${encodeURIComponent(c.itemId)}`);
        }
      } catch (err) {
        setFeedback({
          severity: 'danger',
          message: err instanceof Error ? err.message : 'Could not open source',
        });
      }
    },
    [client, personalWorkspaceId, router]
  );

  const deleteTurn = useCallback(
    async (turnId: string) => {
      if (!personalWorkspaceId) return;
      try {
        await client.deleteAssistantHistory({ workspaceId: personalWorkspaceId, turnId });
        setHistory((prev) => prev.filter((h) => h.id !== turnId));
        setFeedback({ severity: 'success', message: 'Turn deleted from assistant history.' });
      } catch (err) {
        setFeedback({ severity: 'danger', message: 'Failed to delete turn' });
      }
    },
    [client, personalWorkspaceId]
  );

  const clearHistory = useCallback(async () => {
    if (!personalWorkspaceId) return;
    try {
      await client.deleteAssistantHistory({ workspaceId: personalWorkspaceId });
      setHistory([]);
      setFeedback({ severity: 'success', message: 'Assistant history cleared.' });
    } catch (err) {
      setFeedback({ severity: 'danger', message: 'Failed to clear history' });
    }
  }, [client, personalWorkspaceId]);

  const sanitizedDisplay = useMemo(() => {
    const raw = streamingText || answer || '';
    return sanitizeAssistantMarkdown(raw);
  }, [streamingText, answer]);

  const isSlideOut = isOpen !== undefined;

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
        padding: isSlideOut ? `${spacing.base}px` : 0,
        overflowY: 'auto',
      }}
      data-testid="assistant-panel"
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: `${spacing.sm}px`,
          marginBottom: `${spacing.sm}px`,
        }}
      >
        <div>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
              display: 'flex',
              alignItems: 'center',
              gap: `${spacing.xs}px`,
            }}
          >
            <span aria-hidden="true">
              <Icon name="sparkle" />
            </span>
            Daynori Assistant
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: palette.text.secondary }}>
            Grounded text chat and contextual help. Strictly read-only guidance.
          </p>
        </div>
        {isSlideOut && onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assistant"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: `${touchTargets.webMin}px`,
              minHeight: `${touchTargets.webMin}px`,
              border: `1px solid ${palette.border.subtle}`,
              borderRadius: `${radii.sm}px`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            <span aria-hidden="true">
              <Icon name="x" size={16} />
            </span>
          </button>
        ) : null}
      </div>

      {/* Fail-closed Notice & Educational Links */}
      <div
        style={{
          padding: `${spacing.xs}px ${spacing.sm}px`,
          backgroundColor: palette.surfaceRaised,
          borderRadius: `${radii.sm}px`,
          marginBottom: `${spacing.sm}px`,
          fontSize: '12px',
          color: palette.text.secondary,
        }}
      >
        <span>Provisional local assistant. Production AI activation is gated under DEF-V2-008. </span>
        <a
          href="/help?article=assistant-optional"
          style={{ color: palette.action.primary, textDecoration: 'underline' }}
        >
          AI Privacy & FAQ
        </a>
      </div>

      {feedback ? (
        <div style={{ marginBottom: spacing.sm }}>
          <Feedback severity={feedback.severity} message={feedback.message} />
        </div>
      ) : null}

      {/* Selected Knowledge Sources Controls */}
      <div
        style={{
          marginBottom: `${spacing.sm}px`,
          padding: `${spacing.xs}px ${spacing.sm}px`,
          border: `1px solid ${palette.border.subtle}`,
          borderRadius: `${radii.sm}px`,
        }}
        aria-label="Selected knowledge sources"
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: palette.text.primary, display: 'block', marginBottom: '4px' }}>
          Knowledge Sources (only checked & authorized content is queried):
        </span>
        <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap', fontSize: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedSources.help !== false}
              onChange={(e) => setSelectedSources((prev) => ({ ...prev, help: e.target.checked }))}
            />
            Help & Guides
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedSources.notes !== false}
              onChange={(e) => setSelectedSources((prev) => ({ ...prev, notes: e.target.checked }))}
            />
            Notes
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedSources.tasks !== false}
              onChange={(e) => setSelectedSources((prev) => ({ ...prev, tasks: e.target.checked }))}
            />
            Tasks
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedSources.journal !== false}
              onChange={(e) => setSelectedSources((prev) => ({ ...prev, journal: e.target.checked }))}
            />
            Journal
          </label>
        </div>
      </div>

      {/* Contextual Starter Suggestions */}
      <div style={{ marginBottom: `${spacing.sm}px` }} aria-label="Contextual starter suggestions">
        <span style={{ fontSize: '12px', fontWeight: 600, color: palette.text.secondary, display: 'block', marginBottom: '4px' }}>
          Starter Suggestions:
        </span>
        <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}>
          {ASSISTANT_STARTER_SUGGESTIONS.slice(0, 4).map((s: StarterSuggestion) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setQuestion(s.question);
                void ask(s.question);
              }}
              disabled={busy || !personalWorkspaceId}
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '12px',
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surfaceRaised,
                color: palette.text.primary,
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input area */}
      <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }} htmlFor="assistant-q">
        Question (personal workspace scope)
      </label>
      <textarea
        id="assistant-q"
        aria-label="Assistant question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: `${spacing.sm}px`,
          marginBottom: `${spacing.sm}px`,
          borderRadius: `${radii.sm}px`,
          border: `1px solid ${palette.border.subtle}`,
          backgroundColor: palette.surface,
          color: palette.text.primary,
          fontSize: '13px',
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
        placeholder="Ask about your organizer items or Daynori features..."
      />

      <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap', marginBottom: `${spacing.sm}px` }}>
        <Button
          variant="primary"
          size="compact"
          themeMode={themeMode}
          disabled={busy || !personalWorkspaceId || !question.trim()}
          onClick={() => void ask()}
        >
          {busy ? 'Streaming...' : 'Ask'}
        </Button>
        <Button
          variant="secondary"
          size="compact"
          themeMode={themeMode}
          disabled={!busy}
          onClick={cancelAsk}
        >
          Cancel ask
        </Button>
        {answer && !busy ? (
          <Button
            variant="secondary"
            size="compact"
            themeMode={themeMode}
            onClick={() => void ask()}
          >
            Retry
          </Button>
        ) : null}
      </div>

      {/* Streaming or Final Output */}
      {sanitizedDisplay ? (
        <div
          style={{
            marginTop: `${spacing.sm}px`,
            padding: `${spacing.sm}px`,
            background: palette.surfaceRaised,
            borderRadius: `${radii.sm}px`,
            fontSize: '13px',
            lineHeight: '1.5',
            color: palette.text.primary,
            border: `1px solid ${palette.border.subtle}`,
          }}
          aria-live="polite"
        >
          {turnMeta ? (
            <div style={{ fontSize: '11px', color: palette.text.secondary, marginBottom: '6px' }}>
              [{turnMeta.label}] Provider: {turnMeta.providerMode}
              {turnMeta.tokensSettled ? ` • Tokens: ${turnMeta.tokensSettled}` : ''}
            </div>
          ) : null}
          <div style={{ whiteSpace: 'pre-wrap' }}>{sanitizedDisplay}</div>
        </div>
      ) : null}

      {/* Verified Citations with Deep Links */}
      {citations.length > 0 ? (
        <div style={{ marginTop: `${spacing.sm}px` }} aria-label="Authorized source links">
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: palette.text.primary }}>
            Referenced sources (access verified):
          </p>
          <ul style={{ paddingLeft: 18, fontSize: 12, margin: 0 }}>
            {citations.map((c) => (
              <li key={`${c.itemId}-${c.revision}`} style={{ marginBottom: '4px' }}>
                <button
                  type="button"
                  onClick={() => void openCitation(c)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: palette.action.primary,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                  }}
                >
                  {c.kind === 'help' ? `[Help Guide: ${c.itemId.replace(/^help:/, '')}]` : `[${c.kind} ${c.itemId.slice(0, 8)}… r${c.revision}]`}
                </button>
                {c.excerpt ? ` — ${c.excerpt.slice(0, 70)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* History section with turn deletion */}
      {history.length > 0 ? (
        <div style={{ marginTop: `${spacing.base}px`, borderTop: `1px solid ${palette.border.subtle}`, paddingTop: `${spacing.sm}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: palette.text.primary }}>
              Recent turns (current consent)
            </h3>
            <button
              type="button"
              onClick={() => void clearHistory()}
              style={{
                fontSize: '11px',
                color: palette.text.secondary,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Clear all
            </button>
          </div>
          <ul style={{ paddingLeft: 18, fontSize: 12, margin: 0 }}>
            {history.slice(0, 6).map((h) => (
              <li key={h.id} style={{ marginBottom: '4px' }}>
                <span>
                  Q: {h.question.slice(0, 60)}
                  {h.abstained ? ' (abstained)' : ''}
                </span>{' '}
                <button
                  type="button"
                  onClick={() => void deleteTurn(h.id)}
                  aria-label="Delete this turn"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: palette.text.secondary,
                    cursor: 'pointer',
                    fontSize: '11px',
                    marginLeft: '4px',
                    verticalAlign: 'middle',
                  }}
                >
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  if (!isSlideOut) {
    return content;
  }

  return (
    <>
      {/* Background click-away backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          zIndex: 999,
        }}
        aria-hidden="true"
      />
      {/* Slide-out desktop side panel */}
      <aside
        role="complementary"
        aria-label="Daynori Assistant"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(440px, 100vw)',
          backgroundColor: palette.surface,
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.18)',
          borderLeft: `1px solid ${palette.border.subtle}`,
          zIndex: 1000,
          boxSizing: 'border-box',
        }}
      >
        {content}
      </aside>
    </>
  );
}
