self.addEventListener('push', event => {
  try {
    const data = event.data?.json() || {};
    event.waitUntil(
      self.registration.showNotification(data.title || 'Colegio Emanuel', {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        data: data.data || {},
      })
    );
  } catch {
    event.waitUntil(
      self.registration.showNotification('Colegio Emanuel', { body: 'Nueva notificación' })
    );
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const tab = data.tab || '';
  const targetPath = tab ? `/notif?tab=${tab}` : '/notif';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetPath);
          return client.focus();
        }
      }
      return clients.openWindow(targetPath);
    })
  );
});
