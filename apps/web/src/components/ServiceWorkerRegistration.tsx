'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { colors, radii, spacing, touchTargets } from '@daynori/design-tokens';
import { useAuth } from './AuthContext';
import { useShell } from './ShellContext';
import { createWebApiClient } from '../data/webApiClient';
import { reconcileWebPushSubscriptionAsync } from '../notifications/webPushManager';

/**
 * Registers the reviewed PWA service worker and surfaces a concise update action.
 * Does not clear drafts, IndexedDB, or pending mutations on update.
 */
export function ServiceWorkerRegistration() {
  const { isAuthenticated, user, csrfToken } = useAuth();
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    let cancelled = false;

    const trackWaiting = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        if (!cancelled) setWaitingWorker(registration.waiting);
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (
            installing.state === 'installed' &&
            navigator.serviceWorker.controller &&
            registration.waiting
          ) {
            if (!cancelled) {
              setDismissed(false);
              setWaitingWorker(registration.waiting);
            }
          }
        });
      });
    };

    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        trackWaiting(registration);
        void registration.update().catch(() => undefined);
      })
      .catch((err) => {
        console.warn('Daynori service worker registration failed:', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      const client = createWebApiClient({ csrfToken });
      void reconcileWebPushSubscriptionAsync(client, user.id);
    }
  }, [isAuthenticated, user?.id, csrfToken]);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    const onControllerChange = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    // Fallback reload if controllerchange already fired
    window.setTimeout(() => {
      window.location.reload();
    }, 1500);
  }, [waitingWorker]);

  if (!waitingWorker || dismissed) {
    return null;
  }

  return (
    <div
      className="daynori-sw-update"
      role="status"
      aria-live="polite"
      style={{
        backgroundColor: palette.surfaceRaised,
        color: palette.text.primary,
        border: `1px solid ${palette.border.strong}`,
      }}
    >
      <p className="daynori-break" style={{ margin: 0, flex: '1 1 10rem', fontSize: '14px', minWidth: 0 }}>
        Update available. Save your work, then refresh.
      </p>
      <button
        type="button"
        onClick={applyUpdate}
        style={{
          minHeight: `${touchTargets.webMin}px`,
          minWidth: `${touchTargets.webMin}px`,
          padding: `0 ${spacing.sm}px`,
          borderRadius: `${radii.sm}px`,
          border: 'none',
          backgroundColor: palette.action.primary,
          color: palette.action.label,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Update
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update notice"
        style={{
          minHeight: `${touchTargets.webMin}px`,
          minWidth: `${touchTargets.webMin}px`,
          padding: `0 ${spacing.sm}px`,
          borderRadius: `${radii.sm}px`,
          border: `1px solid ${palette.border.subtle}`,
          backgroundColor: 'transparent',
          color: palette.text.secondary,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Later
      </button>
    </div>
  );
}
