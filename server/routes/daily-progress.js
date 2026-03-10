import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { broadcast } from '../utils/sse.js';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    let query = `SELECT dp.id, dp.date, dp.title, dp.content, dp.photo_url, dp.attachments, dp.created_at,
      c.name as course_name, c.color, u.full_name as teacher_name,
      dp.teacher_course_id, tc.grade_level_id
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

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT dp.id, dp.date, dp.title, dp.content, dp.photo_url, dp.attachments, dp.teacher_course_id,
        c.name as course_name, c.color, tc.teacher_id
        FROM daily_progress dp
        JOIN teacher_courses tc ON dp.teacher_course_id = tc.id
        JOIN courses c ON tc.course_id = c.id
        WHERE dp.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    const row = rows[0];
    if (req.user.role === 'docente' && row.teacher_id !== req.user.id)
      return res.status(403).json({ error: 'No autorizado' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id', authorizeRoles('docente', 'admin'), async (req, res) => {
  try {
    const { teacher_course_id, date, title, content, attachments } = req.body;

    if (req.user.role === 'docente') {
      const [owned] = await pool.query(
        'SELECT dp.id FROM daily_progress dp JOIN teacher_courses tc ON dp.teacher_course_id = tc.id WHERE dp.id = ? AND tc.teacher_id = ?',
        [req.params.id, req.user.id]
      );
      if (!owned.length) return res.status(403).json({ error: 'No autorizado' });

      const [tc] = await pool.query('SELECT id FROM teacher_courses WHERE id=? AND teacher_id=?',
        [teacher_course_id, req.user.id]);
      if (!tc.length) return res.status(403).json({ error: 'No autorizado para este curso' });
    }

    const attachmentsJson = attachments?.length ? JSON.stringify(attachments) : null;
    await pool.query(
      'UPDATE daily_progress SET teacher_course_id=?, date=?, title=?, content=?, attachments=? WHERE id=?',
      [teacher_course_id, date, title || null, content || '', attachmentsJson, req.params.id]
    );
    broadcast();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', authorizeRoles('docente', 'admin'), async (req, res) => {
  try {
    const { teacher_course_id, date, title, content, attachments } = req.body;

    if (req.user.role === 'docente') {
      const [tc] = await pool.query('SELECT id FROM teacher_courses WHERE id=? AND teacher_id=?',
        [teacher_course_id, req.user.id]);
      if (tc.length === 0) return res.status(403).json({ error: 'No autorizado para este curso' });
    }

    const attachmentsJson = attachments?.length ? JSON.stringify(attachments) : null;
    const [result] = await pool.query(
      'INSERT INTO daily_progress (teacher_course_id, date, title, content, attachments) VALUES (?,?,?,?,?) RETURNING id',
      [teacher_course_id, date, title || null, content || '', attachmentsJson]
    );
    broadcast();
    res.status(201).json({ id: result[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/:id', authorizeRoles('docente', 'admin'), async (req, res) => {
  try {
    if (req.user.role === 'docente') {
      const [owned] = await pool.query(
        'SELECT dp.id FROM daily_progress dp JOIN teacher_courses tc ON dp.teacher_course_id = tc.id WHERE dp.id = ? AND tc.teacher_id = ?',
        [req.params.id, req.user.id]
      );
      if (!owned.length) return res.status(403).json({ error: 'No autorizado' });
    }
    await pool.query('DELETE FROM daily_progress WHERE id=?', [req.params.id]);
    broadcast();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
