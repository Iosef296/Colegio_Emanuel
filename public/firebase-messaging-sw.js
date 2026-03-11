// TODO: Replace these placeholder values with your actual Firebase project config
// from Firebase Console → Project Settings → Your apps → Web app → SDK setup and configuration
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCM4BwvyydnwhU4i7y2x_of4C_anClG7XY',
  authDomain: 'colegio-emanuel-92955.firebaseapp.com',
  projectId: 'colegio-emanuel-92955',
  messagingSenderId: '691644196163',
  appId: '1:691644196163:web:de888826dd70c633da3bf6',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'Colegio Emanuel', {
    body: body || '',
    icon: '/icons/icon-192.png',
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});
