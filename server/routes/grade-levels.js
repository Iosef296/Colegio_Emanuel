import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT gl.*, ap.name as period_name FROM grade_levels gl JOIN academic_periods ap ON gl.period_id = ap.id ORDER BY gl.name'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, section } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
    const [result] = await pool.query(
      'INSERT INTO grade_levels (name, section, period_id) VALUES (?,?,1) RETURNING id',
      [name.trim(), section ? section.trim() : '']
    );
    res.status(201).json({ id: result[0]?.id || result.insertId, name, section });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, section } = req.body;
    await pool.query('UPDATE grade_levels SET name=?, section=? WHERE id=?', [name.trim(), section.trim(), req.params.id]);
    res.json({ message: 'Grado actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM grade_levels WHERE id=?', [req.params.id]);
    res.json({ message: 'Grado eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
