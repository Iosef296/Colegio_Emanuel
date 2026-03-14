/**
 * routes/push-tokens.js
 * Gestiona el registro y la eliminación de tokens de notificación push
 * (Web Push y FCM/Android) para los padres de familia.
 *
 * Solo los usuarios con rol 'padre' almacenan tokens; los demás roles
 * responden con ok:true sin persistir nada para no saturar la tabla.
 */

import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Todas las rutas requieren un JWT válido; el middleware extrae req.user.
router.use(authenticateToken);

/**
 * POST /push-tokens
 * Registra o actualiza el token de notificación push del padre autenticado.
 *
 * Acepta dos tipos de suscripción:
 *  1. Web Push (navegador de escritorio/móvil):
 *       Requiere endpoint (URL única del navegador), p256dh y auth (claves de cifrado).
 *       Se almacena usando el endpoint como "token" para mantener unicidad.
 *  2. FCM/Android (aplicación nativa Capacitor):
 *       Requiere el campo "token" con el registration token de Firebase.
 *       El campo "platform" indica el sistema operativo ('android', 'ios', etc.).
 *
 * En ambos casos se usa ON CONFLICT para hacer upsert:
 * si el token ya existe se actualiza la fecha (y las claves de cifrado en Web Push).
 */
router.post('/', async (req, res) => {
  try {
    // Solo los padres reciben notificaciones push; ignorar silenciosamente otros roles.
    if (req.user.role !== 'padre') return res.json({ ok: true }); // solo padres reciben notificaciones

    const { token, platform = 'web', endpoint, p256dh, auth } = req.body;

    if (platform === 'web' && endpoint && p256dh && auth) {
      // ── Suscripción Web Push ──────────────────────────────────────────────
      // El endpoint es la URL única del servicio push del navegador (Chrome, Firefox…).
      // p256dh y auth son las claves criptográficas del cliente necesarias para
      // cifrar el payload antes de enviarlo, según el estándar RFC 8291.
      await pool.query(
        `INSERT INTO push_tokens (user_id, token, platform, p256dh, auth_key)
         VALUES (?,?,?,?,?)
         ON CONFLICT (user_id, token) DO UPDATE SET updated_at=NOW(), p256dh=EXCLUDED.p256dh, auth_key=EXCLUDED.auth_key`,
        [req.user.id, endpoint, 'web', p256dh, auth]
      );
    } else if (token) {
      // ── Token FCM (Firebase Cloud Messaging) ─────────────────────────────
      // El token es generado por el SDK de Firebase en el dispositivo Android/iOS.
      // Solo se actualiza updated_at en caso de conflicto porque el token FCM
      // no cambia sus propiedades de cifrado (eso lo maneja Firebase internamente).
      await pool.query(
        `INSERT INTO push_tokens (user_id, token, platform)
         VALUES (?,?,?)
         ON CONFLICT (user_id, token) DO UPDATE SET updated_at=NOW()`,
        [req.user.id, token, platform]
      );
      console.log(`[push-tokens] saved ${platform} token for user ${req.user.id}`);
    } else {
      // Si no se recibió ni endpoint web válido ni token FCM, la petición es inválida.
      return res.status(400).json({ error: 'Suscripción requerida' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('push-tokens POST:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * DELETE /push-tokens
 * Elimina el token de notificación push del padre autenticado.
 * Se llama cuando el usuario desactiva notificaciones en el frontend
 * o cuando el service worker detecta que la suscripción fue revocada.
 *
 * Acepta "token" (FCM) o "endpoint" (Web Push) de forma intercambiable;
 * en la tabla ambos se almacenan en la columna "token".
 */
router.delete('/', async (req, res) => {
  try {
    const { token, endpoint } = req.body;

    // Normalizar: el endpoint de Web Push y el token FCM usan la misma columna en la DB.
    const key = endpoint || token;
    if (!key) return res.status(400).json({ error: 'Token requerido' });

    // Filtrar por user_id además del token para evitar que un usuario borre
    // registros de otro (aunque el token sea único, es una buena práctica de seguridad).
    await pool.query('DELETE FROM push_tokens WHERE user_id=? AND token=?', [req.user.id, key]);
    res.json({ ok: true });
  } catch (err) {
    console.error('push-tokens DELETE:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
