// ============================================================
// Server-Sent Events (SSE) — notificación en memoria.
//
// Responsabilidad de este módulo:
//  1. Mantener un conjunto de clientes SSE conectados (conexiones HTTP persistentes).
//  2. Retransmitir señales a todos los navegadores conectados cuando los datos
//     cambian, sin necesidad de polling.
//
// Nota: se eliminó la capa pg LISTEN/NOTIFY porque el servidor corre en una
// sola instancia (Fly.io). El broadcast en memoria es suficiente y evita
// mantener una conexión persistente a la DB que impediría el auto-suspend de Neon.
// ============================================================

// Conjunto de objetos Response de Express actualmente conectados via SSE.
const clients = new Set();

/**
 * broadcastToClients — envía una señal mínima ("data: 1") a todos los clientes SSE.
 * Si un cliente ya se desconectó y lanza error al escribir, se elimina del Set.
 */
function broadcastToClients() {
  const msg = 'data: 1\n\n';
  for (const res of clients) {
    try { res.write(msg); }
    catch { clients.delete(res); }
  }
}

/**
 * addClient — registra una nueva conexión SSE en el conjunto de clientes activos.
 */
export function addClient(res) { clients.add(res); }

/**
 * removeClient — elimina una conexión SSE del conjunto cuando el cliente se desconecta.
 */
export function removeClient(res) { clients.delete(res); }

/**
 * broadcast — notifica a todos los clientes conectados que los datos cambiaron.
 * Se llama desde las rutas de la API después de cualquier escritura (POST/PUT/DELETE).
 */
export function broadcast() {
  broadcastToClients();
}
