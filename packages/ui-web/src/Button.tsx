import React from 'react';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'danger';
  size?: 'standard' | 'compact';
  themeMode?: ThemeMode;
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'standard',
  themeMode = 'light',
  loading = false,
  disabled = false,
  children,
  style,
  ...props
}) => {
  const palette = colors[themeMode];
  const isDisabled = disabled || loading;

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

  const minHeight = size === 'compact' ? 36 : touchTargets.webMin;
  const paddingY = size === 'compact' ? spacing.xs : spacing.sm;
  const paddingX = size === 'compact' ? spacing.sm : spacing.base;

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={loading}
      aria-disabled={isDisabled}
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
        fontSize: '14px',
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        outline: 'none',
        position: 'relative',
        textDecoration: 'none',
        transition: 'background-color 150ms ease, opacity 150ms ease',
        ...style,
      }}
      {...props}
    >
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
            animation: 'spin 0.8s linear infinite',
          }}
        />
      )}
      <span>{children}</span>
    </button>
  );
};
