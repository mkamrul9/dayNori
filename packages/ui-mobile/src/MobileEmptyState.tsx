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
  icon?: React.ReactNode;
  testID?: string;
}

/**
 * Calm, notebook-inspired native mobile empty state.
 * Features a circular icon badge, warm typography, and clear recovery action.
 */
export const MobileEmptyState: React.FC<MobileEmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  themeMode = 'light',
  containerStyle,
  icon,
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
          backgroundColor: palette.surfaceRaised,
          borderColor: palette.border.subtle,
        },
        containerStyle,
      ]}
    >
      {icon && (
        <View
          style={[
            styles.iconBadge,
            {
              backgroundColor: palette.action.subtle,
            },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {icon}
        </View>
      )}
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
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
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
    maxWidth: 320,
  },
  actionContainer: {
    marginTop: spacing.md,
  },
});
