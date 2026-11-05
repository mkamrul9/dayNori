import { Icon } from './Icon.js';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { subscribeAndroidKeyboardInsets } from './androidInsets.js';

export type MobileTab = 'today' | 'plan' | 'library' | 'journal';

export interface MobileNavigationBarProps {
  currentTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  themeMode?: ThemeMode;
  /** When set, only these primary tabs render (e.g. Journal hidden → three tabs). */
  visibleTabs?: readonly MobileTab[];
  /** Extra bottom inset (gesture/nav bar). Keyboard height is tracked separately. */
  bottomInset?: number;
  testID?: string;
}

interface TabConfig {
  key: MobileTab;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { key: 'today', label: 'Today', icon: 'sun' },
  { key: 'plan', label: 'Plan', icon: 'clipboard' },
  { key: 'library', label: 'Library', icon: 'library' },
  { key: 'journal', label: 'Journal', icon: 'edit' },
];

export const MobileNavigationBar: React.FC<MobileNavigationBarProps> = ({
  currentTab,
  onSelectTab,
  themeMode = 'light',
  visibleTabs,
  bottomInset = 0,
  testID = 'mobile-nav-bar',
}) => {
  const palette = colors[themeMode];
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const tabs =
    visibleTabs && visibleTabs.length > 0
      ? TABS.filter((tab) => visibleTabs.includes(tab.key))
      : TABS;

  useEffect(() => subscribeAndroidKeyboardInsets((s) => setKeyboardHeight(s.keyboardHeight)), []);

  // Hide bottom nav while the IME is open so Save/fields stay reachable.
  if (keyboardHeight > 0) {
    return null;
  }

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel="Main organizer navigation"
      style={[
        styles.container,
        {
          backgroundColor: palette.surface,
          borderTopColor: palette.border.subtle,
          paddingBottom: Math.max(spacing.xs, bottomInset),
        },
      ]}
    >
      {tabs.map((tab) => {
        const isSelected = currentTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            testID={`nav-tab-${tab.key}`}
            accessibilityRole="tab"
            accessibilityLabel={`${tab.label} tab`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelectTab(tab.key)}
            style={({ pressed }) => [
              styles.tabItem,
              {
                backgroundColor: isSelected
                  ? palette.action.subtle
                  : pressed
                    ? palette.surfaceRaised
                    : 'transparent',
              },
            ]}
          >
            <Icon name={tab.icon} color={palette.text.primary} />
            <Text
              numberOfLines={1}
              style={[
                styles.tabLabel,
                {
                  color: isSelected ? palette.action.primary : palette.text.secondary,
                  fontWeight: isSelected ? '700' : '500',
                },
              ]}
            >
              {tab.label}
            </Text>
            {isSelected && (
              <View style={[styles.activeIndicator, { backgroundColor: palette.action.primary }]} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  tabItem: {
    flex: 1,
    minHeight: touchTargets.mobileMin, // 48dp minimum touch target
    minWidth: touchTargets.mobileMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    paddingVertical: 4,
    paddingHorizontal: 2,
    position: 'relative',
  },
  tabIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 12,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 1,
    width: 24,
    height: 3,
    borderRadius: 1.5,
  },
});
