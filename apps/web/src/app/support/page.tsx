'use client';

import React from 'react';
import Link from 'next/link';
import { colors, spacing, typography } from '@daynori/design-tokens';
import { Card } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';

export default function SupportPage() {
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
        Support (draft)
      </h1>
      <p style={{ color: palette.text.secondary }}>
        No monitored public inbox is claimed. Owner must assign support coverage before launch.
      </p>

      <Card themeMode={themeMode}>
        <h2 style={{ marginTop: 0, color: palette.text.primary }}>Self-serve</h2>
        <ul style={{ color: palette.text.secondary }}>
          <li>
            <Link href="/help">Help & accessibility</Link>
          </li>
          <li>
            <Link href="/privacy">Privacy (draft)</Link>
          </li>
          <li>
            <Link href="/terms">Terms (draft)</Link>
          </li>
          <li>
            <Link href="/account-deletion">Account deletion</Link>
          </li>
        </ul>
      </Card>

      <div style={{ marginTop: spacing.base }}>
        <Card themeMode={themeMode}>
          <h2 style={{ marginTop: 0, color: palette.text.primary }}>Contact</h2>
          <p style={{ color: palette.text.secondary }}>
            <strong>UNRESOLVED:</strong> Support email / hours / escalation. Do not publish
            provisional brand addresses as monitored until the owner provisions them.
          </p>
        </Card>
      </div>
    </main>
  );
}