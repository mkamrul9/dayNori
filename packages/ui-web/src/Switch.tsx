'use client';

import React, { useId, useState } from 'react';
import { colors, focusRing, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';

export interface SwitchProps {
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  themeMode?: ThemeMode;
  disabled?: boolean;
  description?: string;
  id?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  label,
  checked,
  onCheckedChange,
  themeMode = 'light',
  disabled = false,
  description,
  id: explicitId,
}) => {
  const generatedId = useId();
  const id = explicitId || generatedId;
  const palette = colors[themeMode];
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.base,
          minHeight: touchTargets.webMin,
        }}
      >
        <label htmlFor={id} style={{ color: disabled ? palette.text.muted : palette.text.primary, fontWeight: 600 }}>
          {label}
        </label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-describedby={description ? `${id}-desc` : undefined}
          disabled={disabled}
          onClick={() => {
            if (!disabled) onCheckedChange(!checked);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{
            width: 52,
            height: 32,
            borderRadius: 999,
            border: `1px solid ${palette.border.strong}`,
            backgroundColor: checked ? palette.action.primary : palette.surfaceRaised,
            cursor: disabled ? 'not-allowed' : 'pointer',
            position: 'relative',
            outline: isFocused && !disabled ? `${focusRing.width}px solid ${palette.border.focus}` : 'none',
            outlineOffset: focusRing.offset,
            opacity: disabled ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 3,
              left: checked ? 24 : 3,
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: checked ? palette.action.label : palette.text.primary,
              transition: 'left 120ms ease',
            }}
          />
        </button>
      </div>
      {description ? (
        <p id={`${id}-desc`} style={{ margin: 0, color: palette.text.secondary, fontSize: 13 }}>
          {description}
        </p>
      ) : null}
    </div>
  );
};
