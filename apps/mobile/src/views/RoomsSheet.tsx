import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import {
  MobileButton
} from '@daynori/ui-mobile';
import type { Room
} from '@daynori/contracts';
import type { DaynoriApiClient } from '@daynori/api-client';
import { CURRENT_UGC_POLICY_VERSION } from '@daynori/domain';
import { clearRoomChatLocal, loadRoomChatLocal, saveRoomChatLocal, type RoomChatCachedMessage } from '../data/roomChatLocalStore';

export interface RoomsSheetProps {
  themeMode: ThemeMode;
  personalWorkspaceId: string;
  /** Authenticated account id — scopes durable chat drafts/pending. */
  userId: string;
  apiClient: DaynoriApiClient;
  onClose: () => void;
  testID?: string;
}

/**
 * Android rooms UI for Phase 51 provisional local development.
 * Manual-token harness: invite tokens are shown for explicit local copy only — no outbound
 * messaging and no deep-link accept screen; paste the token into this sheet to accept.
 */
export function RoomsSheet({
  themeMode,
  personalWorkspaceId,
  userId,
  apiClient,
  onClose,
  testID = 'rooms-sheet',
}: RoomsSheetProps) {
  const palette = colors[themeMode];
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [acceptToken, setAcceptToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contentSummary, setContentSummary] = useState<string | null>(null);
  const [chatLines, setChatLines] = useState<string[]>([]);
  const [chatCache, setChatCache] = useState<RoomChatCachedMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatConnection, setChatConnection] = useState('idle');
  const [chatMuted, setChatMuted] = useState(false);

  const selected = rooms.find((r) => r.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    const listed = await apiClient.listRooms();
    setRooms(listed.data);
  }, [apiClient]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setMessage(err instanceof Error ? err.message : 'Failed to load rooms');
    });
  }, [refresh]);

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scroll}
      accessibilityLabel="Shared rooms"
    >
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: palette.text.primary }]}>
          Shared rooms (provisional)
        </Text>
        <MobileButton
          variant="subtle"
          themeMode={themeMode}
          onPress={onClose}
          accessibilityLabel="Close rooms"
        >
          Close
        </MobileButton>
      </View>

      <Text style={{ color: palette.text.secondary, marginBottom: spacing.md }}>
        Joining a room never opens another person&apos;s personal workspace (
        {personalWorkspaceId.slice(0, 8)}…). Invite links are copied locally only.
      </Text>

      {message ? (
        <Text accessibilityLiveRegion="polite" style={{ color: palette.status.warning }}>
          {message}
        </Text>
      ) : null}

      <Text style={{ fontWeight: '600', color: palette.text.primary }}>Create room</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        accessibilityLabel="Room name"
        style={{
          borderWidth: 1,
          borderColor: palette.border.subtle,
          borderRadius: radii.sm,
          padding: spacing.sm,
          color: palette.text.primary,
          minHeight: 44,
          marginBottom: spacing.sm,
        }}
      />
      <MobileButton
        themeMode={themeMode}
        disabled={busy}
        accessibilityLabel="Create room"
        onPress={() => {
          void (async () => {
            setBusy(true);
            try {
              const created = await apiClient.createRoom({ name: name.trim() || 'New room' });
              setName('');
              setSelectedId(created.data.id);
              setMessage(`Created ${created.data.name}. Personal workspace stays separate.`);
              await refresh();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'Create failed');
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        Create room
      </MobileButton>

      <Text style={{ fontWeight: '600', color: palette.text.primary, marginTop: spacing.md }}>
        Your rooms
      </Text>
      {rooms.map((r) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          accessibilityState={{ selected: r.id === selectedId }}
          onPress={() => setSelectedId(r.id)}
          style={{
            padding: spacing.sm,
            borderRadius: radii.sm,
            borderWidth: r.id === selectedId ? 2 : 1,
            borderColor: palette.border.subtle,
            minHeight: 44,
            marginBottom: 4,
          }}
        >
          <Text style={{ fontWeight: '600', color: palette.text.primary }}>{r.name}</Text>
          <Text style={{ fontSize: 12, color: palette.text.secondary }}>
            {r.status} · {r.actorRole}
          </Text>
        </Pressable>
      ))}

      {selected ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Text style={{ color: palette.text.secondary }}>
            Shared context: {selected.name} (not personal workspace)
          </Text>
          {selected.actorRole === 'owner' ? (
            <MobileButton
              themeMode={themeMode}
              disabled={busy}
              accessibilityLabel="Create invite link"
              onPress={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    const inv = await apiClient.createRoomInvitation(selected.id, {
                      role: 'editor',
                    });
                    Alert.alert('Invitation token', inv.data.inviteToken ?? '', [{ text: 'OK' }]);
                    setMessage(
                      'Invite token shown — copy locally; Daynori does not send messages.'
                    );
                  } catch (err) {
                    setMessage(err instanceof Error ? err.message : 'Invite failed');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Create invite link
            </MobileButton>
          ) : null}
          <MobileButton
            themeMode={themeMode}
            disabled={busy}
            accessibilityLabel="Open shared content"
            onPress={() => {
              void (async () => {
                setBusy(true);
                try {
                  const res = await apiClient.listRoomContent(selected.id);
                  setContentSummary(
                    `Notes ${res.data.notes.length} · Tasks ${res.data.tasks.length} · Files ${res.data.files.length} · role ${selected.actorRole}`
                  );
                  setMessage(
                    selected.actorRole === 'viewer'
                      ? 'Viewer: read-only shared content loaded'
                      : 'Shared content loaded (personal workspace stays separate)'
                  );
                } catch (err) {
                  const code = (err as { code?: string })?.code;
                  const msg = err instanceof Error ? err.message : 'Content failed';
                  const revoked =
                    code === 'MEMBERSHIP_REVOKED' ||
                    code === 'ROOM_ARCHIVED' ||
                    /\bMEMBERSHIP_REVOKED\b|\bROOM_ARCHIVED\b/i.test(msg);
                  setContentSummary(null);
                  setMessage(
                    revoked
                      ? 'Room access was revoked or archived. Displayed shared content was cleared. Offline copies on disconnected devices may remain until reconnect.'
                      : msg
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Open shared content
          </MobileButton>
          <MobileButton
            themeMode={themeMode}
            disabled={busy}
            accessibilityLabel="Open room chat"
            onPress={() => {
              void (async () => {
                setBusy(true);
                try {
                  const snap = loadRoomChatLocal(userId, selected.id);
                  setChatDraft(snap.draft);
                  const hist = await apiClient.listRoomChatMessages(selected.id, { limit: 40 });
                  let cursor = snap.eventCursor;
                  const events = await apiClient.listRoomChatEvents(selected.id, {
                    sinceOrder: cursor,
                    limit: 100,
                  });
                  for (const ev of events.data.events) {
                    cursor = Math.max(cursor, ev.serverOrder);
                  }
                  if (snap.eventCursor === 0 && events.data.events.length === 0) {
                    cursor = events.data.latestServerOrder;
                  }
                  const byId = new Map(
                    hist.data.messages.map((m) => [
                      m.id,
                      {
                        id: m.id,
                        body: m.body,
                        serverOrder: m.serverOrder,
                        bodyRevision: m.bodyRevision,
                        deletedAt: m.deletedAt,
                        senderId: m.senderId,
                      },
                    ])
                  );
                  for (const ev of events.data.events) {
                    if (ev.message) {
                      byId.set(ev.message.id, {
                        id: ev.message.id,
                        body: ev.message.body,
                        serverOrder: ev.message.serverOrder,
                        bodyRevision: ev.message.bodyRevision,
                        deletedAt: ev.message.deletedAt,
                        senderId: ev.message.senderId,
                      });
                    }
                  }
                  const cached = [...byId.values()].sort((a, b) => a.serverOrder - b.serverOrder);
                  saveRoomChatLocal(userId, selected.id, {
                    ...snap,
                    eventCursor: cursor,
                    messagesCache: cached,
                    draft: snap.draft,
                  });
                  setChatCache(cached);
                  setChatLines(
                    cached.map((m) =>
                      m.deletedAt ? `#${m.serverOrder} (deleted)` : `#${m.serverOrder} ${m.body}`
                    )
                  );
                  const read = await apiClient.getRoomChatReadState(selected.id);
                  setChatMuted(read.data.muted);
                  setChatConnection('connected');
                  setMessage(
                    selected.actorRole === 'viewer'
                      ? `Chat loaded (read-only). Unread ${read.data.unreadCount}${hist.data.hasMore ? ' · more history available' : ''}.`
                      : `Chat loaded. Unread ${read.data.unreadCount}${hist.data.hasMore ? ' · more history available' : ''}.`
                  );
                } catch (err) {
                  const code = (err as { code?: string })?.code;
                  const msg = err instanceof Error ? err.message : 'Chat failed';
                  const revoked =
                    code === 'MEMBERSHIP_REVOKED' ||
                    code === 'ROOM_ARCHIVED' ||
                    /\bMEMBERSHIP_REVOKED\b|\bROOM_ARCHIVED\b/i.test(msg);
                  if (revoked) {
                    clearRoomChatLocal(userId, selected.id);
                  }
                  setChatLines([]);
                  setChatDraft('');
                  setChatConnection('offline');
                  setMessage(
                    revoked
                      ? 'Room access was revoked or archived. Conversation and local chat drafts were cleared.'
                      : msg
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Open room chat
          </MobileButton>
          <MobileButton
            variant="subtle"
            themeMode={themeMode}
            disabled={busy}
            accessibilityLabel="Leave room"
            onPress={() => {
              void (async () => {
                setBusy(true);
                try {
                  await apiClient.leaveRoom(selected.id);
                  setSelectedId(null);
                  setContentSummary(null);
                  setChatLines([]);
                  setMessage('Left room');
                  await refresh();
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : 'Leave failed');
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Leave room
          </MobileButton>
          {contentSummary ? (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: palette.text.secondary, marginTop: spacing.sm }}
            >
              {contentSummary}
            </Text>
          ) : null}
          {chatLines.length > 0 || chatConnection !== 'idle' ? (
            <View style={{ marginTop: spacing.sm }} accessibilityLabel="Room conversation">
              <Text style={{ color: palette.text.secondary, marginBottom: spacing.xs }}>
                Chat · {chatConnection}
                {chatMuted ? ' · muted' : ''}
              </Text>
              {chatLines.map((line, idx) => (
                <Text
                  key={`${idx}-${line.slice(0, 12)}`}
                  accessibilityLiveRegion={idx === chatLines.length - 1 ? 'polite' : undefined}
                  style={{ color: palette.text.primary, marginBottom: 4 }}
                >
                  {line}
                </Text>
              ))}
              {selected.actorRole !== 'viewer' ? (
                <>
                  <TextInput
                    value={chatDraft}
                    onChangeText={setChatDraft}
                    accessibilityLabel="Compose room message"
                    placeholder="Message"
                    style={{
                      borderWidth: 1,
                      borderColor: palette.border.subtle,
                      borderRadius: radii.sm,
                      padding: spacing.sm,
                      color: palette.text.primary,
                      minHeight: 44,
                      marginVertical: spacing.sm,
                    }}
                  />
                  <MobileButton
                    themeMode={themeMode}
                    disabled={busy || !chatDraft.trim()}
                    accessibilityLabel="Send room message"
                    onPress={() => {
                      void (async () => {
                        const body = chatDraft.trim();
                        if (!body) return;
                        const snap = loadRoomChatLocal(userId, selected.id);
                        const existing = snap.pending.find(
                          (p) => p.status === 'failed' && p.body === body
                        );
                        const clientMessageId =
                          existing?.clientMessageId ?? crypto.randomUUID();
                        const pending = [
                          ...snap.pending.filter((p) => p.clientMessageId !== clientMessageId),
                          {
                            clientMessageId,
                            body,
                            status: 'pending' as const,
                            updatedAt: new Date().toISOString(),
                          },
                        ];
                        saveRoomChatLocal(userId, selected.id, {
                          ...snap,
                          draft: chatDraft,
                          pending,
                        });
                        setBusy(true);
                        setChatConnection('pending');
                        try {
                          const sent = await apiClient.sendRoomChatMessage(selected.id, {
                            clientMessageId,
                            body,
                          });
                          setChatLines((prev) => [
                            ...prev,
                            `#${sent.data.serverOrder} ${sent.data.body}`,
                          ]);
                          const after = loadRoomChatLocal(userId, selected.id);
                          saveRoomChatLocal(userId, selected.id, {
                            ...after,
                            draft: '',
                            pending: after.pending.filter(
                              (p) => p.clientMessageId !== clientMessageId
                            ),
                          });
                          setChatDraft('');
                          setChatConnection('connected');
                          setMessage('Message sent');
                        } catch (err) {
                          const after = loadRoomChatLocal(userId, selected.id);
                          saveRoomChatLocal(userId, selected.id, {
                            ...after,
                            pending: after.pending.map((p) =>
                              p.clientMessageId === clientMessageId
                                ? {
                                    ...p,
                                    status: 'failed' as const,
                                    error: err instanceof Error ? err.message : 'Send failed',
                                  }
                                : p
                            ),
                          });
                          setChatConnection('failed');
                          setMessage(err instanceof Error ? err.message : 'Send failed');
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    Send message
                  </MobileButton>
                </>
              ) : null}
              <MobileButton
                variant="subtle"
                themeMode={themeMode}
                disabled={busy}
                accessibilityLabel={chatMuted ? 'Unmute room chat notifications' : 'Mute room chat notifications'}
                onPress={() => {
                  void (async () => {
                    try {
                      const res = await apiClient.updateRoomChatMute(selected.id, {
                        muted: !chatMuted,
                      });
                      setChatMuted(res.data.muted);
                    } catch (err) {
                      setMessage(err instanceof Error ? err.message : 'Mute failed');
                    }
                  })();
                }}
              >
                {chatMuted ? 'Unmute notifications' : 'Mute notifications'}
              </MobileButton>
              <MobileButton
                variant="subtle"
                themeMode={themeMode}
                disabled={busy}
                accessibilityLabel="Accept community rules"
                onPress={() => {
                  void (async () => {
                    try {
                      await apiClient.acceptUgcTerms({
                        policyVersion: CURRENT_UGC_POLICY_VERSION,
                      });
                      setMessage(`Accepted community rules ${CURRENT_UGC_POLICY_VERSION}`);
                    } catch (err) {
                      setMessage(err instanceof Error ? err.message : 'Terms failed');
                    }
                  })();
                }}
              >
                Accept community rules
              </MobileButton>
              <MobileButton
                variant="subtle"
                themeMode={themeMode}
                disabled={busy || chatCache.length === 0}
                accessibilityLabel="Report a message"
                onPress={() => {
                  if (!selected || chatCache.length === 0) return;
                  const choices = chatCache
                    .slice(-8)
                    .map((m) => ({
                      id: m.id,
                      label: `#${m.serverOrder} ${(m.deletedAt ? '(deleted)' : m.body).slice(0, 40)}`,
                    }));
                  Alert.alert(
                    'Report message',
                    'Choose which message to report, then a category.',
                    [
                      ...choices.map((c) => ({
                        text: c.label,
                        onPress: () => {
                          Alert.alert('Category', 'Select a report category', [
                            {
                              text: 'Harassment',
                              onPress: () => {
                                void (async () => {
                                  try {
                                    await apiClient.createUgcReport({
                                      clientReportId: crypto.randomUUID(),
                                      targetType: 'message',
                                      roomId: selected.id,
                                      messageId: c.id,
                                      category: 'harassment',
                                    });
                                    setMessage('Report submitted');
                                  } catch (err) {
                                    setMessage(err instanceof Error ? err.message : 'Report failed');
                                  }
                                })();
                              },
                            },
                            {
                              text: 'Spam',
                              onPress: () => {
                                void (async () => {
                                  try {
                                    await apiClient.createUgcReport({
                                      clientReportId: crypto.randomUUID(),
                                      targetType: 'message',
                                      roomId: selected.id,
                                      messageId: c.id,
                                      category: 'spam',
                                    });
                                    setMessage('Report submitted');
                                  } catch (err) {
                                    setMessage(err instanceof Error ? err.message : 'Report failed');
                                  }
                                })();
                              },
                            },
                            { text: 'Cancel', style: 'cancel' },
                          ]);
                        },
                      })),
                      { text: 'Cancel', style: 'cancel' },
                    ]
                  );
                }}
              >
                Report a message
              </MobileButton>
              <MobileButton
                variant="subtle"
                themeMode={themeMode}
                disabled={busy}
                accessibilityLabel="Manage blocked users"
                onPress={() => {
                  void (async () => {
                    try {
                      const list = await apiClient.listUserBlocks();
                      if (list.data.blocks.length === 0) {
                        setMessage('No blocked users');
                        return;
                      }
                      const first = list.data.blocks[0]!;
                      Alert.alert(
                        'Blocked users',
                        `${list.data.blocks.length} blocked. Unblock ${first.blockedUserId.slice(0, 8)}…?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Unblock',
                            onPress: () => {
                              void (async () => {
                                try {
                                  await apiClient.unblockUser(first.blockedUserId);
                                  setMessage('User unblocked');
                                } catch (err) {
                                  setMessage(err instanceof Error ? err.message : 'Unblock failed');
                                }
                              })();
                            },
                          },
                        ]
                      );
                    } catch (err) {
                      setMessage(err instanceof Error ? err.message : 'Block list failed');
                    }
                  })();
                }}
              >
                Manage blocks
              </MobileButton>
              <MobileButton
                variant="subtle"
                themeMode={themeMode}
                disabled={busy || chatCache.length === 0}
                accessibilityLabel="Block last message sender"
                onPress={() => {
                  const last = [...chatCache].reverse().find((m) => m.senderId !== userId);
                  if (!last) {
                    setMessage('No other sender to block');
                    return;
                  }
                  Alert.alert(
                    'Block user',
                    'Blocks invitations between you. Shared-room membership is unchanged; their messages hide for you only.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Block',
                        style: 'destructive',
                        onPress: () => {
                          void (async () => {
                            try {
                              await apiClient.blockUser({ blockedUserId: last.senderId });
                              setChatCache((prev) => prev.filter((m) => m.senderId !== last.senderId));
                              setChatLines((prev) =>
                                prev.filter((_, i) => chatCache[i]?.senderId !== last.senderId)
                              );
                              setMessage('User blocked');
                            } catch (err) {
                              setMessage(err instanceof Error ? err.message : 'Block failed');
                            }
                          })();
                        },
                      },
                    ]
                  );
                }}
              >
                Block last other sender
              </MobileButton>
            </View>
          ) : null}
        </View>
      ) : null}

      <Text style={{ fontWeight: '600', color: palette.text.primary, marginTop: spacing.md }}>
        Accept invitation
      </Text>
      <TextInput
        value={acceptToken}
        onChangeText={setAcceptToken}
        accessibilityLabel="Invitation token"
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: palette.border.subtle,
          borderRadius: radii.sm,
          padding: spacing.sm,
          color: palette.text.primary,
          minHeight: 44,
          marginBottom: spacing.sm,
        }}
      />
      <MobileButton
        themeMode={themeMode}
        disabled={busy || !acceptToken.trim()}
        accessibilityLabel="Accept invitation"
        onPress={() => {
          void (async () => {
            setBusy(true);
            try {
              const res = await apiClient.acceptRoomInvitation({ token: acceptToken.trim() });
              setAcceptToken('');
              setSelectedId(res.data.room.id);
              setMessage(`Joined ${res.data.room.name} as ${res.data.room.actorRole}`);
              await refresh();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'Accept failed');
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        Accept invitation
      </MobileButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.md, gap: spacing.sm },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 20, fontWeight: '700' },
});
