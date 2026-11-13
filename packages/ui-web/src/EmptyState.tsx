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

/**
 * Notebook-inspired Empty State.
 * Calmer presentation with a soft badge, warm typography, and clear next action.
 */
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
        padding: `${spacing.xl}px ${spacing.lg}px`,
        backgroundColor: palette.surfaceRaised,
        border: `1px solid ${palette.border.subtle}`,
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
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '48px',
            borderRadius: '24px',
            backgroundColor: palette.action.subtle,
            color: palette.action.primary,
            marginBottom: `${spacing.md}px`,
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
          letterSpacing: '-0.2px',
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
        <Button variant={actionVariant} size="compact" themeMode={themeMode} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </section>
  );
};
