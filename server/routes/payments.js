import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const { student_id } = req.query;
    let query = `SELECT p.*, s.first_name, s.last_name
      FROM payments p
      JOIN students s ON p.student_id = s.id
      WHERE 1=1`;
    const params = [];

    if (req.user.role === 'padre') {
      query += ` AND p.student_id IN (SELECT student_id FROM parent_student WHERE parent_id=?)`;
      params.push(req.user.id);
    }

    if (student_id) { query += ` AND p.student_id=?`; params.push(student_id); }

    query += ` ORDER BY p.year, CASE p.month
      WHEN 'Enero' THEN 1 WHEN 'Febrero' THEN 2 WHEN 'Marzo' THEN 3
      WHEN 'Abril' THEN 4 WHEN 'Mayo' THEN 5 WHEN 'Junio' THEN 6
      WHEN 'Julio' THEN 7 WHEN 'Agosto' THEN 8 WHEN 'Septiembre' THEN 9
      WHEN 'Octubre' THEN 10 WHEN 'Noviembre' THEN 11 WHEN 'Diciembre' THEN 12
      END`;
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', authorizeRoles('admin'), async (req, res) => {
  try {
    const { student_id, month, year, amount, paid, paid_date } = req.body;
    const [result] = await pool.query(
      'INSERT INTO payments (student_id, month, year, amount, paid, paid_date) VALUES (?,?,?,?,?,?) RETURNING id',
      [student_id, month, year, amount, paid || false, paid_date || null]
    );
    res.status(201).json({ id: result[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Pago ya existe' });
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const { paid, paid_date, amount } = req.body;
    const fields = [];
    const values = [];

    if (paid !== undefined) { fields.push('paid=?'); values.push(paid); }
    if (paid_date !== undefined) { fields.push('paid_date=?'); values.push(paid_date); }
    if (amount !== undefined) { fields.push('amount=?'); values.push(amount); }

    if (fields.length === 0) return res.status(400).json({ error: 'Sin campos' });

    values.push(req.params.id);
    await pool.query(`UPDATE payments SET ${fields.join(',')} WHERE id=?`, values);
    res.json({ message: 'Pago actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
