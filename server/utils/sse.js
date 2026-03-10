const clients = new Set();

export function addClient(res) {
  clients.add(res);
}

export function removeClient(res) {
  clients.delete(res);
}

export function broadcast() {
  const msg = `data: 1\n\n`;
  for (const res of clients) {
    try { res.write(msg); }
    catch { clients.delete(res); }
  }
}
