import React from 'react';
import { colors, radii, spacing } from '@daynori/design-tokens';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  children,
  style,
  disabled,
  ...props
}) => {
  const isPrimary = variant === 'primary';
  const backgroundColor = isPrimary ? colors.light.action.primary : colors.light.surface;
  const color = isPrimary ? colors.light.action.label : colors.light.text.primary;
  const border = isPrimary ? 'none' : `1px solid ${colors.light.border.strong}`;

  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        backgroundColor,
        color,
        border,
        borderRadius: `${radii.sm}px`,
        padding: `${spacing.sm}px ${spacing.base}px`,
        fontSize: '14px',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s ease-in-out',
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
};
