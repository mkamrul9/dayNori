'use client';

import React, { useId, useState } from 'react';
import { colors, focusRing, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
  themeMode?: ThemeMode;
  errorMessage?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  id: explicitId,
  label,
  description,
  themeMode = 'light',
  errorMessage,
  disabled = false,
  style,
  onFocus,
  onBlur,
  ...props
}) => {
  const generatedId = useId();
  const id = explicitId || generatedId;
  const descId = `${id}-desc`;
  const errId = `${id}-err`;
  const palette = colors[themeMode];
  const [isFocused, setIsFocused] = useState(false);
  const describedBy =
    [errorMessage ? errId : null, description ? descId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, ...style }}>
      <label
        htmlFor={id}
        style={{
          display: 'inline-flex',
          alignItems: 'flex-start',
          gap: spacing.sm,
          minHeight: touchTargets.webMin,
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: disabled ? palette.text.muted : palette.text.primary,
        }}
      >
        <input
          id={id}
          type="checkbox"
          disabled={disabled}
          aria-invalid={Boolean(errorMessage)}
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
            width: 20,
            height: 20,
            marginTop: 12,
            accentColor: palette.action.primary,
            outline: isFocused ? `${focusRing.width}px solid ${palette.border.focus}` : 'none',
            outlineOffset: focusRing.offset,
          }}
          {...props}
        />
        <span style={{ paddingTop: 10, fontSize: 'calc(1rem * var(--daynori-text-scale, 1))' }}>
          {label}
        </span>
      </label>
      {description ? (
        <p id={descId} style={{ margin: `0 0 0 ${28}px`, color: palette.text.secondary, fontSize: 13 }}>
          {description}
        </p>
      ) : null}
      {errorMessage ? (
        <p id={errId} role="alert" style={{ margin: `0 0 0 ${28}px`, color: palette.status.danger, fontSize: 13 }}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
};
