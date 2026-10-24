'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { colors, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import { Button, Feedback, type FeedbackSeverity } from '@daynori/ui-web';
import type { AiCitation, AiProposal } from '@daynori/contracts';
import { createWebApiClient } from '../data/webApiClient';

export interface AssistantPanelProps {
  csrfToken: string | null;
  themeMode: ThemeMode;
  personalWorkspaceId: string | null;
}

/**
 * Phase 56 provisional local assistant — grounded answers + reviewable proposals.
 * Fake/gated provider only. Vault never accessed. Model text cannot confirm writes.
 */
export function AssistantPanel({
  csrfToken,
  themeMode,
  personalWorkspaceId,
}: AssistantPanelProps) {
  const palette = colors[themeMode];
  const router = useRouter();
  const client = useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<AiCitation[]>([]);
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const askAbortRef = useRef<AbortController | null>(null);
  const [history, setHistory] = useState<
    Array<{ id: string; question: string; answer: string; abstained: boolean }>
  >([]);

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
        }))
      );
    } catch {
      /* history optional when AI off */
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

  async function ask() {
    if (!personalWorkspaceId || !question.trim()) return;
    askAbortRef.current?.abort();
    const ac = new AbortController();
    askAbortRef.current = ac;
    setBusy(true);
    setFeedback(null);
    setProposal(null);
    setCitations([]);
    try {
      const res = await client.askAssistant(
        {
          workspaceId: personalWorkspaceId,
          question: question.trim(),
          allowSuggestProposal: true,
        },
        { signal: ac.signal }
      );
      if (ac.signal.aborted) {
        setFeedback({
          severity: 'info',
          message:
            'Ask cancelled. If the provider had already started, transmitted content cannot be recalled.',
        });
        return;
      }
      setAnswer(
        `[${res.data.label}] ${res.data.abstained ? '(insufficient context) ' : ''}${res.data.answer}`
      );
      setCitations(res.data.citations);
      setProposal(res.data.suggestedProposal);
      await refreshHistory();
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
  }

  function cancelAsk() {
    askAbortRef.current?.abort();
    setFeedback({
      severity: 'info',
      message: 'Cancel requested for in-flight ask. Closing a sheet is not the same as Cancel.',
    });
  }

  async function openCitation(c: AiCitation) {
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
      if (access.data.kind === 'task') {
        router.push(`/plan?targetId=${encodeURIComponent(c.itemId)}&targetType=task`);
      } else {
        router.push(`/library?noteId=${encodeURIComponent(c.itemId)}`);
      }
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Could not open source',
      });
    }
  }

  async function confirmProposal() {
    if (!proposal) return;
    setBusy(true);
    try {
      const res = await client.confirmAiProposal(proposal.id, {
        confirmationToken: proposal.confirmationToken,
      });
      setProposal(res.data);
      const receipt = res.data.executionReceipt;
      const id = receipt && typeof receipt['id'] === 'string' ? receipt['id'] : null;
      setFeedback({
        severity: 'success',
        message: id
          ? `Confirmed ${res.data.reviewSummary.headline}. Created/updated item ${id.slice(0, 8)}…`
          : `Confirmed ${res.data.reviewSummary.headline}.`,
      });
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Confirm failed',
      });
    } finally {
      setBusy(false);
    }
  }

  async function declineProposal() {
    if (!proposal) return;
    setBusy(true);
    try {
      await client.cancelAiProposal(proposal.id);
      setProposal(null);
      setFeedback({ severity: 'info', message: 'Proposal declined — no write performed.' });
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Decline failed',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2
        style={{
          margin: '0 0 4px 0',
          fontSize: `${typography.webScale.sectionHeading}px`,
          color: palette.text.primary,
        }}
      >
        Assistant (provisional local)
      </h2>
      <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: palette.text.secondary }}>
        Personal-workspace answers with source links. Fake/gated provider — not evaluated live
        intelligence. Vault is never unlocked. Writes require Confirm on a stored proposal.
      </p>

      {feedback ? (
        <div style={{ marginBottom: spacing.sm }}>
          <Feedback severity={feedback.severity} message={feedback.message} />
        </div>
      ) : null}

      <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }} htmlFor="assistant-q">
        Question (personal scope)
      </label>
      <textarea
        id="assistant-q"
        aria-label="Assistant question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        style={{ width: '100%', maxWidth: 560, padding: 8, marginBottom: spacing.sm }}
        placeholder='Ask about indexed notes, or "propose task: Buy milk"'
      />
      <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Button
          variant="primary"
          size="compact"
          themeMode={themeMode}
          disabled={busy || !personalWorkspaceId}
          onClick={() => void ask()}
        >
          Ask
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
      </div>

      {answer ? (
        <pre
          style={{
            marginTop: spacing.md,
            padding: spacing.sm,
            background: palette.surfaceRaised,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
          }}
          aria-live="polite"
        >
          {answer}
        </pre>
      ) : null}

      {citations.length > 0 ? (
        <div style={{ marginTop: spacing.sm }} aria-label="Authorized source links">
          <p style={{ fontSize: 13, marginBottom: 4 }}>Referenced sources (access rechecked):</p>
          <ul style={{ paddingLeft: 18, fontSize: 12 }}>
            {citations.map((c) => (
              <li key={`${c.itemId}-${c.revision}`}>
                <button
                  type="button"
                  onClick={() => void openCitation(c)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: palette.text.primary,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                  }}
                >
                  {c.kind} {c.itemId.slice(0, 8)}… r{c.revision}
                </button>
                {c.excerpt ? ` — ${c.excerpt.slice(0, 80)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {proposal && proposal.status === 'pending' ? (
        <div
          style={{
            marginTop: spacing.md,
            padding: spacing.md,
            border: `1px solid ${palette.border.subtle}`,
            maxWidth: 560,
          }}
          role="region"
          aria-label="Review proposed organizer action"
        >
          <h3 style={{ marginTop: 0, fontSize: 15 }}>{proposal.reviewSummary.headline}</h3>
          <p style={{ fontSize: 13 }}>
            Target: {proposal.reviewSummary.targetLabel}
            <br />
            {proposal.reviewSummary.before
              ? `Before: ${proposal.reviewSummary.before}`
              : 'Before: (new item)'}
            <br />
            After: {proposal.reviewSummary.after}
            <br />
            Expires: {new Date(proposal.expiresAt).toLocaleString()}
          </p>
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <Button
              variant="primary"
              size="compact"
              themeMode={themeMode}
              disabled={busy}
              onClick={() => void confirmProposal()}
            >
              Confirm create/update
            </Button>
            <Button
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              disabled={busy}
              onClick={() => void declineProposal()}
            >
              Decline
            </Button>
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div style={{ marginTop: spacing.lg }}>
          <h3 style={{ fontSize: 14 }}>Recent turns (current consent)</h3>
          <ul style={{ paddingLeft: 18, fontSize: 12 }}>
            {history.slice(0, 8).map((h) => (
              <li key={h.id}>
                Q: {h.question.slice(0, 80)}
                {h.abstained ? ' (abstained)' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
