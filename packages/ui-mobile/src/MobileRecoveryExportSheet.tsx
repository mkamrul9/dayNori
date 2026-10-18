import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import type { RecoveryExport } from '@daynori/sync';
import { MobileButton } from './MobileButton.js';
import { MobileFeedback } from './MobileFeedback.js';
import { MobileModalSheet } from './MobileModalSheet.js';

export type MobileExportActionResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'unavailable'; error?: string }
  | { status: 'failure'; error?: string };

export interface MobileRecoveryExportSheetProps {
  visible: boolean;
  onClose: () => void;
  exportData: RecoveryExport | null;
  onShareOrCopy?: (
    jsonString: string,
    actionType?: 'copy' | 'share'
  ) => Promise<MobileExportActionResult | void> | MobileExportActionResult | void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const MobileRecoveryExportSheet: React.FC<MobileRecoveryExportSheetProps> = ({
  visible,
  onClose,
  exportData,
  onShareOrCopy,
  themeMode = 'light',
  testID,
}) => {
  const palette = colors[themeMode];
  const [showJson, setShowJson] = useState(false);
  const [actionStatus, setActionStatus] = useState<
    'idle' | 'success' | 'cancelled' | 'unavailable' | 'failure'
  >('idle');
  const [actionError, setActionError] = useState<string | null>(null);

  if (!exportData) return null;

  const jsonString = JSON.stringify(exportData, null, 2);

  const handleAction = async (actionType: 'copy' | 'share' = 'share') => {
    if (!onShareOrCopy) {
      setActionStatus('unavailable');
      setActionError('Platform sharing and clipboard capabilities are not available in this environment.');
      return;
    }

    try {
      const result = await onShareOrCopy(jsonString, actionType);
      if (result && typeof result === 'object' && 'status' in result) {
        if (result.status === 'success') {
          setActionStatus('success');
          setActionError(null);
          setTimeout(() => setActionStatus('idle'), 2500);
        } else if (result.status === 'cancelled') {
          setActionStatus('cancelled');
          setActionError(null);
          setTimeout(() => setActionStatus('idle'), 2500);
        } else if (result.status === 'unavailable') {
          setActionStatus('unavailable');
          setActionError(result.error || 'Export capability is unavailable.');
        } else {
          setActionStatus('failure');
          setActionError(result.error || 'Failed to export recovery data.');
        }
      } else {
        setActionStatus('success');
        setActionError(null);
        setTimeout(() => setActionStatus('idle'), 2500);
      }
    } catch (err: unknown) {
      setActionStatus('failure');
      setActionError(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  return (
    <MobileModalSheet
      visible={visible}
      onClose={onClose}
      title="Export Recovery Data"
      themeMode={themeMode}
      testID={testID}
    >
      <View style={styles.container}>
        <MobileFeedback
          severity="warning"
          title="Security Notice"
          message="Exported recovery data is unencrypted plain text JSON. Store it safely. Passwords, auth tokens, and vault items are excluded."
          themeMode={themeMode}
        />

        {actionStatus === 'unavailable' && (
          <MobileFeedback
            severity="warning"
            title="Export Unavailable"
            message={actionError || 'Sharing capability is not available.'}
            themeMode={themeMode}
          />
        )}
        {actionStatus === 'failure' && (
          <MobileFeedback
            severity="danger"
            title="Export Failed"
            message={actionError || 'Could not export recovery data.'}
            themeMode={themeMode}
          />
        )}
        {actionStatus === 'cancelled' && (
          <MobileFeedback
            severity="info"
            title="Export Cancelled"
            message="Export sharing was dismissed. Your local recovery data is preserved."
            themeMode={themeMode}
          />
        )}

        {/* Summary Card */}
        <View style={[styles.card, { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle }]}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            Local Items for Recovery
          </Text>
          <View style={styles.metricRow}>
            <Text style={[styles.metricLabel, { color: palette.text.secondary }]}>Offline Drafts:</Text>
            <Text style={[styles.metricValue, { color: palette.text.primary }]}>{exportData.summary.draftsCount}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={[styles.metricLabel, { color: palette.text.secondary }]}>Queued Mutations:</Text>
            <Text style={[styles.metricValue, { color: palette.text.primary }]}>{exportData.summary.pendingMutationsCount}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={[styles.metricLabel, { color: palette.text.secondary }]}>Unresolved Conflicts:</Text>
            <Text style={[styles.metricValue, { color: palette.text.primary }]}>{exportData.summary.conflictsCount}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={[styles.metricLabel, { color: palette.text.secondary }]}>Unfinalized Files:</Text>
            <Text style={[styles.metricValue, { color: palette.text.primary }]}>{exportData.summary.unfinalizedFilesCount}</Text>
          </View>
        </View>

        {/* JSON Preview Toggle */}
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowJson(!showJson)}
          style={styles.toggleButton}
        >
          <Text style={[styles.toggleText, { color: palette.action.primary }]}>
            {showJson ? 'Hide raw JSON preview' : 'View raw JSON preview'}
          </Text>
        </Pressable>

        {showJson && (
          <ScrollView
            style={[styles.jsonBox, { backgroundColor: palette.surface, borderColor: palette.border.subtle }]}
            nestedScrollEnabled={true}
          >
            <Text style={[styles.jsonText, { color: palette.text.secondary }]}>{jsonString}</Text>
          </ScrollView>
        )}

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <MobileButton
            variant="primary"
            themeMode={themeMode}
            onPress={() => void handleAction('share')}
            accessibilityLabel="Export or copy recovery data"
          >
            {actionStatus === 'success' ? 'Export Copied / Shared!' : 'Copy / Share Recovery JSON'}
          </MobileButton>

          <MobileButton variant="subtle" themeMode={themeMode} onPress={onClose} accessibilityLabel="Close export dialog">
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
  },
  metricLabel: {
    fontSize: 13,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  toggleButton: {
    paddingVertical: 2,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  jsonBox: {
    maxHeight: 180,
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  jsonText: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  actionsContainer: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
