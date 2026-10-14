import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton } from './MobileButton.js';

export interface MobileEmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  themeMode?: ThemeMode;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export const MobileEmptyState: React.FC<MobileEmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  themeMode = 'light',
  containerStyle,
  testID = 'mobile-empty-state',
}) => {
  const palette = colors[themeMode];

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={`${title}. ${description}`}
      style={[
        styles.container,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border.subtle,
        },
        containerStyle,
      ]}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: palette.text.primary }]}>
        {title}
      </Text>
      <Text style={[styles.description, { color: palette.text.secondary }]}>{description}</Text>
      {actionLabel && onAction && (
        <View style={styles.actionContainer}>
          <MobileButton
            variant="primary"
            themeMode={themeMode}
            onPress={onAction}
            accessibilityLabel={actionLabel}
          >
            {actionLabel}
          </MobileButton>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  actionContainer: {
    width: '100%',
    maxWidth: 240,
  },
});
