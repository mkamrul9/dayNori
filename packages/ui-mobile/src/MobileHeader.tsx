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
  onOpenAssistant?: () => void;
  onOpenCreate?: () => void;
  onOpenAllFeatures?: () => void;
  onOpenSettings?: () => void;
  testID?: string;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  title,
  subtitle,
  themeMode = 'light',
  onOpenSearch,
  onOpenAssistant,
  onOpenCreate,
  onOpenAllFeatures,
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
            android_ripple={{ color: themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: pressed ? palette.action.subtle : 'transparent',
              },
            ]}
          >
            <Icon name="search" color={palette.text.primary} />
          </Pressable>
        )}

        {onOpenAssistant && (
          <Pressable
            testID="header-assistant-btn"
            accessibilityRole="button"
            accessibilityLabel="Ask Nori assistant (Gated under DEF-V2-008)"
            onPress={onOpenAssistant}
            android_ripple={{ color: themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: pressed ? palette.action.subtle : 'transparent',
              },
            ]}
          >
            <Icon name="nori" color={palette.text.primary} />
          </Pressable>
        )}

        {onOpenCreate && (
          <Pressable
            testID="header-create-btn"
            accessibilityLabel="Create item"
            accessibilityRole="button"
            onPress={onOpenCreate}
            android_ripple={{ color: themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: pressed ? palette.action.subtle : 'transparent',
              },
            ]}
          >
            <Icon name="plus" color={palette.text.primary} />
          </Pressable>
        )}

        {onOpenAllFeatures && (
          <Pressable
            testID="header-all-features-btn"
            accessibilityRole="button"
            accessibilityLabel="All features"
            onPress={onOpenAllFeatures}
            android_ripple={{ color: themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: pressed ? palette.action.subtle : 'transparent',
              },
            ]}
          >
            <Icon name="sliders" color={palette.text.primary} />
          </Pressable>
        )}

        {onOpenSettings && (
          <Pressable
            testID="header-settings-btn"
            accessibilityRole="button"
            accessibilityLabel="Settings and help"
            onPress={onOpenSettings}
            android_ripple={{ color: themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: pressed ? palette.action.subtle : 'transparent',
              },
            ]}
          >
            <Icon name="settings" color={palette.text.primary} />
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
