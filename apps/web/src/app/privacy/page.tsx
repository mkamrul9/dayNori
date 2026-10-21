'use client';

import React from 'react';
import Link from 'next/link';
import { colors, spacing, typography } from '@daynori/design-tokens';
import { Card } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';

/**
 * Draft privacy resource for local launch preparation.
 * Unresolved legal-entity / domain / retention fields are marked — not invented.
 */
export default function PrivacyPage() {
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
        Privacy (draft)
      </h1>
      <p style={{ color: palette.text.secondary }}>
        Daynori is a provisional name. This page describes implemented local behavior for launch
        preparation. It is not a lawyer-approved policy and does not claim a deployed public URL.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.base }}>
        <Card themeMode={themeMode}>
          <h2 style={{ marginTop: 0, color: palette.text.primary }}>Controller</h2>
          <p style={{ color: palette.text.secondary }}>
            <strong>UNRESOLVED:</strong> Legal entity name, registered address, and data-protection
            contact. Do not invent an operator. Owner decision required before release validation.
          </p>
        </Card>

        <Card themeMode={themeMode}>
          <h2 style={{ marginTop: 0, color: palette.text.primary }}>What the app processes</h2>
          <ul style={{ color: palette.text.secondary }}>
            <li>Account identifiers and authentication tokens (session-scoped).</li>
            <li>Personal organizer content you create: notes, tasks, routines, journals, files metadata/bytes.</li>
            <li>Optional modules (vault, rooms/chat, live AI, production billing, Drive) remain disabled for the proposed release and must not be marketed as available.</li>
            <li>No analytics SDK is assumed absent of collection — network/auth/storage still process account and content data.</li>
          </ul>
        </Card>

        <Card themeMode={themeMode}>
          <h2 style={{ marginTop: 0, color: palette.text.primary }}>Processors / subprocessors</h2>
          <p style={{ color: palette.text.secondary }}>
            <strong>UNRESOLVED:</strong> Production host, email delivery, object storage, and any
            crash/telemetry vendors. Local development uses synthetic sinks and must not send real
            verification email.
          </p>
        </Card>

        <Card themeMode={themeMode}>
          <h2 style={{ marginTop: 0, color: palette.text.primary }}>Retention, backups, deletion</h2>
          <ul style={{ color: palette.text.secondary }}>
            <li>
              Account deletion is available in-app and via the public{' '}
              <Link href="/account-deletion">account deletion</Link> resource (enumeration-safe;
              verification required before destructive action).
            </li>
            <li>
              Deletion suppression ledger retains content-free hashes for disaster-recovery
              sanitization for a disclosed window (engineering default documented in backup runbook;
              <strong> approved retention policy UNRESOLVED</strong>).
            </li>
            <li>Backup/restore of objects is separate from database snapshots.</li>
          </ul>
        </Card>

        <Card themeMode={themeMode}>
          <h2 style={{ marginTop: 0, color: palette.text.primary }}>Security limits</h2>
          <p style={{ color: palette.text.secondary }}>
            Screen lock is not encryption. Vault remains disabled. Support inbox and on-call coverage
            are <strong>unassigned</strong> until the owner names them.
          </p>
        </Card>
      </div>
    </main>
  );
}
