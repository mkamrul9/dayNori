'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { colors, radii, spacing, touchTargets } from '@daynori/design-tokens';
import { useShell } from './ShellContext';

const DISMISS_KEY = 'daynori:pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/**
 * One-shot Chrome install affordance when beforeinstallprompt fires.
 * Does not auto-spam fallback tips; Help/tutorial keep manual steps.
 * Never repeats after install, accept, or dismiss.
 */
export function PwaInstallBanner() {
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* ignore */
    }
    if (isStandaloneDisplay()) {
      try {
        window.localStorage.setItem(DISMISS_KEY, '1');
      } catch {
        /* ignore */
      }
      return;
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const dismiss = useCallback(() => {
    setDeferred(null);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }, [deferred, dismiss]);

  if (!deferred) return null;

  return (
    <div
      className="daynori-pwa-install"
      role="region"
      aria-label="Install Daynori on this phone"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(var(--daynori-bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 12px)',
        zIndex: 1100,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        borderRadius: 10,
        boxSizing: 'border-box',
        backgroundColor: palette.surfaceRaised,
        color: palette.text.primary,
        border: `1px solid ${palette.border.strong}`,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
      }}
    >
      <p
        className="daynori-break"
        style={{ margin: 0, flex: '1 1 10rem', minWidth: 0, fontSize: 14, fontWeight: 700 }}
      >
        Install Daynori on this phone
      </p>
      <button
        type="button"
        onClick={() => void install()}
        style={{
          minHeight: touchTargets.webMin,
          minWidth: touchTargets.webMin,
          padding: `0 ${spacing.sm}px`,
          borderRadius: radii.sm,
          border: 'none',
          backgroundColor: palette.action.primary,
          color: palette.action.label,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Install
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install tip"
        style={{
          minHeight: touchTargets.webMin,
          minWidth: touchTargets.webMin,
          padding: `0 ${spacing.sm}px`,
          borderRadius: radii.sm,
          border: `1px solid ${palette.border.subtle}`,
          background: 'transparent',
          color: palette.text.secondary,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Not now
      </button>
    </div>
  );
}
