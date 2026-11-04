// Khatt service worker: makes the app open offline and installable.
// Version, library version and the precache list are filled in at build time (see vite.config.ts).
const VERSION = '__VERSION__';
const SHELL = `khatt-shell-${VERSION}`;
const LIBRARY = 'khatt-library-__LIBVERSION__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL && key !== LIBRARY) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // open-image sites go straight to the network
  if (req.mode === 'navigate') {
    // App shell: the cached page for this version opens instantly, online or not.
    event.respondWith(caches.match(new URL('./index.html', self.registration.scope).href, { ignoreVary: true }).then((r) => r || fetch(req)));
    return;
  }
  const isLibrary = url.pathname.includes('/library/') && !url.pathname.endsWith('/library/index.json');
  event.respondWith((async () => {
    // Cached files are content-hashed, so a different Origin/Accept-Encoding can never change them:
    // ignore Vary (hosts that send "Vary: Origin" would otherwise miss the cache for module scripts).
    const hit = await caches.match(req, { ignoreVary: true });
    if (hit) return hit;
    const res = await fetch(req);
    // Drawings are cached the first time they are shown, so they work offline afterwards.
    if (isLibrary && res.ok) (await caches.open(LIBRARY)).put(req, res.clone());
    return res;
  })());
});
