import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    let query = `SELECT co.id, co.title, co.body, co.type, co.created_at,
      u.full_name as author_name, u.role as author_role,
      c.name as course_name, gl.name as grade_name
      FROM communications co
      JOIN users u ON co.author_id = u.id
      LEFT JOIN courses c ON co.course_id = c.id
      LEFT JOIN grade_levels gl ON co.grade_level_id = gl.id
      WHERE 1=1`;
    const params = [];

    if (req.user.role === 'padre') {
      query += ` AND (co.type='general' OR co.grade_level_id IN
        (SELECT s.grade_level_id FROM students s JOIN parent_student ps ON ps.student_id=s.id WHERE ps.parent_id=?))`;
      params.push(req.user.id);
    } else if (req.user.role === 'docente') {
      query += ` AND (co.author_id=? OR co.type='general')`;
      params.push(req.user.id);
    }

    query += ' ORDER BY co.created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', authorizeRoles('docente', 'admin'), async (req, res) => {
  try {
    const { course_id, grade_level_id, title, body, type } = req.body;
    const [result] = await pool.query(
      'INSERT INTO communications (author_id, course_id, grade_level_id, title, body, type) VALUES (?,?,?,?,?,?) RETURNING id',
      [req.user.id, course_id || null, grade_level_id || null, title, body, type || 'general']
    );
    res.status(201).json({ id: result[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id', authorizeRoles('docente', 'admin'), async (req, res) => {
  try {
    const { title, body } = req.body;
    if (req.user.role === 'docente') {
      await pool.query('UPDATE communications SET title=?, body=? WHERE id=? AND author_id=?', [title, body, req.params.id, req.user.id]);
    } else {
      await pool.query('UPDATE communications SET title=?, body=? WHERE id=?', [title, body, req.params.id]);
    }
    res.json({ message: 'Comunicado actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/:id', authorizeRoles('docente', 'admin'), async (req, res) => {
  try {
    if (req.user.role === 'docente') {
      await pool.query('DELETE FROM communications WHERE id=? AND author_id=?', [req.params.id, req.user.id]);
    } else {
      await pool.query('DELETE FROM communications WHERE id=?', [req.params.id]);
    }
    res.json({ message: 'Comunicado eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
