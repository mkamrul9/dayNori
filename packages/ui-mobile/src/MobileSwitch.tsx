import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';

export interface MobileSwitchProps {
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  themeMode?: ThemeMode;
  disabled?: boolean;
  description?: string;
}

export const MobileSwitch: React.FC<MobileSwitchProps> = ({
  label,
  checked,
  onCheckedChange,
  themeMode = 'light',
  disabled = false,
  description,
}) => {
  const palette = colors[themeMode];
  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: touchTargets.mobileMin,
          gap: spacing.base,
        }}
      >
        <Text style={{ flex: 1, fontWeight: '600', color: disabled ? palette.text.muted : palette.text.primary }}>
          {label}
        </Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked, disabled }}
          accessibilityLabel={label}
          disabled={disabled}
          onPress={() => onCheckedChange(!checked)}
          style={{
            width: 52,
            height: 32,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.border.strong,
            backgroundColor: checked ? palette.action.primary : palette.surfaceRaised,
            justifyContent: 'center',
            paddingHorizontal: 3,
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: checked ? palette.action.label : palette.text.primary,
              alignSelf: checked ? 'flex-end' : 'flex-start',
            }}
          />
        </Pressable>
      </View>
      {description ? (
        <Text style={{ color: palette.text.secondary, fontSize: 13 }}>{description}</Text>
      ) : null}
    </View>
  );
};
