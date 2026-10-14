'use client';

import React, { useState } from 'react';
import {
  colors,
  focusRing,
  radii,
  spacing,
  touchTargets,
  type ThemeMode,
} from '@daynori/design-tokens';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  meta?: string;
  selected?: boolean;
  disabled?: boolean;
  themeMode?: ThemeMode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const ListRow: React.FC<ListRowProps> = ({
  title,
  subtitle,
  meta,
  selected = false,
  disabled = false,
  themeMode = 'light',
  leading,
  trailing,
  onClick,
  style,
}) => {
  const palette = colors[themeMode];
  const [isFocused, setIsFocused] = useState(false);

  let bg: string = palette.surface;
  if (selected) {
    bg = palette.action.subtle;
  } else if (disabled) {
    bg = palette.surfaceRaised;
  }

  const isInteractive = Boolean(onClick && !disabled);

  return (
    <div
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-selected={selected}
      aria-disabled={disabled}
      onClick={isInteractive ? onClick : undefined}
      onFocus={isInteractive ? () => setIsFocused(true) : undefined}
      onBlur={isInteractive ? () => setIsFocused(false) : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: `${touchTargets.webMin}px`,
        padding: `${spacing.sm}px ${spacing.md}px`,
        backgroundColor: bg,
        borderRadius: `${radii.sm}px`,
        border: selected
          ? `1px solid ${palette.action.primary}`
          : `1px solid ${palette.border.subtle}`,
        cursor: isInteractive ? 'pointer' : 'default',
        opacity: disabled ? 0.6 : 1,
        transition: 'background-color 150ms ease, border-color 150ms ease, outline 150ms ease',
        outline:
          isFocused && isInteractive
            ? `${focusRing.width}px solid ${palette.border.focus}`
            : 'none',
        outlineOffset: `${focusRing.offset}px`,
        boxShadow:
          isFocused && isInteractive ? `0 0 0 ${focusRing.offset}px ${palette.background}` : 'none',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${spacing.md}px`,
          flex: 1,
          minWidth: 0,
        }}
      >
        {leading && (
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{leading}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: '16px',
              fontWeight: 500,
              color: disabled ? palette.text.muted : palette.text.primary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
          {subtitle && (
            <span
              style={{
                fontSize: '14px',
                color: palette.text.secondary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {(meta || trailing) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.sm}px`,
            flexShrink: 0,
            marginLeft: `${spacing.sm}px`,
          }}
        >
          {meta && <span style={{ fontSize: '12px', color: palette.text.muted }}>{meta}</span>}
          {trailing}
        </div>
      )}
    </div>
  );
};
