/**
 * utils/paymentReminder.js
 * Job automático que envía recordatorios de pago de mensualidades via WhatsApp.
 * Se ejecuta diariamente a las 8:00 AM hora de Lima (America/Lima, UTC-5).
 *
 * Lógica de negocio:
 *   - La fecha de vencimiento de cada mensualidad es el día 25 del mes ANTERIOR
 *     al mes de la mensualidad (ej. la mensualidad de Abril vence el 25 de Marzo).
 *   - Se envía recordatorio entre 5 días antes del vencimiento y el día de vencimiento.
 *   - Los pagos ya efectuados (paid = true) o sin teléfono registrado son ignorados.
 */

import pool from '../config/db.js';
import { sendWhatsApp } from './whatsapp.js';

// Meses del año en español, usados para convertir el nombre del mes
// almacenado en la DB a un índice numérico (0 = Enero, 11 = Diciembre).
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/**
 * getDueDate(month, year)
 * Calcula la fecha de vencimiento de una mensualidad escolar.
 * Por política del colegio, el vencimiento es el día 25 del mes previo al mes
 * de la mensualidad (ej. Marzo vence el 25 de Febrero del mismo año;
 * Enero vence el 25 de Diciembre del año anterior).
 *
 * @param {string} month — Nombre del mes en español (ej. "Marzo").
 * @param {number} year  — Año de la mensualidad.
 * @returns {Date|null}  — Fecha de vencimiento, o null si el mes es inválido.
 */
function getDueDate(month, year) {
  const idx = MONTHS.indexOf(month);
  // Si el nombre de mes no coincide con ninguno del array, no se puede calcular la fecha.
  if (idx < 0) return null;

  // Mes previo: si la mensualidad es de Enero (idx=0) el mes anterior es Diciembre (11)
  // del año pasado; para el resto se resta 1 al índice.
  const dueMonth = idx === 0 ? 11 : idx - 1;
  const dueYear  = idx === 0 ? year - 1 : year;

  // new Date(año, mes, día) usa índice 0-11 para los meses, igual que el array MONTHS.
  return new Date(dueYear, dueMonth, 25);
}

/**
 * limaToday()
 * Devuelve la fecha actual en la zona horaria de Lima (America/Lima, UTC-5)
 * con la hora normalizada a medianoche (00:00:00.000) para comparaciones de días.
 * Se usa toLocaleString con la zona horaria de Lima para obtener la hora local
 * correcta incluso cuando el servidor corre en UTC (Fly.io São Paulo).
 *
 * @returns {Date} — Fecha de hoy en Lima, hora 00:00:00.
 */
