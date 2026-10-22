'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { colors, radii, spacing, touchTargets } from '@daynori/design-tokens';
import { useAuth } from './AuthContext';
import { useShell } from './ShellContext';
import { createWebApiClient } from '../data/webApiClient';
import { reconcileWebPushSubscriptionAsync } from '../notifications/webPushManager';
import { hasUnsavedWork, subscribeUnsavedWork } from '../editing/unsavedWork';

const INSTALL_DISMISS_KEY = 'daynori:pwa-install-dismissed';

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
 * Single stacked status region for Install + Update so banners never overlap.
 * Update never force-reloads while unsaved work is flagged; Later dismisses.
 */
export function AppStatusBanners() {
  const { isAuthenticated, user, csrfToken } = useAuth();
  const { themeMode } = useShell();
  const palette = colors[themeMode];

  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [deferredInstall, setDeferredInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => subscribeUnsavedWork(setUnsaved), []);
  useEffect(() => {
    setUnsaved(hasUnsavedWork());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    let cancelled = false;

    const trackWaiting = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting && navigator.serviceWorker.controller && !cancelled) {
        setWaitingWorker(registration.waiting);
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (
            installing.state === 'installed' &&
            navigator.serviceWorker.controller &&
            registration.waiting &&
            !cancelled
          ) {
            setUpdateDismissed(false);
            setWaitingWorker(registration.waiting);
          }
        });
      });
    };

    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        trackWaiting(registration);
        void registration.update().catch(() => undefined);

        // ADR 0066: warm public /_next/static assets observed this session (not private HTML).
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => {
            try {
              const path = new URL(u).pathname;
              return path.startsWith('/_next/static/');
            } catch {
              return false;
            }
          })
          .slice(0, 80);
        if (urls.length > 0 && registration.active) {
          registration.active.postMessage({ type: 'PRECACHE_PUBLIC_STATIC', urls });
        }
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(INSTALL_DISMISS_KEY) === '1') return;
    } catch {
      /* ignore */
    }
    if (isStandaloneDisplay()) {
      try {
        window.localStorage.setItem(INSTALL_DISMISS_KEY, '1');
      } catch {
        /* ignore */
      }
      return;
    }
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredInstall(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const dismissInstall = useCallback(() => {
    setDeferredInstall(null);
    try {
      window.localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferredInstall) return;
    await deferredInstall.prompt();
    await deferredInstall.userChoice;
    dismissInstall();
  }, [deferredInstall, dismissInstall]);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return;
    if (hasUnsavedWork()) {
      setUpdateError('Save or discard your edits first, then tap Update.');
      return;
    }
    setUpdateError(null);
    let reloaded = false;
    const reloadOnce = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    const onControllerChange = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      reloadOnce();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    // Soft fallback only if controllerchange never fires — still refuse while dirty
    window.setTimeout(() => {
      if (!hasUnsavedWork()) reloadOnce();
      else {
        setUpdateError('Update waiting. Finish editing, then tap Update again.');
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      }
    }, 2500);
  }, [waitingWorker]);

  const showUpdate = Boolean(waitingWorker) && !updateDismissed;
  // Prefer Update over Install when both would show
  const showInstall = Boolean(deferredInstall) && !showUpdate;

  if (!showUpdate && !showInstall) return null;

  return (
    <div
      className="daynori-status-banners"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(var(--daynori-bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 12px)',
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 420,
        marginLeft: 'auto',
        pointerEvents: 'none',
      }}
    >
      {showUpdate && (
        <div
          role="status"
          aria-live="polite"
          className="daynori-break"
          style={{
            pointerEvents: 'auto',
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
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
          }}
        >
          <p style={{ margin: 0, flex: '1 1 10rem', fontSize: 14, minWidth: 0 }}>
            {unsaved
              ? 'Update available. Save your edits first.'
              : 'Update available. Your drafts stay on this device.'}
          </p>
          {updateError && (
            <p
              style={{
                margin: 0,
                flex: '1 1 100%',
                fontSize: 12,
                color: palette.status.danger || palette.text.secondary,
              }}
            >
              {updateError}
            </p>
          )}
          <button
            type="button"
            onClick={applyUpdate}
            disabled={unsaved}
            style={{
              minHeight: touchTargets.webMin,
              minWidth: touchTargets.webMin,
              padding: `0 ${spacing.sm}px`,
              borderRadius: radii.sm,
              border: 'none',
              backgroundColor: unsaved ? palette.border.subtle : palette.action.primary,
              color: unsaved ? palette.text.secondary : palette.action.label,
              fontWeight: 700,
              cursor: unsaved ? 'not-allowed' : 'pointer',
            }}
          >
            Update
          </button>
          <button
            type="button"
            onClick={() => setUpdateDismissed(true)}
            aria-label="Dismiss update notice"
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
            Later
          </button>
        </div>
      )}

      {showInstall && (
        <div
          role="region"
          aria-label="Install Daynori on this phone"
          className="daynori-break"
          style={{
            pointerEvents: 'auto',
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
          <p style={{ margin: 0, flex: '1 1 10rem', minWidth: 0, fontSize: 14, fontWeight: 700 }}>
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
            onClick={dismissInstall}
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
      )}
    </div>
  );
}
