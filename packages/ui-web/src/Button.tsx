'use client';

import React, { useEffect, useState } from 'react';
import {
  colors,
  focusRing,
  radii,
  spacing,
  touchTargets,
  type ThemeMode,
} from '@daynori/design-tokens';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'danger';
  size?: 'standard' | 'compact';
  themeMode?: ThemeMode;
  loading?: boolean;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'standard',
  themeMode = 'light',
  loading = false,
  disabled = false,
  children,
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

  let bg: string = palette.action.primary;
  let fg: string = palette.action.label;
  let border: string = 'none';

  if (variant === 'secondary') {
    bg = palette.surface;
    fg = palette.text.primary;
    border = `1px solid ${palette.border.strong}`;
  } else if (variant === 'subtle') {
    bg = palette.action.subtle;
    fg = palette.action.subtleText;
    border = 'none';
  } else if (variant === 'danger') {
    bg = palette.status.danger;
    fg = '#FFFFFF';
    border = 'none';
  }

  if (isDisabled) {
    bg = palette.action.disabled;
    fg = palette.action.disabledText;
    border = variant === 'secondary' ? `1px solid ${palette.border.subtle}` : 'none';
  }

  // All primary web touch targets meet or exceed 44px
  const minHeight = touchTargets.webMin;
  const paddingY = size === 'compact' ? spacing.xs : spacing.sm;
  const paddingX = size === 'compact' ? spacing.sm : spacing.base;

  return (
    <button
      type="button"
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
        gap: `${spacing.sm}px`,
        backgroundColor: bg,
        color: fg,
        border,
        borderRadius: `${radii.sm}px`,
        minHeight: `${minHeight}px`,
        minWidth: `${minHeight}px`,
        padding: `${paddingY}px ${paddingX}px`,
        fontSize: size === 'compact' ? '13px' : '14px',
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        outline:
          isFocused && !isDisabled ? `${focusRing.width}px solid ${palette.border.focus}` : 'none',
        outlineOffset: `${focusRing.offset}px`,
        boxShadow:
          isFocused && !isDisabled ? `0 0 0 ${focusRing.offset}px ${palette.background}` : 'none',
        position: 'relative',
        textDecoration: 'none',
        transition: prefersReducedMotion
          ? 'none'
          : 'background-color 150ms ease, opacity 150ms ease',
        ...style,
      }}
      {...props}
    >
      <style>{`
        @keyframes daynori-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      {loading && (
        <span
          role="status"
          aria-label="Loading"
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: `2px solid ${fg}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: prefersReducedMotion ? 'none' : 'daynori-spin 0.8s linear infinite',
            opacity: prefersReducedMotion ? 0.75 : 1,
            flexShrink: 0,
          }}
        />
      )}
      <span>{children}</span>
    </button>
  );
};
