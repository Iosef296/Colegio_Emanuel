import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM courses ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, color, description } = req.body;
    const [result] = await pool.query(
      'INSERT INTO courses (name, color, description) VALUES (?,?,?)',
      [name, color || '#3B82F6', description]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, color, description } = req.body;
    await pool.query('UPDATE courses SET name=?, color=?, description=? WHERE id=?',
      [name, color, description, req.params.id]);
    res.json({ message: 'Curso actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
