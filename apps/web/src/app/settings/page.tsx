'use client';

import React from 'react';
import Link from 'next/link';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Icon } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';
import { SettingsPageChrome } from '../../components/settings/SettingsPageChrome';
import { SETTINGS_GROUPS } from '../../components/settings/settingsGroups';

/**
 * Modern, calm Settings hub.
 * Consolidates settings groups into an elegant notebook list with soft dividers,
 * eliminating repeated large card borders while maintaining clear touch targets.
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
        <div
          style={{
            backgroundColor: palette.surface,
            borderRadius: `${radii.card}px`,
            border: `1px solid ${palette.border.subtle}`,
            boxShadow:
              themeMode === 'dark'
                ? '0 1px 4px rgba(0, 0, 0, 0.3)'
                : '0 1px 4px rgba(23, 44, 44, 0.04)',
            overflow: 'hidden',
          }}
        >
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {SETTINGS_GROUPS.map((group, index) => {
              const isLast = index === SETTINGS_GROUPS.length - 1;

              return (
                <li
                  key={group.id}
                  style={{
                    borderBottom: isLast ? 'none' : `1px solid ${palette.border.subtle}`,
                  }}
                >
                  <Link
                    href={group.href}
                    id={`settings-group-${group.id}`}
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: `${spacing.base}px`,
                      padding: `${spacing.md}px ${spacing.base}px`,
                      minHeight: `${touchTargets.webMin}px`,
                      transition: 'background-color 140ms ease',
                      boxSizing: 'border-box',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = palette.surfaceRaised;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.outline = `2px solid ${palette.border.focus}`;
                      e.currentTarget.style.outlineOffset = '-2px';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.outline = 'none';
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '38px',
                        height: '38px',
                        borderRadius: `${radii.sm}px`,
                        backgroundColor: palette.action.subtle,
                        color: palette.action.primary,
                        border:
                          themeMode === 'dark'
                            ? `1px solid ${palette.border.subtle}`
                            : '1px solid transparent',
                        flexShrink: 0,
                      }}
                    >
                      <Icon name={group.icon} size={20} />
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="daynori-break"
                        style={{
                          fontSize: `${typography.webScale.body}px`,
                          fontWeight: 600,
                          color: palette.text.primary,
                        }}
                      >
                        {group.title}
                      </div>
                      <p
                        className="daynori-break"
                        style={{
                          margin: '2px 0 0',
                          fontSize: '13px',
                          color: palette.text.secondary,
                          lineHeight: 1.4,
                        }}
                      >
                        {group.description}
                      </p>
                    </div>

                    <span
                      aria-hidden="true"
                      style={{
                        color: palette.text.secondary,
                        flexShrink: 0,
                        marginLeft: `${spacing.xs}px`,
                      }}
                    >
                      <Icon name="chevron-right" size={18} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </SettingsPageChrome>
  );
}
