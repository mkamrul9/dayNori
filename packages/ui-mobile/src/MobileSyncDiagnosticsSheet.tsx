import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import type { RedactedSyncDiagnostics } from '@daynori/sync';
import { formatSyncStateLabel } from '@daynori/sync';
import { MobileButton } from './MobileButton.js';
import { MobileFeedback } from './MobileFeedback.js';
import { MobileModalSheet } from './MobileModalSheet.js';

export interface MobileSyncDiagnosticsSheetProps {
  visible: boolean;
  onClose: () => void;
  diagnostics: RedactedSyncDiagnostics | null;
  onSyncNow?: () => Promise<void> | void;
  onOpenRecoveryExport?: () => void;
  onRefresh?: () => Promise<void> | void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const MobileSyncDiagnosticsSheet: React.FC<MobileSyncDiagnosticsSheetProps> = ({
  visible,
  onClose,
  diagnostics,
  onSyncNow,
  onOpenRecoveryExport,
  onRefresh,
  themeMode = 'light',
  testID,
}) => {
  const palette = colors[themeMode];
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!diagnostics) return null;

  const statusLabel = formatSyncStateLabel(diagnostics.cloudSyncStatus);

  const handleSync = async () => {
    if (!onSyncNow) return;
    setIsSyncing(true);
    try {
      await onSyncNow();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderMetricRow = (label: string, value: string | number | boolean | null) => (
    <View style={[styles.metricRow, { borderBottomColor: palette.border.subtle }]}>
      <Text style={[styles.metricLabel, { color: palette.text.secondary }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: palette.text.primary }]}>
        {value === null || value === undefined ? '—' : String(value)}
      </Text>
    </View>
  );

  return (
    <MobileModalSheet
      visible={visible}
      onClose={onClose}
      title="Sync & Offline Status"
      themeMode={themeMode}
      testID={testID}
    >
      <View style={styles.container}>
        {diagnostics.failedCount > 0 || diagnostics.consecutiveFailures > 0 ? (
          <MobileFeedback
            severity="warning"
            title="Attention Required"
            message={`${diagnostics.failedCount} failed mutations or ${diagnostics.consecutiveFailures} consecutive sync failures. Your data is preserved locally.`}
            themeMode={themeMode}
          />
        ) : (
          <MobileFeedback
            severity="info"
            title="Diagnostic Privacy"
            message="Redacted diagnostics. No personal notes, journal entries, or credentials are leaked or sent automatically."
            themeMode={themeMode}
          />
        )}

        {/* Connection & Account Card */}
        <View style={[styles.card, { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle }]}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            Connection & Device
          </Text>
          {renderMetricRow('Network', diagnostics.networkStatus.toUpperCase())}
          {renderMetricRow('Sync State', statusLabel)}
          {renderMetricRow('Workspace', diagnostics.workspaceId.slice(0, 8) + '...')}
          {renderMetricRow('User ID', diagnostics.userIdRedacted)}
          {renderMetricRow('Device ID', diagnostics.deviceIdRedacted)}
        </View>

        {/* Queue Metrics Card */}
        <View style={[styles.card, { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle }]}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            Queue & Storage Metrics
          </Text>
          {renderMetricRow('Queued Mutations', diagnostics.queueLength)}
          {renderMetricRow('Failed Operations', diagnostics.failedCount)}
          {renderMetricRow('Active Conflicts', diagnostics.activeConflictsCount)}
          {renderMetricRow('Failures in a Row', diagnostics.consecutiveFailures)}
          {renderMetricRow('Last Synced', diagnostics.lastSyncedAt ? new Date(diagnostics.lastSyncedAt).toLocaleTimeString() : 'Never')}
          {renderMetricRow('Sync Sequence', diagnostics.lastSyncSequence)}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {onSyncNow && (
            <MobileButton
              variant="primary"
              themeMode={themeMode}
              disabled={isSyncing || diagnostics.networkStatus === 'offline'}
              onPress={() => void handleSync()}
              accessibilityLabel="Synchronize now with cloud server"
            >
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </MobileButton>
          )}

          {onOpenRecoveryExport && (
            <MobileButton
              variant="secondary"
              themeMode={themeMode}
              onPress={onOpenRecoveryExport}
              accessibilityLabel="Export local recovery data to device"
            >
              Export Recovery Data
            </MobileButton>
          )}

          {onRefresh && (
            <MobileButton
              variant="subtle"
              themeMode={themeMode}
              disabled={isRefreshing}
              onPress={() => void handleRefresh()}
              accessibilityLabel="Refresh diagnostic metrics"
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </MobileButton>
          )}

          <MobileButton variant="subtle" themeMode={themeMode} onPress={onClose} accessibilityLabel="Close sync status">
            Close
          </MobileButton>
        </View>
      </View>
    </MobileModalSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  card: {
    padding: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  metricLabel: {
    fontSize: 13,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionsContainer: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
