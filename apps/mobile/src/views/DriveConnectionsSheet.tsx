import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton } from '@daynori/ui-mobile';
import type { DriveConnection, DriveLinkedFile, DriveLinkMode } from '@daynori/contracts';
import { buildAuthorizedDriveTree } from '@daynori/domain';
import type { DaynoriApiClient } from '@daynori/api-client';

export interface DriveConnectionsSheetProps {
  themeMode: ThemeMode;
  workspaceId: string;
  apiClient: DaynoriApiClient;
  onClose: () => void;
  /** Opens system browser / Custom Tabs — never an embedded WebView for Google OAuth. */
  openSystemBrowser?: (url: string) => void;
  testID?: string;
}

/**
 * Android connections UI for Phase 87 Drive connector.
 * Selected/app-created files under narrow drive.file scope.
 * Production Google uses Custom Tabs + server-brokered HTTPS redirect (not desktop custom schemes).
 */
export function DriveConnectionsSheet({
  themeMode,
  workspaceId,
  apiClient,
  onClose,
  openSystemBrowser,
  testID = 'drive-connections-sheet',
}: DriveConnectionsSheetProps) {
  const palette = colors[themeMode];
  const [connection, setConnection] = useState<DriveConnection | null>(null);
  const [files, setFiles] = useState<DriveLinkedFile[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{ intentId: string; state: string } | null>(null);
  const [harnessCode, setHarnessCode] = useState('fake-ok');
  const [busy, setBusy] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const status = await apiClient.getDriveConnection(workspaceId);
    setConnection(status.data);
    if (status.data.status === 'connected') {
      const listed = await apiClient.listDriveLinkedFiles(workspaceId);
      setFiles(listed.data);
    } else {
      setFiles([]);
    }
  }, [apiClient, workspaceId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setMessage(err instanceof Error ? err.message : 'Failed to load Drive status');
    });
  }, [refresh]);

  const connect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const started = await apiClient.startDriveConnect(workspaceId, {
        platform: 'android',
        returnPath: '/settings',
      });
      const url = new URL(started.data.authorizationUrl);
      const state = url.searchParams.get('state') ?? '';
      setPending({ intentId: started.data.intentId, state });
      if (started.data.providerKind === 'fake') {
        setMessage(
          started.data.developmentHarnessHint ??
            'Fake Drive fixture — complete with labeled code (not Google).'
        );
      } else if (openSystemBrowser) {
        openSystemBrowser(started.data.authorizationUrl);
      } else {
        setMessage('Open the authorization URL in a system browser / Custom Tab.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setBusy(false);
    }
  };

  const completeFake = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await apiClient.completeDriveConnect(workspaceId, {
        intentId: pending.intentId,
        state: pending.state,
        code: harnessCode,
      });
      setPending(null);
      setMessage('Fake Drive fixture connected (labeled).');
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Complete failed');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await apiClient.disconnectDrive(workspaceId);
      setMessage(res.data.message);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setBusy(false);
    }
  };

  const selectFile = async (mode: DriveLinkMode) => {
    setBusy(true);
    setMessage(null);
    try {
      if (connection?.isDevelopmentFixture) {
        await apiClient.selectDriveFile(workspaceId, {
          providerFileId: `fake-harness-${mode === 'import_copy' ? 'import' : 'selected'}-file`,
          displayName: mode === 'import_copy' ? 'Harness imported file' : 'Harness selected file',
          mimeType: 'text/plain',
          linkMode: mode,
          isShortcut: false,
          isSharedDrive: false,
        });
        setMessage(
          mode === 'import_copy'
            ? 'Import job queued for fake harness file.'
            : 'Linked fake harness reference.'
        );
      } else {
        const token = await apiClient.getDrivePickerToken(workspaceId);
        setMessage(`Picker access token issued (expires ${token.data.expiresAt}). Select file in Google Picker.`);
      }
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'File selection failed');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (linkedFileId: string, name: string) => {
    setUnlinkingId(linkedFileId);
    try {
      await apiClient.unlinkDriveFile(workspaceId, linkedFileId);
      setMessage(`Unlinked "${name}". Remote Drive original was not deleted.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unlink failed');
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <ScrollView testID={testID} contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: palette.text.primary }]}>
          Google Drive
        </Text>
        <MobileButton
          variant="subtle"
          themeMode={themeMode}
          onPress={onClose}
          accessibilityLabel="Close Drive settings"
        >
          Close
        </MobileButton>
      </View>

      <Text style={{ color: palette.text.secondary, marginBottom: spacing.sm, fontSize: 13, lineHeight: 18 }}>
        Selected/app-created files only under narrow drive.file scope. Vault content is strictly
        excluded. Disconnect removes stored tokens and cancels pending jobs; imported copies remain
        in Daynori and remote originals in Google Drive are never deleted.
      </Text>

      {/* Copy vs Reference Explanatory Box */}
      <View
        style={{
          padding: spacing.sm,
          borderRadius: radii.sm,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border.subtle,
          marginBottom: spacing.sm,
        }}
      >
        <Text style={{ fontWeight: '600', color: palette.text.primary, fontSize: 12, marginBottom: 4 }}>
          Supported Modes:
        </Text>
        <Text style={{ color: palette.text.secondary, fontSize: 11, marginBottom: 2 }}>
          • Reference: Keeps file in Drive. Online access; becomes unavailable if deleted in Drive.
        </Text>
        <Text style={{ color: palette.text.secondary, fontSize: 11, marginBottom: 2 }}>
          • Imported Copy: Saved locally in Daynori. Available offline; preserved if Drive original deleted.
        </Text>
        <Text style={{ color: palette.text.secondary, fontSize: 11 }}>
          • Vault Exclusion: Encrypted vault files cannot be shared with Drive.
        </Text>
      </View>

      {connection?.isDevelopmentFixture ? (
        <Text
          style={{ color: palette.status.warning, fontWeight: '700', marginBottom: spacing.sm, fontSize: 12 }}
        >
          Development fixture provider — not a real Google account.
        </Text>
      ) : null}

      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: palette.text.primary, marginBottom: spacing.sm, fontSize: 13 }}
        >
          {message}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: 6 }}>
        <Text style={{ color: palette.text.primary, fontSize: 13 }}>
          Status: <Text style={{ fontWeight: '700' }}>{connection?.status ?? '…'}</Text>
        </Text>
        {connection?.providerAccountEmail ? (
          <Text style={{ color: palette.text.secondary, fontSize: 12 }}>
            ({connection.providerAccountEmail})
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {connection?.status !== 'connected' ? (
          <MobileButton themeMode={themeMode} onPress={() => void connect()} disabled={busy}>
            {connection?.status === 'revoked' ? 'Reconnect Drive' : 'Connect Drive'}
          </MobileButton>
        ) : (
          <>
            <MobileButton
              variant="subtle"
              themeMode={themeMode}
              onPress={() => void selectFile('link_reference')}
              disabled={busy}
            >
              Link Reference
            </MobileButton>
            <MobileButton
              variant="subtle"
              themeMode={themeMode}
              onPress={() => void selectFile('import_copy')}
              disabled={busy}
            >
              Import Copy
            </MobileButton>
            <MobileButton
              variant="subtle"
              themeMode={themeMode}
              onPress={() => void disconnect()}
              disabled={busy}
            >
              Disconnect
            </MobileButton>
          </>
        )}
        {pending ? (
          <Pressable
            onPress={() => {
              setPending(null);
              setMessage('Consent cancelled.');
            }}
            accessibilityRole="button"
            accessibilityLabel="Cancel Drive consent"
          >
            <Text style={{ color: palette.text.secondary, fontSize: 13, marginTop: 4 }}>Cancel consent</Text>
          </Pressable>
        ) : null}
      </View>

      {pending && connection?.providerKind !== 'google_production' ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={{ color: palette.text.primary, fontWeight: '600' }}>Fake harness code</Text>
          <TextInput
            value={harnessCode}
            onChangeText={setHarnessCode}
            accessibilityLabel="Fake Drive authorization code"
            style={[
              styles.input,
              { borderColor: palette.border.subtle, color: palette.text.primary },
            ]}
          />
          <MobileButton themeMode={themeMode} onPress={() => void completeFake()} disabled={busy}>
            Complete fake consent
          </MobileButton>
        </View>
      ) : null}

      {/* Linked Files & Authorized Folders Hierarchy (Phase 107) */}
      {files.length > 0 ? (
        <View style={{ marginTop: spacing.base }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
            <Text style={{ fontWeight: '700', color: palette.text.primary, fontSize: 14 }}>
              Authorized Folders & Files ({files.length})
            </Text>
            <Text style={{ fontSize: 11, color: palette.text.secondary }}>
              Bounded to user-picked selections
            </Text>
          </View>

          {buildAuthorizedDriveTree(files).map((node) => (
            <View
              key={node.id}
              style={{
                marginBottom: spacing.xs,
                borderRadius: radii.sm,
                borderWidth: 1,
                borderColor: palette.border.subtle,
                backgroundColor: node.isFolder ? palette.surfaceRaised : palette.surface,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: spacing.sm,
                }}
              >
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {node.isFolder ? (
                      <View
                        style={{
                          backgroundColor: palette.action.subtle,
                          paddingHorizontal: 4,
                          paddingVertical: 2,
                          borderRadius: radii.sm,
                        }}
                      >
                        <Text style={{ color: palette.action.primary, fontSize: 10, fontWeight: '700' }}>
                          FOLDER
                        </Text>
                      </View>
                    ) : null}
                    <Text style={{ color: palette.text.primary, fontWeight: '600', fontSize: 13 }}>
                      {node.displayName}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color:
                        node.availability === 'permission_lost' || node.availability === 'source_unavailable'
                          ? palette.status.danger
                          : palette.text.secondary,
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {node.linkMode} · {node.availability}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void unlink(node.id, node.displayName)}
                  disabled={busy || unlinkingId === node.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Unlink ${node.displayName}`}
                >
                  <Text style={{ color: palette.status.danger, fontSize: 12, fontWeight: '600' }}>
                    {unlinkingId === node.id ? '…' : 'Unlink'}
                  </Text>
                </Pressable>
              </View>

              {node.isFolder ? (
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: palette.border.subtle,
                    paddingLeft: spacing.base,
                    paddingRight: spacing.sm,
                    paddingBottom: spacing.xs,
                    backgroundColor: palette.surface,
                  }}
                >
                  {node.children.length > 0 ? (
                    node.children.map((child) => (
                      <View
                        key={child.id}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingVertical: 4,
                          borderBottomWidth: 1,
                          borderBottomColor: palette.border.subtle,
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: spacing.sm }}>
                          <Text style={{ color: palette.text.primary, fontSize: 12, fontWeight: '500' }}>
                            {child.displayName}
                          </Text>
                          <Text style={{ color: palette.text.secondary, fontSize: 10 }}>
                            {child.linkMode} · {child.availability}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => void unlink(child.id, child.displayName)}
                          disabled={busy || unlinkingId === child.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Unlink ${child.displayName}`}
                        >
                          <Text style={{ color: palette.status.danger, fontSize: 11, fontWeight: '600' }}>
                            {unlinkingId === child.id ? '…' : 'Unlink'}
                          </Text>
                        </Pressable>
                      </View>
                    ))
                  ) : (
                    <Text style={{ color: palette.text.secondary, fontSize: 10, fontStyle: 'italic', marginVertical: 4 }}>
                      Under narrow drive.file, unpicked files in this folder are invisible.
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.base },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 20, fontWeight: '700' },
  actions: { marginTop: spacing.base, gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginVertical: spacing.sm,
  },
});
