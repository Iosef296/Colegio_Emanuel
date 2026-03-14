import { useEffect } from 'react';
import { api } from '../api/client';

// Clave pública VAPID necesaria para suscribirse a Web Push.
// Se inyecta en tiempo de build por Vite a través de la variable de entorno
// VITE_VAPID_PUBLIC_KEY definida en el .env del frontend.
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// ─── Hook usePushNotifications ─────────────────────────────────────────────────
//
// Hook personalizado que gestiona el registro de notificaciones push para el
// usuario autenticado. Soporta dos plataformas:
//
//   1. Capacitor (Android nativo): usa el plugin @capacitor/push-notifications
//      para registrarse en FCM y recibir tokens nativos.
//
//   2. Web/PWA (navegador): usa la Web Push API estándar con un Service Worker
//      y suscripción VAPID para recibir notificaciones en segundo plano.
//
// El hook solo actúa para usuarios con rol 'padre'; para cualquier otro rol
// cancela la suscripción existente para evitar notificaciones no deseadas.
//
// Parámetros:
//   user — objeto del usuario autenticado (del contexto AuthContext).
//          El hook se re-ejecuta cuando cambia user.id.
export function usePushNotifications(user) {
  useEffect(() => {
    // Si no hay usuario autenticado, salimos sin hacer nada.
    if (!user) return;

    // Solo el rol 'padre' debe recibir notificaciones push.
    // Para cualquier otro rol (docente, admin, auxiliar, etc.) eliminamos
    // cualquier suscripción previa que pudiera existir en el navegador,
    // de modo que no reciban notificaciones al cambiar de sesión.
    if (user.role !== 'padre') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg =>
          reg.pushManager.getSubscription().then(sub => sub?.unsubscribe())
        ).catch(() => {});
      }
      return;
    }

    // ── Función asíncrona de registro ──────────────────────────────────────

    // Se define como función interna asíncrona porque useEffect no puede ser async.
    // La detección de Capacitor se hace aquí dentro (y no en el scope del módulo)
    // para garantizar que el bridge nativo de Capacitor ya esté inicializado
    // en el momento de la comprobación.
    async function register() {
      // Check inside the effect so Capacitor bridge is guaranteed to be ready
      // Comprobamos si estamos corriendo en la app nativa de Capacitor (Android).
      const isCapacitor = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true;
      try {
        if (isCapacitor) {
          // ── Rama Capacitor (Android) ───────────────────────────────────────

          // Importamos el plugin de push de Capacitor dinámicamente para que
          // no rompa la build web donde este módulo no existe.
          const { PushNotifications } = await import('@capacitor/push-notifications');

          // Creamos el canal de notificaciones de Android con prioridad máxima (5),
          // vibración y sonido predeterminado. Esto es obligatorio en Android 8+
          // para que las notificaciones sean visibles.
          await PushNotifications.createChannel({
            id: 'default',
            name: 'Colegio Emanuel',
            importance: 5,   // IMPORTANCE_HIGH: notificación en cabecera
            visibility: 1,   // VISIBILITY_PUBLIC: visible en pantalla bloqueada
            vibration: true,
            sound: 'default',
          });

          // Solicitamos permiso al usuario para mostrar notificaciones.
          // Si el usuario rechaza, abortamos el registro.
          const perm = await PushNotifications.requestPermissions();
          if (perm.receive !== 'granted') return;

          // Registramos el dispositivo en FCM. El token llegará en el listener
          // 'registration' que definimos a continuación.
          await PushNotifications.register();

          // Cuando FCM devuelve el token del dispositivo, lo enviamos al backend
          // para que lo almacene asociado a este padre y pueda usarlo para enviar
          // notificaciones desde el servidor.
          PushNotifications.addListener('registration', async ({ value: token }) => {
            await api.post('/push-tokens', { token, platform: 'android' });
          });

          // Dispatch refresh event when push arrives (foreground or tapped from background)
          // Cuando llega una notificación (en primer plano) o el usuario la toca
          // (desde el cajón de notificaciones), disparamos el evento 'server-change'
          // que el hook useAutoRefresh escucha para actualizar los datos en pantalla.
          const refresh = () => window.dispatchEvent(new CustomEvent('server-change'));
          PushNotifications.addListener('pushNotificationReceived', refresh);
          PushNotifications.addListener('pushNotificationActionPerformed', refresh);
        } else {
          // ── Rama Web/PWA (navegador) ───────────────────────────────────────

          // Verificamos que estén disponibles todos los requisitos de Web Push:
          //   - Clave VAPID configurada en el entorno.
          //   - API Service Worker disponible en el navegador.
          //   - API Notification disponible (no disponible en algunos contextos).
          if (!VAPID_KEY || !('serviceWorker' in navigator) || !('Notification' in window)) return;

          // Solicitamos permiso al usuario para mostrar notificaciones.
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') return;

          // Esperamos a que el Service Worker esté activo y controlando la página.
          // navigator.serviceWorker.ready resuelve con el ServiceWorkerRegistration activo.
          const swReg = await navigator.serviceWorker.ready;

          // Creamos la suscripción push asociada al Service Worker.
          // userVisibleOnly: true es requerido por los navegadores (no se permiten
          // notificaciones silenciosas en Web Push para mayor privacidad del usuario).
          // applicationServerKey es la clave pública VAPID que autentica nuestro servidor.
          const subscription = await swReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: VAPID_KEY,
          });

          // Serializamos la suscripción a JSON para extraer endpoint y claves.
          const sub = subscription.toJSON();
          console.log('[Push] suscrito:', sub.endpoint.slice(0, 50) + '...');

          // Enviamos la suscripción al backend para que pueda enviar notificaciones
          // a través del protocolo Web Push cuando haya novedades para este padre.
          // El endpoint identifica el navegador; p256dh y auth son las claves de cifrado
          // que el servidor necesita para cifrar el payload de la notificación.
          await api.post('/push-tokens', {
            endpoint: sub.endpoint,
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
            platform: 'web',
          });
        }
      } catch (e) {
        // Capturamos cualquier error sin propagar para no interrumpir la app.
        // Errores comunes: permisos denegados, Service Worker no registrado,
        // o VAPID_KEY inválida.
        console.warn('Push registration failed:', e.message);
      }
    }

    // Lanzamos el flujo de registro sin bloquear el render.
    register();

  // El efecto solo se re-ejecuta si cambia el ID del usuario autenticado,
  // evitando registros duplicados en re-renders normales del componente padre.
  }, [user?.id]);
}
