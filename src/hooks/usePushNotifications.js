import { useEffect } from 'react';
import { api } from '../api/client';

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function usePushNotifications(user) {
  useEffect(() => {
    if (!user || user.role !== 'padre') return;

    async function register() {
      // Check inside the effect so Capacitor bridge is guaranteed to be ready
      const isCapacitor = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true;
      try {
        if (isCapacitor) {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          await PushNotifications.createChannel({
            id: 'default',
            name: 'Colegio Emanuel',
            importance: 5,
            visibility: 1,
            vibration: true,
            sound: 'default',
          });
          const perm = await PushNotifications.requestPermissions();
          if (perm.receive !== 'granted') return;
          await PushNotifications.register();
          PushNotifications.addListener('registration', async ({ value: token }) => {
            await api.post('/push-tokens', { token, platform: 'android' });
          });
          // Dispatch refresh event when push arrives (foreground or tapped from background)
          const refresh = () => window.dispatchEvent(new CustomEvent('server-change'));
          PushNotifications.addListener('pushNotificationReceived', refresh);
          PushNotifications.addListener('pushNotificationActionPerformed', refresh);
        } else {
          if (!VAPID_KEY || !('serviceWorker' in navigator) || !('Notification' in window)) return;
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') return;

          const swReg = await navigator.serviceWorker.ready;

          const subscription = await swReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: VAPID_KEY,
          });

          const sub = subscription.toJSON();
          console.log('[Push] suscrito:', sub.endpoint.slice(0, 50) + '...');
          await api.post('/push-tokens', {
            endpoint: sub.endpoint,
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
            platform: 'web',
          });
        }
      } catch (e) {
        console.warn('Push registration failed:', e.message);
      }
    }

    register();
  }, [user?.id]);
}
