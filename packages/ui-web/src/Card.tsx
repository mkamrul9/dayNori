import React from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  themeMode?: ThemeMode;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ themeMode = 'light', children, style, ...props }) => {
  const palette = colors[themeMode];

  return (
    <div
      style={{
        backgroundColor: palette.surface,
        color: palette.text.primary,
        borderRadius: `${radii.card}px`,
        border: `1px solid ${palette.border.subtle}`,
        padding: `${spacing.base}px`,
        boxSizing: 'border-box',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};
