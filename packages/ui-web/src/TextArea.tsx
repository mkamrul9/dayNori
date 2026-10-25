'use client';

import React, { useId, useState } from 'react';
import {
  colors,
  focusRing,
  radii,
  spacing,
  typography,
  type ThemeMode,
} from '@daynori/design-tokens';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helperText?: string;
  errorMessage?: string;
  themeMode?: ThemeMode;
  bangla?: boolean;
}

export const TextArea: React.FC<TextAreaProps> = ({
  id: explicitId,
  label,
  helperText,
  errorMessage,
  themeMode = 'light',
  disabled = false,
  required = false,
  bangla = false,
  'aria-describedby': callerDescribedBy,
  style,
  onFocus,
  onBlur,
  ...props
}) => {
  const generatedId = useId();
  const id = explicitId || generatedId;
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;
  const [isFocused, setIsFocused] = useState(false);
  const palette = colors[themeMode];
  const isInvalid = Boolean(errorMessage);
  const describedBy =
    [callerDescribedBy, errorMessage ? errorId : helperText ? helperId : null]
      .filter(Boolean)
      .join(' ') || undefined;

  const borderColor = isInvalid
    ? palette.status.danger
    : isFocused
      ? palette.border.focus
      : disabled
        ? palette.border.subtle
        : palette.border.strong;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px`, width: '100%' }}>
      <label
        htmlFor={id}
        style={{
          fontSize: 'calc(0.875rem * var(--daynori-text-scale, 1))',
          fontWeight: 600,
          color: disabled ? palette.text.muted : palette.text.primary,
        }}
      >
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: palette.status.danger, marginLeft: 4 }}>
            *
          </span>
        )}
      </label>
      <textarea
        id={id}
        disabled={disabled}
        required={required}
        aria-invalid={isInvalid}
        aria-describedby={describedBy}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        style={{
          minHeight: 120,
          padding: `${spacing.sm}px ${spacing.md}px`,
          fontSize: 'calc(1rem * var(--daynori-text-scale, 1))',
          lineHeight: bangla ? typography.lineHeight.bangla : typography.lineHeight.relaxed,
          fontFamily: bangla ? typography.fontFamily.bangla : 'inherit',
          color: disabled ? palette.text.muted : palette.text.primary,
          backgroundColor: disabled ? palette.surfaceRaised : palette.surface,
          border: `1px solid ${borderColor}`,
          borderRadius: `${radii.sm}px`,
          resize: 'vertical',
          outline: isFocused && !disabled ? `${focusRing.width}px solid ${palette.border.focus}` : 'none',
          outlineOffset: `${focusRing.offset}px`,
          ...style,
        }}
        {...props}
      />
      {errorMessage ? (
        <p id={errorId} role="alert" style={{ margin: 0, color: palette.status.danger, fontSize: 13 }}>
          {errorMessage}
        </p>
      ) : helperText ? (
        <p id={helperId} style={{ margin: 0, color: palette.text.secondary, fontSize: 13 }}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
};
