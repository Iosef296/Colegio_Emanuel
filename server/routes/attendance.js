// ============================================================
// Rutas de Asistencia — /api/attendance
// Gestiona el registro, consulta y eliminación de asistencia
// diaria. Cada registro tiene: alumno, fecha, estado
// (temprano/tarde/falta), turno (mañana/tarde) y tipo
// (entrada/salida). Al registrar se envían notificaciones push
// (FCM), web-push (VAPID) y WhatsApp al apoderado.
// ============================================================

import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { broadcast } from '../utils/sse.js';
import { getParentIdsForStudent, getTokensForUsers, sendToTokens } from '../utils/fcm.js';
import { getWebSubscriptionsForUsers, sendWebPush } from '../utils/webpush.js';
import { sendWhatsApp } from '../utils/whatsapp.js';

// Router principal; todas las rutas heredan el middleware de autenticación.
const router = Router();
router.use(authenticateToken);

// ------------------------------------------------------------
// getStudentName(studentId)
// Consulta el nombre completo del alumno dado su ID.
// Si el alumno no existe (fue eliminado) devuelve 'Tu hijo'
// como texto seguro para incluir en notificaciones.
// ------------------------------------------------------------
async function getStudentName(studentId) {
  const [rows] = await pool.query('SELECT first_name, last_name FROM students WHERE id=?', [studentId]);
  if (!rows.length) return 'Tu hijo';
  return `${rows[0].first_name} ${rows[0].last_name}`;
}

// ------------------------------------------------------------
// peruTime()
// Devuelve la hora actual en zona horaria de Lima (UTC-5)
// formateada como HH:MM. Se usa en el cuerpo de las
// notificaciones para indicar la hora exacta de llegada/salida.
// Se convierte mediante toLocaleString para respetar el horario
// de verano de Perú sin depender de librerías externas.
// ------------------------------------------------------------
function peruTime() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ------------------------------------------------------------
// buildNotification(name, status, tipo)
// Construye el objeto { title, body } de la notificación push
// según el tipo de registro (entrada o salida) y el estado:
//   - salida: siempre informa la hora de salida.
//   - entrada temprano: llegó puntual, indica hora.
//   - entrada tarde: llegó tarde, indica hora.
//   - falta: informa la inasistencia sin hora.
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// GET /api/attendance
// Devuelve registros de asistencia filtrados por rol y por los
// parámetros opcionales de query string:
//   student_id, date, turno, month+year
// Control de acceso:
//   - padre   → solo los hijos vinculados en parent_student.
//   - docente → alumnos de los grados donde dicta cursos.
//   - admin/auxiliar → todos los registros.
// Los resultados se ordenan del más reciente al más antiguo.
// ------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { student_id, month, year, date, turno } = req.query;

    // Consulta base con JOIN a students para incluir nombre del alumno.
    // COALESCE garantiza compatibilidad con registros antiguos sin campo tipo.
    let query = `SELECT a.id, a.student_id, a.date, a.status, a.turno, COALESCE(a.tipo,'entrada') as tipo,
      a.updated_at, s.first_name, s.last_name
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      WHERE 1=1`;
    const params = [];

    // Filtro por rol: limitar el acceso según el usuario autenticado.
    if (req.user.role === 'padre') {
      // El padre solo ve la asistencia de sus hijos registrados en parent_student.
      query += ` AND a.student_id IN (SELECT student_id FROM parent_student WHERE parent_id=?)`;
      params.push(req.user.id);
    } else if (req.user.role === 'docente') {
      // El docente ve la asistencia de los grados que le fueron asignados.
      query += ` AND s.grade_level_id IN (SELECT DISTINCT grade_level_id FROM teacher_courses WHERE teacher_id=?)`;
      params.push(req.user.id);
    }

    // Filtros opcionales de query string añadidos dinámicamente.
    if (student_id) { query += ` AND a.student_id=?`; params.push(student_id); }
    if (date) { query += ` AND a.date=?`; params.push(date); }
    if (turno) { query += ` AND a.turno=?`; params.push(turno); }

    // Filtrar por rango de fecha (permite usar el índice idx_attendance_date)
    if (month && year) {
      const from = `${year}-${String(month).padStart(2,'0')}-01`;
      const to   = `${month == 12 ? Number(year)+1 : year}-${String(month==12?1:Number(month)+1).padStart(2,'0')}-01`;
      query += ` AND a.date >= ? AND a.date < ?`;
      params.push(from, to);
    }

    query += ' ORDER BY a.date DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// POST /api/attendance
