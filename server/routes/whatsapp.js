/**
 * routes/whatsapp.js
 * Panel de administración de la integración WhatsApp.
 * Expone endpoints exclusivos para el rol 'admin' que permiten:
 *   - Consultar el estado de la conexión (desconectado / conectando / QR / conectado).
 *   - Iniciar la sesión escaneando un código QR.
 *   - Cerrar sesión limpiamente.
 *   - Enviar recordatorios de pago manuales a un padre por su nombre de usuario.
 */

import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getWAStatus, connectWhatsApp, disconnectWhatsApp, sendWhatsApp } from '../utils/whatsapp.js';
import pool from '../config/db.js';

const router = Router();

// Solo usuarios autenticados con JWT válido pueden acceder a este módulo.
router.use(authenticateToken);

// Todas las rutas de WhatsApp son exclusivas del rol 'admin' (director/administrador).
// El middleware rechaza con 403 a cualquier otro rol.
router.use(authorizeRoles('admin'));

/**
 * GET /whatsapp/status
 * Devuelve el estado actual de la sesión WhatsApp y el QR en base64 (si aplica).
 * El frontend usa este endpoint para mostrar el panel de conexión y el QR en pantalla.
 *
 * Respuesta: { status: 'disconnected'|'connecting'|'qr'|'connected', qr: string|null }
 */
router.get('/status', (req, res) => {
  // getWAStatus() lee las variables de módulo del util; no hay IO, responde de inmediato.
  res.json(getWAStatus());
});

/**
 * POST /whatsapp/connect
 * Inicia el proceso de conexión a WhatsApp via Baileys.
 * Si ya hay una sesión activa devuelve éxito sin hacer nada para evitar
 * conexiones duplicadas que podrían corromper el estado de la sesión.
 *
 * connectWhatsApp() es asíncrona y tardará varios segundos mientras genera
 * el QR o restablece la sesión persistida en la DB; por eso se llama sin await
 * y la respuesta se envía de inmediato para no bloquear al cliente.
 */
router.post('/connect', async (req, res) => {
  const { status } = getWAStatus();

  // Evitar doble conexión si ya hay una sesión abierta.
  if (status === 'connected') return res.json({ ok: true, message: 'Ya conectado' });

  // Iniciar conexión en segundo plano; los errores se registran en consola.
  connectWhatsApp().catch(err => console.error('WA connect error:', err.message));

  // Responder de inmediato; el frontend consultará /status para seguir el progreso.
  res.json({ ok: true, message: 'Conectando...' });
});

/**
 * POST /whatsapp/disconnect
 * Cierra la sesión de WhatsApp y limpia la autenticación almacenada en la DB.
 * Útil cuando se quiere vincular una cuenta distinta o resolver problemas de sesión.
 * Después de llamar a este endpoint, el próximo /connect mostrará un QR nuevo.
 */
router.post('/disconnect', async (req, res) => {
  // disconnectWhatsApp() hace logout en Baileys y borra la tabla whatsapp_auth.
  await disconnectWhatsApp();
  res.json({ ok: true });
});

/**
 * POST /whatsapp/send-reminder
 * Envía manualmente un recordatorio de pago de mensualidad a un padre específico.
 * Se usa desde el panel admin cuando el administrador quiere avisar a un padre
 * en concreto sin esperar al job automático diario.
 *
 * Body esperado:
 *   - username   {string} — nombre de usuario del padre en la plataforma.
 *   - days_left  {number} — días que faltan para el vencimiento (0 = vence hoy).
 *   - month      {string} — nombre del mes de la mensualidad (ej. "Marzo").
 *   - amount     {number} — monto adeudado en soles.
 *
 * La consulta JOIN obtiene el teléfono del padre y el nombre del alumno asociado
 * para personalizar el mensaje de WhatsApp.
 */
