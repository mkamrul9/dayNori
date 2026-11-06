'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, radii, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import { Button, Feedback, type FeedbackSeverity } from '@daynori/ui-web';
import type { DriveConnection, DriveLinkedFile, DriveLinkMode } from '@daynori/contracts';
import { createWebApiClient } from '../data/webApiClient';

export interface DriveConnectionsPanelProps {
  workspaceId: string;
  csrfToken: string | null;
  themeMode: ThemeMode;
}

/**
 * Accessible Google Drive connection settings (Phase 87).
 * Supports narrow drive.file selected-file mode, imported copies vs provider references,
 * explicit progress, safe disconnect, and truthful unconfigured/revoked guidance.
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
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

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
      setFeedback({ severity: 'success', message: 'Google Drive connected successfully.' });
      void refresh();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('drive_error')) {
      const err = params.get('drive_error');
      const msg =
        err === 'unauthenticated_callback'
          ? 'Drive connection callback was unauthenticated. Please sign in and try again.'
          : err === 'missing_workspace_or_state'
            ? 'Drive connection missing state token or workspace context.'
            : err === 'consent_denied'
              ? 'Google Drive authorization was denied or cancelled.'
              : `Drive connection failed: ${err}`;
      setFeedback({ severity: 'danger', message: msg });
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
      setFeedback({ severity: 'success', message: 'Fake Drive fixture connected (labeled harness).' });
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

  const onSelectFile = async (mode: DriveLinkMode) => {
    setBusy(true);
    try {
      if (connection?.isDevelopmentFixture) {
        // Labeled harness only — fake-harness-* IDs are verified by the fake provider.
        const res = await client.selectDriveFile(workspaceId, {
          providerFileId: `fake-harness-${mode === 'import_copy' ? 'import' : 'selected'}-file`,
          displayName: mode === 'import_copy' ? 'Harness imported file' : 'Harness selected file',
          mimeType: 'text/plain',
          linkMode: mode,
          isShortcut: false,
          isSharedDrive: false,
        });
        const actionLabel =
          mode === 'import_copy'
            ? 'Import job queued for labeled fake-harness file'
            : 'Linked labeled fake-harness file reference';
        setFeedback({
          severity: 'info',
          message: `${actionLabel} (jobId: ${res.data.jobId ?? 'none'}). Production uses Google Picker + provider metadata verification.`,
        });
      } else {
        // Production: obtain short-lived picker access token for Google Picker UI.
        const token = await client.getDrivePickerToken(workspaceId);
        setFeedback({
          severity: 'info',
          message: `Picker access token issued (expires ${token.data.expiresAt}). Open Google Picker with this token; selected IDs are verified server-side under drive.file.`,
        });
        // Token is memory-only; never persist or log it.
        void token.data.accessToken;
      }
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Selection failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onUnlink = async (linkedFileId: string, displayName: string) => {
    setUnlinkingId(linkedFileId);
    try {
      await client.unlinkDriveFile(workspaceId, linkedFileId);
      setFeedback({
        severity: 'info',
        message: `Unlinked "${displayName}". Remote Google Drive original was not deleted.`,
      });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to unlink file',
      });
    } finally {
      setUnlinkingId(null);
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
        Optional connector for app-created or explicitly picked files under the narrow{' '}
        <code>https://www.googleapis.com/auth/drive.file</code> scope. Vault content is strictly
        excluded. Disconnect removes stored tokens and cancels pending jobs; imported copies stay in
        Daynori unless deleted. Remote Drive originals are never deleted by unlink or disconnect.
      </p>

      {/* Copy versus Reference Explanation Card */}
      <div
        style={{
          padding: spacing.md,
          borderRadius: radii.card,
          backgroundColor: palette.surface,
          border: `1px solid ${palette.border.subtle}`,
          marginBottom: spacing.md,
          fontSize: '13px',
          color: palette.text.secondary,
        }}
      >
        <p style={{ margin: '0 0 6px 0', fontWeight: 600, color: palette.text.primary }}>
          Understanding Supported Link Modes:
        </p>
        <ul style={{ margin: '0 0 8px 0', paddingLeft: spacing.lg, lineHeight: 1.5 }}>
          <li>
            <strong>Provider Reference:</strong> Keeps the file in your Google Drive. Accessible
            online; does not consume Daynori storage. If deleted or unshared in Google Drive, status
            reflects <em>source unavailable</em> or <em>permission lost</em>.
          </li>
          <li>
            <strong>Imported Copy:</strong> Downloads file bytes into private Daynori storage. Scanned
            for security on ingest; available offline once cached. Remains in Daynori even if the
            remote Google Drive original is later deleted.
          </li>
          <li>
            <strong>App-Created Upload:</strong> Uploads a local Daynori file to your Google Drive with
            idempotency tracking to prevent duplicates.
          </li>
          <li>
            <strong>Vault Exclusion:</strong> Encrypted vault files and secrets can never be shared,
            linked, or uploaded to Google Drive.
          </li>
        </ul>
      </div>

      {connection?.isDevelopmentFixture ? (
        <p role="status" style={{ color: palette.status.warning, fontWeight: 600 }}>
          Development fixture provider — not a real Google account. Real Google integration requires
          configured Google Cloud OAuth client credentials.
        </p>
      ) : null}

      {feedback ? (
        <div style={{ marginTop: spacing.sm, marginBottom: spacing.sm }}>
          <Feedback severity={feedback.severity} message={feedback.message} themeMode={themeMode} />
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
          marginTop: spacing.md,
          padding: spacing.sm,
          backgroundColor: palette.surface,
          borderRadius: radii.sm,
          border: `1px solid ${palette.border.subtle}`,
        }}
      >
        <span style={{ fontSize: '13px', color: palette.text.primary }}>
          Status:{' '}
          <strong
            style={{
              color:
                connection?.status === 'connected'
                  ? palette.status.success
                  : connection?.status === 'revoked' || connection?.status === 'degraded'
                    ? palette.status.danger
                    : palette.text.secondary,
            }}
          >
            {connection?.status ?? 'loading…'}
          </strong>
        </span>
        {connection?.providerAccountEmail ? (
          <span style={{ fontSize: '13px', color: palette.text.secondary }}>
            · Identity: <strong>{connection.providerAccountEmail}</strong>
          </span>
        ) : null}
      </div>

      {/* Guidance when unconfigured or revoked */}
      {connection?.status === 'unconfigured' ? (
        <p style={{ fontSize: '12px', color: palette.text.secondary, marginTop: spacing.xs }}>
          Connector is unconfigured. A Google Cloud project with the Drive API and approved{' '}
          <code>drive.file</code> scope is required for production authorization.
        </p>
      ) : connection?.status === 'revoked' ? (
        <p style={{ fontSize: '12px', color: palette.status.danger, marginTop: spacing.xs }}>
          Google access was revoked or expired. Reconnect Drive to restore synchronization.
        </p>
      ) : connection?.status === 'degraded' ? (
        <p style={{ fontSize: '12px', color: palette.status.warning, marginTop: spacing.xs }}>
          Drive connection is in a degraded state. Re-authentication may be required.
        </p>
      ) : null}

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
            {connection?.status === 'revoked' ? 'Reconnect Drive' : 'Connect Drive'}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() => void onSelectFile('link_reference')}
              disabled={busy}
            >
              Link provider reference
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() => void onSelectFile('import_copy')}
              disabled={busy}
            >
              Import copy to Daynori
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
            backgroundColor: palette.surface,
          }}
        >
          <label htmlFor="drive-harness-code" style={{ display: 'block', fontWeight: 600, fontSize: '13px' }}>
            Fake harness authorization code
          </label>
          <input
            id="drive-harness-code"
            value={harnessCode}
            onChange={(e) => setHarnessCode(e.target.value)}
            style={{
              marginTop: spacing.xs,
              padding: '6px 8px',
              borderRadius: radii.sm,
              border: `1px solid ${palette.border.subtle}`,
              width: '100%',
              maxWidth: 320,
            }}
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

      {/* Linked Files Inventory List */}
      {files.length > 0 ? (
        <div style={{ marginTop: spacing.lg }}>
          <h3
            style={{
              fontSize: `${typography.webScale.body}px`,
              fontWeight: 600,
              color: palette.text.primary,
              margin: '0 0 8px 0',
            }}
          >
            Linked & Imported Files ({files.length})
          </h3>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.sm,
            }}
          >
            {files.map((f) => (
              <li
                key={f.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: spacing.sm,
                  borderRadius: radii.sm,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surface,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: palette.text.primary, fontSize: '13px' }}>
                    {f.displayName}
                  </div>
                  <div style={{ fontSize: '12px', color: palette.text.secondary }}>
                    Mode: <code>{f.linkMode}</code> · Availability:{' '}
                    <strong
                      style={{
                        color:
                          f.availability === 'permission_lost' || f.availability === 'source_unavailable'
                            ? palette.status.danger
                            : f.availability === 'imported' || f.availability === 'offline_cached'
                              ? palette.status.success
                              : palette.text.primary,
                      }}
                    >
                      {f.availability === 'permission_lost'
                        ? 'Permission lost (check Drive access)'
                        : f.availability === 'source_unavailable'
                          ? 'Source deleted externally'
                          : f.availability === 'imported'
                            ? 'Imported copy (stored in Daynori)'
                            : f.availability === 'offline_cached'
                              ? 'Cached offline'
                              : f.availability === 'pending_offline'
                                ? 'Pending offline acknowledgment'
                                : 'Live provider reference'}
                    </strong>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="subtle"
                  size="compact"
                  themeMode={themeMode}
                  onClick={() => void onUnlink(f.id, f.displayName)}
                  disabled={busy || unlinkingId === f.id}
                >
                  {unlinkingId === f.id ? 'Unlinking…' : 'Unlink'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
