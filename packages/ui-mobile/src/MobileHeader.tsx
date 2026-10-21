import { Icon } from './Icon.js';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import brandSymbol from '../assets/daynori-symbol.png';

export interface MobileHeaderProps {
  title: string;
  subtitle?: string;
  themeMode?: ThemeMode;
  onOpenSearch?: () => void;
  onOpenCreate?: () => void;
  onOpenSettings?: () => void;
  testID?: string;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  title,
  subtitle,
  themeMode = 'light',
  onOpenSearch,
  onOpenCreate,
  onOpenSettings,
  testID = 'mobile-header',
}) => {
  const palette = colors[themeMode];

  return (
    <View
      testID={testID}
      accessibilityRole="header"
      style={[
        styles.container,
        {
          backgroundColor: palette.surface,
          borderBottomColor: palette.border.subtle,
        },
      ]}
    >
      <Image
        source={brandSymbol}
        accessible={false}
        importantForAccessibility="no"
        resizeMode="contain"
        style={{
          width: 34,
          height: 34,
          marginRight: spacing.sm,
          tintColor: palette.action.primary,
        }}
      />
      <View style={styles.titleContainer}>
        <Text numberOfLines={1} style={[styles.title, { color: palette.text.primary }]}>
          {title}
        </Text>
        {subtitle && (
          <Text numberOfLines={1} style={[styles.subtitle, { color: palette.text.secondary }]}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.actionsContainer}>
        {onOpenSearch && (
          <Pressable
            testID="header-search-btn"
            accessibilityRole="button"
            accessibilityLabel="Search organizer"
            onPress={onOpenSearch}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: pressed ? palette.action.subtle : 'transparent',
              },
            ]}
          >
            <Text style={styles.actionIcon} aria-hidden={true}>
              <Icon name="search" color={palette.text.primary} />
            </Text>
          </Pressable>
        )}

        {onOpenCreate && (
          <Pressable
            testID="header-create-btn"
            accessibilityRole="button"
            accessibilityLabel="Create item"
            onPress={onOpenCreate}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: pressed ? palette.action.subtle : 'transparent',
              },
            ]}
          >
            <Text style={styles.actionIcon} aria-hidden={true}>
              <Icon name="plus" color={palette.text.primary} />
            </Text>
          </Pressable>
        )}

        {onOpenSettings && (
          <Pressable
            testID="header-settings-btn"
            accessibilityRole="button"
            accessibilityLabel="Settings and help"
            onPress={onOpenSettings}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: pressed ? palette.action.subtle : 'transparent',
              },
            ]}
          >
            <Text style={styles.actionIcon} aria-hidden={true}>
              <Icon name="settings" color={palette.text.primary} />
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  titleContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionButton: {
    minWidth: touchTargets.mobileMin, // 48dp minimum touch target
    minHeight: touchTargets.mobileMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  actionIcon: {
    fontSize: 18,
  },
});
