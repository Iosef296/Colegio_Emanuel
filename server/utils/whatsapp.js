/**
 * utils/whatsapp.js
 * Integración con WhatsApp mediante la librería Baileys (@whiskeysockets/baileys).
 * Gestiona el ciclo de vida completo de la sesión:
 *   - Autenticación persistida en PostgreSQL (sin archivos en disco).
 *   - Generación de QR en base64 para mostrar en el panel admin.
 *   - Cola de mensajes con pausa de 3 s entre envíos para evitar bloqueos de cuenta.
 *   - Reconexión automática exponencial tras desconexiones inesperadas.
 *   - Limpieza de credenciales cuando el dispositivo cierra sesión remotamente.
 */

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  initAuthCreds,
  BufferJSON,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import pool from '../config/db.js';

// Logger silencioso para Baileys: evita que inunde la consola del servidor
// con mensajes internos de la librería (handshakes, pings, etc.).
const logger = pino({ level: 'silent' });

// ── Estado global del módulo ──────────────────────────────────────────────────
// Estas variables son el "estado" de la conexión WhatsApp a nivel de proceso Node.
// Al ser variables de módulo son compartidas entre todas las peticiones HTTP.

let sock = null;              // Instancia activa del socket Baileys (null si desconectado).
let qrBase64 = null;          // QR codificado en base64 para mostrar en el panel admin.
let waStatus = 'disconnected'; // Estado actual: 'disconnected' | 'connecting' | 'qr' | 'connected'
let reconnectAttempts = 0;    // Contador de intentos de reconexión consecutivos.
let reconnectTimer = null;    // Referencia al setTimeout de reconexión para poder cancelarlo.

// ── Cola de mensajes salientes ────────────────────────────────────────────────
// WhatsApp puede banear cuentas que envían mensajes en ráfaga sin pausa.
// La cola garantiza un intervalo mínimo de 3 s entre mensajes enviados.
const queue = [];
let processingQueue = false; // Semáforo para evitar que processQueue se ejecute en paralelo.

/**
 * processQueue
 * Consume la cola de mensajes pendientes de forma secuencial.
 * Espera 3 segundos entre cada mensaje para respetar los límites de WhatsApp.
 * Si el socket no está conectado en el momento del envío, rechaza la promesa
 * del mensaje correspondiente con un error descriptivo.
 */
async function processQueue() {
  // Salir si ya hay un procesamiento en curso o si no hay mensajes en cola.
  if (processingQueue || queue.length === 0) return;
  processingQueue = true;

  while (queue.length > 0) {
    // Extraer el siguiente mensaje de la cola (FIFO).
    const { jid, text, resolve, reject } = queue.shift();
    try {
      // Verificar que el socket esté activo antes de intentar enviar.
      if (!sock || waStatus !== 'connected') throw new Error('WhatsApp no conectado');
      // Enviar el mensaje de texto al JID (número@s.whatsapp.net).
      await sock.sendMessage(jid, { text });
      resolve();
    } catch (err) {
      // Propagar el error a quien llamó sendWhatsApp() para manejo en el sitio de llamada.
      reject(err);
    }
    // Pausa de 3 s entre mensajes para evitar rate-limiting de WhatsApp.
    // Solo se espera si aún hay más mensajes en cola.
    if (queue.length > 0) await new Promise(r => setTimeout(r, 3000));
  }

  processingQueue = false;
}

/**
 * sendWhatsApp(rawPhone, message)
 * Encola un mensaje de texto para enviarlo al número de teléfono indicado.
 * Normaliza el número al formato peruano (+51) y lo convierte al JID de WhatsApp.
 *
 * @param {string} rawPhone — Número de teléfono en cualquier formato (con/sin código de país).
 * @param {string} message  — Texto del mensaje; soporta formato Markdown de WhatsApp.
 * @returns {Promise<void>} — Se resuelve cuando el mensaje fue enviado, o rechaza si falló.
 */
export function sendWhatsApp(rawPhone, message) {
  // Si no se recibió número, resolver sin hacer nada para evitar errores silenciosos.
  if (!rawPhone) return Promise.resolve();

  // Eliminar todos los caracteres que no sean dígitos (espacios, guiones, paréntesis…).
  const digits = rawPhone.replace(/\D/g, '');

  // Agregar el código de país de Perú (51) si el número no lo incluye ya.
  const phone = digits.startsWith('51') ? digits : `51${digits}`;

  // Formato JID de WhatsApp: número@s.whatsapp.net (usuarios individuales).
  const jid = `${phone}@s.whatsapp.net`;

  // Crear una promesa que se resuelve/rechaza cuando processQueue procese este mensaje.
  return new Promise((resolve, reject) => {
    queue.push({ jid, text: message, resolve, reject });
    // Intentar procesar la cola de inmediato; si ya está en proceso, no hace nada.
    processQueue();
  });
}

