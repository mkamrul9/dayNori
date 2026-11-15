import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';

export interface MobileCardProps {
  themeMode?: ThemeMode;
  variant?: 'subtle' | 'outlined' | 'elevated' | 'flat';
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessible?: boolean;
  accessibilityRole?: 'none' | 'summary' | 'button' | 'header';
  accessibilityLabel?: string;
}

/**
 * Calm, notebook-inspired native mobile card.
 * Supports subtle, outlined, elevated, and flat variants with native Android elevation.
 */
export const MobileCard: React.FC<MobileCardProps> = ({
  themeMode = 'light',
  variant = 'subtle',
  children,
  style,
  testID,
  accessible,
  accessibilityRole,
  accessibilityLabel,
}) => {
  const palette = colors[themeMode];

  let bg: string = palette.surface;
  let borderColor: string = palette.border.subtle;
  let elevation: number = 1;

  if (variant === 'flat') {
    bg = palette.surfaceRaised;
    borderColor = 'transparent';
    elevation = 0;
  } else if (variant === 'elevated') {
    bg = palette.surface;
    borderColor = palette.border.subtle;
    elevation = 2;
  } else if (variant === 'outlined') {
    bg = palette.surface;
    borderColor = palette.border.subtle;
    elevation = 0;
  }

  return (
    <View
      testID={testID}
      accessible={accessible}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderColor,
          elevation,
          shadowColor: themeMode === 'dark' ? '#000000' : '#172C2C',
          shadowOffset: { width: 0, height: elevation > 0 ? 1 : 0 },
          shadowOpacity: elevation > 1 ? 0.12 : elevation > 0 ? 0.06 : 0,
          shadowRadius: elevation * 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.base,
    marginVertical: spacing.xs,
  },
});
