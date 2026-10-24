'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { Button, Feedback, type FeedbackSeverity } from '@daynori/ui-web';
import type { Room, RoomChatMessage } from '@daynori/contracts';
import { CURRENT_UGC_POLICY_VERSION } from '@daynori/domain';
import { createWebApiClient } from '../data/webApiClient';
import { useAuth } from './AuthContext';
import {
  clearRoomChatLocal,
  loadRoomChatLocal,
  saveRoomChatDraft,
  saveRoomChatEventCursor,
  saveRoomChatPending,
  type RoomChatPendingSend,
} from '../data/roomChatLocalStore';

export interface RoomChatPanelProps {
  csrfToken: string | null;
  themeMode: ThemeMode;
  room: Room;
  onClose: () => void;
}

function mergeByRevision(prev: RoomChatMessage[], incoming: RoomChatMessage[]): RoomChatMessage[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const next of incoming) {
    const cur = byId.get(next.id);
    if (!cur) {
      byId.set(next.id, next);
      continue;
    }
    const newerRevision = next.bodyRevision > cur.bodyRevision;
    const newlyDeleted = Boolean(next.deletedAt) && !cur.deletedAt;
    const newerUpdated = next.updatedAt > cur.updatedAt;
    if (newerRevision || newlyDeleted || newerUpdated) {
      byId.set(next.id, next);
    }
  }
  return [...byId.values()].sort((a, b) => a.serverOrder - b.serverOrder);
}

/**
 * Phase 53 repair — durable drafts/pending, event-cursor handoff, revocation purge.
 */
