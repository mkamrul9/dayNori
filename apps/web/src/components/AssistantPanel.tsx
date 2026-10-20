'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  const client = useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<AiCitation[]>([]);
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
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
    if (!personalWorkspaceId || !question.trim()) return;
    const t = setTimeout(() => {
      void client
        .saveAssistantDraft({ workspaceId: personalWorkspaceId, draftQuestion: question })
        .catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, [client, personalWorkspaceId, question]);

  async function ask() {
    if (!personalWorkspaceId || !question.trim()) return;
    setBusy(true);
    setFeedback(null);
    setProposal(null);
    setCitations([]);
    try {
      const res = await client.askAssistant({
        workspaceId: personalWorkspaceId,
        question: question.trim(),
        allowSuggestProposal: true,
      });
      setAnswer(
        `[${res.data.label}] ${res.data.abstained ? '(insufficient context) ' : ''}${res.data.answer}`
      );
      setCitations(res.data.citations);
      setProposal(res.data.suggestedProposal);
      await refreshHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ask failed';
      const offline =
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? ' Offline — draft kept locally in the question field.'
          : '';
      setFeedback({
        severity: 'danger',
        message: `${msg}.${offline} Budget, consent, cancel, or provider unavailable states are returned by the server.`,
      });
    } finally {
      setBusy(false);
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
      setFeedback({
        severity: 'success',
        message: `Confirmed ${res.data.operation}. Receipt: ${JSON.stringify(res.data.executionReceipt)}`,
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
      setFeedback({ severity: 'info', message: 'Proposal cancelled — no write performed.' });
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Cancel failed',
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
        intelligence. Vault is never unlocked or retrieved. Writes require an explicit Confirm on a
        stored proposal; conversational “confirmed” text does nothing.
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
      <Button
        variant="primary"
        size="compact"
        themeMode={themeMode}
        disabled={busy || !personalWorkspaceId}
        onClick={() => void ask()}
      >
        Ask
      </Button>

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
          <p style={{ fontSize: 13, marginBottom: 4 }}>Referenced sources (rechecked on open):</p>
          <ul style={{ paddingLeft: 18, fontSize: 12 }}>
            {citations.map((c) => (
              <li key={`${c.itemId}-${c.revision}`}>
                <a href={`#item-${c.itemId}`}>
                  {c.kind} {c.itemId.slice(0, 8)}… r{c.revision}
                </a>
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
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Review proposed action</h3>
          <p style={{ fontSize: 13 }}>
            Operation: <strong>{proposal.operation}</strong>
            <br />
            Target: {proposal.targetItemId ?? '(new item)'}
            <br />
            Expires: {proposal.expiresAt}
          </p>
          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(proposal.payload, null, 2)}
          </pre>
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
          <h3 style={{ fontSize: 14 }}>Recent turns</h3>
          <ul style={{ paddingLeft: 18, fontSize: 12 }}>
            {history
              .filter((h) => h.question)
              .slice(0, 8)
              .map((h) => (
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