function limaToday() {
  // Convertir la fecha UTC del servidor a la representación local de Lima.
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  // Eliminar la parte horaria para que las diferencias de días sean exactas.
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * sendPaymentReminders()
 * Función principal del job: consulta todos los pagos pendientes con teléfono
 * disponible, calcula cuántos días faltan para el vencimiento de cada uno
 * y envía un mensaje de WhatsApp si el vencimiento está entre 0 y 5 días.
 *
 * El mensaje varía según si vence hoy (urgente ⚠️) o en días futuros (recordatorio 🔔).
 * Los errores por alumno se capturan individualmente para no interrumpir el resto.
 */
export async function sendPaymentReminders() {
  try {
    const today = limaToday();

    // Obtener todos los pagos pendientes (paid = false) junto con los datos del alumno
    // y del padre (solo los que tienen teléfono registrado para poder enviar WA).
    const [payments] = await pool.query(`
      SELECT p.month, p.year, p.amount,
             s.first_name, s.last_name,
             u.phone, u.full_name as parent_name
      FROM payments p
      JOIN students s ON p.student_id = s.id
      JOIN parent_student ps ON ps.student_id = s.id
      JOIN users u ON u.id = ps.parent_id
      WHERE p.paid = false
        AND u.phone IS NOT NULL
        AND u.phone <> ''
    `);

    let sent = 0; // Contador de mensajes enviados exitosamente en esta ejecución.

    for (const p of payments) {
      // Calcular la fecha de vencimiento del pago actual.
      const due = getDueDate(p.month, Number(p.year));
      if (!due) continue; // Saltar si el mes en la DB es inválido o no reconocido.

      // Diferencia en días entre el vencimiento y hoy.
      // 86400000 ms = 1 día; Math.round maneja pequeñas diferencias por cambio de horario.
      const diffDays = Math.round((due - today) / 86400000);

      // Solo enviar recordatorio si el vencimiento es hoy o en los próximos 5 días.
      // Si ya venció (diffDays < 0) o vence en más de 5 días, no molestar al padre.
      if (diffDays < 0 || diffDays > 5) continue;

      const studentName = `${p.first_name} ${p.last_name}`;

      // Formatear la fecha de vencimiento en español peruano (ej. "25 de febrero de 2026").
      const dueStr = due.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });

      // Mostrar el monto formateado o "pendiente" si no está definido en la DB.
      const amount = p.amount ? `S/ ${Number(p.amount).toFixed(2)}` : 'pendiente';

      // Componer el mensaje apropiado según la urgencia:
      //   - diffDays === 0 → Vence HOY: mensaje de urgencia con ⚠️.
      //   - diffDays > 0  → Faltan N días: recordatorio con 🔔 y fecha exacta.
      const msg = diffDays === 0
        ? `⚠️ *Colegio Emanuel*\n\nLa mensualidad de *${studentName}* (${p.month}) vence *HOY*.\n\nMonto: ${amount}\n\nPor favor realice el pago a la brevedad.`
        : `🔔 *Colegio Emanuel*\n\nRecordatorio: la mensualidad de *${studentName}* (${p.month}) vence el *${dueStr}*, en *${diffDays} día${diffDays > 1 ? 's' : ''}*.\n\nMonto: ${amount}\n\nEvite inconvenientes pagando a tiempo.`;

      // Enviar el mensaje por WhatsApp; los errores individuales se registran sin detener el loop.
      await sendWhatsApp(p.phone, msg).catch(err =>
        console.error(`Reminder WA error (${p.phone}):`, err.message)
      );
      sent++;
    }

    // Registrar en consola cuántos recordatorios se enviaron (solo si fue al menos uno).
    if (sent > 0) console.log(`Payment reminders: ${sent} enviados`);
  } catch (err) {
    console.error('Payment reminder error:', err.message);
  }
}

/**
 * startPaymentReminderJob()
 * Registra el job recurrente que ejecuta sendPaymentReminders() todos los días
 * a las 8:00 AM hora de Lima.
 *
 * No usa cron para evitar dependencias adicionales; en su lugar implementa
 * un setTimeout auto-renovable (scheduleNext se llama a sí misma tras cada ejecución).
 * Esto garantiza que el job siempre se dispare a las 8:00 AM incluso si el servidor
 * estuvo caído parte de la noche, ya que recalcula el delay en cada ciclo.
 */
export function startPaymentReminderJob() {
  /**
   * scheduleNext()
   * Calcula los milisegundos hasta el próximo disparo (8:00 AM Lima) y programa
   * un setTimeout. Si las 8:00 AM de hoy ya pasó, apunta al día siguiente.
   */
  function scheduleNext() {
    // Obtener la hora actual en Lima para calcular cuánto falta para las 8:00 AM.
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const next = new Date(now);

    // Fijar la próxima ejecución a las 8:00:00.000 del día actual en Lima.
    next.setHours(8, 0, 0, 0);

    // Si ya pasaron las 8:00 AM de hoy, programar para las 8:00 AM de mañana.
    if (next <= now) next.setDate(next.getDate() + 1);

    // Milisegundos de espera hasta el próximo disparo.
    const ms = next - now;
    console.log(`Payment reminder: próximo envío en ${Math.round(ms / 60000)} min`);

    setTimeout(async () => {
      // Ejecutar los recordatorios y luego volver a programar el siguiente disparo.
      await sendPaymentReminders();
      scheduleNext(); // Auto-renovar el job para el siguiente día.
    }, ms);
  }

  // Arrancar el ciclo de programación al inicializar el servidor.
  scheduleNext();
}