export function RoomChatPanel({ csrfToken, themeMode, room, onClose }: RoomChatPanelProps) {
  const palette = colors[themeMode];
  const { user } = useAuth();
  const userId = user?.id ?? 'anonymous';
  const client = useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [pending, setPending] = useState<RoomChatPendingSend[]>([]);
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'reconnecting' | 'offline'
  >('connected');
  const [unreadCount, setUnreadCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextBeforeOrder, setNextBeforeOrder] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [needsTerms, setNeedsTerms] = useState(false);
  const [blocks, setBlocks] = useState<Array<{ blockedUserId: string; createdAt: string }>>([]);
  const eventCursorRef = useRef(0);
  const generationRef = useRef(0);
  const roomIdRef = useRef(room.id);
  const announceRef = useRef<HTMLParagraphElement | null>(null);
  const draftAtSendRef = useRef<string | null>(null);
  const readOnly = room.actorRole === 'viewer';

  const isStale = useCallback(() => roomIdRef.current !== room.id, [room.id]);

  const applyRevocation = useCallback(
    (message: string) => {
      clearRoomChatLocal(userId, room.id);
      setMessages([]);
      setPending([]);
      setDraft('');
      eventCursorRef.current = 0;
      setConnectionStatus('offline');
      setFeedback({ severity: 'danger', message });
    },
    [room.id, userId]
  );

  useEffect(() => {
    roomIdRef.current = room.id;
    generationRef.current += 1;
    const gen = generationRef.current;
    const snap = loadRoomChatLocal(userId, room.id);
    eventCursorRef.current = snap.eventCursor;
    setDraft(snap.draft);
    setPending(snap.pending);
    setMessages([]);
    return () => {
      generationRef.current += 1;
      void gen;
    };
  }, [room.id, userId]);

  useEffect(() => {
    saveRoomChatDraft(userId, room.id, draft);
  }, [draft, room.id, userId]);

  useEffect(() => {
    saveRoomChatPending(userId, room.id, pending);
  }, [pending, room.id, userId]);

  const mergeMessages = useCallback((incoming: RoomChatMessage[]) => {
    setMessages((prev) => mergeByRevision(prev, incoming));
  }, []);

  const applyEvents = useCallback(
    (events: Array<{ messageId: string; message: RoomChatMessage | null }>) => {
      const fresh: RoomChatMessage[] = [];
      const hideIds = new Set<string>();
      for (const ev of events) {
        if (ev.message) fresh.push(ev.message);
        else hideIds.add(ev.messageId);
      }
      setMessages((prev) => {
        const kept = prev.filter((m) => !hideIds.has(m.id));
        return mergeByRevision(kept, fresh);
      });
    },
    []
  );

  const drainEvents = useCallback(
    async (since: number): Promise<number> => {
      let cursor = since;
      for (let page = 0; page < 20; page++) {
        if (isStale()) return cursor;
        const res = await client.listRoomChatEvents(room.id, {
          sinceOrder: cursor,
          limit: 100,
        });
        if (isStale()) return cursor;
        for (const ev of res.data.events) {
          cursor = Math.max(cursor, ev.serverOrder);
        }
        applyEvents(res.data.events);
        if (res.data.events.length === 0) {
          // Snapshot watermark when starting cold: do not skip if since was 0 and history loaded.
          if (since === 0 && cursor === 0) {
            cursor = res.data.latestServerOrder;
          }
          break;
        }
        if (res.data.events.length < 100) break;
      }
      eventCursorRef.current = cursor;
      saveRoomChatEventCursor(userId, room.id, cursor);
      return cursor;
    },
    [applyEvents, client, isStale, room.id, userId]
  );

  const refreshHistory = useCallback(async () => {
    const gen = generationRef.current;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await client.listRoomChatMessages(room.id, { limit: 50 });
      if (isStale() || gen !== generationRef.current) return;
      setMessages(mergeByRevision([], res.data.messages));
      setHasMore(res.data.hasMore);
      setNextBeforeOrder(res.data.nextBeforeOrder);

      // History/live handoff: drain events from persisted cursor (do not use message order).
      const watermark = await drainEvents(eventCursorRef.current);
      if (isStale() || gen !== generationRef.current) return;

      if (watermark > 0) {
        const read = await client.updateRoomChatReadState(room.id, {
          lastReadServerOrder: watermark,
        });
        if (isStale() || gen !== generationRef.current) return;
        setUnreadCount(read.data.unreadCount);
        setMuted(read.data.muted);
      } else {
        const read = await client.getRoomChatReadState(room.id);
        if (isStale() || gen !== generationRef.current) return;
        setUnreadCount(read.data.unreadCount);
        setMuted(read.data.muted);
      }
      setConnectionStatus('connected');
    } catch (err) {
      if (isStale() || gen !== generationRef.current) return;
      const code = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : 'Failed to load chat';
      const revoked =
        code === 'MEMBERSHIP_REVOKED' ||
        code === 'ROOM_ARCHIVED' ||
        /\bMEMBERSHIP_REVOKED\b|\bROOM_ARCHIVED\b/i.test(message);
      if (revoked) {
        applyRevocation(
          'Room access was revoked or archived. Conversation and local chat drafts for this room were cleared.'
        );
      } else {
        setConnectionStatus('offline');
        setFeedback({ severity: 'danger', message });
      }
    } finally {
      if (gen === generationRef.current) setBusy(false);
    }
  }, [applyRevocation, client, drainEvents, isStale, room.id]);

  const loadOlder = useCallback(async () => {
    if (!nextBeforeOrder) return;
    setBusy(true);
    try {
      const res = await client.listRoomChatMessages(room.id, {
        beforeOrder: nextBeforeOrder,
        limit: 50,
      });
      if (isStale()) return;
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
  }, [client, isStale, mergeMessages, nextBeforeOrder, room.id]);

  const pollEvents = useCallback(async () => {
    const gen = generationRef.current;
    try {
      const before = eventCursorRef.current;
      const after = await drainEvents(before);
      if (isStale() || gen !== generationRef.current) return;
      setConnectionStatus('connected');
      if (after > before) {
        const latestMsg = messages[messages.length - 1];
        if (announceRef.current && latestMsg && !latestMsg.deletedAt) {
          announceRef.current.textContent = `New message: ${latestMsg.body.slice(0, 80)}`;
        }
        const read = await client.updateRoomChatReadState(room.id, {
          lastReadServerOrder: after,
        });
        if (isStale() || gen !== generationRef.current) return;
        setUnreadCount(read.data.unreadCount);
      }
    } catch (err) {
      if (isStale() || gen !== generationRef.current) return;
      const code = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : '';
      const revoked =
        code === 'MEMBERSHIP_REVOKED' ||
        code === 'ROOM_ARCHIVED' ||
        /\bMEMBERSHIP_REVOKED\b|\bROOM_ARCHIVED\b/i.test(message);
      if (revoked) {
        applyRevocation(
          'Room access was revoked or archived. Conversation and local chat drafts for this room were cleared.'
        );
      } else {
        setConnectionStatus('reconnecting');
      }
    }
  }, [applyRevocation, client, drainEvents, isStale, messages, room.id]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    const timer = setInterval(() => {
      void pollEvents();
    }, 2500);
    return () => clearInterval(timer);
  }, [pollEvents]);

  // Resume durable pending sends after load
  useEffect(() => {
    const failedOrPending = pending.filter((p) => p.status === 'pending' || p.status === 'failed');
    if (failedOrPending.length === 0 || readOnly) return;
    // Do not auto-fire on mount spam — leave explicit retry for failed; pending resume once.
    for (const p of pending.filter((x) => x.status === 'pending')) {
      void (async () => {
        try {
          const res = await client.sendRoomChatMessage(room.id, {
            clientMessageId: p.clientMessageId,
            body: p.body,
            attachmentFileId: p.attachmentFileId,
          });
          if (isStale()) return;
          mergeMessages([res.data]);
          setPending((prev) => prev.filter((x) => x.clientMessageId !== p.clientMessageId));
        } catch (err) {
          if (isStale()) return;
          const message = err instanceof Error ? err.message : 'Send failed';
          setPending((prev) =>
            prev.map((x) =>
              x.clientMessageId === p.clientMessageId
                ? { ...x, status: 'failed' as const, error: message }
                : x
            )
          );
        }
      })();
    }
  }, [room.id]);

  const sendBody = useCallback(
    async (body: string, clientMessageId: string) => {
      const entry: RoomChatPendingSend = {
        clientMessageId,
        body,
        status: 'pending',
        updatedAt: new Date().toISOString(),
      };
      setPending((p) => {
        const rest = p.filter((x) => x.clientMessageId !== clientMessageId);
        return [...rest, entry];
      });
      draftAtSendRef.current = draft;
      try {
        const res = await client.sendRoomChatMessage(room.id, { clientMessageId, body });
        if (isStale()) return;
        mergeMessages([res.data]);
        // Do not advance event cursor from ack — poll/drain owns that.
        setPending((p) => p.filter((x) => x.clientMessageId !== clientMessageId));
        // Clear draft only if user has not typed further since this send started.
        setDraft((current) =>
          current === draftAtSendRef.current || current === body ? '' : current
        );
      } catch (err) {
        if (isStale()) return;
        const message = err instanceof Error ? err.message : 'Send failed';
        const code = (err as { code?: string })?.code;
        if (
          code === 'MEMBERSHIP_REVOKED' ||
          code === 'ROOM_ARCHIVED' ||
          /\bMEMBERSHIP_REVOKED\b|\bROOM_ARCHIVED\b/i.test(message)
        ) {
          applyRevocation(
            'Room access was revoked or archived. Conversation and local chat drafts for this room were cleared.'
          );
          return;
        }
        setPending((p) =>
          p.map((x) =>
            x.clientMessageId === clientMessageId
              ? {
                  ...x,
                  status: 'failed' as const,
                  error: message,
                  updatedAt: new Date().toISOString(),
                }
              : x
          )
        );
        setFeedback({ severity: 'danger', message });
      }
    },
    [applyRevocation, client, draft, isStale, mergeMessages, room.id]
  );

  const onSend = () => {
    const body = draft.trim();
    if (!body || readOnly || busy) return;
    // Stable id: reuse pending failed entry for same body if present, else new.
    const existing = pending.find((p) => p.status === 'failed' && p.body === body);
    void sendBody(body, existing?.clientMessageId ?? crypto.randomUUID());
  };

  const onSaveEdit = async () => {
    if (!editingId || readOnly) return;
    const target = messages.find((m) => m.id === editingId);
    if (!target) return;
    try {
      const res = await client.editRoomChatMessage(room.id, editingId, {
        body: editBody.trim(),
        baseRevision: target.bodyRevision,
      });
      mergeMessages([res.data]);
      setEditingId(null);
      setEditBody('');
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Edit failed',
      });
    }
  };

  const onDelete = async (messageId: string) => {
    try {
      const res = await client.deleteRoomChatMessage(room.id, messageId);
      mergeMessages([res.data]);
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Delete failed',
      });
    }
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

  const refreshBlocks = useCallback(async () => {
    try {
      const res = await client.listUserBlocks();
      if (!isStale()) setBlocks(res.data.blocks);
    } catch {
      /* ignore */
    }
  }, [client, isStale]);

  const acceptTerms = async () => {
    const confirmed = window.confirm(
      `Accept Daynori community rules version ${CURRENT_UGC_POLICY_VERSION}?\n\n` +
        'This covers shared room contributions (chat and shared notes/tasks/files). ' +
        'See docs/policy/acceptable-use-and-community-rules.md for the full text. ' +
        'Reporting, blocking, leaving, and deleting remain available without re-acceptance.'
    );
    if (!confirmed) return;
    try {
      const res = await client.acceptUgcTerms({ policyVersion: CURRENT_UGC_POLICY_VERSION });
      setNeedsTerms(res.data.requiresAcceptance);
      setFeedback({
        severity: 'success',
        message: `Accepted community rules ${CURRENT_UGC_POLICY_VERSION}.`,
      });
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Terms acceptance failed',
      });
    }
  };

  const onReportMessage = async (m: RoomChatMessage) => {
    const category = window.prompt(
      'Report category (harassment|hate|sexual_content|spam|scam|violence|illegal|other):',
      'harassment'
    );
    if (!category) return;
    try {
      await client.createUgcReport({
        clientReportId: crypto.randomUUID(),
        targetType: 'message',
        roomId: room.id,
        messageId: m.id,
        category: category as
          | 'harassment'
          | 'hate'
          | 'sexual_content'
          | 'spam'
          | 'scam'
          | 'violence'
          | 'illegal'
          | 'other',
      });
      setFeedback({ severity: 'success', message: 'Report submitted. Receipt recorded.' });
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Report failed',
      });
    }
  };

  const onReportUser = async (userIdToReport: string) => {
    const category = window.prompt(
      'Report user category (harassment|hate|sexual_content|spam|scam|violence|illegal|other):',
      'harassment'
    );
    if (!category) return;
    try {
      await client.createUgcReport({
        clientReportId: crypto.randomUUID(),
        targetType: 'user',
        roomId: room.id,
        reportedUserId: userIdToReport,
        category: category as
          | 'harassment'
          | 'hate'
          | 'sexual_content'
          | 'spam'
          | 'scam'
          | 'violence'
          | 'illegal'
          | 'other',
      });
      setFeedback({ severity: 'success', message: 'User report submitted.' });
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Report failed',
      });
    }
  };

  const onBlockSender = async (senderId: string) => {
    if (
      !window.confirm(
        'Block this user? They will not be able to invite you (and vice versa). In shared rooms they keep their membership; their messages are hidden for you only. Mute only suppresses notifications.'
      )
    ) {
      return;
    }
    try {
      await client.blockUser({ blockedUserId: senderId });
      setMessages((prev) => prev.filter((m) => m.senderId !== senderId));
      await refreshBlocks();
      setFeedback({ severity: 'success', message: 'User blocked. Invitation path restricted.' });
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Block failed',
      });
    }
  };

  const onUnblock = async (blockedUserId: string) => {
    if (!window.confirm('Unblock this user? Invitations between you may resume.')) return;
    try {
      await client.unblockUser(blockedUserId);
      await refreshBlocks();
      setFeedback({ severity: 'success', message: 'User unblocked.' });
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Unblock failed',
      });
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const terms = await client.getUgcTermsStatus();
        if (!isStale()) setNeedsTerms(terms.data.requiresAcceptance);
      } catch {
        /* terms endpoint may be gated; leave default */
      }
      await refreshBlocks();
    })();
  }, [client, room.id, isStale, refreshBlocks]);

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
        <Button
          type="button"
          variant="subtle"
          size="compact"
          themeMode={themeMode}
          onClick={() => void toggleMute()}
        >
          {muted ? 'Unmute notifications' : 'Mute notifications'}
        </Button>
        {needsTerms ? (
          <Button
            type="button"
            size="compact"
            themeMode={themeMode}
            onClick={() => void acceptTerms()}
          >
            Review & accept rules {CURRENT_UGC_POLICY_VERSION}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="subtle"
          size="compact"
          themeMode={themeMode}
          onClick={onClose}
        >
          Close
        </Button>
      </div>

      {blocks.length > 0 ? (
        <section aria-label="Blocked users" style={{ marginBottom: spacing.md }}>
          <h3 style={{ fontSize: 14, margin: `0 0 ${spacing.xs}` }}>Blocked users</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {blocks.map((b) => (
              <li
                key={b.blockedUserId}
                style={{
                  display: 'flex',
                  gap: spacing.sm,
                  alignItems: 'center',
                  marginBottom: spacing.xs,
                }}
              >
                <span style={{ fontSize: 12, color: palette.text.secondary }}>
                  {b.blockedUserId.slice(0, 8)}…
                </span>
                <Button
                  type="button"
                  size="compact"
                  variant="subtle"
                  themeMode={themeMode}
                  onClick={() => void onUnblock(b.blockedUserId)}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul
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
              {m.senderId.slice(0, 8)}… · #{m.serverOrder} · rev {m.bodyRevision}
            </span>
            <div>
              {editingId === m.id ? (
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  aria-label="Edit message"
                  rows={2}
                  style={{ width: '100%' }}
                />
              ) : m.deletedAt ? (
                '(deleted)'
              ) : (
                m.body
              )}
            </div>
            <div
              style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}
            >
              {!m.deletedAt ? (
                <Button
                  type="button"
                  size="compact"
                  variant="subtle"
                  themeMode={themeMode}
                  onClick={() => void onReportMessage(m)}
                >
                  Report message
                </Button>
              ) : null}
              {m.senderId !== userId ? (
                <>
                  <Button
                    type="button"
                    size="compact"
                    variant="subtle"
                    themeMode={themeMode}
                    onClick={() => void onReportUser(m.senderId)}
                  >
                    Report user
                  </Button>
                  <Button
                    type="button"
                    size="compact"
                    variant="subtle"
                    themeMode={themeMode}
                    onClick={() => void onBlockSender(m.senderId)}
                  >
                    Block sender
                  </Button>
                </>
              ) : null}
              {!readOnly && !m.deletedAt && m.senderId === userId ? (
                editingId === m.id ? (
                  <>
                    <Button
                      type="button"
                      size="compact"
                      themeMode={themeMode}
                      onClick={() => void onSaveEdit()}
                    >
                      Save edit
                    </Button>
                    <Button
                      type="button"
                      size="compact"
                      variant="subtle"
                      themeMode={themeMode}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="compact"
                      variant="subtle"
                      themeMode={themeMode}
                      onClick={() => {
                        setEditingId(m.id);
                        setEditBody(m.body);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="compact"
                      variant="subtle"
                      themeMode={themeMode}
                      onClick={() => void onDelete(m.id)}
                    >
                      Delete
                    </Button>
                  </>
                )
              ) : null}
            </div>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.clientMessageId} style={{ padding: spacing.sm, opacity: 0.85 }}>
            <span style={{ fontSize: 12, color: palette.text.secondary }}>You · {p.status}</span>
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
