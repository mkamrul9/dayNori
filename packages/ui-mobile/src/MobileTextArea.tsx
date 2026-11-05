import React from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radii, spacing, typography, type ThemeMode } from '@daynori/design-tokens';

export interface MobileTextAreaProps extends TextInputProps {
  label: string;
  helperText?: string;
  errorMessage?: string;
  themeMode?: ThemeMode;
}

export const MobileTextArea: React.FC<MobileTextAreaProps> = ({
  label,
  helperText,
  errorMessage,
  themeMode = 'light',
  editable = true,
  style,
  ...props
}) => {
  const palette = colors[themeMode];
  const invalid = Boolean(errorMessage);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontWeight: '600', color: editable ? palette.text.primary : palette.text.muted }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityState={{ disabled: !editable }}
        editable={editable}
        multiline
        textAlignVertical="top"
        placeholderTextColor={palette.text.muted}
        style={[
          {
            minHeight: 120,
            padding: spacing.sm,
            borderWidth: 1,
            borderColor: invalid ? palette.status.danger : palette.border.strong,
            borderRadius: radii.sm,
            color: palette.text.primary,
            backgroundColor: palette.surface,
            fontSize: typography.webScale.body,
            lineHeight: typography.webScale.body * typography.lineHeight.bangla,
          },
          style,
        ]}
        {...props}
      />
      {errorMessage ? (
        <Text accessibilityRole="alert" style={{ color: palette.status.danger, fontSize: 13 }}>
          {errorMessage}
        </Text>
      ) : helperText ? (
        <Text style={{ color: palette.text.secondary, fontSize: 13 }}>{helperText}</Text>
      ) : null}
    </View>
  );
};
