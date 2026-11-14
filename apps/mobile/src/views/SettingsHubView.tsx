import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { Icon, MobileButton, MobileCard, MobileListRow } from '@daynori/ui-mobile';
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
 * Modern, calm native Settings hub — Phase 106 component overhaul.
 * Consolidates settings groups into an elegant notebook card with soft divided rows,
 * eliminating repetitive card borders while ensuring >= 48dp touch targets and clear type hierarchy.
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

      <MobileCard
        testID="settings-groups-card"
        variant="subtle"
        themeMode={themeMode}
        style={{ padding: 0, overflow: 'hidden' }}
      >
        {MOBILE_SETTINGS_GROUPS.map((group, index) => {
          const isLast = index === MOBILE_SETTINGS_GROUPS.length - 1;
          return (
            <MobileListRow
              key={group.id}
              testID={`settings-group-${group.id}`}
              title={group.title}
              subtitle={group.description}
              variant="divided"
              themeMode={themeMode}
              onPress={() => onOpenGroup(group.id)}
              accessibilityLabel={`${group.title}. ${group.description}`}
              leading={
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: palette.action.subtle },
                  ]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Icon name={group.icon} color={palette.action.primary} />
                </View>
              }
              trailing={
                <Icon name="chevron-right" color={palette.text.secondary} />
              }
              style={{
                borderBottomWidth: isLast ? 0 : 1,
                borderBottomColor: palette.border.subtle,
              }}
            />
          );
        })}
      </MobileCard>
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
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
