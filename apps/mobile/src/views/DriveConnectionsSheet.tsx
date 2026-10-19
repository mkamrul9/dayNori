import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton } from '@daynori/ui-mobile';
import type { DriveConnection, DriveLinkedFile } from '@daynori/contracts';
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
 * Android connections UI for Phase 49 provisional Drive connector.
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
      setMessage('Fake Drive fixture connected.');
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

      <Text style={{ color: palette.text.secondary, marginBottom: spacing.md }}>
        Selected/app-created files only (drive.file). Vault excluded. Disconnect keeps imported
        copies and does not trash remote originals.
      </Text>

      {connection?.isDevelopmentFixture ? (
        <Text
          style={{ color: palette.status.warning, fontWeight: '700', marginBottom: spacing.sm }}
        >
          Development fixture — not a real Google account.
        </Text>
      ) : null}

      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: palette.text.primary, marginBottom: spacing.sm }}
        >
          {message}
        </Text>
      ) : null}

      <Text style={{ color: palette.text.primary }}>Status: {connection?.status ?? '…'}</Text>
      {connection?.providerAccountEmail ? (
        <Text style={{ color: palette.text.primary }}>
          Identity: {connection.providerAccountEmail}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {connection?.status !== 'connected' ? (
          <MobileButton themeMode={themeMode} onPress={() => void connect()} disabled={busy}>
            Connect Drive
          </MobileButton>
        ) : (
          <MobileButton
            variant="subtle"
            themeMode={themeMode}
            onPress={() => void disconnect()}
            disabled={busy}
          >
            Disconnect
          </MobileButton>
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
            <Text style={{ color: palette.text.secondary }}>Cancel consent</Text>
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

      {files.map((f) => (
        <Text key={f.id} style={{ color: palette.text.secondary, marginTop: spacing.sm }}>
          {f.displayName} ({f.availability})
        </Text>
      ))}
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
