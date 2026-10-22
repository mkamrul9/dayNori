// Daynori Service Worker (Phase 29/30/31: Web Reminders & Reviewed PWA Shell)
const CACHE_VERSION = 'daynori-static-v5';

// Strict allowlist: immutable public static assets only.
// Root navigation ('/') and personalized views (Today, Plan, Journal, Settings) are strictly excluded.
const ALLOWLISTED_STATIC_ASSETS = [
  '/manifest.json',
  '/offline.html',
  '/favicon.ico',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/brand/daynori-logo.svg',
  '/brand/daynori-logo-inverse.svg',
  '/brand/daynori-symbol.svg',
  '/brand/daynori-symbol-inverse.svg',
  '/brand/icon-192.png',
  '/brand/icon-512.png',
  '/brand/icon-maskable-512.png',
];

/**
 * Checks if a request URL matches the strict public static asset allowlist.
 * Excludes all authenticated HTML, Next.js RSC payloads, private APIs, and capability-bearing URLs.
 */
function isAllowlistedStaticAsset(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== self.location.origin) {
      return false;
    }

    const path = parsed.pathname;

    // Strict Exclusions: private APIs, auth routes, signed URLs, downloads
    if (
      path.startsWith('/v1/') ||
      path.startsWith('/api/') ||
      path.startsWith('/auth/') ||
      path.startsWith('/attachments/') ||
      path.includes('/signed/') ||
      path.includes('/download/')
    ) {
      return false;
    }

    // Exclude Next.js RSC / prefetch streams
    if (parsed.searchParams.has('_rsc')) {
      return false;
    }

    // Exclude capability-bearing query parameters
    if (
      parsed.searchParams.has('token') ||
      parsed.searchParams.has('signature') ||
      parsed.searchParams.has('sig') ||
      parsed.searchParams.has('auth') ||
      parsed.searchParams.has('key') ||
      parsed.searchParams.has('secret') ||
      parsed.searchParams.has('credential')
    ) {
      return false;
    }

    // Public static asset files (must have no query parameters)
    if (ALLOWLISTED_STATIC_ASSETS.includes(path)) {
      return !parsed.search;
    }

    // Allow Next.js immutable static build bundles
    if (path.startsWith('/_next/static/')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// 1. Install Lifecycle: precache allowlisted public static assets only
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(ALLOWLISTED_STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Precache failed for some assets:', err);
      });
    })
  );
});

// 2. Activate Lifecycle: clean up only old daynori-static-v* caches without touching unrelated origin caches,
// and safely remove any legacy navigation/private entries from old installations.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key.startsWith('daynori-static-') && key !== CACHE_VERSION) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        );
      })
      .then(() => {
        return caches.open(CACHE_VERSION).then((cache) => {
          return cache.keys().then((requests) => {
            return Promise.all(
              requests.map((request) => {
                if (!isAllowlistedStaticAsset(request.url)) {
                  return cache.delete(request);
                }
                return Promise.resolve();
              })
            );
          });
        });
      })
      .then(() => self.clients.claim())
  );
});

// Upgrade message listener: safely skip waiting upon explicit message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 3. Fetch Handler: strict allowlist caching policy
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);

  // Check for Next.js RSC / prefetch headers
  const isRsc =
    req.headers.get('RSC') === '1' ||
    req.headers.get('Next-Router-Prefetch') === '1' ||
    url.searchParams.has('_rsc');

  if (isRsc) {
    // Network-only: never cache private RSC payloads
    return;
  }

  // Check for private API routes
  if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/api/')) {
    // Network-only: never cache private API responses in shared service worker CacheStorage
    return;
  }

  // Vault surfaces: never put vault HTML/RSC into SW caches (plaintext must not persist).
  if (url.pathname.startsWith('/vault') || url.pathname.startsWith('/dev/vault-harness')) {
    return;
  }

  // Navigation requests: Network-first, falling back to clean offline shell.
  // NEVER cache HTML responses from navigation in static CacheStorage.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match('/offline.html').then((fallback) => {
          return (
            fallback ||
            new Response('Offline: Daynori requires an active connection for this view.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        });
      })
    );
    return;
  }

  // Allowlisted public static assets: Cache-first with network fallback
  if (isAllowlistedStaticAsset(req.url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(req).then((response) => {
          if (
            response &&
            response.status === 200 &&
            response.type === 'basic' &&
            !response.headers.get('set-cookie') &&
            !response.headers.get('cache-control')?.includes('no-store') &&
            !response.headers.get('cache-control')?.includes('private')
          ) {
            const clone = response.clone();
            event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone)));
          }
          return response;
        });
      })
    );
    return;
  }
});

// 4. Push Event Handling: enforce generic display text to prevent private information leakage
self.addEventListener('push', (event) => {
  const title = 'Daynori Reminder';
  const body = 'You have a scheduled reminder';
  let data = {
    destination: 'plan',
    timestamp: Date.now(),
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload && typeof payload === 'object') {
        if (payload.data && typeof payload.data === 'object') {
          data = payload.data;
        }
      }
    } catch {
      // Malformed or raw text data: do NOT use as notification body; retain generic default
    }
  }

  const notificationOptions = {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.instanceId || 'daynori-reminder',
    data,
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, notificationOptions));
});

// 5. Notification Click Handling: safe client focus/navigation carrying validated target identity
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let destination = data.destination || 'plan';

  const ALLOWED_DESTINATIONS = ['plan', 'today', 'library', 'journal', 'settings'];
  if (!ALLOWED_DESTINATIONS.includes(destination)) {
    destination = 'plan';
  }

  // Build target URL carrying validated identifiers so the client can reauthorize and open the source item
  const params = new URLSearchParams();
  if (data.instanceId) params.set('reminderInstanceId', String(data.instanceId));
  if (data.deliveryGeneration) params.set('deliveryGeneration', String(data.deliveryGeneration));
  if (data.itemId || data.targetId) params.set('targetId', String(data.itemId || data.targetId));
  if (data.targetType) params.set('targetType', String(data.targetType));
  if (data.workspaceId) params.set('workspaceId', String(data.workspaceId));

  const queryString = params.toString();
  const targetPath = '/' + destination + (queryString ? '?' + queryString : '');
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then((focused) => {
            if (focused && 'navigate' in focused) {
              return focused.navigate(targetUrl);
            }
          });
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
