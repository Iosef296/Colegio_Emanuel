import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const [rows] = await pool.query(
      'SELECT id, username, password_hash, role, full_name FROM users WHERE username = ? AND active = true',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    let photo_url = null;
    if (user.role === 'padre') {
      const [photos] = await pool.query(
        'SELECT s.photo_url FROM students s JOIN parent_student ps ON ps.student_id = s.id WHERE ps.parent_id = ? AND s.photo_url IS NOT NULL LIMIT 1',
        [user.id]
      );
      if (photos.length > 0) photo_url = photos[0].photo_url;
    }

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, photo_url }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, role, full_name, dni, email, phone FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    const userData = rows[0];
    if (userData.role === 'padre') {
      const [photos] = await pool.query(
        'SELECT s.photo_url FROM students s JOIN parent_student ps ON ps.student_id = s.id WHERE ps.parent_id = ? AND s.photo_url IS NOT NULL LIMIT 1',
        [userData.id]
      );
      userData.photo_url = photos.length > 0 ? photos[0].photo_url : null;
    }
    res.json(userData);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
