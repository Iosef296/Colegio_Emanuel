// ============================================================
// server/routes/schedules.js
// CRUD de horarios semanales por grado.
// Tabla: schedules (id, grade_level_id, day_of_week, start_time, end_time, subject, teacher_id, color)
// day_of_week: 1=Lunes … 5=Viernes
// ============================================================

import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

// GET /api/schedules?grade_level_id=X
// Devuelve los bloques horarios del grado indicado, con nombre del docente.
router.get('/', async (req, res) => {
  try {
    const { grade_level_id } = req.query;
    let query = `
      SELECT s.*, u.full_name as teacher_name
      FROM schedules s
      LEFT JOIN users u ON u.id = s.teacher_id
      WHERE 1=1`;
    const params = [];
    if (grade_level_id) {
      query += ' AND s.grade_level_id=?';
      params.push(grade_level_id);
    }
    query += ' ORDER BY s.start_time, s.day_of_week';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/schedules
// Crea o actualiza (upsert) un bloque horario.
// Conflicto: (grade_level_id, day_of_week, start_time) → actualiza el resto.
router.post('/', authorizeRoles('admin', 'director', 'secretaria'), async (req, res) => {
  try {
    const { grade_level_id, day_of_week, start_time, end_time, subject, teacher_id, color } = req.body;
    if (!grade_level_id || !day_of_week || !start_time || !end_time || !subject) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    const [result] = await pool.query(
      `INSERT INTO schedules (grade_level_id, day_of_week, start_time, end_time, subject, teacher_id, color)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (grade_level_id, day_of_week, start_time)
       DO UPDATE SET end_time=EXCLUDED.end_time, subject=EXCLUDED.subject,
                     teacher_id=EXCLUDED.teacher_id, color=EXCLUDED.color
       RETURNING id`,
      [grade_level_id, day_of_week, start_time, end_time, subject.trim(), teacher_id || null, color || null]
    );
    res.status(201).json({ id: result[0]?.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/schedules/:id
// Actualiza un bloque existente por ID.
router.put('/:id', authorizeRoles('admin', 'director', 'secretaria'), async (req, res) => {
  try {
    const { start_time, end_time, subject, teacher_id, color } = req.body;
    await pool.query(
      'UPDATE schedules SET start_time=?, end_time=?, subject=?, teacher_id=?, color=? WHERE id=?',
      [start_time, end_time, subject.trim(), teacher_id || null, color || null, req.params.id]
    );
    res.json({ message: 'Actualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// DELETE /api/schedules/:id
router.delete('/:id', authorizeRoles('admin', 'director', 'secretaria'), async (req, res) => {
  try {
    await pool.query('DELETE FROM schedules WHERE id=?', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
