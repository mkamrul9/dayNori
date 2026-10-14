'use client';

import React, { useId, useState } from 'react';
import {
  colors,
  focusRing,
  radii,
  spacing,
  touchTargets,
  type ThemeMode,
} from '@daynori/design-tokens';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  errorMessage?: string;
  themeMode?: ThemeMode;
}

export const TextField: React.FC<TextFieldProps> = ({
  id: explicitId,
  label,
  helperText,
  errorMessage,
  themeMode = 'light',
  disabled = false,
  required = false,
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

  // Construct description IDs only from elements actually rendered (F06 fix)
  const renderedDescriptionId = errorMessage ? errorId : helperText ? helperId : null;
  const describedBy =
    [callerDescribedBy, renderedDescriptionId].filter(Boolean).join(' ') || undefined;

  const borderColor = isInvalid
    ? palette.status.danger
    : isFocused
      ? palette.border.focus
      : disabled
        ? palette.border.subtle
        : palette.border.strong;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${spacing.xs}px`,
        width: '100%',
        fontFamily: 'inherit',
      }}
    >
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
          <span aria-hidden="true" style={{ color: palette.status.danger, marginLeft: '4px' }}>
            *
          </span>
        )}
      </label>

      <input
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
          minHeight: `${touchTargets.webMin}px`,
          padding: `${spacing.sm}px ${spacing.md}px`,
          fontSize: 'calc(1rem * var(--daynori-text-scale, 1))', // 16px default prevents iOS zoom
          color: disabled ? palette.text.muted : palette.text.primary,
          backgroundColor: disabled ? palette.surfaceRaised : palette.surface,
          border: `1.5px solid ${borderColor}`,
          borderRadius: `${radii.sm}px`,
          outline:
            isFocused && !disabled ? `${focusRing.width}px solid ${palette.border.focus}` : 'none',
          outlineOffset: `${focusRing.offset}px`,
          boxShadow:
            isFocused && !disabled ? `0 0 0 ${focusRing.offset}px ${palette.background}` : 'none',
          boxSizing: 'border-box',
          width: '100%',
          transition: 'border-color 150ms ease, box-shadow 150ms ease, outline 150ms ease',
          ...style,
        }}
        {...props}
      />

      {helperText && !errorMessage && (
        <span
          id={helperId}
          style={{
            fontSize: 'calc(0.75rem * var(--daynori-text-scale, 1))',
            color: palette.text.secondary,
            marginTop: '2px',
          }}
        >
          {helperText}
        </span>
      )}

      {errorMessage && (
        <span
          id={errorId}
          role="alert"
          style={{
            fontSize: 'calc(0.75rem * var(--daynori-text-scale, 1))',
            color: palette.status.danger,
            fontWeight: 500,
            marginTop: '2px',
          }}
        >
          {errorMessage}
        </span>
      )}
    </div>
  );
};
