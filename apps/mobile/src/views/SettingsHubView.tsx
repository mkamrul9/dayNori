import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { Icon, MobileButton, MobileCard } from '@daynori/ui-mobile';
import {
  MOBILE_SETTINGS_GROUPS,
  type MobileSettingsGroupId,
} from '../settings/settingsGroups.js';

export interface SettingsHubViewProps {
  themeMode: ThemeMode;
  onOpenGroup: (id: MobileSettingsGroupId) => void;
  onClose: () => void;
  testID?: string;
}

/**
 * Grouped Settings entry — Phase 71 native hub (parity with web /settings).
 */
export function SettingsHubView({
  themeMode,
  onOpenGroup,
  onClose,
  testID = 'settings-hub',
}: SettingsHubViewProps) {
  const palette = colors[themeMode];

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: palette.text.primary }]}
        >
          Settings
        </Text>
        <MobileButton
          variant="subtle"
          themeMode={themeMode}
          onPress={onClose}
          accessibilityLabel="Close settings"
        >
          <Icon name="x" /> Done
        </MobileButton>
      </View>
      <Text style={[styles.subtitle, { color: palette.text.secondary }]}>
        Choose a group. Appearance, privacy, and workspace controls open on focused screens.
      </Text>

      {MOBILE_SETTINGS_GROUPS.map((group) => (
        <Pressable
          key={group.id}
          testID={`settings-group-${group.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${group.title}. ${group.description}`}
          onPress={() => onOpenGroup(group.id)}
          style={{ marginBottom: spacing.sm }}
        >
          <MobileCard themeMode={themeMode}>
            <View style={styles.row}>
              <View
                style={[styles.iconWrap, { backgroundColor: palette.surfaceRaised }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Icon name={group.icon} color={palette.action.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.groupTitle, { color: palette.text.primary }]}>
                  {group.title}
                </Text>
                <Text style={[styles.groupDesc, { color: palette.text.secondary }]}>
                  {group.description}
                </Text>
              </View>
              <Icon name="chevron-right" color={palette.text.secondary} />
            </View>
          </MobileCard>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.base,
    paddingBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: spacing.base,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.base,
    minHeight: touchTargets.mobileMin,
  },
  iconWrap: {
    width: touchTargets.mobileMin,
    height: touchTargets.mobileMin,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  groupDesc: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
});
