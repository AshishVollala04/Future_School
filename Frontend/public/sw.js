/**
 * FutureSchool service worker.
 * - Caches offline fallback and icons for PWA / Android TWA installability.
 * - Always revalidates HTML navigations against the network so F5 / reloads load the latest build.
 * - NEVER caches /api/ or HTML rewrites under /assets/, so fees, attendance, marks, and deploys stay live.
 */
const CACHE_NAME = 'futureschool-shell-v2';
const SHELL_URLS = ['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

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
  // Never cache API endpoints or well-known verification files.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.well-known/')) return;

  // Navigation requests: revalidate HTML against network, fallback to /offline.html when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(new Request(req.url, { cache: 'no-cache' }))
        .catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // Versioned Vite assets and icons: cache-first, rejecting HTML SPA rewrites for missing deploy chunks.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    const isViteChunk = url.pathname.startsWith('/assets/');
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req)
          .then(res => {
            const type = (res.headers.get('content-type') || '').toLowerCase();
            if (isViteChunk && type.includes('text/html')) {
              return Response.error();
            }
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => undefined);
            }
            return res;
          });
      })
    );
  }
});
