'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { Button, Feedback, type FeedbackSeverity } from '@daynori/ui-web';
import type { Room, RoomChatMessage } from '@daynori/contracts';
import { createWebApiClient } from '../data/webApiClient';

export interface RoomChatPanelProps {
  csrfToken: string | null;
  themeMode: ThemeMode;
  room: Room;
  onClose: () => void;
}

type LocalPending = {
  clientMessageId: string;
  body: string;
  status: 'pending' | 'failed' | 'sent';
  error?: string;
};

const draftKey = (roomId: string) => `daynori.roomChat.draft.${roomId}`;

/**
 * Phase 53 provisional room conversation UI.
 * History + composer + pending/retry + unread/mute + connection feedback.
 */
export function RoomChatPanel({ csrfToken, themeMode, room, onClose }: RoomChatPanelProps) {
  const palette = colors[themeMode];
  const client = useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [pending, setPending] = useState<LocalPending[]>([]);
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'offline'>(
    'connected'
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextBeforeOrder, setNextBeforeOrder] = useState<number | null>(null);
  const sinceOrderRef = useRef(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const announceRef = useRef<HTMLParagraphElement | null>(null);
  const readOnly = room.actorRole === 'viewer';
  const pollAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey(room.id));
      if (saved) setDraft(saved);
    } catch {
      /* ignore */
    }
  }, [room.id]);

  useEffect(() => {
    try {
      if (draft) localStorage.setItem(draftKey(room.id), draft);
      else localStorage.removeItem(draftKey(room.id));
    } catch {
      /* ignore */
    }
  }, [draft, room.id]);

  const mergeMessages = useCallback((incoming: RoomChatMessage[]) => {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => a.serverOrder - b.serverOrder);
    });
  }, []);

  const refreshHistory = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await client.listRoomChatMessages(room.id, { limit: 50 });
      mergeMessages(res.data.messages);
      setHasMore(res.data.hasMore);
      setNextBeforeOrder(res.data.nextBeforeOrder);
      const maxOrder = res.data.messages.reduce(
        (m: number, x: RoomChatMessage) => Math.max(m, x.serverOrder),
        0
      );
      sinceOrderRef.current = Math.max(sinceOrderRef.current, maxOrder);
      if (maxOrder > 0) {
        const read = await client.updateRoomChatReadState(room.id, {
          lastReadServerOrder: maxOrder,
        });
        setUnreadCount(read.data.unreadCount);
        setMuted(read.data.muted);
      } else {
        const read = await client.getRoomChatReadState(room.id);
        setUnreadCount(read.data.unreadCount);
        setMuted(read.data.muted);
      }
      setConnectionStatus('connected');
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : 'Failed to load chat';
      const revoked =
        code === 'MEMBERSHIP_REVOKED' ||
        code === 'ROOM_ARCHIVED' ||
        /\bMEMBERSHIP_REVOKED\b|\bROOM_ARCHIVED\b/i.test(message);
      setMessages([]);
      setConnectionStatus('offline');
      setFeedback({
        severity: 'danger',
        message: revoked
          ? 'Room access was revoked or archived. Conversation history was cleared from this view.'
          : message,
      });
    } finally {
      setBusy(false);
    }
  }, [client, mergeMessages, room.id]);

  const loadOlder = useCallback(async () => {
    if (!nextBeforeOrder) return;
    setBusy(true);
    try {
      const res = await client.listRoomChatMessages(room.id, {
        beforeOrder: nextBeforeOrder,
        limit: 50,
      });
      mergeMessages(res.data.messages);
      setHasMore(res.data.hasMore);
      setNextBeforeOrder(res.data.nextBeforeOrder);
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to load older messages',
      });
    } finally {
      setBusy(false);
    }
  }, [client, mergeMessages, nextBeforeOrder, room.id]);

  const pollEvents = useCallback(async () => {
    try {
      const res = await client.listRoomChatEvents(room.id, {
        sinceOrder: sinceOrderRef.current,
        limit: 50,
      });
      setConnectionStatus(res.data.connectionStatus);
      const fresh: RoomChatMessage[] = [];
      for (const ev of res.data.events) {
        sinceOrderRef.current = Math.max(sinceOrderRef.current, ev.serverOrder);
        if (ev.message) fresh.push(ev.message);
      }
      if (fresh.length) {
        mergeMessages(fresh);
        const latest = fresh[fresh.length - 1]!;
        if (announceRef.current && !latest.deletedAt) {
          announceRef.current.textContent = `New message: ${latest.body.slice(0, 80)}`;
        }
        await client.updateRoomChatReadState(room.id, {
          lastReadServerOrder: sinceOrderRef.current,
        });
        setUnreadCount(0);
      }
    } catch {
      setConnectionStatus('reconnecting');
    }
  }, [client, mergeMessages, room.id]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    pollAbort.current?.abort();
    const ac = new AbortController();
    pollAbort.current = ac;
    const timer = setInterval(() => {
      if (!ac.signal.aborted) void pollEvents();
    }, 2500);
    return () => {
      ac.abort();
      clearInterval(timer);
    };
  }, [pollEvents]);

  const sendBody = useCallback(
    async (body: string, clientMessageId: string) => {
      setPending((p) => {
        const rest = p.filter((x) => x.clientMessageId !== clientMessageId);
        return [...rest, { clientMessageId, body, status: 'pending' }];
      });
      try {
        const res = await client.sendRoomChatMessage(room.id, { clientMessageId, body });
        setPending((p) =>
          p.map((x) =>
            x.clientMessageId === clientMessageId ? { ...x, status: 'sent' as const } : x
          )
        );
        mergeMessages([res.data]);
        sinceOrderRef.current = Math.max(sinceOrderRef.current, res.data.serverOrder);
        setPending((p) => p.filter((x) => x.clientMessageId !== clientMessageId));
        setDraft('');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Send failed';
        setPending((p) =>
          p.map((x) =>
            x.clientMessageId === clientMessageId
              ? { ...x, status: 'failed' as const, error: message }
              : x
          )
        );
        setFeedback({ severity: 'danger', message });
      }
    },
    [client, mergeMessages, room.id]
  );

  const onSend = () => {
    const body = draft.trim();
    if (!body || readOnly || busy) return;
    void sendBody(body, crypto.randomUUID());
  };

  const toggleMute = async () => {
    try {
      const res = await client.updateRoomChatMute(room.id, { muted: !muted });
      setMuted(res.data.muted);
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Mute update failed',
      });
    }
  };

  return (
    <section
      aria-label={`Chat for room ${room.name}`}
      style={{
        marginTop: spacing.lg,
        padding: spacing.lg,
        borderRadius: radii.card,
        background: palette.surfaceRaised,
        border: `1px solid ${palette.border.subtle}`,
      }}
    >
      <header style={{ marginBottom: spacing.md }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: palette.text.primary, margin: 0 }}>
          {room.name} — conversation
        </h2>
        <p style={{ color: palette.text.secondary, margin: `${spacing.xs} 0 0` }}>
          Role: {room.actorRole ?? 'unknown'}
          {readOnly ? ' (read only)' : ''} · Connection: {connectionStatus}
          {unreadCount > 0 ? ` · Unread ${unreadCount}` : ''}
          {muted ? ' · Muted' : ''}
        </p>
      </header>

      <p
        ref={announceRef}
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      />

      {feedback ? (
        <Feedback
          severity={feedback.severity}
          message={feedback.message}
          themeMode={themeMode}
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.sm }}>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          themeMode={themeMode}
          disabled={busy}
          onClick={() => void refreshHistory()}
        >
          Refresh
        </Button>
        <Button
          type="button"
          variant="subtle"
          size="compact"
          themeMode={themeMode}
          disabled={busy || !hasMore}
          onClick={() => void loadOlder()}
        >
          Load older
        </Button>
        <Button type="button" variant="subtle" size="compact" themeMode={themeMode} onClick={() => void toggleMute()}>
          {muted ? 'Unmute' : 'Mute'}
        </Button>
        <Button type="button" variant="subtle" size="compact" themeMode={themeMode} onClick={onClose}>
          Close
        </Button>
      </div>

      <ul
        ref={listRef}
        aria-label="Message history"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          maxHeight: 320,
          overflowY: 'auto',
          display: 'grid',
          gap: spacing.sm,
        }}
      >
        {messages.map((m) => (
          <li
            key={m.id}
            style={{
              padding: spacing.sm,
              borderRadius: radii.sm,
              background: palette.surface,
              color: palette.text.primary,
              opacity: m.deletedAt ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 12, color: palette.text.secondary }}>
              {m.senderId.slice(0, 8)}… · #{m.serverOrder}
            </span>
            <div>{m.deletedAt ? '(deleted)' : m.body}</div>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.clientMessageId} style={{ padding: spacing.sm, opacity: 0.85 }}>
            <span style={{ fontSize: 12, color: palette.text.secondary }}>
              You · {p.status}
            </span>
            <div>{p.body}</div>
            {p.status === 'failed' ? (
              <Button
                type="button"
                variant="secondary"
                size="compact"
                themeMode={themeMode}
                onClick={() => void sendBody(p.body, p.clientMessageId)}
              >
                Retry
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {!readOnly ? (
        <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md }}>
          <label style={{ flex: 1, display: 'grid', gap: spacing.xs }}>
            <span style={{ fontSize: 12, color: palette.text.secondary }}>Message</span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={4000}
              aria-label="Compose room message"
              style={{
                width: '100%',
                resize: 'vertical',
                borderRadius: radii.sm,
                border: `1px solid ${palette.border.subtle}`,
                padding: spacing.sm,
                background: palette.surface,
                color: palette.text.primary,
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
          </label>
          <Button
            type="button"
            variant="primary"
            themeMode={themeMode}
            disabled={busy || !draft.trim()}
            onClick={onSend}
          >
            Send
          </Button>
        </div>
      ) : (
        <p style={{ color: palette.text.secondary, marginTop: spacing.md }}>
          Viewers can read history but cannot send messages.
        </p>
      )}
    </section>
  );
}
