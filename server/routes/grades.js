import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { broadcast } from '../utils/sse.js';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const { student_id, teacher_course_id } = req.query;
    const { course_id } = req.query;
    let query = `SELECT g.id, g.student_id, g.teacher_course_id, g.evaluation_name, g.score,
      s.first_name, s.last_name, c.name as course_name, c.color, tc.course_id,
      gl.name as grade_name, gl.section,
      u.full_name as teacher_name
      FROM grades g
      JOIN students s ON g.student_id = s.id
      JOIN teacher_courses tc ON g.teacher_course_id = tc.id
      JOIN courses c ON tc.course_id = c.id
      JOIN grade_levels gl ON tc.grade_level_id = gl.id
      JOIN users u ON tc.teacher_id = u.id
      WHERE 1=1`;
    const params = [];

    if (req.user.role === 'padre') {
      query += ` AND g.student_id IN (SELECT student_id FROM parent_student WHERE parent_id=?)`;
      params.push(req.user.id);
    } else if (req.user.role === 'docente') {
      query += ` AND tc.teacher_id=?`;
      params.push(req.user.id);
    }

    if (student_id) { query += ` AND g.student_id=?`; params.push(student_id); }
    if (teacher_course_id) { query += ` AND g.teacher_course_id=?`; params.push(teacher_course_id); }
    if (course_id) { query += ` AND tc.course_id=?`; params.push(course_id); }
    if (req.query.grade_level_id) { query += ` AND tc.grade_level_id=?`; params.push(req.query.grade_level_id); }

    query += ' ORDER BY c.name, g.evaluation_name';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', authorizeRoles('docente', 'admin'), async (req, res) => {
  try {
    const { student_id, teacher_course_id, evaluation_name, score } = req.body;

    if (req.user.role === 'docente') {
      const [tc] = await pool.query('SELECT id FROM teacher_courses WHERE id=? AND teacher_id=?',
        [teacher_course_id, req.user.id]);
      if (tc.length === 0) return res.status(403).json({ error: 'No autorizado para este curso' });
    }

    await pool.query(
      `INSERT INTO grades (student_id, teacher_course_id, evaluation_name, score)
       VALUES (?,?,?,?) ON CONFLICT (student_id, teacher_course_id, evaluation_name) DO UPDATE SET score=EXCLUDED.score`,
      [student_id, teacher_course_id, evaluation_name, score]
    );
    broadcast();
    res.status(201).json({ message: 'Nota guardada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id', authorizeRoles('docente', 'admin'), async (req, res) => {
  try {
    const { score } = req.body;
    await pool.query('UPDATE grades SET score=? WHERE id=?', [score, req.params.id]);
    broadcast();
    res.json({ message: 'Nota actualizada' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
