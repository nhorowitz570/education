const CACHE = 'fieldwork-shell-v4';
self.addEventListener('install', (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(['/offline.html', '/offline.js', '/icons/icon-192.png']),
      ),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k !== CACHE && k.startsWith('fieldwork-shell-'))
              .map((k) => caches.delete(k)),
          ),
        ),
      self.clients.claim(),
    ]),
  ),
);
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () =>
        (await caches.open(CACHE)).match('/offline.html'),
      ),
    );
    return;
  }
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/offline.js'
  ) {
    event.respondWith(
      caches.open(CACHE).then(
        async (cache) =>
          (await cache.match(event.request)) ||
          fetch(event.request).then((response) => {
            if (response.ok) void cache.put(event.request, response.clone());
            return response;
          }),
      ),
    );
  }
});
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification('Fieldwork', {
      body: data.body || 'A useful next step is ready when you are.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'fieldwork-learning',
      data: { url: data.url || '/' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const client = clients.find(
          (c) => new URL(c.url).origin === self.location.origin,
        );
        const url = event.notification.data?.url || '/';
        if (client) return client.navigate(url).then((c) => (c || client).focus());
        return self.clients.openWindow(url);
      }),
  );
});
