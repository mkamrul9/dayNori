import React from 'react';
import { Pressable, type PressableProps } from 'react-native';
import { colors, radii, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { Icon, type IconProps } from './Icon.js';

export interface MobileIconButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  icon: IconProps['name'];
  themeMode?: ThemeMode;
  loading?: boolean;
}

export const MobileIconButton: React.FC<MobileIconButtonProps> = ({
  label,
  icon,
  themeMode = 'light',
  loading = false,
  disabled = false,
  ...props
}) => {
  const palette = colors[themeMode];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={{
        width: touchTargets.mobileMin,
        height: touchTargets.mobileMin,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radii.sm,
        backgroundColor: 'transparent',
      }}
      {...props}
    >
      <Icon name={icon} size={22} color={isDisabled ? palette.text.muted : palette.text.primary} />
    </Pressable>
  );
};
