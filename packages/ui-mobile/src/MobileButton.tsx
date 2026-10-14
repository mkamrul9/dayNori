import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';

export interface MobileButtonProps extends Omit<PressableProps, 'style'> {
  title?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'subtle' | 'danger';
  themeMode?: ThemeMode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const MobileButton: React.FC<MobileButtonProps> = ({
  title,
  children,
  variant = 'primary',
  themeMode = 'light',
  loading = false,
  disabled = false,
  accessibilityLabel,
  style,
  ...props
}) => {
  const palette = colors[themeMode];
  const isDisabled = disabled || loading;

  let bg: string = palette.action.primary;
  let fg: string = palette.action.label;
  let borderColor: string = 'transparent';

  if (variant === 'secondary') {
    bg = palette.surface;
    fg = palette.text.primary;
    borderColor = palette.border.strong;
  } else if (variant === 'subtle') {
    bg = palette.action.subtle;
    fg = palette.action.subtleText;
  } else if (variant === 'danger') {
    bg = palette.action.danger;
    fg = palette.action.dangerLabel;
  }

  if (isDisabled) {
    bg = palette.action.disabled;
    fg = palette.action.disabledText;
    borderColor = variant === 'secondary' ? palette.border.subtle : 'transparent';
  }

  const labelText = typeof children === 'string' ? children : title;
  const computedAccessibilityLabel =
    accessibilityLabel || (typeof labelText === 'string' ? labelText : undefined);

  return (
    <Pressable
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={computedAccessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: variant === 'secondary' ? 1 : 0,
          opacity: pressed && !isDisabled ? 0.85 : 1,
        },
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} accessibilityLabel="Loading" />
      ) : children ? (
        typeof children === 'string' ? (
          <Text style={[styles.text, { color: fg }]}>{children}</Text>
        ) : (
          children
        )
      ) : (
        <Text style={[styles.text, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: touchTargets.mobileMin, // 48dp minimum touch target
    minWidth: touchTargets.mobileMin,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
