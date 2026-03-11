const CACHE = 'colegio-emanuel-v3';
const OFFLINE_URL = '/';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([OFFLINE_URL])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(OFFLINE_URL))
    );
  }
});

self.addEventListener('push', event => {
  try {
    const data = event.data?.json() || {};
    event.waitUntil(
      self.registration.showNotification(data.title || 'Colegio Emanuel', {
        body: data.body || '',
        icon: '/LOGO EMANUEL.png',
        badge: '/LOGO EMANUEL.png',
        vibrate: [200, 100, 200],
        renotify: true,
        tag: 'attendance',
        data: data.data || {},
      })
    );
  } catch {
    event.waitUntil(
      self.registration.showNotification('Colegio Emanuel', { body: 'Nueva notificación', vibrate: [200, 100, 200] })
    );
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});
