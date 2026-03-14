// ============================================================
// Server-Sent Events (SSE) con notificación vía PostgreSQL LISTEN/NOTIFY.
//
// Responsabilidad de este módulo:
//  1. Mantener un conjunto de clientes SSE conectados (conexiones HTTP persistentes).
//  2. Escuchar el canal 'changes' de PostgreSQL para recibir notificaciones
//     cuando cualquier instancia del servidor (Fly.io puede tener varias)
//     modifique datos relevantes.
//  3. Retransmitir esa señal a todos los navegadores conectados para que
//     actualicen su estado sin necesidad de polling.
//
// Arquitectura:
//  — broadcastToClients: escribe directamente en los streams SSE activos.
//  — setupListener: establece una conexión dedicada a PostgreSQL LISTEN.
//  — broadcast (export): llama a broadcastToClients (instancia local) y además
//    dispara pg_notify (cross-instance, por si hay múltiples réplicas de Fly).
// ============================================================

import pool from '../config/db.js';

// Conjunto de objetos Response de Express actualmente conectados via SSE.
// Se usa Set para garantizar que cada cliente aparece solo una vez y
// para poder eliminarlos eficientemente cuando se desconectan.
const clients = new Set();

// Cliente de BD dedicado exclusivamente a escuchar notificaciones LISTEN/NOTIFY.
// Se mantiene en una variable de módulo para evitar crear múltiples listeners.
let listenerClient = null;

/**
 * broadcastToClients — envía una señal mínima ("data: 1") a todos los clientes SSE.
 *
 * El frontend no necesita payload; solo detectar el evento para refrescar datos.
 * Si un cliente ya se desconectó y lanza error al escribir, se elimina del Set
 * para evitar acumular referencias muertas.
 */
function broadcastToClients() {
  // Mensaje SSE mínimo: campo "data" con valor "1" seguido de doble salto de línea
  const msg = 'data: 1\n\n';
  for (const res of clients) {
    try { res.write(msg); }
    catch {
      // Si falla la escritura, el cliente ya se desconectó — lo limpiamos del Set
      clients.delete(res);
    }
  }
}

/**
 * setupListener — establece (o restablece) la escucha LISTEN en PostgreSQL.
 *
 * Se conecta al pool con una conexión dedicada y registra el listener del
 * canal 'changes'. Cuando Postgres emite una notificación en ese canal
 * (via pg_notify), broadcastToClients retransmite el evento a todos los
 * navegadores suscritos por SSE.
 *
 * Manejo de errores:
 *  — Si la conexión falla (BD no disponible al arrancar), reintenta cada 3 s.
 *  — Si la conexión se cae durante la operación, libera el cliente, limpia la
 *    referencia y programa un reintento en 3 s.
 *
 * Solo se ejecuta si listenerClient es null para garantizar una única escucha activa.
 */
async function setupListener() {
  // Evita crear un segundo listener si ya hay uno activo
  if (listenerClient) return;
  try {
    // Obtiene una conexión dedicada del pool (no vuelve al pool automáticamente)
    listenerClient = await pool._pool.connect();

    // Suscribe esta conexión al canal 'changes' de PostgreSQL
    await listenerClient.query('LISTEN changes');

    // Cuando Postgres notifica en 'changes', retransmite a todos los clientes SSE
    listenerClient.on('notification', broadcastToClients);

    // Si la conexión se pierde por error de red o reinicio de BD, limpia y reintenta
    listenerClient.on('error', (err) => {
      console.error('[sse] pg listener error:', err.message);
      try { listenerClient.release(true); } catch {} // true = destruye la conexión dañada
      listenerClient = null;
      setTimeout(setupListener, 3000); // Reintenta en 3 segundos
    });

    console.log('[sse] pg LISTEN ready');
  } catch (err) {
    // La BD aún no está lista (p. ej. arranque en frio en Fly.io) — reintenta
    console.error('[sse] setupListener error:', err.message);
    setTimeout(setupListener, 3000);
  }
}

// Inicia el listener inmediatamente al importar el módulo.
// Si la BD no está disponible, setupListener seguirá reintentando cada 3 s.
setupListener();

/**
 * addClient — registra una nueva conexión SSE en el conjunto de clientes activos.
 * Llamado desde el endpoint GET /api/sse al establecerse la conexión.
 *
 * @param {import('express').Response} res — objeto Response de Express con el stream SSE abierto
 */
export function addClient(res) { clients.add(res); }

/**
 * removeClient — elimina una conexión SSE del conjunto cuando el cliente se desconecta.
 * Llamado desde el handler 'close' del Request SSE.
 *
 * @param {import('express').Response} res — objeto Response a eliminar
 */
export function removeClient(res) { clients.delete(res); }

/**
 * broadcast — notifica a todos los clientes conectados que los datos cambiaron.
 *
 * Estrategia de doble disparo para soportar despliegues multi-instancia en Fly.io:
 *  1. Escribe directamente en los streams SSE de esta máquina (inmediato).
 *  2. Emite pg_notify('changes', '') para que otras instancias del servidor
 *     que tengan su propio listener también retransmitan a sus clientes locales.
 *
 * Se llama desde las rutas de la API después de cualquier escritura en BD
 * (POST, PUT, DELETE) que requiera refrescar la UI en tiempo real.
 */
export function broadcast() {
  // Notificación directa a los clientes SSE de esta instancia (sin latencia de BD)
  broadcastToClients();
  // Notificación cruzada via PostgreSQL para otras instancias del servidor
  pool._pool.query("SELECT pg_notify('changes', '')").catch(err =>
    console.error('[sse] notify error:', err.message)
  );
}
