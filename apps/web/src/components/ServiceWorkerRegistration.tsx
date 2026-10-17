'use client';

import { useEffect } from 'react';
import { useAuth } from './AuthContext';
import { createApiClient } from '@daynori/api-client';
import { reconcileWebPushSubscriptionAsync } from '../notifications/webPushManager';

export function ServiceWorkerRegistration() {
  const { isAuthenticated } = useAuth();

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
    if (isAuthenticated) {
      const client = createApiClient({
        baseUrl: '/api',
      });
      void reconcileWebPushSubscriptionAsync(client);
    }
  }, [isAuthenticated]);

  return null;
}
