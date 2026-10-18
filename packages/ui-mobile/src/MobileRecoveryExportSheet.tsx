import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import type { RecoveryExport } from '@daynori/sync';
import { MobileButton } from './MobileButton.js';
import { MobileFeedback } from './MobileFeedback.js';
import { MobileModalSheet } from './MobileModalSheet.js';

export interface MobileRecoveryExportSheetProps {
  visible: boolean;
  onClose: () => void;
  exportData: RecoveryExport | null;
  onShareOrCopy?: (jsonString: string) => Promise<void> | void;
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
  const [copied, setCopied] = useState(false);

  if (!exportData) return null;

  const jsonString = JSON.stringify(exportData, null, 2);

  const handleAction = async () => {
    if (onShareOrCopy) {
      await onShareOrCopy(jsonString);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
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
            onPress={() => void handleAction()}
            accessibilityLabel="Export or copy recovery data"
          >
            {copied ? 'Export Copied / Shared!' : 'Copy / Share Recovery JSON'}
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
