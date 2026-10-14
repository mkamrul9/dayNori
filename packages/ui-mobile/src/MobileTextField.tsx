import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';

export interface MobileTextFieldProps extends TextInputProps {
  label: string;
  helperText?: string;
  errorMessage?: string;
  themeMode?: ThemeMode;
  containerStyle?: StyleProp<ViewStyle>;
}

export const MobileTextField: React.FC<MobileTextFieldProps> = ({
  label,
  helperText,
  errorMessage,
  themeMode = 'light',
  editable = true,
  containerStyle,
  style,
  ...props
}) => {
  const palette = colors[themeMode];
  const isInvalid = Boolean(errorMessage);

  const borderColor = isInvalid
    ? palette.status.danger
    : editable === false
      ? palette.border.subtle
      : palette.border.strong;

  return (
    <View style={[styles.container, containerStyle]}>
      <Text
        style={[
          styles.label,
          { color: editable === false ? palette.text.muted : palette.text.primary },
        ]}
      >
        {label}
      </Text>

      <TextInput
        accessible={true}
        accessibilityLabel={`${label}${isInvalid ? ', error: ' + errorMessage : ''}`}
        accessibilityHint={errorMessage || helperText}
        accessibilityState={{ disabled: !editable }}
        editable={editable}
        placeholderTextColor={palette.text.muted}
        style={[
          styles.input,
          {
            backgroundColor: editable === false ? palette.surfaceRaised : palette.surface,
            borderColor,
            color: editable === false ? palette.text.muted : palette.text.primary,
          },
          style,
        ]}
        {...props}
      />

      {helperText && !errorMessage && (
        <Text style={[styles.helper, { color: palette.text.secondary }]}>{helperText}</Text>
      )}

      {errorMessage && (
        <Text accessibilityRole="alert" style={[styles.error, { color: palette.status.danger }]}>
          {errorMessage}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: touchTargets.mobileMin, // 48dp minimum
    borderWidth: 1.5,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  helper: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  error: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: spacing.xs,
  },
});
