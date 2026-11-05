'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { colors, spacing, typography } from '@daynori/design-tokens';
import { Button, Card, Feedback } from '@daynori/ui-web';
import { useShell } from './ShellContext';
import { useAuth } from './AuthContext';

/**
 * Client gate for developer surfaces. Server/API still enforce DAYNORI_OPERATOR_USER_IDS.
 * Hiding alone is never sufficient — this only prevents ordinary UI exposure and flashing.
 */
export function OperatorGate({
  children,
  title = 'Developer tools',
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const { themeMode } = useShell();
  const { isAuthenticated, isLoading } = useAuth();
  const palette = colors[themeMode];
  const [state, setState] = useState<'loading' | 'denied' | 'allowed'>('loading');

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (isLoading) return;
      if (!isAuthenticated) {
        if (!cancelled) setState('denied');
        return;
      }
      try {
        const res = await fetch('/api/v1/operator/session', { cache: 'no-store' });
        if (!cancelled) setState(res.ok ? 'allowed' : 'denied');
      } catch {
        if (!cancelled) setState('denied');
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading]);

  if (state === 'loading' || isLoading) {
    return (
      <div className="daynori-page" aria-busy="true">
        <p style={{ color: palette.text.secondary }}>Checking access…</p>
      </div>
    );
  }

  if (state !== 'allowed') {
    return (
      <div className="daynori-page">
        <Card themeMode={themeMode}>
          <h1
            style={{
              margin: `0 0 ${spacing.sm}px`,
              fontSize: typography.webScale.sectionHeading,
              color: palette.text.primary,
            }}
          >
            {title}
          </h1>
          <Feedback
            severity="warning"
            themeMode={themeMode}
            message="This area is restricted to authorized platform operators. Ordinary accounts cannot enable it from Settings, preferences, or query parameters."
          />
          <div style={{ marginTop: spacing.base }}>
            <Link href="/settings" style={{ textDecoration: 'none' }}>
              <Button variant="secondary" themeMode={themeMode}>
                Back to Settings
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
