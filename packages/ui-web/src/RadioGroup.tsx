'use client';

import React, { useId, useState } from 'react';
import { colors, focusRing, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  legend: string;
  name: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  themeMode?: ThemeMode;
  errorMessage?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  legend,
  name,
  options,
  value,
  onChange,
  themeMode = 'light',
  errorMessage,
}) => {
  const palette = colors[themeMode];
  const errId = useId();
  const [focusValue, setFocusValue] = useState<string | null>(null);

  return (
    <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: spacing.sm, color: palette.text.primary }}>
        {legend}
      </legend>
      <div role="radiogroup" aria-invalid={Boolean(errorMessage)} aria-describedby={errorMessage ? errId : undefined}>
        {options.map((opt) => {
          const id = `${name}-${opt.value}`;
          const checked = opt.value === value;
          return (
            <label
              key={opt.value}
              htmlFor={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                minHeight: touchTargets.webMin,
                color: opt.disabled ? palette.text.muted : palette.text.primary,
                cursor: opt.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={opt.value}
                checked={checked}
                disabled={opt.disabled}
                onChange={() => onChange(opt.value)}
                onFocus={() => setFocusValue(opt.value)}
                onBlur={() => setFocusValue(null)}
                style={{
                  width: 18,
                  height: 18,
                  accentColor: palette.action.primary,
                  outline:
                    focusValue === opt.value
                      ? `${focusRing.width}px solid ${palette.border.focus}`
                      : 'none',
                  outlineOffset: focusRing.offset,
                }}
              />
              {opt.label}
            </label>
          );
        })}
      </div>
      {errorMessage ? (
        <p id={errId} role="alert" style={{ color: palette.status.danger, fontSize: 13 }}>
          {errorMessage}
        </p>
      ) : null}
    </fieldset>
  );
};
