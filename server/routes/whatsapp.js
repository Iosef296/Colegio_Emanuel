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
    // Encolar el mensaje en el util de WhatsApp (respeta el intervalo de 3 s entre mensajes).
    await sendWhatsApp(phone, msg);
    // Devolver el teléfono y el mensaje enviado para que el admin pueda confirmar.
    res.json({ ok: true, phone, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
