import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';

export type MobileFeedbackSeverity = 'info' | 'success' | 'warning' | 'danger';

export interface MobileFeedbackProps {
  severity: MobileFeedbackSeverity;
  message: string;
  title?: string;
  themeMode?: ThemeMode;
}

export const MobileFeedback: React.FC<MobileFeedbackProps> = ({
  severity,
  message,
  title,
  themeMode = 'light',
}) => {
  const palette = colors[themeMode];

  let bg: string = palette.status.infoBg;
  let fg: string = palette.status.info;
  let border: string = palette.status.infoBorder;
  let icon = 'ℹ️';

  if (severity === 'success') {
    bg = palette.status.successBg;
    fg = palette.status.success;
    border = palette.status.successBorder;
    icon = '✓';
  } else if (severity === 'warning') {
    bg = palette.status.warningBg;
    fg = palette.status.warning;
    border = palette.status.warningBorder;
    icon = '⚠';
  } else if (severity === 'danger') {
    bg = palette.status.dangerBg;
    fg = palette.status.danger;
    border = palette.status.dangerBorder;
    icon = '✕';
  }

  return (
    <View
      accessible={true}
      accessibilityRole={severity === 'danger' ? 'alert' : 'none'}
      accessibilityLiveRegion={severity === 'danger' ? 'assertive' : 'polite'}
      style={[styles.container, { backgroundColor: bg, borderColor: border }]}
    >
      <Text style={[styles.icon, { color: fg }]}>{icon}</Text>
      <View style={styles.textContainer}>
        {title ? <Text style={[styles.title, { color: fg }]}>{title}</Text> : null}
        <Text style={[styles.message, { color: fg }]}>{message}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginVertical: spacing.xs,
  },
  icon: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: spacing.sm,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
});
