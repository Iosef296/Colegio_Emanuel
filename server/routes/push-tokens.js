import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.post('/', async (req, res) => {
  try {
    const { token, platform = 'web', endpoint, p256dh, auth } = req.body;

    if (platform === 'web' && endpoint && p256dh && auth) {
      // Web Push subscription
      await pool.query(
        `INSERT INTO push_tokens (user_id, token, platform, p256dh, auth_key)
         VALUES (?,?,?,?,?)
         ON CONFLICT (user_id, token) DO UPDATE SET updated_at=NOW(), p256dh=EXCLUDED.p256dh, auth_key=EXCLUDED.auth_key`,
        [req.user.id, endpoint, 'web', p256dh, auth]
      );
    } else if (token) {
      // Android FCM token
      await pool.query(
        `INSERT INTO push_tokens (user_id, token, platform)
         VALUES (?,?,?)
         ON CONFLICT (user_id, token) DO UPDATE SET updated_at=NOW()`,
        [req.user.id, token, platform]
      );
    } else {
      return res.status(400).json({ error: 'Suscripción requerida' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('push-tokens POST:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const { token, endpoint } = req.body;
    const key = endpoint || token;
    if (!key) return res.status(400).json({ error: 'Token requerido' });
    await pool.query('DELETE FROM push_tokens WHERE user_id=? AND token=?', [req.user.id, key]);
    res.json({ ok: true });
  } catch (err) {
    console.error('push-tokens DELETE:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
