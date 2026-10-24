'use client';

import { Icon } from '@daynori/ui-web';
import React from 'react';
import Link from 'next/link';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { useShell } from '../components/ShellContext';

export default function NotFoundPage() {
  const { themeMode } = useShell();
  const palette = colors[themeMode];

  return (
    <div
      style={{
        maxWidth: '640px',
        margin: '80px auto',
        padding: `${spacing.xl}px ${spacing.base}px`,
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontSize: '48px', marginBottom: `${spacing.sm}px` }} aria-hidden="true">
        <Icon name="compass" />
      </div>
      <h1
        style={{
          margin: 0,
          fontSize: `${typography.webScale.welcomeTitle}px`,
          fontWeight: 800,
          color: palette.text.primary,
        }}
      >
        Page Not Found
      </h1>
      <p
        style={{
          margin: `${spacing.sm}px 0 ${spacing.lg}px 0`,
          fontSize: `${typography.webScale.body}px`,
          color: palette.text.secondary,
          lineHeight: 1.5,
        }}
      >
        The requested organizer destination or record could not be found. You may return to your
        Today overview.
      </p>

      <div>
        <Link
          href="/today"
          id="not-found-return-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: `${touchTargets.webMin}px`,
            padding: `0 ${spacing.lg}px`,
            borderRadius: `${radii.sm}px`,
            backgroundColor: palette.action.primary,
            color: palette.action.label,
            fontWeight: 700,
            fontSize: '14px',
            textDecoration: 'none',
          }}
        >
          Return to Today Overview <Icon name="arrow-right" />
        </Link>
      </div>
    </div>
  );
}