/**
 * getWAStatus()
 * Devuelve el estado actual de la conexión y el QR (si está en proceso de vinculación).
 * Es llamado por el endpoint GET /whatsapp/status del panel admin.
 *
 * @returns {{ status: string, qr: string|null }}
 */
export function getWAStatus() {
  return { status: waStatus, qr: qrBase64 };
}

// ── Persistencia de autenticación en PostgreSQL ───────────────────────────────
// Baileys normalmente guarda las credenciales de sesión en archivos locales.
// Aquí se reemplaza ese mecanismo con la base de datos para que la sesión
// sobreviva a reinicios del servidor en Fly.io (sistema de archivos efímero).

/**
 * ensureTable()
 * Crea la tabla whatsapp_auth en la DB si no existe.
 * Se llama una vez al inicio de cada intento de conexión.
 * El error se ignora para el caso de que la tabla ya exista o los permisos difieran.
 */
async function ensureTable() {
  await pool._pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_auth (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).catch(() => {});
}

/**
 * readData(key)
 * Lee un valor de autenticación de la DB dado su clave.
 * Usa BufferJSON.reviver para reconstruir objetos que contienen Buffers
 * (como las claves criptográficas de Signal Protocol que usa WhatsApp).
 *
 * @param {string} key — Clave del registro (ej. 'creds', 'key-pre-key-1').
 * @returns {any|null} — El valor deserializado o null si no existe.
 */
async function readData(key) {
  try {
    const r = await pool._pool.query('SELECT value FROM whatsapp_auth WHERE key=$1', [key]);
    if (!r.rows.length) return null;
    // BufferJSON.reviver convierte strings base64 de vuelta a Buffer para las claves criptográficas.
    return JSON.parse(r.rows[0].value, BufferJSON.reviver);
  } catch { return null; }
}

/**
 * writeData(key, value)
 * Persiste un valor de autenticación en la DB.
 * Si value es null se elimina la fila (equivalente a borrar el archivo de credencial).
 * Usa BufferJSON.replacer para serializar Buffers como strings base64 en JSON.
 *
 * @param {string} key   — Clave del registro.
 * @param {any}    value — Valor a guardar, o null para eliminar.
 */
