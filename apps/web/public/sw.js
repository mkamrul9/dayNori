// Daynori Service Worker (Phase 29: Web Reminders & Reviewed PWA Shell)
const CACHE_VERSION = 'daynori-static-v1';
const ALLOWLISTED_STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/favicon.ico',
];

/**
 * Checks if a request URL matches the strict public static asset allowlist.
 * Excludes authenticated HTML, Next.js RSC payloads, private APIs, and signed capabilities.
 */
function isAllowlistedStaticAsset(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== self.location.origin) {
      return false;
    }

    const path = parsed.pathname;

    // Strict Exclusions
    if (path.startsWith('/v1/') || path.startsWith('/api/') || path.startsWith('/auth/')) {
      return false;
    }
    if (parsed.searchParams.has('_rsc')) {
      return false;
    }
    if (path.includes('/signed/') || path.includes('/download/')) {
      return false;
    }

    if (ALLOWLISTED_STATIC_ASSETS.includes(path)) {
      return true;
    }

    // Allow Next.js static asset bundles
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
  // Avoid disruptive reloads during user edits
  self.skipWaiting();
});

// 2. Activate Lifecycle: clean up only old daynori-static-v* caches without touching unrelated origin caches
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
      .then(() => self.clients.claim())
  );
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

  // Allowlisted public static assets: Cache-first with network fallback
  if (isAllowlistedStaticAsset(req.url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(req).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation requests: Network-first, falling back to clean offline shell
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
});

// 4. Push Event Handling: bounded generic display text
self.addEventListener('push', (event) => {
  let title = 'Daynori Reminder';
  let body = 'You have a scheduled reminder';
  let data = {
    destination: 'plan',
    timestamp: Date.now(),
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload && typeof payload === 'object') {
        if (typeof payload.title === 'string' && payload.title.length <= 100) {
          title = payload.title;
        }
        if (typeof payload.body === 'string' && payload.body.length <= 300) {
          body = payload.body;
        }
        if (payload.data && typeof payload.data === 'object') {
          data = payload.data;
        }
      }
    } catch {
      const rawText = event.data.text();
      if (rawText && rawText.length <= 100) {
        body = rawText;
      }
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

// 5. Notification Click Handling: safe focus / open client
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let destination = data.destination || 'plan';

  const ALLOWED_DESTINATIONS = ['plan', 'today', 'library', 'journal', 'settings'];
  if (!ALLOWED_DESTINATIONS.includes(destination)) {
    destination = 'plan';
  }

  const targetPath = '/' + destination;
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
