'use client';

import React from 'react';
import { colors, spacing, typography } from '@daynori/design-tokens';
import { Card, Feedback } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';

export default function HelpPage() {
  const { themeMode } = useShell();
  const palette = colors[themeMode];

  const shortcuts = [
    { key: '?', action: 'Open Keyboard Shortcuts dialog from anywhere' },
    { key: '/', action: 'Open Search modal' },
    { key: 'C', action: 'Open Create item modal' },
    { key: 'T', action: 'Navigate to Today view' },
    { key: 'P', action: 'Navigate to Plan view' },
    { key: 'K', action: 'Navigate directly to Calendar under Plan' },
    { key: 'L', action: 'Navigate to Library (folders & files)' },
    { key: 'J', action: 'Navigate to Journal (daily reflection timeline)' },
    { key: ',', action: 'Navigate to Settings' },
    { key: 'Esc', action: 'Close any open modal dialog or navigation drawer' },
  ];

  return (
    <div
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        padding: `${spacing.lg}px ${spacing.base}px`,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ marginBottom: `${spacing.base}px` }}>
        <h1
          style={{
            margin: 0,
            fontSize: `${typography.webScale.welcomeTitle}px`,
            fontWeight: 800,
            color: palette.text.primary,
          }}
        >
          Help & Accessibility Guide
        </h1>
        <p style={{ margin: '4px 0 0 0', color: palette.text.secondary }}>
          Accessible navigation instructions, keyboard shortcuts, and assistive technology
          landmarks.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
        {/* Keyboard Shortcuts Reference */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 8px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Global Keyboard Shortcuts
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Navigate the organizer instantly from anywhere in the application.
          </p>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
              textAlign: 'left',
              marginBottom: `${spacing.base}px`,
            }}
          >
            <thead>
              <tr style={{ borderBottom: `2px solid ${palette.border.strong}` }}>
                <th style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>Shortcut</th>
                <th style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>Destination / Action</th>
              </tr>
            </thead>
            <tbody>
              {shortcuts.map((row) => (
                <tr key={row.key} style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                  <td style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>
                    <kbd
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: palette.surfaceRaised,
                        border: `1px solid ${palette.border.strong}`,
                        fontWeight: 700,
                        color: palette.text.primary,
                      }}
                    >
                      {row.key}
                    </kbd>
                  </td>
                  <td style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Feedback
            severity="info"
            message="Shortcuts are automatically suppressed whenever you are typing in an input, textarea, or editable note."
            themeMode={themeMode}
          />
        </Card>

        {/* Screen Reader & Landmark Structure */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 8px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Assistive Technology & Landmarks
          </h2>
          <ul
            style={{
              margin: 0,
              paddingLeft: '20px',
              lineHeight: 1.6,
              fontSize: '14px',
              color: palette.text.secondary,
            }}
          >
            <li>
              <strong>Skip Navigation Link:</strong> Press <kbd>Tab</kbd> on any page load to reveal
              the Skip to main content link.
            </li>
            <li>
              <strong>Landmark Roles:</strong> Every view includes <code>header[role=banner]</code>,{' '}
              <code>nav[role=navigation]</code>, and <code>main[role=main]</code>.
            </li>
            <li>
              <strong>Route Announcements:</strong> Screen readers receive an{' '}
              <code>aria-live=&quot;polite&quot;</code> announcement when switching routes.
            </li>
            <li>
              <strong>Touch Targets:</strong> All interactive elements guarantee at least 44 CSS
              pixels height and width.
            </li>
            <li>
              <strong>Focus Rings:</strong> All focused controls show a deliberate focus ring with
              at least 3:1 contrast against adjacent backgrounds.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
