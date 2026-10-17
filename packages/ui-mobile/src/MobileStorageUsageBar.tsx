import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { computeStorageUsage } from '@daynori/domain';

export interface MobileStorageUsageBarProps {
  storedBytes: number;
  reservedBytes: number;
  maxBytes: number;
  themeMode?: ThemeMode;
  compact?: boolean;
  testID?: string;
}

export const MobileStorageUsageBar: React.FC<MobileStorageUsageBarProps> = ({
  storedBytes,
  reservedBytes,
  maxBytes,
  themeMode = 'light',
  compact = false,
  testID = 'mobile-storage-usage-bar',
}) => {
  const palette = colors[themeMode];
  const usage = computeStorageUsage(storedBytes, reservedBytes, maxBytes);

  const storedPercent = Math.min(100, Math.round((usage.storedBytes / usage.maxBytes) * 100));
  const reservedPercent = Math.min(
    100 - storedPercent,
    Math.round((usage.reservedBytes / usage.maxBytes) * 100)
  );

  const barColor = usage.isExceeded
    ? palette.status.danger
    : usage.isNearLimit
      ? palette.status.warning
      : palette.action.primary;

  const reservedColor = usage.isExceeded
    ? palette.status.danger
    : usage.isNearLimit
      ? '#f59e0b'
      : '#93c5fd';

  return (
    <View testID={testID} style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.labelTitle, { color: palette.text.primary }]}>Storage Usage</Text>
        <Text style={[styles.labelValue, { color: palette.text.secondary }]}>
          {usage.formattedStored} / {usage.formattedMax} ({usage.percentUsed}%)
        </Text>
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityValue={{
          min: 0,
          max: 100,
          now: usage.percentUsed,
          text: `${usage.percentUsed}% storage used (${usage.formattedStored} of ${usage.formattedMax})`,
        }}
        style={[
          styles.track,
          {
            height: compact ? 6 : 8,
            backgroundColor: palette.surfaceRaised,
            borderColor: palette.border.subtle,
          },
        ]}
      >
        <View style={[styles.fill, { width: `${storedPercent}%`, backgroundColor: barColor }]} />
        {reservedPercent > 0 && (
          <View
            style={[
              styles.fill,
              { width: `${reservedPercent}%`, backgroundColor: reservedColor, opacity: 0.7 },
            ]}
          />
        )}
      </View>

      {usage.isExceeded && (
        <Text
          accessibilityRole="alert"
          style={[styles.alertText, { color: palette.status.danger }]}
        >
          Storage quota exceeded. Free up space before uploading more files.
        </Text>
      )}

      {!usage.isExceeded && usage.isNearLimit && (
        <Text style={[styles.alertText, { color: palette.status.warning }]}>
          Storage is nearing capacity ({usage.percentUsed}% used).
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  labelTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  labelValue: {
    fontSize: 12,
  },
  track: {
    width: '100%',
    borderRadius: radii.pill,
    overflow: 'hidden',
    borderWidth: 1,
    flexDirection: 'row',
  },
  fill: {
    height: '100%',
  },
  alertText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
});
