'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { colors, spacing, typography, touchTargets } from '@daynori/design-tokens';
import { Icon } from '@daynori/ui-web';
import { useShell } from '../ShellContext';

export interface SettingsPageChromeProps {
  title: string;
  description?: string;
  /** When set, shows Back to this href (default /settings for subpages). */
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}

/**
 * Shared Settings chrome: meaningful title, predictable Back, focus on arrival.
 */
export function SettingsPageChrome({
  title,
  description,
  backHref,
  backLabel = 'Back to Settings',
  children,
}: SettingsPageChromeProps) {
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);

  return (
    <div
      className="daynori-page daynori-settings-page"
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {backHref ? (
        <div style={{ marginBottom: `${spacing.sm}px` }}>
          <Link
            href={backHref}
            id="settings-back-link"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: `${touchTargets.webMin}px`,
              color: palette.action.primary,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            <Icon name="chevron-left" size={18} />
            {backLabel}
          </Link>
        </div>
      ) : null}

      <div style={{ marginBottom: `${spacing.base}px` }}>
        <h1
          ref={headingRef}
          tabIndex={-1}
          id="settings-page-title"
          className="daynori-break"
          style={{
            margin: 0,
            fontSize: `${typography.webScale.welcomeTitle}px`,
            fontWeight: 800,
            color: palette.text.primary,
            outline: 'none',
          }}
        >
          {title}
        </h1>
        {description ? (
          <p
            className="daynori-break"
            style={{ margin: '4px 0 0 0', color: palette.text.secondary }}
          >
            {description}
          </p>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
        {children}
      </div>
    </div>
  );
}
