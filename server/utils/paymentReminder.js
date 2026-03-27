/**
 * utils/paymentReminder.js
 * Job automático que envía recordatorios de pago de mensualidades via WhatsApp.
 * Se ejecuta diariamente a las 2:00 PM hora de Lima (America/Lima, UTC-5).
 *
 * Lógica de negocio:
 *   - La fecha de vencimiento de cada mensualidad es el día 25 del mes ANTERIOR
 *     al mes de la mensualidad (ej. la mensualidad de Abril vence el 25 de Marzo).
 *   - Se envía recordatorio entre 5 días antes del vencimiento y el día de vencimiento.
 *   - Los pagos ya efectuados (paid = true) o sin teléfono registrado son ignorados.
 *   - Los mensajes se distribuyen uniformemente entre las 2:00 PM y las 6:30 PM
 *     con jitter aleatorio para evitar patrones robóticos y riesgo de baneo.
 */

import pool from '../config/db.js';
import { sendWhatsApp } from './whatsapp.js';

// Meses del año en español, usados para convertir el nombre del mes
// almacenado en la DB a un índice numérico (0 = Enero, 11 = Diciembre).
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Ventana de envío: 4.5 horas (14:00–18:30 Lima) en milisegundos.
const SEND_WINDOW_MS = 4.5 * 60 * 60 * 1000;

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
 * disponible, filtra los que vencen en los próximos 5 días y programa cada
 * mensaje en un momento distinto dentro de la ventana 14:00–18:30 Lima.
 *
 * La distribución gradual evita ráfagas que puedan activar el sistema
 * anti-spam de WhatsApp. Cada mensaje lleva además un jitter de ±2 minutos
 * para que los intervalos no sean exactamente uniformes.
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

    // Filtrar y preparar solo los pagos que necesitan recordatorio hoy.
    const toSend = [];

    for (const p of payments) {
      const due = getDueDate(p.month, Number(p.year));
      if (!due) continue;

      // Diferencia en días entre el vencimiento y hoy.
      const diffDays = Math.round((due - today) / 86400000);

      // Solo recordar si el vencimiento es hoy o en los próximos 5 días.
      if (diffDays < 0 || diffDays > 5) continue;

      const studentName = `${p.first_name} ${p.last_name}`;
      const dueStr = due.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
      const amount = p.amount ? `S/ ${Number(p.amount).toFixed(2)}` : 'pendiente';

      const msg = diffDays === 0
        ? `⚠️ *Colegio Emanuel*\n\nLa mensualidad de *${studentName}* (${p.month}) vence *HOY*.\n\nMonto: ${amount}\n\nPor favor realice el pago a la brevedad.`
        : `🔔 *Colegio Emanuel*\n\nRecordatorio: la mensualidad de *${studentName}* (${p.month}) vence el *${dueStr}*, en *${diffDays} día${diffDays > 1 ? 's' : ''}*.\n\nMonto: ${amount}\n\nEvite inconvenientes pagando a tiempo.`;

      toSend.push({ phone: p.phone, msg });
    }

    if (toSend.length === 0) {
      console.log('Payment reminders: sin pagos pendientes hoy');
      return;
    }

    // Distribuir los mensajes uniformemente dentro de la ventana de 4.5 horas.
    // Con N destinatarios: el primero sale al inicio, el último al final de la ventana.
    // Cada uno lleva un jitter de ±2 minutos para que no sean intervalos exactos.
    const spacing = toSend.length > 1 ? SEND_WINDOW_MS / (toSend.length - 1) : 0;
    const JITTER_MS = 2 * 60 * 1000; // ±2 minutos

    toSend.forEach(({ phone, msg }, i) => {
      const jitter = (Math.random() - 0.5) * 2 * JITTER_MS;
      const delay = Math.max(0, Math.round(i * spacing + jitter));
      setTimeout(
        () => sendWhatsApp(phone, msg).catch(err =>
          console.error(`Reminder WA error (${phone}):`, err.message)
        ),
        delay
      );
    });

    console.log(`Payment reminders: ${toSend.length} programados gradualmente entre 14:00 y 18:30`);
  } catch (err) {
    console.error('Payment reminder error:', err.message);
  }
}

/**
 * startPaymentReminderJob()
 * Registra el job recurrente que ejecuta sendPaymentReminders() todos los días
 * a las 2:00 PM hora de Lima. Al dispararse, los mensajes se distribuyen
 * automáticamente a lo largo de la ventana 14:00–18:30.
 *
 * No usa cron para evitar dependencias adicionales; en su lugar implementa
 * un setTimeout auto-renovable (scheduleNext se llama a sí misma tras cada ejecución).
 */
export function startPaymentReminderJob() {
  /**
   * scheduleNext()
   * Calcula los milisegundos hasta las próximas 2:00 PM Lima y programa
   * un setTimeout. Si las 2:00 PM de hoy ya pasó, apunta al día siguiente.
   */
  function scheduleNext() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const next = new Date(now);

    // Fijar la próxima ejecución a las 14:00:00.000 del día actual en Lima.
    next.setHours(14, 0, 0, 0);

    // Si ya pasaron las 2:00 PM de hoy, programar para las 2:00 PM de mañana.
    if (next <= now) next.setDate(next.getDate() + 1);

    const ms = next - now;
    console.log(`Payment reminder: próximo disparo en ${Math.round(ms / 60000)} min (14:00 Lima)`);

    setTimeout(async () => {
      await sendPaymentReminders();
      scheduleNext(); // Auto-renovar el job para el siguiente día.
    }, ms);
  }

  scheduleNext();
}