async function writeData(key, value) {
  if (value == null) {
    // Valor null significa "borrar esta credencial" (ej. clave pre-key ya usada).
    await pool._pool.query('DELETE FROM whatsapp_auth WHERE key=$1', [key]).catch(() => {});
  } else {
    // Upsert: si la clave ya existe se actualiza el valor; si no, se inserta.
    await pool._pool.query(
      `INSERT INTO whatsapp_auth (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      [key, JSON.stringify(value, BufferJSON.replacer)]
    ).catch(() => {});
  }
}

/**
 * createAuthState()
 * Construye el objeto de estado de autenticación que Baileys necesita para
 * inicializar el socket, leyendo las credenciales desde la DB.
 *
 * El objeto retornado tiene dos propiedades:
 *   - state.creds  → Credenciales de identidad del dispositivo (claves de largo plazo).
 *   - state.keys   → Almacén de claves efímeras de Signal Protocol (pre-keys, session-keys…).
 *     Las operaciones get/set del almacén son adaptadas para leer y escribir en la DB.
 *   - saveCreds    → Función que Baileys llama cuando las credenciales cambian.
 *
 * @returns {{ state: object, saveCreds: Function }}
 */
async function createAuthState() {
  await ensureTable();

  // Cargar credenciales previas de la DB o inicializar unas nuevas si es la primera vez.
  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      // makeCacheableSignalKeyStore adapta un almacén con interfaz get/set al formato
      // interno de Baileys, añadiendo caché en memoria para reducir lecturas a la DB.
      keys: makeCacheableSignalKeyStore({
        /**
         * get(type, ids)
         * Recupera múltiples claves de un tipo dado (ej. 'pre-key', 'session').
         * Se resuelven en paralelo para minimizar el tiempo de espera.
         *
         * @param {string}   type — Tipo de clave de Signal Protocol.
         * @param {string[]} ids  — Lista de identificadores de clave a recuperar.
         * @returns {Object} — Mapa { [id]: valor } con las claves encontradas.
         */
        get: async (type, ids) => {
          const data = {};
          await Promise.all(ids.map(async id => {
            let val = await readData(`key-${type}-${id}`);
            // Las claves de sincronización de estado de app requieren deserialización
            // especial con el proto de protobuf de WhatsApp.
            if (type === 'app-state-sync-key' && val) {
              val = proto.Message.AppStateSyncKeyData.fromObject(val);
            }
            data[id] = val;
          }));
          return data;
        },

        /**
         * set(data)
         * Persiste un lote de claves de Signal Protocol en la DB.
         * Se usa flatMap para aplanar el objeto anidado { tipo: { id: valor } }
         * en una lista plana de promesas de escritura, ejecutadas en paralelo.
         *
         * @param {Object} data — Mapa { [type]: { [id]: valor } } de claves a guardar.
         */
        set: async (data) => {
          await Promise.all(
            Object.entries(data).flatMap(([type, typeData]) =>
              Object.entries(typeData || {}).map(([id, val]) =>
                // val ?? null convierte undefined en null para activar la lógica de borrado.
                writeData(`key-${type}-${id}`, val ?? null)
              )
            )
          );
        },
      }, logger),
    },
    // saveCreds es invocado por Baileys cada vez que cambia la identidad del dispositivo.
    saveCreds: () => writeData('creds', creds),
  };
}

// ── Gestión de la conexión ────────────────────────────────────────────────────

/**
 * connectWhatsApp()
 * Abre (o reabre) la conexión WebSocket con los servidores de WhatsApp.
 * Obtiene la versión más reciente del protocolo Baileys, carga las credenciales
 * desde la DB y crea el socket con los listeners necesarios.
 *
 * Listeners del socket:
 *   - creds.update → Persiste las credenciales actualizadas en la DB.
 *   - connection.update → Maneja los cambios de estado: QR, apertura, cierre.
 *
 * El manejo de cierre incluye reconexión automática con backoff exponencial
 * (máximo 5 intentos, espera de hasta 30 s) excepto si el dispositivo hizo logout.
 */
export async function connectWhatsApp() {
  // Cancelar cualquier reconexión programada para evitar conexiones paralelas.
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  waStatus = 'connecting';
  qrBase64 = null; // Limpiar el QR anterior mientras se establece la nueva conexión.

  // Obtener la versión del protocolo de WhatsApp Web recomendada por Baileys.
  const { version } = await fetchLatestBaileysVersion();

  // Cargar el estado de autenticación persistido en la DB.
  const { state, saveCreds } = await createAuthState();

  // Crear el socket con opciones mínimas para evitar fingerprinting agresivo.
  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,         // No imprimir QR en consola; lo mostramos en el panel web.
    browser: ['Colegio Emanuel', 'Chrome', '120.0'], // Identificación del cliente ante WA.
    getMessage: async () => ({ conversation: '' }), // Requerido por Baileys; devuelve mensaje vacío.
  });

  // Persistir credenciales cada vez que Baileys las actualiza (rotación de claves).
  sock.ev.on('creds.update', saveCreds);

  // Manejar todos los cambios de estado de la conexión en un único listener.
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {

    if (qr) {
      // Se generó un nuevo código QR: convertirlo a base64 para mostrarlo en el frontend.
      qrBase64 = await QRCode.toDataURL(qr).catch(() => null);
      waStatus = 'qr';
      console.log('WhatsApp: QR generado — escanea desde el panel admin');
    }

    if (connection === 'open') {
      // Conexión establecida exitosamente: limpiar el QR y resetear el contador de intentos.
      qrBase64 = null;
      waStatus = 'connected';
      reconnectAttempts = 0;
      console.log('WhatsApp: conectado');
    }

    if (connection === 'close') {
      // Analizar el código de error de Boom para determinar si fue un logout voluntario.
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;

      waStatus = 'disconnected';
      sock = null; // Liberar la referencia al socket cerrado.
      console.log(`WhatsApp: desconectado (código ${code})`);

      if (!loggedOut && reconnectAttempts < 5) {
        // Reconexión automática con backoff: 5 s, 10 s, 15 s… hasta máximo 30 s.
        reconnectAttempts++;
        const delay = Math.min(5000 * reconnectAttempts, 30000);
        console.log(`WhatsApp: reconectando en ${delay / 1000}s (intento ${reconnectAttempts})`);
        reconnectTimer = setTimeout(connectWhatsApp, delay);
      } else if (loggedOut) {
        // El usuario cerró sesión desde el teléfono: borrar credenciales de la DB
        // para que el próximo /connect muestre un QR nuevo en lugar de fallar.
        await pool._pool.query('DELETE FROM whatsapp_auth').catch(() => {});
        console.log('WhatsApp: sesión cerrada, auth eliminada');
      }
    }
  });
}

/**
 * disconnectWhatsApp()
 * Cierra la sesión de WhatsApp de forma limpia y borra las credenciales de la DB.
 * Llama a sock.logout() para notificar a los servidores de WhatsApp que el dispositivo
 * se está desvinculando, lo que invalida el token de sesión en sus servidores.
 * Después de esto, connectWhatsApp() mostrará un QR nuevo.
 */
export async function disconnectWhatsApp() {
  if (sock) {
    // Intentar logout ordenado; si falla (ej. ya desconectado) se ignora el error.
    await sock.logout().catch(() => {});
    sock = null;
  }

  // Eliminar todas las filas de autenticación para forzar vinculación nueva.
  await pool._pool.query('DELETE FROM whatsapp_auth').catch(() => {});

  // Resetear el estado del módulo a sus valores iniciales.
  waStatus = 'disconnected';
  qrBase64 = null;
  reconnectAttempts = 0;
}
