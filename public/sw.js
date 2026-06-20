const CACHE = 'gasocamion-v1';
const STATIC = [
  '/gasolineras.html',
  '/admin-gasolineras.html',
  '/manifest.json',
  '/css/gasolineras.css',
  '/css/admin-gasolineras.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  if (url.pathname === '/api/gasolineras') {
    event.respondWith(networkWithCacheFallback(event.request));
    return;
  }

  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' ||
      url.hostname === 'unpkg.com') {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  if (url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/') || url.pathname.startsWith('/data/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  return cached || fetchAndCache(req);
}

async function networkFirst(req) {
  try {
    return await fetchAndCache(req);
  } catch {
    const cached = await caches.match(req);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkWithCacheFallback(req) {
  try {
    return await fetchAndCache(req);
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    const last = await caches.match('/gasolineras.html');
    if (last) return new Response(JSON.stringify({ offline: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
    return new Response(JSON.stringify({ error: 'No hay datos cacheados' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function fetchAndCache(req) {
  const res = await fetch(req);
  if (res.ok) {
    const clone = res.clone();
    caches.open(CACHE).then(cache => cache.put(req, clone));
  }
  return res;
}
