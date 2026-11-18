import React from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  themeMode?: ThemeMode;
  variant?: 'subtle' | 'outlined' | 'elevated' | 'flat' | 'calm';
  children: React.ReactNode;
}

/**
 * Shared surface card. Calm surfaces separate content by tone and spacing;
 * outlined surfaces retain a visible boundary where grouping needs one.
 */
export const Card: React.FC<CardProps> = ({
  themeMode = 'light',
  variant = 'subtle',
  children,
  style,
  ...props
}) => {
  const palette = colors[themeMode];

  let bg: string = palette.surface;
  let border =
    themeMode === 'dark'
      ? `1px solid ${palette.border.subtle}`
      : '1px solid rgba(23, 35, 58, 0.09)';
  let shadow = 'none';

  if (variant === 'flat') {
    bg = palette.surfaceRaised;
    border = '1px solid transparent';
  } else if (variant === 'elevated') {
    bg = palette.surface;
    border =
      themeMode === 'dark'
        ? `1px solid ${palette.border.subtle}`
        : '1px solid rgba(23, 35, 58, 0.08)';
    shadow =
      themeMode === 'dark' ? '0 4px 16px rgba(0, 0, 0, 0.35)' : '0 2px 10px rgba(23, 35, 58, 0.06)';
  } else if (variant === 'calm') {
    bg = palette.surface;
    border = '1px solid transparent';
    shadow = themeMode === 'dark' ? 'none' : '0 6px 24px rgba(27, 39, 74, 0.035)';
  } else if (variant === 'subtle') {
    bg = palette.surface;
    border = themeMode === 'dark' ? `1px solid ${palette.border.subtle}` : '1px solid transparent';
    shadow =
      themeMode === 'dark' ? '0 1px 4px rgba(0, 0, 0, 0.25)' : '0 4px 14px rgba(23, 35, 58, 0.045)';
  }

  return (
    <div
      style={{
        backgroundColor: bg,
        color: palette.text.primary,
        borderRadius: `${radii.card}px`,
        border,
        boxShadow: shadow,
        padding: `${spacing.base}px`,
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        transition: 'background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};
