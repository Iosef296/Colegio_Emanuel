import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    let query = `SELECT dp.id, dp.date, dp.content, dp.created_at,
      c.name as course_name, c.color, u.full_name as teacher_name,
      dp.teacher_course_id
      FROM daily_progress dp
      JOIN teacher_courses tc ON dp.teacher_course_id = tc.id
      JOIN courses c ON tc.course_id = c.id
      JOIN users u ON tc.teacher_id = u.id
      WHERE 1=1`;
    const params = [];

    if (req.user.role === 'padre') {
      query += ` AND tc.grade_level_id IN
        (SELECT s.grade_level_id FROM students s JOIN parent_student ps ON ps.student_id=s.id WHERE ps.parent_id=?)`;
      params.push(req.user.id);
    } else if (req.user.role === 'docente') {
      query += ` AND tc.teacher_id=?`;
      params.push(req.user.id);
    }

    query += ' ORDER BY dp.date DESC, dp.created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', authorizeRoles('docente', 'admin'), async (req, res) => {
  try {
    const { teacher_course_id, date, content } = req.body;

    if (req.user.role === 'docente') {
      const [tc] = await pool.query('SELECT id FROM teacher_courses WHERE id=? AND teacher_id=?',
        [teacher_course_id, req.user.id]);
      if (tc.length === 0) return res.status(403).json({ error: 'No autorizado para este curso' });
    }

    const [result] = await pool.query(
      'INSERT INTO daily_progress (teacher_course_id, date, content) VALUES (?,?,?) RETURNING id',
      [teacher_course_id, date, content]
    );
    res.status(201).json({ id: result[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
