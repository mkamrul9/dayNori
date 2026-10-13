import React from 'react';
import { colors, radii, spacing } from '@daynori/design-tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, style, ...props }) => {
  return (
    <div
      style={{
        backgroundColor: colors.light.surface,
        border: `1px solid ${colors.light.border.subtle}`,
        borderRadius: `${radii.card}px`,
        padding: `${spacing.base}px`,
        color: colors.light.text.primary,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};
