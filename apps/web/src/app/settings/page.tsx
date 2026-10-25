'use client';

import React from 'react';
import Link from 'next/link';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Card, Icon } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';
import { SettingsPageChrome } from '../../components/settings/SettingsPageChrome';
import { SETTINGS_GROUPS } from '../../components/settings/settingsGroups';

/**
 * Settings hub — grouped entry page for mobile/PWA and desktop.
 * Focused controls live on stable subpages under /settings/*.
 */
export default function SettingsPage() {
  const { themeMode } = useShell();
  const palette = colors[themeMode];

  return (
    <SettingsPageChrome
      title="Settings"
      description="Choose a group. Appearance, privacy, and workspace controls open on focused subpages."
    >
      <nav aria-label="Settings groups">
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: `${spacing.sm}px`,
          }}
        >
          {SETTINGS_GROUPS.map((group) => (
            <li key={group.id}>
              <Link
                href={group.href}
                id={`settings-group-${group.id}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <Card themeMode={themeMode}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: `${spacing.base}px`,
                      minWidth: 0,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: `${touchTargets.webMin}px`,
                        minHeight: `${touchTargets.webMin}px`,
                        borderRadius: `${radii.sm}px`,
                        backgroundColor: palette.surfaceRaised,
                        color: palette.action.primary,
                        flexShrink: 0,
                      }}
                    >
                      <Icon name={group.icon} size={20} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="daynori-break"
                        style={{
                          fontSize: `${typography.webScale.sectionHeading}px`,
                          fontWeight: 700,
                          color: palette.text.primary,
                        }}
                      >
                        {group.title}
                      </div>
                      <p
                        className="daynori-break"
                        style={{
                          margin: '4px 0 0',
                          fontSize: '13px',
                          color: palette.text.secondary,
                          lineHeight: 1.45,
                        }}
                      >
                        {group.description}
                      </p>
                    </div>
                    <span aria-hidden="true" style={{ color: palette.text.secondary, flexShrink: 0 }}>
                      <Icon name="chevron-right" size={18} />
                    </span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </SettingsPageChrome>
  );
}
