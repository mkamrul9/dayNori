import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { Icon, MobileButton, MobileCard } from '@daynori/ui-mobile';
import {
  getDefaultFeaturePersonalization,
  sanitizeAndMigrateFeaturePersonalization,
  searchFeatureDirectory,
  type FeatureAuthContext,
  type FeaturePersonalization,
  type FeatureReleaseContext,
} from '@daynori/domain';
import { isCorePreview } from '../config/runtime.js';

export interface AllFeaturesSheetProps {
  themeMode: ThemeMode;
  isAuthenticated: boolean;
  hasWorkspace: boolean;
  isOperator?: boolean;
  personalization?: FeaturePersonalization;
  onClose: () => void;
  onOpenDestination: (mobileDestination: string) => void;
  onChangePersonalization?: (next: FeaturePersonalization) => void;
}

export function AllFeaturesSheet({
  themeMode,
  isAuthenticated,
  hasWorkspace,
  isOperator = false,
  personalization = getDefaultFeaturePersonalization(),
  onClose,
  onOpenDestination,
  onChangePersonalization,
}: AllFeaturesSheetProps) {
  const palette = colors[themeMode];
  const [query, setQuery] = useState('');

  const release: FeatureReleaseContext = {
    platform: 'android',
    corePreview: isCorePreview,
    production: !__DEV__,
    moduleReleased: {
      vault: false,
      drive: false,
      rooms: false,
      billing: false,
      assistant: false,
    },
    capabilityKnown: true,
  };
  const auth: FeatureAuthContext = {
    authenticated: isAuthenticated,
    hasWorkspaceMembership: hasWorkspace,
    isPlatformOperator: isOperator,
    privilegeKnown: true,
  };

  const results = useMemo(
    () =>
      searchFeatureDirectory(query, release, auth, personalization, {
        includeHiddenForRestore: true,
      }),
    [query, release, auth, personalization]
  );

  return (
    <View
      style={[styles.root, { backgroundColor: palette.background }]}
      testID="all-features-sheet"
    >
      <View style={[styles.header, { borderBottomColor: palette.border.subtle }]}>
        <Text style={[styles.title, { color: palette.text.primary }]}>All features</Text>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close All features"
          style={{ minHeight: touchTargets.mobileMin, justifyContent: 'center' }}
        >
          <Icon name="x" />
        </Pressable>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search features"
        accessibilityLabel="Search features"
        placeholderTextColor={palette.text.secondary}
        style={[
          styles.search,
          {
            color: palette.text.primary,
            borderColor: palette.border.subtle,
            backgroundColor: palette.surface,
          },
        ]}
      />
      <ScrollView contentContainerStyle={styles.list}>
        {results.length === 0 ? (
          <Text style={{ color: palette.text.secondary }}>
            {query.trim() ? 'No features match that search.' : 'No features available.'}
          </Text>
        ) : (
          results.map(({ feature, eligibility }) => (
            <MobileCard key={feature.id} themeMode={themeMode} style={{ marginBottom: spacing.sm }}>
              <Text style={{ fontWeight: '700', color: palette.text.primary }}>
                {feature.label}
              </Text>
              <Text style={{ color: palette.text.secondary, marginTop: 4, fontSize: 13 }}>
                {eligibility.personallyHidden
                  ? 'Hidden by you — content kept.'
                  : eligibility.statusLabel || feature.description}
              </Text>
              <View style={styles.actions}>
                {eligibility.usable ? (
                  <MobileButton
                    variant="primary"
                    themeMode={themeMode}
                    onPress={() => onOpenDestination(feature.mobileDestination)}
                    accessibilityLabel={`Open ${feature.label}`}
                  >
                    Open
                  </MobileButton>
                ) : null}
                {eligibility.personallyHidden && onChangePersonalization ? (
                  <MobileButton
                    variant="secondary"
                    themeMode={themeMode}
                    onPress={() =>
                      onChangePersonalization(
                        sanitizeAndMigrateFeaturePersonalization({
                          ...personalization,
                          hiddenFeatureIds: personalization.hiddenFeatureIds.filter(
                            (id) => id !== feature.id
                          ),
                        })
                      )
                    }
                  >
                    Restore
                  </MobileButton>
                ) : null}
                {eligibility.canHide && !eligibility.personallyHidden && onChangePersonalization ? (
                  <MobileButton
                    variant="secondary"
                    themeMode={themeMode}
                    onPress={() =>
                      onChangePersonalization(
                        sanitizeAndMigrateFeaturePersonalization({
                          ...personalization,
                          hiddenFeatureIds: [
                            ...new Set([...personalization.hiddenFeatureIds, feature.id]),
                          ],
                        })
                      )
                    }
                  >
                    Hide
                  </MobileButton>
                ) : null}
              </View>
            </MobileCard>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 20, fontWeight: '800' },
  search: {
    margin: spacing.md,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    minHeight: touchTargets.mobileMin,
  },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});
