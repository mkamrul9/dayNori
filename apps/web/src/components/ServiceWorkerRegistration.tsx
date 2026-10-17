'use client';

import { useEffect } from 'react';
import { useAuth } from './AuthContext';
import { createWebApiClient } from '../data/webApiClient';
import { reconcileWebPushSubscriptionAsync } from '../notifications/webPushManager';

export function ServiceWorkerRegistration() {
  const { isAuthenticated, user, csrfToken } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // Listen for updates
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New content available
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn('Daynori service worker registration failed:', err);
        });
    }
  }, []);

  // Reconcile push subscription when user session changes
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      const client = createWebApiClient({ csrfToken });
      void reconcileWebPushSubscriptionAsync(client, user.id);
    }
  }, [isAuthenticated, user?.id, csrfToken]);

  return null;
}
