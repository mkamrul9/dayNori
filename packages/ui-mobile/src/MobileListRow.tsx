import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';

export interface MobileListRowProps {
  title: string;
  subtitle?: string;
  meta?: string;
  metadata?: string;
  selected?: boolean;
  disabled?: boolean;
  themeMode?: ThemeMode;
  variant?: 'card' | 'flat' | 'divided';
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Calm, accessible native mobile list row.
 * Supports card, flat, and divided variants with leading/trailing widgets and touch target compliance.
 */
export const MobileListRow: React.FC<MobileListRowProps> = ({
  title,
  subtitle,
  meta,
  metadata,
  selected = false,
  disabled = false,
  themeMode = 'light',
  variant = 'card',
  leading,
  trailing,
  onPress,
  style,
  accessibilityLabel,
  testID,
}) => {
  const displaySubtitle = subtitle || metadata;
  const palette = colors[themeMode];

  let bg: string = palette.surface;
  if (selected) {
    bg = palette.action.subtle;
  } else if (disabled) {
    bg = palette.surfaceRaised;
  } else if (variant === 'flat') {
    bg = palette.surfaceRaised;
  }

  let borderWidth: number = 1;
  let borderColor: string = selected ? palette.action.primary : palette.border.subtle;
  let borderRadius: number = radii.sm;
  let marginVertical: number = spacing.xs;

  if (variant === 'flat') {
    borderColor = 'transparent';
  } else if (variant === 'divided') {
    borderRadius = 0;
    borderWidth = 0;
    marginVertical = 0;
  }

  const isInteractive = Boolean(onPress && !disabled);

  return (
    <Pressable
      testID={testID}
      accessible={true}
      accessibilityRole={isInteractive ? 'button' : 'none'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={isInteractive ? onPress : undefined}
      android_ripple={{ color: themeMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: variant === 'divided' ? 0 : borderWidth,
          borderBottomWidth: variant === 'divided' ? 1 : borderWidth,
          borderBottomColor: variant === 'divided' ? palette.border.subtle : borderColor,
          borderRadius,
          marginVertical,
          opacity: pressed && isInteractive ? 0.8 : disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      {leading && <View style={styles.leadingContainer}>{leading}</View>}

      <View style={styles.textContainer}>
        <Text
          style={[styles.title, { color: disabled ? palette.text.muted : palette.text.primary }]}
        >
          {title}
        </Text>
        {displaySubtitle && (
          <Text style={[styles.subtitle, { color: palette.text.secondary }]}>
            {displaySubtitle}
          </Text>
        )}
      </View>

      {meta && <Text style={[styles.meta, { color: palette.text.secondary }]}>{meta}</Text>}
      {trailing && <View style={styles.trailingContainer}>{trailing}</View>}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: touchTargets.mobileMin, // 48dp minimum touch target
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leadingContainer: {
    marginRight: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  trailingContainer: {
    marginLeft: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  meta: {
    fontSize: 12,
  },
});
