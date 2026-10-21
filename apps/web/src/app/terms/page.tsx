'use client';

import React from 'react';
import Link from 'next/link';
import { colors, spacing, typography } from '@daynori/design-tokens';
import { Card } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';

export default function TermsPage() {
  const { themeMode } = useShell();
  const palette = colors[themeMode];

  return (
    <main
      id="main"
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: `${spacing.lg}px ${spacing.base}px`,
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: typography.webScale.welcomeTitle,
          fontWeight: 800,
          color: palette.text.primary,
        }}
      >
        Terms of use (draft)
      </h1>
      <p style={{ color: palette.text.secondary }}>
        Provisional local draft for launch preparation. Not a binding commercial agreement.
      </p>

      <Card themeMode={themeMode}>
        <h2 style={{ marginTop: 0, color: palette.text.primary }}>Service description</h2>
        <p style={{ color: palette.text.secondary }}>
          Daynori (provisional name) provides a personal organizer for notes, routines, tasks,
          journals, and files. Features marked disabled in the release manifest (vault, rooms/chat
          for real users, live AI, production billing, deferred Drive) are unavailable and must not
          be advertised.
        </p>
      </Card>

      <div style={{ marginTop: spacing.base }}>
      <Card themeMode={themeMode}>
        <h2 style={{ marginTop: 0, color: palette.text.primary }}>Accounts and deletion</h2>
        <p style={{ color: palette.text.secondary }}>
          You may request deletion via Settings or the public{' '}
          <Link href="/account-deletion">account deletion</Link> page. Destructive action requires
          identity verification. Delivery uses a synthetic local sink in development.
        </p>
      </Card>
      </div>

      <div style={{ marginTop: spacing.base }}>
      <Card themeMode={themeMode}>
        <h2 style={{ marginTop: 0, color: palette.text.primary }}>Unresolved</h2>
        <ul style={{ color: palette.text.secondary }}>
          <li>Governing law / venue — owner decision</li>
          <li>Legal entity and merchant of record — owner decision</li>
          <li>Paid plan commercial terms — excluded until catalog/prices approved</li>
          <li>Monitored support SLA — unassigned</li>
        </ul>
      </Card>
      </div>
    </main>
  );
}
