// Service worker for the phone remote (/remote/). It caches the app shell only, so the phone
// opens offline or on a bad connection. Everything else goes straight to the network.
// build.sh replaces __V__ with the build stamp: every deploy gets a new cache name and the old caches are deleted.
const VERSION = '__V__';
const CACHE = 'sunset-remote-' + VERSION;

// The shell, as exact URLs. The ?v= values match the ones the page uses, so the same file is found.
const SHELL_PATHS = [
  './',
  './remote.css?v=' + VERSION,
  './remote.js?v=' + VERSION,
  './manifest.webmanifest',
  '../shared/tokens.css?v=' + VERSION,
  '../shared/db.js?v=' + VERSION,
  '../shared/room.js?v=' + VERSION,
  '../shared/firebase-config.js?v=' + VERSION,
  '../assets/fonts/anton-latin-400.woff2',
  '../assets/icon.svg',
  '../assets/icon-192.png',
  '../assets/icon-512.png',
  '../assets/apple-touch-icon.png',
];
const SHELL = new Set(SHELL_PATHS.map((p) => new URL(p, self.location.href).href));
const HOME = new URL('./', self.location.href).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 'reload' skips the browser's HTTP cache so the new build's files are really fetched.
    await Promise.all([...SHELL].map(async (url) => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error('shell file missing: ' + url);
      await cache.put(url, res);
    }));
    self.skipWaiting(); // take over at once instead of waiting for every tab to close
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('sunset-remote-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase and the CDN are other origins: never intercepted, so database traffic is never cached.
  if (url.origin !== self.location.origin) return;

  // Opening the app (or a link with ?room=): the network first, so a deploy shows at once.
  // Offline, fall back to the cached page; the room comes from localStorage either way.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (err) {
        const cache = await caches.open(CACHE);
        return (await cache.match(HOME)) || Response.error();
      }
    })());
    return;
  }

  // Shell files: from the cache for this build; anything else passes through untouched.
  if (!SHELL.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(url.href)) || fetch(req);
  })());
});
