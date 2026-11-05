import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';

export interface MobileSegmentOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface MobileSegmentedControlProps {
  label: string;
  options: MobileSegmentOption[];
  value: string;
  onChange: (value: string) => void;
  themeMode?: ThemeMode;
}

export const MobileSegmentedControl: React.FC<MobileSegmentedControlProps> = ({
  label,
  options,
  value,
  onChange,
  themeMode = 'light',
}) => {
  const palette = colors[themeMode];
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label}>
      <Text style={{ fontWeight: '600', marginBottom: spacing.xs, color: palette.text.primary }}>
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          borderWidth: 1,
          borderColor: palette.border.strong,
          borderRadius: radii.sm,
          overflow: 'hidden',
        }}
      >
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="tab"
              accessibilityState={{ selected, disabled: Boolean(opt.disabled) }}
              disabled={opt.disabled}
              onPress={() => onChange(opt.value)}
              style={{
                minHeight: touchTargets.mobileMin,
                paddingHorizontal: spacing.md,
                justifyContent: 'center',
                backgroundColor: selected ? palette.action.subtle : palette.surface,
              }}
            >
              <Text
                style={{
                  color: selected ? palette.action.subtleText : palette.text.secondary,
                  fontWeight: selected ? '700' : '500',
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};
