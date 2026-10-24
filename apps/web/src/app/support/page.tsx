'use client';

import React from 'react';
import Link from 'next/link';
import { colors, spacing, typography } from '@daynori/design-tokens';
import { Card } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';

/**
 * Support hub — honest about contact channels. Does not invent a monitored inbox
 * or treat dummy @daynori.com login identifiers as support addresses.
 */
export default function SupportPage() {
  const { themeMode } = useShell();
  const palette = colors[themeMode];

  return (
    <main id="main" className="daynori-page">
      <h1
        className="daynori-break"
        style={{
          margin: 0,
          fontSize: typography.webScale.welcomeTitle,
          fontWeight: 800,
          color: palette.text.primary,
        }}
      >
        Support
      </h1>
      <p className="daynori-break" style={{ color: palette.text.secondary, fontSize: 14 }}>
        Self-serve help is available below. A monitored public support inbox is not configured for
        this free testing preview.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.base }}>
        <Card themeMode={themeMode}>
          <h2 style={{ marginTop: 0, color: palette.text.primary, fontSize: 18 }}>Help yourself</h2>
          <ul className="daynori-break" style={{ color: palette.text.secondary, lineHeight: 1.5 }}>
            <li>
              <Link href="/help">Help &amp; tutorial</Link> — how-tos and replay the beginner guide
            </li>
            <li>
              <Link href="/privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/terms">Terms</Link>
            </li>
            <li>
              <Link href="/account-deletion">Account deletion</Link>
            </li>
          </ul>
        </Card>

        <Card themeMode={themeMode}>
          <h2 style={{ marginTop: 0, color: palette.text.primary, fontSize: 18 }}>
            Troubleshooting
          </h2>
          <ul className="daynori-break" style={{ color: palette.text.secondary, lineHeight: 1.5 }}>
            <li>
              <strong>Slow first load:</strong> the free server may sleep; wait about a minute and
              retry.
            </li>
            <li>
              <strong>Signed out unexpectedly:</strong> try refreshing once after the server wakes.
              Choose Log out only when you mean to.
            </li>
            <li>
              <strong>Offline:</strong> keep the app open to edit local drafts; cold reopen without
              network shows an offline page until you reconnect.
            </li>
            <li>
              <strong>Dummy login emails</strong> (for example testing identifiers) are not real
              inboxes — password recovery by email may not work for them.
            </li>
          </ul>
        </Card>

        <Card themeMode={themeMode}>
          <h2 style={{ marginTop: 0, color: palette.text.primary, fontSize: 18 }}>Contact</h2>
          <p className="daynori-break" style={{ color: palette.text.secondary, margin: 0 }}>
            No monitored support email is published for this preview. Ask the project owner for a
            contact channel if you need human help. This page never pretends a message was sent.
          </p>
        </Card>
      </div>
    </main>
  );
}
