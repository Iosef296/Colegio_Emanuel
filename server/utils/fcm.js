import crypto from 'crypto';
import pool from '../config/db.js';

let cachedToken = null;
let tokenExpiry = 0;
let serviceAccount = null;

function getServiceAccount() {
  if (!serviceAccount) serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return serviceAccount;
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExpiry - 60) return cachedToken;

  const sa = getServiceAccount();
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = base64url(sign.sign(sa.private_key));
  const jwt = `${header}.${payload}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`OAuth failed: ${JSON.stringify(data)}`);

  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in || 3600);
  return cachedToken;
}

export async function getParentIdsForStudent(studentId) {
  const [rows] = await pool.query(
    'SELECT parent_id FROM parent_student WHERE student_id=?',
    [studentId]
  );
  return rows.map(r => r.parent_id);
}

export async function getTokensForUsers(userIds) {
  if (!userIds.length) return [];
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
  const result = await pool._pool.query(
    `SELECT token FROM push_tokens WHERE platform='android' AND user_id IN (${placeholders})`,
    userIds
  );
  return result.rows.map(r => r.token);
}

export async function sendToTokens(tokens, { title, body }, data = {}) {
  console.log(`[FCM] sendToTokens: ${tokens.length} tokens, title="${title}"`);
  if (!tokens.length) return;
  const sa = getServiceAccount();
  const accessToken = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const deadTokens = [];

  await Promise.all(tokens.map(async (token) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            android: {
              priority: 'high',
              notification: {
                channel_id: 'default',
                notification_priority: 'PRIORITY_HIGH',
                default_vibrate_timings: true,
                sound: 'default',
              },
            },
            data: Object.fromEntries(
              Object.entries(data).map(([k, v]) => [k, String(v)])
            ),
          },
        }),
      });
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errCode = resJson.error?.details?.[0]?.errorCode || resJson.error?.status;
        console.error(`[FCM] error status=${res.status} code=${errCode} token=${token.slice(0,20)}... msg=${JSON.stringify(resJson.error?.message)}`);
        if (errCode === 'UNREGISTERED' || res.status === 404) {
          deadTokens.push(token);
        }
      } else {
        console.log(`[FCM] OK → ${resJson.name || 'sent'} token=${token.slice(0,20)}...`);
      }
    } catch (e) {
      console.warn('FCM send error for token:', e.message);
    }
  }));

  if (deadTokens.length) {
    const placeholders = deadTokens.map((_, i) => `$${i + 1}`).join(',');
    await pool._pool.query(
      `DELETE FROM push_tokens WHERE token IN (${placeholders})`,
      deadTokens
    ).catch(() => {});
  }
}
