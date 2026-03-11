import { Router } from 'express';
import { addClient, removeClient } from '../utils/sse.js';

const router = Router();

router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write('retry: 1000\n\n');
  res.write(': connected\n\n');
  addClient(res);

  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); }
    catch { clearInterval(heartbeat); removeClient(res); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(res);
  });
});

export default router;
