/* TeamTask PWA — never cache HTML/SW so deploys show without a server purge. */
const CACHE = 'teamtask-pwa-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function isUncachedPath(pathname) {
  if (pathname === '/' || pathname === '/index.html') return true;
  if (pathname === '/sw.js' || pathname === '/manifest.json' || pathname === '/pwa-register.js') return true;
  if (pathname.endsWith('.html')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws') || url.pathname.startsWith('/uploads')) {
    return;
  }

  if (req.mode === 'navigate' || isUncachedPath(url.pathname)) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      if (fresh && fresh.ok && /\.[a-f0-9]{8,}\./i.test(url.pathname)) {
        const copy = fresh.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
      }
      return fresh;
    })()
  );
});
