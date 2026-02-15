import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    let query, params;
    if (req.user.role === 'docente') {
      query = `SELECT tc.id, tc.teacher_id, tc.course_id, tc.grade_level_id, tc.period_id,
        c.name as course_name, c.color, gl.name as grade_name, gl.section,
        u.full_name as teacher_name
        FROM teacher_courses tc
        JOIN courses c ON tc.course_id = c.id
        JOIN grade_levels gl ON tc.grade_level_id = gl.id
        JOIN users u ON tc.teacher_id = u.id
        WHERE tc.teacher_id = ?`;
      params = [req.user.id];
    } else if (req.user.role === 'padre') {
      query = `SELECT tc.id, tc.teacher_id, tc.course_id, tc.grade_level_id, tc.period_id,
        c.name as course_name, c.color, gl.name as grade_name, gl.section,
        u.full_name as teacher_name
        FROM teacher_courses tc
        JOIN courses c ON tc.course_id = c.id
        JOIN grade_levels gl ON tc.grade_level_id = gl.id
        JOIN users u ON tc.teacher_id = u.id
        JOIN parent_student ps ON ps.parent_id = ?
        JOIN students s ON ps.student_id = s.id AND s.grade_level_id = tc.grade_level_id`;
      params = [req.user.id];
    } else {
      query = `SELECT tc.id, tc.teacher_id, tc.course_id, tc.grade_level_id, tc.period_id,
        c.name as course_name, c.color, gl.name as grade_name, gl.section,
        u.full_name as teacher_name
        FROM teacher_courses tc
        JOIN courses c ON tc.course_id = c.id
        JOIN grade_levels gl ON tc.grade_level_id = gl.id
        JOIN users u ON tc.teacher_id = u.id`;
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
    const { teacher_id, course_id, grade_level_id, period_id } = req.body;
    const [result] = await pool.query(
      'INSERT INTO teacher_courses (teacher_id, course_id, grade_level_id, period_id) VALUES (?,?,?,?)',
      [teacher_id, course_id, grade_level_id, period_id || 1]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Asignación ya existe' });
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM teacher_courses WHERE id=?', [req.params.id]);
    res.json({ message: 'Asignación eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
