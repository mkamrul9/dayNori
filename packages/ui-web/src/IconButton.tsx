'use client';

import React, { useEffect, useState } from 'react';
import {
  colors,
  focusRing,
  radii,
  touchTargets,
  type ThemeMode,
} from '@daynori/design-tokens';
import { Icon, type IconProps } from './Icon.js';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  icon: IconProps['name'];
  themeMode?: ThemeMode;
  loading?: boolean;
  variant?: 'subtle' | 'primary' | 'ghost';
}

export const IconButton: React.FC<IconButtonProps> = ({
  label,
  icon,
  themeMode = 'light',
  loading = false,
  disabled = false,
  variant = 'ghost',
  style,
  onFocus,
  onBlur,
  ...props
}) => {
  const palette = colors[themeMode];
  const isDisabled = disabled || loading;
  const [isFocused, setIsFocused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  let bg: string = 'transparent';
  let fg: string = palette.text.primary;
  if (variant === 'subtle') {
    bg = palette.action.subtle;
    fg = palette.action.subtleText;
  } else if (variant === 'primary') {
    bg = palette.action.primary;
    fg = palette.action.label;
  }
  if (isDisabled) {
    bg = palette.action.disabled;
    fg = palette.action.disabledText;
  }

  return (
    <button
      type="button"
      aria-label={label}
      disabled={isDisabled}
      aria-busy={loading}
      aria-disabled={isDisabled}
      onFocus={(e) => {
        setIsFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        onBlur?.(e);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${touchTargets.webMin}px`,
        height: `${touchTargets.webMin}px`,
        minWidth: `${touchTargets.webMin}px`,
        minHeight: `${touchTargets.webMin}px`,
        padding: 0,
        border: 'none',
        borderRadius: `${radii.sm}px`,
        backgroundColor: bg,
        color: fg,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        outline:
          isFocused && !isDisabled ? `${focusRing.width}px solid ${palette.border.focus}` : 'none',
        outlineOffset: `${focusRing.offset}px`,
        transition: prefersReducedMotion ? 'none' : 'background-color 150ms ease',
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <span role="status" aria-label="Loading" style={{ fontSize: 12 }}>
          …
        </span>
      ) : (
        <Icon name={icon} size={20} />
      )}
    </button>
  );
};
