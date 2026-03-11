import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { broadcast } from '../utils/sse.js';
import { getParentIdsForStudent, getTokensForUsers, sendToTokens } from '../utils/fcm.js';
import { getWebSubscriptionsForUsers, sendWebPush } from '../utils/webpush.js';

const router = Router();
router.use(authenticateToken);

async function getStudentName(studentId) {
  const [rows] = await pool.query('SELECT first_name, last_name FROM students WHERE id=?', [studentId]);
  if (!rows.length) return 'Tu hijo';
  return `${rows[0].first_name} ${rows[0].last_name}`;
}

function peruTime() {
  return new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });
}

function buildNotification(name, status, tipo) {
  const hora = peruTime();
  if (tipo === 'salida') {
    return { title: 'SALIDA REGISTRADA', body: `${name} salió a las ${hora}` };
  }
  const body = status === 'temprano'
    ? `${name} llegó a las ${hora}`
    : status === 'tarde'
    ? `${name} llegó tarde a las ${hora}`
    : `${name} faltó hoy`;
  return { title: 'ASISTENCIA REGISTRADA', body };
}

router.get('/', async (req, res) => {
  try {
    const { student_id, month, year, date, turno } = req.query;
    let query = `SELECT a.id, a.student_id, a.date, a.status, a.turno, COALESCE(a.tipo,'entrada') as tipo,
      s.first_name, s.last_name
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      WHERE 1=1`;
    const params = [];

    if (req.user.role === 'padre') {
      query += ` AND a.student_id IN (SELECT student_id FROM parent_student WHERE parent_id=?)`;
      params.push(req.user.id);
    } else if (req.user.role === 'docente') {
      query += ` AND s.grade_level_id IN (SELECT DISTINCT grade_level_id FROM teacher_courses WHERE teacher_id=?)`;
      params.push(req.user.id);
    }

    if (student_id) { query += ` AND a.student_id=?`; params.push(student_id); }
    if (date) { query += ` AND a.date=?`; params.push(date); }
    if (turno) { query += ` AND a.turno=?`; params.push(turno); }
    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM a.date)=? AND EXTRACT(YEAR FROM a.date)=?`;
      params.push(month, year);
    }

    query += ' ORDER BY a.date DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    const { student_id, date, status, turno = 'mañana', tipo = 'entrada' } = req.body;
    await pool.query(
      `INSERT INTO attendance (student_id, date, status, turno, tipo)
       VALUES (?,?,?,?,?) ON CONFLICT (student_id, date, turno, tipo) DO UPDATE SET status=EXCLUDED.status`,
      [student_id, date, status, turno, tipo]
    );
    broadcast();
    res.status(201).json({ message: 'Asistencia registrada' });
    const notifData = { type: 'attendance', student_id: String(student_id) };
    if (status === 'falta' && tipo === 'salida') return;
    getStudentName(student_id).then(name => {
      const notification = buildNotification(name, status, tipo);
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        getParentIdsForStudent(student_id)
          .then(ids => getTokensForUsers(ids))
          .then(tokens => sendToTokens(tokens, notification, notifData))
          .catch(err => console.error('Push attendance FCM:', err.message));
      }
      if (process.env.VAPID_PRIVATE_KEY) {
        getParentIdsForStudent(student_id)
          .then(ids => getWebSubscriptionsForUsers(ids))
          .then(subs => sendWebPush(subs, notification, notifData))
          .catch(err => console.error('Push attendance web:', err.message));
      }
    }).catch(err => console.error('Push attendance name:', err.message));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/bulk', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    const { records } = req.body; // [{student_id, date, status, turno?}]
    if (!records || !records.length) return res.status(400).json({ error: 'Sin registros' });

    const params = [];
    const valueClauses = records.map((r, i) => {
      const offset = i * 5;
      params.push(r.student_id, r.date, r.status, r.turno || 'mañana', r.tipo || 'entrada');
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    });
    await pool._pool.query(
      `INSERT INTO attendance (student_id, date, status, turno, tipo)
       VALUES ${valueClauses.join(', ')} ON CONFLICT (student_id, date, turno, tipo) DO UPDATE SET status=EXCLUDED.status`,
      params
    );
    broadcast();
    res.status(201).json({ message: `${records.length} registros guardados` });
    Promise.all(records.map(async r => {
      const name = await getStudentName(r.student_id);
      const notification = buildNotification(name, r.status);
      const notifData = { type: 'attendance', student_id: String(r.student_id) };
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        getParentIdsForStudent(r.student_id)
          .then(ids => getTokensForUsers(ids))
          .then(tokens => sendToTokens(tokens, notification, notifData))
          .catch(err => console.error('Push bulk FCM:', err.message));
      }
      if (process.env.VAPID_PRIVATE_KEY) {
        getParentIdsForStudent(r.student_id)
          .then(ids => getWebSubscriptionsForUsers(ids))
          .then(subs => sendWebPush(subs, notification, notifData))
          .catch(err => console.error('Push bulk web:', err.message));
      }
    })).catch(err => console.error('Push bulk:', err.message));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
