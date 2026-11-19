// ============================================================================
// DineroYa — Service worker
// Guarda el shell de la app para abrirla sin señal. Los datos y las
// operaciones (/api/) nunca se cachean: sin red, la app avisa que no guarda.
// ============================================================================
const CACHE = 'dineroya-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(['/', '/manifest.webmanifest', '/icon.svg']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Datos y sesión: siempre a la red, jamás desde caché.
  if (url.pathname.startsWith('/api/')) return;

  // Navegación: red primero; si falla, el último shell guardado.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('/', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Assets con hash: caché primero, red como respaldo.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
        return response;
      })),
    );
  }
});
