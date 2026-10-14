import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';

export interface MobileListRowProps {
  title: string;
  subtitle?: string;
  meta?: string;
  selected?: boolean;
  disabled?: boolean;
  themeMode?: ThemeMode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const MobileListRow: React.FC<MobileListRowProps> = ({
  title,
  subtitle,
  meta,
  selected = false,
  disabled = false,
  themeMode = 'light',
  onPress,
  style,
}) => {
  const palette = colors[themeMode];

  let bg: string = palette.surface;
  if (selected) {
    bg = palette.action.subtle;
  } else if (disabled) {
    bg = palette.surfaceRaised;
  }

  const isInteractive = Boolean(onPress && !disabled);

  return (
    <Pressable
      accessible={true}
      accessibilityRole={isInteractive ? 'button' : 'none'}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={isInteractive ? onPress : undefined}
      android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: bg,
          borderColor: selected ? palette.action.primary : palette.border.subtle,
          opacity: pressed && isInteractive ? 0.8 : disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      <View style={styles.textContainer}>
        <Text
          style={[styles.title, { color: disabled ? palette.text.muted : palette.text.primary }]}
        >
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: palette.text.secondary }]}>{subtitle}</Text>
        )}
      </View>
      {meta && <Text style={[styles.meta, { color: palette.text.secondary }]}>{meta}</Text>}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: touchTargets.mobileMin, // 48dp minimum touch target
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.xs,
  },
  textContainer: {
    flex: 1,
    marginRight: spacing.sm,
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
