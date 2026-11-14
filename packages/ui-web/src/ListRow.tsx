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
  id?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  selected?: boolean;
  disabled?: boolean;
  themeMode?: ThemeMode;
  variant?: 'card' | 'flat' | 'divided';
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * Calm, accessible list row primitive for items, options, and settings.
 * Supports card, flat, and soft-divided variants with responsive text scaling.
 */
export const ListRow: React.FC<ListRowProps> = ({
  id,
  title,
  subtitle,
  meta,
  selected = false,
  disabled = false,
  themeMode = 'light',
  variant = 'card',
  leading,
  trailing,
  onClick,
  style,
}) => {
  const palette = colors[themeMode];
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isInteractive = Boolean(onClick && !disabled);

  let bg: string = palette.surface;
  if (selected) {
    bg = palette.action.subtle;
  } else if (disabled) {
    bg = palette.surfaceRaised;
  } else if (isInteractive && isHovered) {
    bg = palette.surfaceRaised;
  }

  let border = `1px solid ${palette.border.subtle}`;
  let borderRadius: string = `${radii.sm}px`;

  if (variant === 'flat') {
    border = '1px solid transparent';
  } else if (variant === 'divided') {
    border = 'none';
    borderRadius = '0px';
  }

  if (selected) {
    border = `1px solid ${palette.action.primary}`;
  }

  return (
    <div
      id={id}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-pressed={isInteractive ? selected : undefined}
      aria-disabled={disabled || undefined}
      onClick={isInteractive ? onClick : undefined}
      onMouseEnter={isInteractive ? () => setIsHovered(true) : undefined}
      onMouseLeave={isInteractive ? () => setIsHovered(false) : undefined}
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
        borderRadius,
        border,
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
              fontSize: 'calc(1rem * var(--daynori-text-scale, 1))',
              fontWeight: 500,
              color: disabled ? palette.text.muted : palette.text.primary,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            {title}
          </span>
          {subtitle && (
            <span
              style={{
                fontSize: 'calc(0.875rem * var(--daynori-text-scale, 1))',
                color: palette.text.secondary,
                marginTop: '2px',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                lineHeight: 1.4,
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
          {meta && (
            <span
              style={{
                fontSize: 'calc(0.75rem * var(--daynori-text-scale, 1))',
                color: palette.text.secondary,
              }}
            >
              {meta}
            </span>
          )}
          {trailing}
        </div>
      )}
    </div>
  );
};
