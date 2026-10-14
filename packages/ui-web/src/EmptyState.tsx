'use client';

import React from 'react';
import { colors, radii, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import { Button } from './Button.js';

export interface EmptyStateProps {
  id?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: 'primary' | 'secondary';
  themeMode?: ThemeMode;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  id,
  title,
  description,
  actionLabel,
  onAction,
  actionVariant = 'primary',
  themeMode = 'light',
  icon,
}) => {
  const palette = colors[themeMode];

  return (
    <section
      id={id}
      aria-label={title}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: `${spacing.xxl}px ${spacing.lg}px`,
        backgroundColor: palette.surface,
        border: `1px dashed ${palette.border.strong}`,
        borderRadius: `${radii.card}px`,
        margin: `${spacing.md}px 0`,
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {icon && (
        <div
          aria-hidden="true"
          style={{
            marginBottom: `${spacing.md}px`,
            color: palette.text.secondary,
            fontSize: '32px',
          }}
        >
          {icon}
        </div>
      )}
      <h3
        style={{
          margin: 0,
          marginBottom: `${spacing.xs}px`,
          fontSize: `${typography.webScale.sectionHeading}px`,
          fontWeight: 700,
          color: palette.text.primary,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: 0,
          marginBottom: actionLabel ? `${spacing.lg}px` : 0,
          fontSize: `${typography.webScale.body}px`,
          color: palette.text.secondary,
          maxWidth: '440px',
          lineHeight: typography.lineHeight.relaxed,
        }}
      >
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant={actionVariant} themeMode={themeMode} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </section>
  );
};
