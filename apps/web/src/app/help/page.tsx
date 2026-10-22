'use client';

import React, { useMemo, useState } from 'react';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, Feedback } from '@daynori/ui-web';
import { PWA_INSTALL_GUIDE_STEPS } from '@daynori/domain';
import { useShell } from '../../components/ShellContext';
import { isCorePreview } from '../../config/preview';

export default function HelpPage() {
  const { themeMode, openModal } = useShell();
  const palette = colors[themeMode];
  const [query, setQuery] = useState('');

  const howTo = useMemo(
    () =>
      [
        {
          title: 'Write a note',
          body: 'Tap Create, choose Note, then Save. Find it again in Library.',
        },
        {
          title: 'Add a task',
          body: 'Tap Create, choose Task, then Save. See it on Today or in Plan.',
        },
        {
          title: 'Tasks vs routines',
          body: 'A task finishes once. A routine repeats on a schedule. Both live under Plan.',
        },
        {
          title: 'Journal',
          body: 'Open Journal to write a private daily entry. Your privacy settings stay in Settings.',
        },
        {
          title: 'Saving and sync',
          body: 'Changes save on this device first. When online, they sync to your account so you can reopen them later.',
        },
        {
          title: 'Install on your phone',
          body: PWA_INSTALL_GUIDE_STEPS.join(' '),
        },
        {
          title: 'Stay signed in',
          body: 'Daynori keeps you signed in across refresh and reopen until you choose Log out. A sleeping free server may need one retry.',
        },
        {
          title: 'Offline and updates',
          body: 'Edits on this device queue while offline. When an update is ready, save your work then tap Update — Later waits. Cold offline reopen shows a simple offline page.',
        },
        ...(isCorePreview
          ? [
              {
                title: 'Preview limits',
                body: 'File uploads, audio, reminder delivery, rooms/chat, live AI, and billing are off in this free testing preview.',
              },
            ]
          : []),
      ] as const,
    []
  );

  const filtered = query.trim()
    ? howTo.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.body.toLowerCase().includes(query.toLowerCase())
      )
    : howTo;

  const shortcuts = [
    { key: '?', action: 'Open shortcuts' },
    { key: '/', action: 'Search' },
    { key: 'C', action: 'Create' },
    { key: 'T', action: 'Today' },
    { key: 'P', action: 'Plan' },
    { key: 'L', action: 'Library' },
    { key: 'J', action: 'Journal' },
    { key: ',', action: 'Settings' },
    { key: 'Esc', action: 'Close dialog' },
  ];

  return (
    <div className="daynori-page">
      <div style={{ marginBottom: `${spacing.base}px` }}>
        <h1
          className="daynori-break"
          style={{
            margin: 0,
            fontSize: `${typography.webScale.welcomeTitle}px`,
            fontWeight: 800,
            color: palette.text.primary,
          }}
        >
          Help
        </h1>
        <p
          className="daynori-break"
          style={{ margin: '4px 0 0 0', color: palette.text.secondary, fontSize: '14px' }}
        >
          Short how-tos for everyday use.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
        <Card themeMode={themeMode} className="daynori-break">
          <h2
            style={{
              margin: '0 0 8px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Getting started
          </h2>
          <p
            className="daynori-break"
            style={{ margin: '0 0 12px 0', fontSize: '13px', color: palette.text.secondary }}
          >
            Replay the short beginner guide anytime. It does not reset settings or duplicate samples.
          </p>
          <Button
            variant="secondary"
            size="compact"
            themeMode={themeMode}
            onClick={() => openModal('onboarding-replay')}
            id="help-replay-onboarding-btn"
          >
            Replay beginner guide
          </Button>
        </Card>

        <Card themeMode={themeMode}>
          <label
            htmlFor="help-howto-search"
            style={{
              display: 'block',
              fontWeight: 700,
              fontSize: '14px',
              color: palette.text.primary,
              marginBottom: '8px',
            }}
          >
            Search how-to
          </label>
          <input
            id="help-howto-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. note, sync, install"
            className="daynori-break"
            style={{
              width: '100%',
              minHeight: `${touchTargets.webMin}px`,
              boxSizing: 'border-box',
              padding: `0 ${spacing.sm}px`,
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              background: palette.surface,
              color: palette.text.primary,
              fontSize: '14px',
              marginBottom: `${spacing.sm}px`,
            }}
          />
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, minWidth: 0, width: '100%' }}>
            {filtered.map((item) => (
              <li
                key={item.title}
                className="daynori-break"
                style={{
                  padding: `${spacing.sm}px 0`,
                  borderBottom: `1px solid ${palette.border.subtle}`,
                  minWidth: 0,
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <strong
                  className="daynori-break"
                  style={{ color: palette.text.primary, display: 'block', minWidth: 0 }}
                >
                  {item.title}
                </strong>
                <p
                  className="daynori-break"
                  style={{
                    margin: '4px 0 0',
                    fontSize: '13px',
                    color: palette.text.secondary,
                    lineHeight: 1.45,
                    minWidth: 0,
                    maxWidth: '100%',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.body}
                </p>
              </li>
            ))}
            {filtered.length === 0 && (
              <li style={{ fontSize: '13px', color: palette.text.secondary }}>No matching tips.</li>
            )}
          </ul>
        </Card>

        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 8px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Keyboard shortcuts
          </h2>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ borderBottom: `2px solid ${palette.border.strong}` }}>
                <th style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>Key</th>
                <th style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>Action</th>
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
                      }}
                    >
                      {row.key}
                    </kbd>
                  </td>
                  <td className="daynori-break" style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>
                    {row.action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: `${spacing.sm}px` }}>
            <Feedback
              severity="info"
              message="Shortcuts pause while you type in a field or note."
              themeMode={themeMode}
            />
          </div>
        </Card>

        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 8px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Need more help?
          </h2>
          <p className="daynori-break" style={{ margin: '0 0 12px', fontSize: 13, color: palette.text.secondary }}>
            See Support for troubleshooting and contact status. Screenshots of this interface live in
            the repository under artifacts for contributors; this preview does not embed private
            user data.
          </p>
          <Button
            variant="secondary"
            size="compact"
            themeMode={themeMode}
            onClick={() => {
              window.location.href = '/support';
            }}
          >
            Open Support
          </Button>
        </Card>
      </div>
    </div>
  );
}