// Registra o actualiza la asistencia de un alumno para una
// fecha, turno y tipo específicos. Acceso: docente, admin, auxiliar.
//
// Usa INSERT … ON CONFLICT DO UPDATE (upsert) para que llamar
// dos veces con los mismos datos solo actualice el status, sin
// lanzar error ni duplicar filas. La restricción única en la
// tabla es (student_id, date, turno, tipo).
//
// Tras responder al cliente (201), se envían notificaciones
// de forma asíncrona (no bloquean la respuesta):
//   1. FCM (Firebase) si la variable FIREBASE_SERVICE_ACCOUNT existe.
//   2. Web Push (VAPID) si la variable VAPID_PRIVATE_KEY existe.
//   3. WhatsApp si el apoderado tiene celular registrado.
//
// EXCEPCIÓN: no se envía notificación si es una 'falta' de salida
// (no tiene sentido notificar que alguien "no salió").
// ------------------------------------------------------------
router.post('/', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    const { student_id, date, status, turno = 'mañana', tipo = 'entrada' } = req.body;

    // Upsert: si ya existe el registro para esa combinación única,
    // actualiza el estado y la marca de tiempo; de lo contrario inserta.
    await pool.query(
      `INSERT INTO attendance (student_id, date, status, turno, tipo)
       VALUES (?,?,?,?,?) ON CONFLICT (student_id, date, turno, tipo) DO UPDATE SET status=EXCLUDED.status, updated_at=NOW()`,
      [student_id, date, status, turno, tipo]
    );

    // Notificar a clientes SSE que los datos cambiaron.
    broadcast();

    // Responder antes de lanzar las notificaciones push para no hacer
    // esperar al cliente (docente/auxiliar) mientras se procesan.
    res.status(201).json({ message: 'Asistencia registrada' });

    // Datos adicionales que viajan en el payload de la notificación push
    // para que la app pueda actualizar la UI sin necesidad de refrescar.
    const notifData = { type: 'attendance', tab: 'avisos', student_id: String(student_id) };

    // No enviar notificación cuando se registra "falta de salida" porque
    // no tiene sentido alertar que el alumno no marcó salida.
    if (status === 'falta' && tipo === 'salida') return;

    // Obtener nombre del alumno y disparar notificaciones en paralelo.
    getStudentName(student_id).then(name => {
      const notification = buildNotification(name, status, tipo);

      // Envío FCM (notificación nativa en Android/iOS via Firebase).
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        getParentIdsForStudent(student_id)
          .then(ids => getTokensForUsers(ids))
          .then(tokens => sendToTokens(tokens, notification, notifData))
          .catch(err => console.error('Push attendance FCM:', err.message));
      }

      // Envío Web Push (navegadores de escritorio y PWA via VAPID).
      if (process.env.VAPID_PRIVATE_KEY) {
        getParentIdsForStudent(student_id)
          .then(ids => getWebSubscriptionsForUsers(ids))
          .then(subs => sendWebPush(subs, notification, notifData))
          .catch(err => console.error('Push attendance web:', err.message));
      }

      // WhatsApp
      // Consultar el teléfono del apoderado directamente con $N (sin capa
      // de conversión) y enviar el mensaje via WhatsApp si existe el número.
      pool._pool.query(
        `SELECT u.phone FROM users u
         JOIN parent_student ps ON ps.parent_id = u.id
         WHERE ps.student_id = $1 AND u.phone IS NOT NULL AND u.phone <> ''`,
        [student_id]
      ).then(r => r.rows.forEach(row =>
        sendWhatsApp(row.phone, notification.body).catch(e => console.error('WA attendance:', e.message))
      )).catch(() => {});
    }).catch(err => console.error('Push attendance name:', err.message));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// POST /api/attendance/bulk
