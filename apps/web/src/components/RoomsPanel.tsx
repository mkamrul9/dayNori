'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, radii, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import { Button, Feedback, type FeedbackSeverity } from '@daynori/ui-web';
import type {
  CopyPersonalItemToRoomPreviewResponse,
  Room,
  RoomInvitation,
} from '@daynori/contracts';
import { createWebApiClient } from '../data/webApiClient';
import { RoomContentPanel } from './RoomContentPanel';
import { RoomChatPanel } from './RoomChatPanel';

export interface RoomsPanelProps {
  csrfToken: string | null;
  themeMode: ThemeMode;
  /** Personal workspace id — kept separate from active room selection. */
  personalWorkspaceId: string | null;
}

/**
 * Provisional local shared-rooms settings (Phase 51).
 * Real-user / public invitation enablement remains release-gated.
 *
 * Invitation delivery is a **manual-token harness**: create returns a raw token once for
 * clipboard copy, and accept is via the paste field below. Deep-link path
 * `/rooms/invitations/accept?token=…` is not a routed web page in this phase — recipients
 * paste the token into Settings → Rooms (or call the API). Tokens are kept in component
 * state only for the copy action and are not written to localStorage or audit logs.
 */
export function RoomsPanel({ csrfToken, themeMode, personalWorkspaceId }: RoomsPanelProps) {
  const palette = colors[themeMode];
  const client = useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState('');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [acceptToken, setAcceptToken] = useState('');
  const [members, setMembers] = useState<
    Array<{ userId: string; role: string }>
  >([]);
  const [invites, setInvites] = useState<RoomInvitation[]>([]);
  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [personalItemId, setPersonalItemId] = useState('');
  const [copyPreview, setCopyPreview] = useState<
    CopyPersonalItemToRoomPreviewResponse['data'] | null
  >(null);

  const selected = rooms.find((r) => r.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    try {
      const listed = await client.listRooms();
      setRooms(listed.data);
      if (selectedId) {
        const detail = listed.data.find((r) => r.id === selectedId);
        if (!detail) {
          setSelectedId(null);
          setMembers([]);
          setInvites([]);
          return;
        }
        const m = await client.listRoomMembers(selectedId);
        setMembers(m.data.map((x) => ({ userId: x.userId, role: x.role })));
        if (detail.actorRole === 'owner') {
          const inv = await client.listRoomInvitations(selectedId);
          setInvites(inv.data);
        } else {
          setInvites([]);
        }
      }
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to load rooms',
      });
    }
  }, [client, selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const created = await client.createRoom({ name: roomName || 'New room' });
      setRoomName('');
      setSelectedId(created.data.id);
      setFeedback({
        severity: 'success',
        message: `Created shared room “${created.data.name}”. Personal workspace stays separate.`,
      });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Create failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onInvite = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const inv = await client.createRoomInvitation(selectedId, { role: 'editor' });
      setInviteToken(inv.data.inviteToken ?? null);
      setFeedback({
        severity: 'info',
        message:
          'Invitation link generated locally. Copy it yourself — Daynori does not email or message recipients.',
      });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Invite failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onAccept = async () => {
    setBusy(true);
    try {
      const res = await client.acceptRoomInvitation({ token: acceptToken.trim() });
      setAcceptToken('');
      setSelectedId(res.data.room.id);
      setFeedback({
        severity: 'success',
        message: `Joined “${res.data.room.name}” as ${res.data.room.actorRole}. This does not open anyone’s personal workspace.`,
      });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Accept failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    if (!selectedId) return;
    if (!window.confirm('Leave this shared room?')) return;
    setBusy(true);
    try {
      await client.leaveRoom(selectedId);
      setSelectedId(null);
      setFeedback({ severity: 'info', message: 'Left room.' });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Leave failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onArchive = async () => {
    if (!selectedId) return;
    if (!window.confirm('Archive this room? Pending invitations will be revoked.')) return;
    setBusy(true);
    try {
      await client.archiveRoom(selectedId);
      setFeedback({ severity: 'info', message: 'Room archived.' });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Archive failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onUpdateMemberRole = async (userId: string, newRole: 'editor' | 'viewer') => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await client.updateRoomMemberRole(selectedId, userId, { role: newRole });
      setFeedback({
        severity: 'success',
        message: `Updated member role to ${newRole}.`,
      });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Role update failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onRemoveMember = async (userId: string) => {
    if (!selectedId) return;
    if (
      !window.confirm(
        `Remove member ${userId.slice(0, 8)}… from room? Their cached room content will be purged on next sync.`
      )
    )
      return;
    setBusy(true);
    try {
      await client.removeRoomMember(selectedId, userId);
      setFeedback({
        severity: 'info',
        message: `Removed member ${userId.slice(0, 8)}… from room.`,
      });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Remove member failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onTransferOwnership = async (userId: string) => {
    if (!selectedId) return;
    if (
      !window.confirm(
        `Transfer room ownership to ${userId.slice(0, 8)}…? You will become an editor.`
      )
    )
      return;
    setBusy(true);
    try {
      await client.transferRoomOwnership(selectedId, { newOwnerUserId: userId });
      setFeedback({
        severity: 'success',
        message: `Transferred room ownership to ${userId.slice(0, 8)}….`,
      });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Transfer ownership failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onPreviewCopy = async () => {
    if (!selectedId || !personalWorkspaceId || !personalItemId.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await client.previewCopyPersonalItemToRoom({
        sourceWorkspaceId: personalWorkspaceId,
        sourceItemId: personalItemId.trim(),
        destinationRoomId: selectedId,
      });
      setCopyPreview(res.data);
    } catch (err) {
      setCopyPreview(null);
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Copy preview failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const onExecuteCopy = async () => {
    if (!selectedId || !personalWorkspaceId || !personalItemId.trim()) return;
    setBusy(true);
    try {
      const res = await client.copyPersonalItemToRoom({
        sourceWorkspaceId: personalWorkspaceId,
        sourceItemId: personalItemId.trim(),
        destinationRoomId: selectedId,
      });
      setFeedback({
        severity: 'success',
        message: `Copied “${copyPreview?.sourceTitle || 'item'}” to room (ID: ${res.data.destinationItemId.slice(0, 8)}…). Personal original preserved.`,
      });
      setPersonalItemId('');
      setCopyPreview(null);
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Copy to room failed',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="rooms-heading">
      <h2
        id="rooms-heading"
        style={{
          margin: '0 0 4px 0',
          fontSize: `${typography.webScale.sectionHeading}px`,
          color: palette.text.primary,
        }}
      >
        Shared rooms (provisional)
      </h2>
      <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
        Local-only room workspaces with owner/editor/viewer roles and single-use invite links.
        Joining a room never grants access to another person&apos;s personal workspace
        {personalWorkspaceId ? ` (${personalWorkspaceId.slice(0, 8)}…)` : ''}. Public sharing and
        outbound invites stay disabled.
      </p>

      {feedback ? (
        <div style={{ marginBottom: spacing.sm }}>
          <Feedback severity={feedback.severity} message={feedback.message} themeMode={themeMode} />
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
        <label htmlFor="new-room-name" style={{ fontWeight: 600 }}>
          Room name
        </label>
        <input
          id="new-room-name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          style={{ maxWidth: 240 }}
        />
        <Button
          type="button"
          variant="primary"
          size="compact"
          themeMode={themeMode}
          onClick={() => void onCreate()}
          disabled={busy}
        >
          Create room
        </Button>
      </div>

      <div style={{ display: 'flex', gap: spacing.lg, flexWrap: 'wrap' }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, minWidth: 200 }}>
          {rooms.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelectedId(r.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: spacing.sm,
                  marginBottom: 4,
                  borderRadius: radii.sm,
                  border:
                    r.id === selectedId
                      ? `2px solid ${palette.border.strong}`
                      : `1px solid ${palette.border.subtle}`,
                  background: palette.surfaceRaised,
                  color: palette.text.primary,
                  cursor: 'pointer',
                }}
              >
                <strong>{r.name}</strong>
                <div style={{ fontSize: 12, color: palette.text.secondary }}>
                  {r.status} · your role: {r.actorRole}
                </div>
              </button>
            </li>
          ))}
        </ul>

        {selected ? (
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ color: palette.text.primary }}>
              <strong>Context:</strong> shared room “{selected.name}” — not your personal workspace.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
              {selected.actorRole === 'owner' ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    themeMode={themeMode}
                    onClick={() => void onInvite()}
                    disabled={busy || selected.status !== 'active'}
                  >
                    Create invite link
                  </Button>
                  <Button
                    type="button"
                    variant="subtle"
                    size="compact"
                    themeMode={themeMode}
                    onClick={() => void onArchive()}
                    disabled={busy}
                  >
                    Archive room
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="compact"
                themeMode={themeMode}
                onClick={() => setShowContent(true)}
                disabled={busy}
              >
                Open shared content
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="compact"
                themeMode={themeMode}
                onClick={() => setShowChat(true)}
                disabled={busy}
              >
                Open room chat
              </Button>
              <Button
                type="button"
                variant="subtle"
                size="compact"
                themeMode={themeMode}
                onClick={() => void onLeave()}
                disabled={busy}
              >
                Leave room
              </Button>
            </div>
            {showContent ? (
              <RoomContentPanel
                csrfToken={csrfToken}
                themeMode={themeMode}
                room={selected}
                personalWorkspaceId={personalWorkspaceId}
                onClose={() => setShowContent(false)}
              />
            ) : null}
            {showChat ? (
              <RoomChatPanel
                csrfToken={csrfToken}
                themeMode={themeMode}
                room={selected}
                onClose={() => setShowChat(false)}
              />
            ) : null}

            {inviteToken ? (
              <div
                style={{
                  marginTop: spacing.md,
                  padding: spacing.md,
                  border: `1px solid ${palette.border.subtle}`,
                  borderRadius: radii.card,
                }}
              >
                <label htmlFor="invite-token-out" style={{ fontWeight: 600 }}>
                  Copy invitation token (shown once)
                </label>
                <textarea
                  id="invite-token-out"
                  readOnly
                  value={inviteToken}
                  rows={2}
                  style={{ width: '100%', marginTop: spacing.xs }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  themeMode={themeMode}
                  onClick={() => {
                    void navigator.clipboard.writeText(inviteToken);
                    setFeedback({ severity: 'success', message: 'Invite token copied.' });
                  }}
                >
                  Copy to clipboard
                </Button>
              </div>
            ) : null}

            <h3 style={{ fontSize: 14, marginTop: spacing.md }}>Members</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {members.map((m) => (
                <li
                  key={m.userId}
                  style={{
                    color: palette.text.primary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${spacing.xs}px 0`,
                    borderBottom: `1px solid ${palette.border.subtle}`,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{m.userId.slice(0, 8)}…</span>{' '}
                    <span style={{ fontSize: 12, color: palette.text.secondary }}>({m.role})</span>
                  </div>
                  {selected.actorRole === 'owner' && m.role !== 'owner' ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button
                        type="button"
                        variant="subtle"
                        size="compact"
                        themeMode={themeMode}
                        disabled={busy}
                        onClick={() =>
                          void onUpdateMemberRole(
                            m.userId,
                            m.role === 'editor' ? 'viewer' : 'editor'
                          )
                        }
                      >
                        {m.role === 'editor' ? 'Demote to viewer' : 'Promote to editor'}
                      </Button>
                      <Button
                        type="button"
                        variant="subtle"
                        size="compact"
                        themeMode={themeMode}
                        disabled={busy}
                        onClick={() => void onRemoveMember(m.userId)}
                      >
                        Remove
                      </Button>
                      <Button
                        type="button"
                        variant="subtle"
                        size="compact"
                        themeMode={themeMode}
                        disabled={busy}
                        onClick={() => void onTransferOwnership(m.userId)}
                      >
                        Make owner
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            {invites.length > 0 ? (
              <>
                <h3 style={{ fontSize: 14, marginTop: spacing.md }}>Pending invitations</h3>
                <ul>
                  {invites
                    .filter((i) => i.status === 'pending')
                    .map((i) => (
                      <li key={i.id} style={{ color: palette.text.secondary }}>
                        {i.tokenPrefix}… · {i.role} · expires {i.expiresAt}
                        <Button
                          type="button"
                          variant="subtle"
                          size="compact"
                          themeMode={themeMode}
                          onClick={() => {
                            void (async () => {
                              await client.revokeRoomInvitation(selected.id, i.id);
                              await refresh();
                            })();
                          }}
                        >
                          Revoke
                        </Button>
                      </li>
                    ))}
                </ul>
              </>
            ) : null}

            {personalWorkspaceId && selected.status === 'active' ? (
              <div
                style={{
                  marginTop: spacing.lg,
                  padding: spacing.md,
                  border: `1px solid ${palette.border.subtle}`,
                  borderRadius: radii.card,
                  background: palette.surfaceRaised,
                }}
              >
                <h4 style={{ margin: '0 0 6px 0', fontSize: 14, color: palette.text.primary }}>
                  Share personal item to room
                </h4>
                <p style={{ margin: '0 0 10px 0', fontSize: 12, color: palette.text.secondary }}>
                  Explicit copy only. Items copied to a room receive a new UUID in the room
                  workspace. Your personal original remains untouched. Vault items and journal
                  entries are strictly excluded from room sharing.
                </p>
                <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
                  <input
                    placeholder="Personal item UUID..."
                    value={personalItemId}
                    onChange={(e) => {
                      setPersonalItemId(e.target.value);
                      setCopyPreview(null);
                    }}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: radii.sm,
                      border: `1px solid ${palette.border.subtle}`,
                      background: palette.surface,
                      color: palette.text.primary,
                      fontSize: 13,
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    themeMode={themeMode}
                    disabled={busy || !personalItemId.trim()}
                    onClick={() => void onPreviewCopy()}
                  >
                    Preview
                  </Button>
                </div>

                {copyPreview ? (
                  <div
                    style={{
                      marginTop: spacing.sm,
                      padding: spacing.sm,
                      borderRadius: radii.sm,
                      background: palette.surface,
                      border: `1px solid ${
                        copyPreview.blocked ? palette.status.danger : palette.border.subtle
                      }`,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>
                      {copyPreview.sourceTitle} ({copyPreview.sourceKind})
                    </div>
                    <div style={{ fontSize: 12, color: palette.text.secondary, marginTop: 2 }}>
                      Destination: {copyPreview.destinationRoomName}
                    </div>
                    {copyPreview.blocked ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: palette.status.danger,
                          marginTop: 4,
                          fontWeight: 500,
                        }}
                      >
                        Cannot copy: {copyPreview.blockReason}
                      </div>
                    ) : (
                      <div style={{ marginTop: spacing.sm }}>
                        <p
                          style={{
                            fontSize: 12,
                            color: palette.text.secondary,
                            margin: '0 0 8px 0',
                          }}
                        >
                          {copyPreview.ownershipExplanation}
                        </p>
                        <Button
                          type="button"
                          variant="primary"
                          size="compact"
                          themeMode={themeMode}
                          disabled={busy}
                          onClick={() => void onExecuteCopy()}
                        >
                          Confirm copy to room
                        </Button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: spacing.lg }}>
        <label htmlFor="accept-token" style={{ fontWeight: 600 }}>
          Accept invitation token
        </label>
        <input
          id="accept-token"
          value={acceptToken}
          onChange={(e) => setAcceptToken(e.target.value)}
          style={{ display: 'block', width: '100%', maxWidth: 420, marginTop: spacing.xs }}
        />
        <Button
          type="button"
          variant="primary"
          size="compact"
          themeMode={themeMode}
          onClick={() => void onAccept()}
          disabled={busy || !acceptToken.trim()}
          style={{ marginTop: spacing.sm }}
        >
          Accept invitation
        </Button>
      </div>
    </section>
  );
}
