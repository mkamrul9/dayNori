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
  variant?: 'card' | 'subtle' | 'inline';
}

/**
 * Notebook-inspired Empty State.
 * Calmer, warmer presentation with a soft badge, warm typography, and clear next action.
 * Eliminates aggressive nested borders while maintaining visual focus.
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
  variant = 'subtle',
}) => {
  const palette = colors[themeMode];

  const isInline = variant === 'inline';
  const isCard = variant === 'card';

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
        padding: isInline ? `${spacing.lg}px ${spacing.md}px` : `${spacing.xl}px ${spacing.lg}px`,
        backgroundColor: isInline
          ? 'transparent'
          : isCard
            ? palette.surface
            : palette.surfaceRaised,
        border: isInline
          ? 'none'
          : `1px solid ${themeMode === 'dark' ? palette.border.subtle : 'rgba(23, 35, 58, 0.08)'}`,
        borderRadius: `${radii.card}px`,
        boxShadow:
          isCard && themeMode === 'light'
            ? '0 1px 4px rgba(23, 35, 58, 0.04)'
            : 'none',
        margin: isInline ? `${spacing.sm}px 0` : `${spacing.md}px 0`,
        boxSizing: 'border-box',
        width: '100%',
        transition: 'background-color 150ms ease, border-color 150ms ease',
      }}
    >
      {icon && (
        <div
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '52px',
            height: '52px',
            borderRadius: '26px',
            backgroundColor: palette.action.subtle,
            color: palette.action.primary,
            border:
              themeMode === 'dark'
                ? `1px solid ${palette.border.subtle}`
                : '1px solid rgba(98, 61, 232, 0.12)',
            marginBottom: `${spacing.md}px`,
            boxShadow:
              themeMode === 'dark'
                ? '0 2px 8px rgba(0, 0, 0, 0.25)'
                : '0 2px 8px rgba(98, 61, 232, 0.08)',
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
          letterSpacing: '-0.25px',
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
          maxWidth: '460px',
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