// Registra la asistencia de múltiples alumnos en una sola
// llamada. Usado por el docente/auxiliar para pasar lista de
// todo el salón a la vez. Acceso: docente, admin, auxiliar.
//
// Recibe un array `records` con objetos { student_id, date,
// status, turno?, tipo? }. Construye un INSERT multi-fila con
// placeholders $N directamente (sin la capa de conversión de ?)
// porque la lógica dinámica de offsets por fila lo requiere.
//
// Tras responder, envía notificaciones FCM y web-push por cada
// alumno de forma asíncrona con Promise.all.
// ------------------------------------------------------------
router.post('/bulk', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    const { records } = req.body; // [{student_id, date, status, turno?}]
    if (!records || !records.length) return res.status(400).json({ error: 'Sin registros' });

    // Construir el INSERT multi-fila con placeholders posicionales ($1,$2,…).
    // Cada fila ocupa 5 parámetros; el offset garantiza que los índices no se repitan.
    const params = [];
    const valueClauses = records.map((r, i) => {
      const offset = i * 5;
      params.push(r.student_id, r.date, r.status, r.turno || 'mañana', r.tipo || 'entrada');
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    });

    // Upsert masivo: en caso de conflicto de clave única, actualiza el estado.
    await pool._pool.query(
      `INSERT INTO attendance (student_id, date, status, turno, tipo)
       VALUES ${valueClauses.join(', ')} ON CONFLICT (student_id, date, turno, tipo) DO UPDATE SET status=EXCLUDED.status`,
      params
    );

    // Notificar a clientes SSE del cambio masivo.
    broadcast();
    res.status(201).json({ message: `${records.length} registros guardados` });

    // Enviar notificaciones push de forma asíncrona para cada alumno.
    // Se usa Promise.all para paralelizar los envíos sin bloquear la respuesta.
    Promise.all(records.map(async r => {
      const name = await getStudentName(r.student_id);
      const notification = buildNotification(name, r.status);
      const notifData = { type: 'attendance', tab: 'avisos', student_id: String(r.student_id) };

      // Notificación FCM (app nativa) si Firebase está configurado.
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        getParentIdsForStudent(r.student_id)
          .then(ids => getTokensForUsers(ids))
          .then(tokens => sendToTokens(tokens, notification, notifData))
          .catch(err => console.error('Push bulk FCM:', err.message));
      }

      // Notificación web-push (PWA/navegador) si VAPID está configurado.
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

// ------------------------------------------------------------
// DELETE /api/attendance
// Elimina uno o varios registros de asistencia identificados
// por student_id y date (obligatorios). Los parámetros turno
// y tipo son opcionales: si se omiten, se borran todos los
// registros de ese alumno en esa fecha (ambos turnos/tipos).
// Acceso: docente, admin, auxiliar.
//
// Se usa pool._pool.query con $N directamente porque los
// parámetros se construyen de forma dinámica y esta ruta
// requiere devolver el rowCount (filas afectadas).
// ------------------------------------------------------------
router.delete('/', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    const { student_id, date, turno, tipo } = req.query;

    // Validar que los parámetros mínimos están presentes.
    if (!student_id || !date) return res.status(400).json({ error: 'student_id y date requeridos' });

    // Construir el WHERE dinámico: los filtros opcionales se agregan solo si llegan.
    const params = [student_id, date];
    let sql = 'DELETE FROM attendance WHERE student_id=$1 AND date=$2';
    if (turno) { params.push(turno); sql += ` AND turno=$${params.length}`; }
    if (tipo)  { params.push(tipo);  sql += ` AND tipo=$${params.length}`; }

    const result = await pool._pool.query(sql, params);

    // Notificar a clientes SSE del cambio.
    broadcast();

    // Devolver cuántas filas fueron eliminadas para confirmación en el cliente.
    res.json({ deleted: result.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
