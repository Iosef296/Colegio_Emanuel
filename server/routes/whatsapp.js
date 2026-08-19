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

const fmtDate = (ts) => ts ? new Date(ts).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtSec = (ms) => ms == null ? '—' : (ms / 1000).toFixed(1) + 's';
const fmtDur = (min) => {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

/**
 * veredicto(session) — heurística simple en texto plano para que alguien sin
 * conocimiento de la API de WhatsApp entienda qué probablemente pasó en esa sesión.
 * No es 100% certero (WhatsApp no explica sus baneos) pero da una pista accionable.
 */
function veredicto(s) {
  if (s.disconnect_code == null) return 'Sesión sigue activa (o el servidor se reinició sin registrar el cierre).';
  const risky = s.avg_delay_ms != null && s.avg_delay_ms < 4000;
  const highVolume = s.messages_sent > 150;
  if (s.disconnect_code === 403) {
    return `ALERTA: WhatsApp rechazó la conexión (403). Señal fuerte de restricción/baneo.${risky ? ' El intervalo promedio (' + fmtSec(s.avg_delay_ms) + ') estuvo por debajo de lo recomendado (5-10s) — probable causa.' : ''}${highVolume ? ' Además se enviaron ' + s.messages_sent + ' mensajes en esta sesión, volumen alto.' : ''}`;
  }
  if (s.disconnect_code === 401) {
    if (risky || highVolume) {
      return `SOSPECHOSO: sesión cerrada (401 loggedOut). Puede ser baneo o cierre manual desde el teléfono — no se puede distinguir con certeza.${risky ? ' Intervalo promedio de ' + fmtSec(s.avg_delay_ms) + ' es más rápido de lo recomendado.' : ''}${highVolume ? ' Volumen alto: ' + s.messages_sent + ' mensajes en la sesión.' : ''}`;
    }
    return 'Probable cierre manual (401 loggedOut) con volumen e intervalo normales — no parece baneo por spam.';
  }
  if (s.disconnect_code === 515) return 'Normal: reinicio requerido tras vincular el QR, no es un baneo.';
  if (s.disconnect_code === 440) return 'Normal: se vinculó el mismo número en otro dispositivo (no es baneo).';
  return `Corte de conexión con código ${s.disconnect_code} (${DISCONNECT_MEANING[s.disconnect_code] || 'código desconocido'}). No parece indicar baneo por sí solo.`;
}

/**
 * GET /whatsapp/report
 * Genera un reporte de diagnóstico en texto plano (no JSON crudo) a partir de
 * whatsapp_events: cuántos mensajes se enviaron, con qué intervalo real entre
 * ellos, y en qué momento/código se cerró cada sesión — con explicación en
 * español simple de cada término, para poder leerlo sin conocer la API de
 * WhatsApp ni el formato interno de los logs.
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
      messages_sent: s.messages_sent,
      messages_failed: s.messages_failed,
      avg_delay_ms: avg(s.delays),
      min_delay_ms: s.delays.length ? Math.min(...s.delays) : null,
      max_delay_ms: s.delays.length ? Math.max(...s.delays) : null,
    }));

    // ── Construcción del texto legible ──────────────────────────────────────
    const L = [];
    L.push('REPORTE DE DIAGNOSTICO — WHATSAPP (Colegio Emanuel)');
    L.push(`Generado: ${fmtDate(new Date())}`);
    L.push('');
    L.push('='.repeat(70));
    L.push('GLOSARIO (para leer este reporte sin conocer la API de WhatsApp)');
    L.push('='.repeat(70));
    L.push('- "Sesion": periodo entre que el servidor se conecta a WhatsApp (se');
    L.push('  escanea el QR) y el momento en que se desconecta. Cada corte abre');
    L.push('  una sesion nueva al reconectar.');
    L.push('- "Intervalo entre mensajes": tiempo real que paso entre el envio de');
    L.push('  un mensaje y el anterior. El sistema intenta esperar 5-10 segundos');
    L.push('  entre cada uno para simular un humano y no parecer spam.');
    L.push('- "Codigo de desconexion": codigo que WhatsApp manda al cortar la');
    L.push('  conexion. Los mas relevantes:');
    L.push('    401 (loggedOut)  = sesion cerrada; puede ser manual o baneo.');
    L.push('    403 (forbidden)  = WhatsApp rechazo la conexion; señal fuerte de baneo.');
    L.push('    515 (restartRequired) = normal, ocurre justo despues de vincular el QR.');
    L.push('    440 (connectionReplaced) = se vinculo el mismo numero en otro dispositivo.');
    L.push('');
    L.push('='.repeat(70));
    L.push('RESUMEN GENERAL');
    L.push('='.repeat(70));
    L.push(`- Mensajes enviados con exito: ${totalOk}`);
    L.push(`- Mensajes que fallaron al enviar: ${totalFail}`);
    L.push(`- Intervalo promedio entre mensajes: ${fmtSec(avg(allDelays))} (recomendado: 5.0s-10.0s)`);
    L.push(`- Intervalo minimo registrado: ${fmtSec(allDelays.length ? Math.min(...allDelays) : null)}`);
    L.push(`- Sesiones de conexion registradas: ${sessions.length}`);
    L.push('');
    L.push('='.repeat(70));
    L.push('DETALLE POR SESION (de la mas antigua a la mas reciente)');
    L.push('='.repeat(70));
    if (sessionsSummary.length === 0) {
      L.push('(Todavia no hay datos suficientes. Este reporte se llena a medida que');
      L.push(' el sistema envia mensajes y se conecta/desconecta de WhatsApp.)');
    }
    for (const s of sessionsSummary) {
      L.push('');
      L.push(`Sesion ${s.session}`);
      L.push(`  Conectado:     ${fmtDate(s.opened_at)}`);
      L.push(`  Desconectado:  ${fmtDate(s.closed_at)}  (duro ${fmtDur(s.duration_min)})`);
      L.push(`  Mensajes enviados: ${s.messages_sent}  |  fallidos: ${s.messages_failed}`);
      L.push(`  Intervalo promedio: ${fmtSec(s.avg_delay_ms)}  (min ${fmtSec(s.min_delay_ms)}, max ${fmtSec(s.max_delay_ms)})`);
      L.push(`  Motivo de corte: ${s.disconnect_code == null ? 'sigue conectada' : `codigo ${s.disconnect_code} — ${DISCONNECT_MEANING[s.disconnect_code] || 'desconocido'}`}`);
      L.push(`  Veredicto: ${veredicto(s)}`);
    }
    L.push('');
    L.push('='.repeat(70));
    L.push('COMO USAR ESTE REPORTE');
    L.push('='.repeat(70));
    L.push('Buscar sesiones marcadas "ALERTA" o "SOSPECHOSO": ahi es donde el');
    L.push('intervalo entre mensajes fue muy rapido o el volumen fue muy alto justo');
    L.push('antes del corte. Si varias sesiones seguidas terminan asi, conviene');
    L.push('aumentar el intervalo entre mensajes o repartir los envios masivos en');
    L.push('mas tiempo (por ejemplo, no mandar todos los recordatorios de pago el');
    L.push('mismo minuto).');

    res.type('text/plain; charset=utf-8').send(L.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
