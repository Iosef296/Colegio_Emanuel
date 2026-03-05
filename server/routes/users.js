import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/', authorizeRoles('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, role, full_name, dni, email, phone, active, created_at FROM users ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', authorizeRoles('admin'), async (req, res) => {
  try {
    let { username, password, role, full_name, first_name, last_name, dni, email, phone } = req.body;

    // Auto-generate credentials when first_name and last_name are provided
    if (first_name && last_name) {
      full_name = `${first_name.trim()} ${last_name.trim()}`;
      const normalize = s => s.trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      username = `${normalize(last_name)}.${normalize(first_name)}`;
      password = dni || `docente${Date.now()}`;
      const [existing] = await pool.query('SELECT COUNT(*) as c FROM users WHERE username LIKE ?', [`${username}%`]);
      if (existing[0].c > 0) username = `${username}${existing[0].c + 1}`;
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, password_hash, role, full_name, dni, email, phone) VALUES (?,?,?,?,?,?,?) RETURNING id',
      [username, hash, role, full_name, dni || null, email || null, phone || null]
    );
    res.status(201).json({ id: result[0].id, username, password, role, full_name });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const { username, password, role, full_name, dni, email, phone, active } = req.body;
    const fields = [];
    const values = [];

    if (username !== undefined) { fields.push('username=?'); values.push(username); }
    if (password) { fields.push('password_hash=?'); values.push(await bcrypt.hash(password, 10)); }
    if (role !== undefined) { fields.push('role=?'); values.push(role); }
    if (full_name !== undefined) { fields.push('full_name=?'); values.push(full_name); }
    if (dni !== undefined) { fields.push('dni=?'); values.push(dni); }
    if (email !== undefined) { fields.push('email=?'); values.push(email); }
    if (phone !== undefined) { fields.push('phone=?'); values.push(phone); }
    if (active !== undefined) { fields.push('active=?'); values.push(active); }

    if (fields.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

    values.push(req.params.id);
    await pool.query(`UPDATE users SET ${fields.join(',')} WHERE id=?`, values);
    res.json({ message: 'Usuario actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE users SET active=false WHERE id=?', [req.params.id]);
    res.json({ message: 'Usuario desactivado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
