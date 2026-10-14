import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';

export interface MobileCardProps {
  themeMode?: ThemeMode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const MobileCard: React.FC<MobileCardProps> = ({ themeMode = 'light', children, style }) => {
  const palette = colors[themeMode];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border.subtle,
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
