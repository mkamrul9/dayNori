'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CURRENT_AI_CONSENT_VERSION,
  CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
} from '@daynori/domain';
import { colors, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import { Button, Feedback, type FeedbackSeverity } from '@daynori/ui-web';
import type { AiConsentStatusResponse } from '@daynori/contracts';
import { createWebApiClient } from '../data/webApiClient';

export interface AiConsentHarnessProps {
  csrfToken: string | null;
  themeMode: ThemeMode;
  personalWorkspaceId: string | null;
}

/**
 * Phase 55 provisional local harness — consent, index one note/task, retrieve, disable/purge.
 * Not the Phase 56 assistant UI. Live provider calls remain server-gated and off by default.
 * Deleting local indexes does not recall content already sent to an external provider.
 */
export function AiConsentHarness({
  csrfToken,
  themeMode,
  personalWorkspaceId,
}: AiConsentHarnessProps) {
  const palette = colors[themeMode];
  const client = useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);
  const [status, setStatus] = useState<AiConsentStatusResponse['data'] | null>(null);
  const [itemId, setItemId] = useState('');
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [journalOptIn, setJournalOptIn] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await client.getAiConsentStatus();
      setStatus(res.data);
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'AI consent status unavailable',
      });
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function accept() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await client.acceptAiConsent({
        consentVersion: CURRENT_AI_CONSENT_VERSION,
        providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
        contentScope: { notes: true, tasks: true, journal: journalOptIn },
      });
      setStatus(res.data);
      setFeedback({
        severity: 'success',
        message: `AI enabled (generation ${res.data.consentGeneration}). Provider mode: ${res.data.providerMode}.`,
      });
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Accept failed',
      });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await client.disableAi({ purgeDerived: true });
      setStatus(res.data);
      setAnswer(null);
      setFeedback({
        severity: 'success',
        message:
          'AI disabled and local derived indexes purged. External provider copies (if any were ever sent) are not recalled by this action.',
      });
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Disable failed',
      });
    } finally {
      setBusy(false);
    }
  }

  async function indexSource() {
    if (!personalWorkspaceId || !itemId) {
      setFeedback({ severity: 'danger', message: 'Workspace and item id required' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await client.indexAiSource({
        workspaceId: personalWorkspaceId,
        itemId,
      });
      setFeedback({
        severity: res.data.indexed ? 'success' : 'warning',
        message: res.data.indexed
          ? `Indexed ${res.data.chunkCount} chunk(s)`
          : `Not indexed: ${res.data.reason ?? 'unknown'}`,
      });
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Index failed',
      });
    } finally {
      setBusy(false);
    }
  }

  async function retrieve() {
    if (!personalWorkspaceId || !query.trim()) {
      setFeedback({ severity: 'danger', message: 'Workspace and query required' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await client.retrieveAiAnswer({
        workspaceId: personalWorkspaceId,
        query: query.trim(),
      });
      setAnswer(
        `${res.data.abstained ? '[abstained] ' : ''}${res.data.answer}\n\ncitations: ${JSON.stringify(res.data.citations)}`
      );
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Retrieve failed',
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
        AI consent harness (provisional)
      </h2>
      <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: palette.text.secondary }}>
        Default-off personal-workspace retrieval only. Rooms/chat and vault stay excluded. This is
        not the organizer assistant (Phase 56). Live OpenAI calls require separate server
        authorization and are off by default.
      </p>
      <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: palette.text.secondary }}>
        Consent version: <code>{CURRENT_AI_CONSENT_VERSION}</code>
        <br />
        Provider disclosure: <code>{CURRENT_AI_PROVIDER_DISCLOSURE_VERSION}</code> — OpenAI API
        candidate; default no training on API data; ~30-day abuse monitoring retention unless ZDR
        (approval-only). See ADR 0052.
      </p>

      {feedback ? (
        <div style={{ marginBottom: spacing.sm }}>
          <Feedback severity={feedback.severity} message={feedback.message} />
        </div>
      ) : null}

      {status ? (
        <p style={{ fontSize: '13px', color: palette.text.primary }}>
          Enabled: {String(status.enabled)} · generation {status.consentGeneration} · mode{' '}
          {status.providerMode} · requiresAcceptance {String(status.requiresAcceptance)}
        </p>
      ) : null}

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: spacing.sm }}>
        <input
          type="checkbox"
          checked={journalOptIn}
          onChange={(e) => setJournalOptIn(e.target.checked)}
        />
        <span style={{ fontSize: '13px' }}>
          Explicit journal AI opt-in (ordinary journal visibility is not enough)
        </span>
      </label>

      <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md }}>
        <Button variant="primary" size="compact" themeMode={themeMode} disabled={busy} onClick={() => void accept()}>
          Accept current AI consent
        </Button>
        <Button variant="secondary" size="compact" themeMode={themeMode} disabled={busy} onClick={() => void disable()}>
          Disable AI + purge indexes
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, maxWidth: 480 }}>
        <input
          aria-label="Item id to index"
          placeholder="Personal note/task item UUID"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          style={{ padding: 8 }}
        />
        <Button variant="secondary" size="compact" themeMode={themeMode} disabled={busy} onClick={() => void indexSource()}>
          Index source
        </Button>
        <input
          aria-label="Retrieve query"
          placeholder="Question over indexed personal content"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: 8 }}
        />
        <Button variant="secondary" size="compact" themeMode={themeMode} disabled={busy} onClick={() => void retrieve()}>
          Retrieve (bounded)
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
        >
          {answer}
        </pre>
      ) : null}
    </div>
  );
}
