'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, radii, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import { Button, Feedback, type FeedbackSeverity } from '@daynori/ui-web';
import type { DriveConnection, DriveLinkedFile } from '@daynori/contracts';
import { createWebApiClient } from '../data/webApiClient';

export interface DriveConnectionsPanelProps {
  workspaceId: string;
  csrfToken: string | null;
  themeMode: ThemeMode;
}

/**
 * Accessible Google Drive connection settings (Phase 49 provisional).
 * Fake/harness fixtures are labeled; production Google remains fail-closed without config.
 */
export function DriveConnectionsPanel({
  workspaceId,
  csrfToken,
  themeMode,
}: DriveConnectionsPanelProps) {
  const palette = colors[themeMode];
  const client = useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);
  const [connection, setConnection] = useState<DriveConnection | null>(null);
  const [files, setFiles] = useState<DriveLinkedFile[]>([]);
  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [harnessCode, setHarnessCode] = useState('fake-ok');
  const [pendingIntent, setPendingIntent] = useState<{ intentId: string; state: string } | null>(
    null
  );

  const refresh = useCallback(async () => {
    try {
      const status = await client.getDriveConnection(workspaceId);
      setConnection(status.data);
      if (status.data.status === 'connected') {
        const listed = await client.listDriveLinkedFiles(workspaceId);
        setFiles(listed.data);
      } else {
        setFiles([]);
      }
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to load Drive connection',
      });
    }
  }, [client, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('drive') === 'connected') {
      setFeedback({ severity: 'success', message: 'Google Drive connected.' });
      void refresh();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('drive_error')) {
      setFeedback({
        severity: 'danger',
        message: `Drive connect failed: ${params.get('drive_error')}`,
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refresh]);

  const onConnect = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const started = await client.startDriveConnect(workspaceId, {
        platform: 'web',
        returnPath: '/settings',
      });
      const url = new URL(started.data.authorizationUrl);
      const state = url.searchParams.get('state') ?? '';
      setPendingIntent({ intentId: started.data.intentId, state });
      if (started.data.providerKind === 'fake') {
        setFeedback({
          severity: 'info',
          message:
            started.data.developmentHarnessHint ??
            'Fake Drive harness ready — complete with the labeled code below (not a Google account).',
        });
      } else {
        // Persist session-bound cookies, then redirect — codes are completed server-side.
        const prep = await fetch('/api/drive/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken ?? '',
          },
          body: JSON.stringify({
            workspaceId,
            intentId: started.data.intentId,
            returnPath: '/settings',
            authorizationUrl: started.data.authorizationUrl,
          }),
        });
        if (!prep.ok) {
          throw new Error('Failed to prepare Drive OAuth redirect');
        }
        window.location.assign(started.data.authorizationUrl);
      }
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Connect failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onCompleteHarness = async () => {
    if (!pendingIntent) return;
    setBusy(true);
    try {
      await client.completeDriveConnect(workspaceId, {
        intentId: pendingIntent.intentId,
        state: pendingIntent.state,
        code: harnessCode,
      });
      setPendingIntent(null);
      setFeedback({ severity: 'success', message: 'Fake Drive fixture connected (labeled).' });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Complete failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      const res = await client.disconnectDrive(workspaceId);
      setFeedback({ severity: 'info', message: res.data.message });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Disconnect failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onLinkReference = async () => {
    setBusy(true);
    try {
      if (connection?.isDevelopmentFixture) {
        // Labeled harness only — fake-harness-* IDs are verified by the fake provider, not fabricated Google IDs.
        await client.selectDriveFile(workspaceId, {
          providerFileId: 'fake-harness-selected-file',
          displayName: 'Harness selected file',
          mimeType: 'text/plain',
          linkMode: 'link_reference',
          isShortcut: false,
          isSharedDrive: false,
        });
        setFeedback({
          severity: 'info',
          message:
            'Linked labeled fake-harness selection (not Google Picker). Production uses Picker + provider metadata verification.',
        });
      } else {
        // Production: obtain short-lived picker token; caller must open Google Picker UI.
        const token = await client.getDrivePickerToken(workspaceId);
        setFeedback({
          severity: 'info',
          message: `Picker access token issued (expires ${token.data.expiresAt}). Open Google Picker with this token; selected IDs are verified server-side via provider metadata.`,
        });
        // Token is memory-only in the response; do not persist or log it.
        void token.data.accessToken;
      }
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Select failed',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="drive-connections-heading">
      <h2
        id="drive-connections-heading"
        style={{
          margin: '0 0 4px 0',
          fontSize: `${typography.webScale.sectionHeading}px`,
          color: palette.text.primary,
        }}
      >
        Google Drive (selected files)
      </h2>
      <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
        Optional connector for app-created or explicitly picked files under the narrow drive.file
        scope. Vault content is excluded. Disconnect removes tokens and cancels jobs; imported
        copies stay unless you delete them. Remote originals are not trashed by unlink.
      </p>

      {connection?.isDevelopmentFixture ? (
        <p role="status" style={{ color: palette.status.warning, fontWeight: 600 }}>
          Development fixture provider — not a real Google account.
        </p>
      ) : null}

      {feedback ? (
        <div style={{ marginTop: spacing.sm }}>
          <Feedback severity={feedback.severity} message={feedback.message} themeMode={themeMode} />
        </div>
      ) : null}

      <p style={{ color: palette.text.primary, marginTop: spacing.md }}>
        Status: <strong>{connection?.status ?? 'loading…'}</strong>
        {connection?.providerAccountEmail
          ? ` · Identity: ${connection.providerAccountEmail}`
          : ''}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        {connection?.status !== 'connected' ? (
          <Button
            type="button"
            variant="primary"
            size="compact"
            themeMode={themeMode}
            onClick={() => void onConnect()}
            disabled={busy}
          >
            Connect Drive
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() => void onLinkReference()}
              disabled={busy}
            >
              Link selected file
            </Button>
            <Button
              type="button"
              variant="subtle"
              size="compact"
              themeMode={themeMode}
              onClick={() => void onDisconnect()}
              disabled={busy}
            >
              Disconnect
            </Button>
          </>
        )}
      </div>

      {pendingIntent ? (
        <div
          style={{
            marginTop: spacing.md,
            padding: spacing.md,
            borderRadius: radii.card,
            border: `1px solid ${palette.border.subtle}`,
          }}
        >
          <label htmlFor="drive-harness-code" style={{ display: 'block', fontWeight: 600 }}>
            Fake harness authorization code
          </label>
          <input
            id="drive-harness-code"
            value={harnessCode}
            onChange={(e) => setHarnessCode(e.target.value)}
            style={{ marginTop: spacing.xs, width: '100%', maxWidth: 320 }}
          />
          <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              type="button"
              variant="primary"
              size="compact"
              themeMode={themeMode}
              onClick={() => void onCompleteHarness()}
              disabled={busy}
            >
              Complete fake consent
            </Button>
            <Button
              type="button"
              variant="subtle"
              size="compact"
              themeMode={themeMode}
              onClick={() => {
                setPendingIntent(null);
                setFeedback({ severity: 'info', message: 'Consent cancelled.' });
              }}
              disabled={busy}
            >
              Cancel consent
            </Button>
          </div>
        </div>
      ) : null}

      {files.length > 0 ? (
        <ul style={{ marginTop: spacing.md, paddingLeft: spacing.lg }}>
          {files.map((f) => (
            <li key={f.id} style={{ color: palette.text.secondary }}>
              {f.displayName} — {f.linkMode} — {f.availability}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
