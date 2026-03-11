import webpush from 'web-push';
import pool from '../config/db.js';

webpush.setVapidDetails(
  'mailto:admin@colegioemanuel.es',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export async function getWebSubscriptionsForUsers(userIds) {
  if (!userIds.length) return [];
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
  const result = await pool._pool.query(
    `SELECT token, p256dh, auth_key FROM push_tokens
     WHERE platform='web' AND p256dh IS NOT NULL AND user_id IN (${placeholders})`,
    userIds
  );
  return result.rows.map(r => ({
    endpoint: r.token,
    keys: { p256dh: r.p256dh, auth: r.auth_key },
  }));
}

export async function sendWebPush(subscriptions, { title, body }, data = {}) {
  if (!subscriptions.length) return;
  const payload = JSON.stringify({ title, body, data });
  const dead = [];

  await Promise.all(subscriptions.map(async sub => {
    try {
      await webpush.sendNotification(sub, payload);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
      else console.warn('WebPush send error:', err.message);
    }
  }));

  if (dead.length) {
    const placeholders = dead.map((_, i) => `$${i + 1}`).join(',');
    await pool._pool.query(
      `DELETE FROM push_tokens WHERE token IN (${placeholders})`, dead
    ).catch(() => {});
  }
}
