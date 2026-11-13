import React from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  themeMode?: ThemeMode;
  variant?: 'subtle' | 'outlined' | 'elevated' | 'flat';
  children: React.ReactNode;
}

/**
 * Notebook-inspired surface card.
 * Calmer modern styling with softer borders and optional elevation variants.
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
  let border = `1px solid ${palette.border.subtle}`;
  let shadow = 'none';

  if (variant === 'flat') {
    bg = palette.surfaceRaised;
    border = '1px solid transparent';
  } else if (variant === 'elevated') {
    bg = palette.surface;
    border = `1px solid ${palette.border.subtle}`;
    shadow =
      themeMode === 'dark'
        ? '0 4px 16px rgba(0, 0, 0, 0.35)'
        : '0 2px 8px rgba(23, 44, 44, 0.05)';
  } else if (variant === 'subtle') {
    bg = palette.surface;
    border = `1px solid ${palette.border.subtle}`;
    shadow =
      themeMode === 'dark'
        ? '0 1px 3px rgba(0, 0, 0, 0.25)'
        : '0 1px 3px rgba(23, 44, 44, 0.03)';
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
