const VERSION = 'dev';
// strich. Service Worker: hält die App-Shell offline vor. Daten liegen in IndexedDB, nicht hier.
const CACHE = 'strich-' + VERSION;
const SHELL = ['./', './index.html', './src/rechnen.js', './src/abgleich.js','./manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('strich-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Netz zuerst für Seitenaufrufe (damit Updates ankommen), sonst Cache zuerst.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { const k = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', k)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const k = res.clone(); caches.open(CACHE).then(c => c.put(req, k)); }
      return res;
    }))
  );
});
