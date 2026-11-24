// Offline support for Molecular Foundry (registered by js/app.js in the deployed build).
//
// Network first, always: online, every request goes to the network exactly as without this file, so
// a new deploy shows up at once. Each successful same-origin GET is also copied into the cache, and
// when the network fails (offline) the copy is served, so the app reloads and works offline after one
// visit. The page also posts the URLs it has already loaded, which were fetched before this worker
// was active, so the very first visit is cached too.
const CACHE = 'foundry-offline-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

const sameOrigin = url => new URL(url, self.location.href).origin === self.location.origin;

self.addEventListener('message', event => {
  const urls = (event.data && event.data.cacheUrls) || [];
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(urls.filter(sameOrigin).map(url =>
    fetch(url).then(res => (res.ok ? cache.put(url, res) : null)).catch(() => null)))));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !sameOrigin(req.url)) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(req, copy)));
      }
      return res;
    } catch (err) {
      const cache = await caches.open(CACHE);
      // Asset URLs carry ?v=<build>; fall back to any cached version of the same file.
      const hit = await cache.match(req) || await cache.match(req, { ignoreSearch: true })
        || (req.mode === 'navigate' ? await cache.match(new URL('./', self.location.href).href) || await cache.match(new URL('index.html', self.location.href).href) : null);
      if (hit) return hit;
      throw err;
    }
  })());
});
