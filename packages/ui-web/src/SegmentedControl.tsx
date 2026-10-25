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

export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  label: string;
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  themeMode?: ThemeMode;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  label,
  options,
  value,
  onChange,
  themeMode = 'light',
}) => {
  const palette = colors[themeMode];
  const listId = useId();
  const [focusIndex, setFocusIndex] = useState(0);

  return (
    <div>
      <div id={listId} style={{ fontWeight: 600, marginBottom: spacing.xs, color: palette.text.primary }}>
        {label}
      </div>
      <div
        role="tablist"
        aria-labelledby={listId}
        style={{
          display: 'inline-flex',
          flexWrap: 'wrap',
          border: `1px solid ${palette.border.strong}`,
          borderRadius: `${radii.sm}px`,
          overflow: 'hidden',
        }}
      >
        {options.map((opt, index) => {
          const selected = opt.value === value;
          const disabled = Boolean(opt.disabled);
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={disabled}
              tabIndex={selected ? 0 : -1}
              onFocus={() => setFocusIndex(index)}
              onClick={() => {
                if (!disabled) onChange(opt.value);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const dir = e.key === 'ArrowRight' ? 1 : -1;
                let next = index;
                for (let i = 0; i < options.length; i += 1) {
                  next = (next + dir + options.length) % options.length;
                  if (!options[next]?.disabled) break;
                }
                const target = options[next];
                if (target && !target.disabled) {
                  onChange(target.value);
                  setFocusIndex(next);
                }
              }}
              style={{
                minHeight: touchTargets.webMin,
                padding: `0 ${spacing.md}px`,
                border: 'none',
                borderRadius: 0,
                backgroundColor: selected ? palette.action.subtle : palette.surface,
                color: selected ? palette.action.subtleText : palette.text.secondary,
                fontWeight: selected ? 700 : 500,
                font: 'inherit',
                cursor: disabled ? 'not-allowed' : 'pointer',
                outline:
                  focusIndex === index ? `${focusRing.width}px solid ${palette.border.focus}` : 'none',
                outlineOffset: -2,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
