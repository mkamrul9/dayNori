import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';

export interface MobileBreadcrumbSegment {
  id: string | null;
  label: string;
}

export interface MobileBreadcrumbProps {
  segments: MobileBreadcrumbSegment[];
  themeMode?: ThemeMode;
  onPressSegment?: (segment: MobileBreadcrumbSegment, index: number) => void;
  onPressBack?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const MobileBreadcrumb: React.FC<MobileBreadcrumbProps> = ({
  segments,
  themeMode = 'light',
  onPressSegment,
  onPressBack,
  style,
  testID = 'mobile-breadcrumb',
}) => {
  const palette = colors[themeMode];
  const canGoBack = segments.length > 1;

  const fullPathText = segments.map((s) => s.label).join(' / ');

  return (
    <View
      testID={testID}
      accessible={true}
      accessibilityRole="header"
      accessibilityLabel={`Current location: ${fullPathText}`}
      style={[
        styles.container,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border.subtle,
        },
        style,
      ]}
    >
      {canGoBack && onPressBack && (
        <Pressable
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Go back to parent folder"
          onPress={onPressBack}
          style={({ pressed }) => [
            styles.backButton,
            {
              borderColor: palette.border.subtle,
              backgroundColor: palette.surfaceRaised,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.backIcon, { color: palette.text.primary }]}>&larr;</Text>
          <Text style={[styles.backText, { color: palette.text.primary }]}>Up</Text>
        </Pressable>
      )}

      <View style={styles.segmentsRow}>
        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1;
          return (
            <React.Fragment key={seg.id ?? `seg-${idx}`}>
              {idx > 0 && <Text style={[styles.separator, { color: palette.text.muted }]}>/</Text>}
              {isLast ? (
                <Text
                  style={[styles.currentSegment, { color: palette.text.primary }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {seg.label}
                </Text>
              ) : (
                <Pressable
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={`Navigate to ${seg.label}`}
                  onPress={() => onPressSegment?.(seg, idx)}
                  style={styles.segmentButton}
                >
                  <Text
                    style={[styles.segmentLink, { color: palette.action.primary }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {seg.label}
                  </Text>
                </Pressable>
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderWidth: 1,
    borderRadius: radii.card,
    minHeight: touchTargets.mobileMin,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginRight: spacing.sm,
    minHeight: 36,
  },
  backIcon: {
    fontSize: 16,
    fontWeight: '700',
    marginRight: 4,
  },
  backText: {
    fontSize: 13,
    fontWeight: '600',
  },
  segmentsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  separator: {
    marginHorizontal: spacing.xs,
    fontSize: 14,
  },
  currentSegment: {
    fontSize: 15,
    fontWeight: '700',
    maxWidth: 160,
  },
  segmentButton: {
    maxWidth: 120,
    justifyContent: 'center',
  },
  segmentLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});
