/**
 * FutureSchool service worker.
 * - Caches static shell and offline fallback page for PWA / Android TWA installability.
 * - NEVER caches /api/ or non-GET requests so attendance, marks, fees, and OTP stay strictly live.
 */
const CACHE_NAME = 'futureschool-shell-v1';
const SHELL_URLS = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API endpoints, Razorpay callbacks, or well-known verification files.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.well-known/')) return;

  // Navigation requests: network first, fallback to offline page cleanly.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put('/', copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => caches.match('/offline.html').then(r => r || caches.match('/')))
    );
    return;
  }

  // Versioned Vite assets and icons: cache-first with background refresh.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(cached => {
        const fetched = fetch(req)
          .then(res => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => undefined);
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetched;
      })
    );
  }
});
