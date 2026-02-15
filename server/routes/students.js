import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    let query, params;

    if (req.user.role === 'padre') {
      query = `SELECT s.*, gl.name as grade_name, gl.section
        FROM students s
        JOIN grade_levels gl ON s.grade_level_id = gl.id
        JOIN parent_student ps ON ps.student_id = s.id
        WHERE ps.parent_id = ? AND s.active = true`;
      params = [req.user.id];
    } else if (req.user.role === 'docente') {
      query = `SELECT DISTINCT s.*, gl.name as grade_name, gl.section
        FROM students s
        JOIN grade_levels gl ON s.grade_level_id = gl.id
        JOIN teacher_courses tc ON tc.grade_level_id = s.grade_level_id
        WHERE tc.teacher_id = ? AND s.active = true`;
      params = [req.user.id];
    } else {
      query = `SELECT s.*, gl.name as grade_name, gl.section
        FROM students s
        JOIN grade_levels gl ON s.grade_level_id = gl.id
        WHERE s.active = true ORDER BY s.last_name, s.first_name`;
      params = [];
    }

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', authorizeRoles('admin'), async (req, res) => {
  try {
    const { first_name, last_name, dni, birth_date, grade_level_id } = req.body;
    const [result] = await pool.query(
      'INSERT INTO students (first_name, last_name, dni, birth_date, grade_level_id) VALUES (?,?,?,?,?) RETURNING id',
      [first_name, last_name, dni, birth_date, grade_level_id]
    );
    res.status(201).json({ id: result[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const { first_name, last_name, dni, birth_date, grade_level_id, active } = req.body;
    const fields = [];
    const values = [];

    if (first_name !== undefined) { fields.push('first_name=?'); values.push(first_name); }
    if (last_name !== undefined) { fields.push('last_name=?'); values.push(last_name); }
    if (dni !== undefined) { fields.push('dni=?'); values.push(dni); }
    if (birth_date !== undefined) { fields.push('birth_date=?'); values.push(birth_date); }
    if (grade_level_id !== undefined) { fields.push('grade_level_id=?'); values.push(grade_level_id); }
    if (active !== undefined) { fields.push('active=?'); values.push(active); }

    if (fields.length === 0) return res.status(400).json({ error: 'Sin campos' });

    values.push(req.params.id);
    await pool.query(`UPDATE students SET ${fields.join(',')} WHERE id=?`, values);
    res.json({ message: 'Alumno actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE students SET active=false WHERE id=?', [req.params.id]);
    res.json({ message: 'Alumno desactivado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
