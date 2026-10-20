import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton } from '@daynori/ui-mobile';
import type { Room } from '@daynori/contracts';
import type { DaynoriApiClient } from '@daynori/api-client';

export interface RoomsSheetProps {
  themeMode: ThemeMode;
  personalWorkspaceId: string;
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
