'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { Button, Feedback, type FeedbackSeverity } from '@daynori/ui-web';
import type { Room, RoomContent } from '@daynori/contracts';
import { createWebApiClient } from '../data/webApiClient';

export interface RoomContentPanelProps {
  csrfToken: string | null;
  themeMode: ThemeMode;
  /** Active room — distinct from personal workspace identity. */
  room: Room;
  personalWorkspaceId: string | null;
  onClose: () => void;
}

/**
 * Phase 52 provisional room content browser.
 * Viewers are read-only; editors/owners can create notes via sync in later UI.
 * Revocation notices surface when membership is lost.
 */
export function RoomContentPanel({
  csrfToken,
  themeMode,
  room,
  personalWorkspaceId,
  onClose,
}: RoomContentPanelProps) {
  const palette = colors[themeMode];
  const client = useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);
  const [content, setContent] = useState<RoomContent | null>(null);
  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const readOnly = room.actorRole === 'viewer';

  const refresh = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await client.listRoomContent(room.id);
      setContent(res.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load room content';
      const revoked =
        /MEMBERSHIP_REVOKED|access revoked|Room not found|FORBIDDEN|403/i.test(message) ||
        (err as { code?: string })?.code === 'MEMBERSHIP_REVOKED';
      setContent(null);
      setFeedback({
        severity: 'danger',
        message: revoked
          ? 'Room access was revoked or is unavailable. Shared content for this room was cleared from this session. Offline copies on disconnected devices may remain until reconnect.'
          : message,
      });
    } finally {
      setBusy(false);
    }
  }, [client, room.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section
      aria-label={`Shared content for room ${room.name}`}
      style={{
        marginTop: spacing.lg,
        padding: spacing.lg,
        borderRadius: radii.card,
        background: palette.surfaceRaised,
        border: `1px solid ${palette.border.subtle}`,
      }}
    >
      <header style={{ marginBottom: spacing.md }}>
        <p style={{ fontSize: 12, color: palette.text.secondary, margin: 0 }}>
          Shared room context (not your personal workspace
          {personalWorkspaceId ? ` ${personalWorkspaceId.slice(0, 8)}…` : ''})
        </p>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: palette.text.primary, margin: `${spacing.xs} 0` }}>
          {room.name}
        </h2>
        <p style={{ color: palette.text.secondary, margin: 0 }}>
          Your role: <strong>{room.actorRole ?? 'unknown'}</strong>
          {readOnly ? ' — read only' : ' — can edit shared notes and tasks'}
        </p>
      </header>

      {feedback ? (
        <Feedback
          severity={feedback.severity}
          message={feedback.message}
          themeMode={themeMode}
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md, marginTop: spacing.sm }}>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          themeMode={themeMode}
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh shared content
        </Button>
        <Button type="button" variant="subtle" size="compact" themeMode={themeMode} onClick={onClose}>
          Close
        </Button>
      </div>

      {content ? (
        <div style={{ display: 'grid', gap: spacing.md }}>
          <ContentSection title="Notes" empty="No shared notes">
            {content.notes.map((n) => (
              <li key={n.id}>
                <span style={{ color: palette.text.primary }}>{n.title}</span>
              </li>
            ))}
          </ContentSection>
          <ContentSection title="Tasks" empty="No shared tasks">
            {content.tasks.map((t) => (
              <li key={t.id}>
                <span style={{ color: palette.text.primary }}>
                  {t.title} ({t.status})
                </span>
              </li>
            ))}
          </ContentSection>
          <ContentSection title="Files" empty="No shared files">
            {content.files.map((f) => (
              <li key={f.id}>
                <span style={{ color: palette.text.primary }}>
                  {f.fileName} ({f.mimeType})
                </span>
              </li>
            ))}
          </ContentSection>
        </div>
      ) : (
        !feedback && <p style={{ color: palette.text.secondary }}>Loading…</p>
      )}
    </section>
  );
}

function ContentSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  return (
    <div>
      <h3 style={{ margin: `0 0 ${spacing.xs}` }}>{title}</h3>
      {items.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.7 }}>{empty}</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: spacing.lg }}>{children}</ul>
      )}
    </div>
  );
}