router.post('/send-reminder', async (req, res) => {
  const { username, days_left, month, amount } = req.body;

  // Buscar al padre por username y obtener sus datos junto con los del alumno vinculado.
  // Se filtra por phone IS NOT NULL para no intentar enviar a usuarios sin teléfono.
  const [rows] = await pool.query(
    `SELECT u.phone, u.full_name, s.first_name, s.last_name
     FROM users u
     JOIN parent_student ps ON ps.parent_id = u.id
     JOIN students s ON s.id = ps.student_id
     WHERE u.username = ? AND u.phone IS NOT NULL AND u.phone <> ''`,
    [username]
  );

  // Si no se encontró el usuario o no tiene teléfono registrado, no se puede enviar.
  if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado o sin teléfono' });

  const { phone, first_name, last_name } = rows[0];
  const studentName = `${first_name} ${last_name}`;

  // Convertir days_left a número por si viene como string desde el body JSON.
  const daysNum = Number(days_left);

  // Formatear el monto como "S/ 150.00" o mostrar "pendiente" si no se proporcionó.
  const amountStr = amount ? `S/ ${Number(amount).toFixed(2)}` : 'pendiente';

  // Componer el mensaje según si vence hoy (daysNum === 0) o en días futuros.
  // El formato usa Markdown de WhatsApp: *negrita* y plural dinámico en "día/días".
  const msg = daysNum === 0
    ? `⚠️ *Colegio Emanuel*\n\nLa mensualidad de *${studentName}* (${month || 'este mes'}) vence *HOY*.\n\nMonto: ${amountStr}\n\nPor favor realice el pago a la brevedad.`
    : `🔔 *Colegio Emanuel*\n\nRecordatorio: la mensualidad de *${studentName}* (${month || 'este mes'}) vence en *${daysNum} día${daysNum > 1 ? 's' : ''}*.\n\nMonto: ${amountStr}\n\nEvite inconvenientes pagando a tiempo.`;

  try {
    // Encolar el mensaje en el util de WhatsApp (respeta el intervalo aleatorio de 8–20 s entre mensajes).
    await sendWhatsApp(phone, msg);
    // Devolver el teléfono y el mensaje enviado para que el admin pueda confirmar.
    res.json({ ok: true, phone, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Códigos de desconexión de Baileys/WhatsApp ────────────────────────────────
// Referencia para interpretar el campo disconnect_code del reporte.
const DISCONNECT_MEANING = {
  401: 'loggedOut — sesión cerrada desde el teléfono (o cuenta baneada/removida por WhatsApp)',
  403: 'forbidden — WhatsApp rechazó la conexión (posible restricción/baneo)',
  408: 'timedOut — se perdió la conexión por timeout',
  411: 'multideviceMismatch — versión de protocolo desactualizada',
  428: 'connectionClosed — conexión cerrada por el servidor',
  440: 'connectionReplaced — se abrió otra sesión con el mismo dispositivo',
  500: 'badSession — sesión corrupta',
  515: 'restartRequired — reinicio requerido tras vincular (normal, no es error)',
};

/**
 * GET /whatsapp/report
 * Genera un reporte de diagnóstico a partir de whatsapp_events: cuántos mensajes
 * se enviaron, con qué intervalo real entre ellos, y en qué momento/código se
 * cerró cada sesión — para poder correlacionar volumen/velocidad de envío con
 * los baneos/desconexiones y ajustar la estrategia de envío.
 */
router.get('/report', async (req, res) => {
  try {
    const { rows } = await pool._pool.query(
      'SELECT id, ts, event, detail FROM whatsapp_events ORDER BY ts ASC'
    );

    const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

    // Agrupa los eventos en "sesiones": desde que se conecta hasta que se desconecta,
    // acumulando cuántos mensajes se enviaron/fallaron y con qué intervalos en esa sesión.
    const sessions = [];
    let current = null;
    const allDelays = [];
    let totalOk = 0;
    let totalFail = 0;

    for (const row of rows) {
      const detail = row.detail || {};
      if (row.event === 'connected') {
        current = { opened_at: row.ts, closed_at: null, disconnect_code: null, logged_out: null, messages_sent: 0, messages_failed: 0, delays: [] };
        sessions.push(current);
      } else if (row.event === 'send_ok') {
        totalOk++;
        if (current) current.messages_sent++;
        if (detail.delay_ms != null) {
          allDelays.push(detail.delay_ms);
          if (current) current.delays.push(detail.delay_ms);
        }
      } else if (row.event === 'send_fail') {
        totalFail++;
        if (current) current.messages_failed++;
      } else if (row.event === 'disconnected') {
        if (!current) {
          current = { opened_at: null, closed_at: null, disconnect_code: null, logged_out: null, messages_sent: 0, messages_failed: 0, delays: [] };
          sessions.push(current);
        }
        current.closed_at = row.ts;
        current.disconnect_code = detail.code ?? null;
        current.logged_out = detail.logged_out ?? null;
        current = null; // cierra la sesión: los próximos send_ok/fail no cuentan hasta el siguiente 'connected'
      }
    }

    const sessionsSummary = sessions.map((s, i) => ({
      session: i + 1,
      opened_at: s.opened_at,
      closed_at: s.closed_at,
      duration_min: s.opened_at && s.closed_at ? Math.round((new Date(s.closed_at) - new Date(s.opened_at)) / 60000) : null,
      disconnect_code: s.disconnect_code,
      disconnect_meaning: s.disconnect_code ? (DISCONNECT_MEANING[s.disconnect_code] || 'código desconocido') : null,
      logged_out: s.logged_out,
      messages_sent: s.messages_sent,
      messages_failed: s.messages_failed,
      avg_delay_ms: avg(s.delays),
      min_delay_ms: s.delays.length ? Math.min(...s.delays) : null,
      max_delay_ms: s.delays.length ? Math.max(...s.delays) : null,
    }));

    const report = {
      generated_at: new Date().toISOString(),
      note: 'Reporte de diagnostico de envios WhatsApp. "session" = periodo entre conectar y desconectar. Revisar messages_sent y avg_delay_ms de la sesion previa a cada disconnect_code para correlacionar con baneos.',
      summary: {
        total_events_logged: rows.length,
        total_messages_sent: totalOk,
        total_messages_failed: totalFail,
        avg_delay_ms_overall: avg(allDelays),
        min_delay_ms_overall: allDelays.length ? Math.min(...allDelays) : null,
        max_delay_ms_overall: allDelays.length ? Math.max(...allDelays) : null,
        total_sessions: sessions.length,
      },
      sessions: sessionsSummary,
      raw_events: rows.map((r) => ({ ts: r.ts, event: r.event, detail: r.detail })),
    };

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
