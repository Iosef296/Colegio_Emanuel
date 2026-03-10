import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { broadcast } from '../utils/sse.js';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    let query = `SELECT co.id, co.author_id, co.title, co.body, co.type, co.attachments, co.student_ids, co.created_at,
      u.full_name as author_name, u.role as author_role,
      c.name as course_name, c.color as course_color, gl.name as grade_name,
      (SELECT STRING_AGG(s.last_name || ' ' || s.first_name, ', ' ORDER BY s.last_name, s.first_name)
       FROM students s WHERE co.student_ids IS NOT NULL
         AND s.id::text IN (SELECT jsonb_array_elements_text(co.student_ids::jsonb))) as student_names,
      (SELECT JSON_AGG(JSON_BUILD_OBJECT('id', s.id, 'name', s.last_name || ' ' || s.first_name) ORDER BY s.last_name, s.first_name)
       FROM students s WHERE co.student_ids IS NOT NULL
         AND s.id::text IN (SELECT jsonb_array_elements_text(co.student_ids::jsonb))) as students_list
      FROM communications co
      JOIN users u ON co.author_id = u.id
      LEFT JOIN courses c ON co.course_id = c.id
      LEFT JOIN grade_levels gl ON co.grade_level_id = gl.id
      WHERE 1=1`;
    const params = [];

    if (req.user.role === 'padre') {
      query += ` AND (
        co.type='general'
        OR co.grade_level_id IN (SELECT s.grade_level_id FROM students s JOIN parent_student ps ON ps.student_id=s.id WHERE ps.parent_id=?)
        OR (co.student_ids IS NOT NULL AND EXISTS (
          SELECT 1 FROM students s2 JOIN parent_student ps2 ON ps2.student_id=s2.id
          WHERE ps2.parent_id=? AND co.student_ids::jsonb @> jsonb_build_array(s2.id)
        ))
      )`;
      params.push(req.user.id, req.user.id);
    } else if (req.user.role === 'docente') {
      query += ` AND (co.author_id=? OR co.type='general' OR co.type='grado')`;
      params.push(req.user.id);
    } else if (req.user.role === 'auxiliar') {
      // sees everything: own comms + all general/grado/curso/alumno
    }

    query += ' ORDER BY co.created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    const { course_id, grade_level_id, title, body, type, attachments, student_ids } = req.body;

    if (req.user.role === 'docente' && type !== 'curso' && type !== 'alumno')
      return res.status(400).json({ error: 'El docente solo puede enviar comunicados por curso o a alumnos específicos' });
    if (req.user.role === 'auxiliar' && type !== 'general' && type !== 'grado')
      return res.status(400).json({ error: 'El auxiliar solo puede enviar comunicados generales o por grado' });
    if (req.user.role === 'admin' && type === 'curso')
      return res.status(400).json({ error: 'El director no puede enviar comunicados por curso' });

    const attachmentsJson = attachments?.length ? JSON.stringify(attachments) : null;
    const studentIdsJson = student_ids?.length ? JSON.stringify(student_ids) : null;
    const [result] = await pool.query(
      'INSERT INTO communications (author_id, course_id, grade_level_id, title, body, type, attachments, student_ids) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
      [req.user.id, course_id || null, grade_level_id || null, title, body || '', type || 'general', attachmentsJson, studentIdsJson]
    );
    broadcast();
    res.status(201).json({ id: result[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    const { title, body, attachments } = req.body;
    const attachmentsJson = attachments !== undefined
      ? (attachments?.length ? JSON.stringify(attachments) : null)
      : undefined;
    if (req.user.role === 'docente' || req.user.role === 'auxiliar') {
      if (attachmentsJson !== undefined) {
        await pool.query('UPDATE communications SET title=?, body=?, attachments=? WHERE id=? AND author_id=?', [title, body, attachmentsJson, req.params.id, req.user.id]);
      } else {
        await pool.query('UPDATE communications SET title=?, body=? WHERE id=? AND author_id=?', [title, body, req.params.id, req.user.id]);
      }
    } else {
      if (attachmentsJson !== undefined) {
        await pool.query('UPDATE communications SET title=?, body=?, attachments=? WHERE id=?', [title, body, attachmentsJson, req.params.id]);
      } else {
        await pool.query('UPDATE communications SET title=?, body=? WHERE id=?', [title, body, req.params.id]);
      }
    }
    broadcast();
    res.json({ message: 'Comunicado actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/:id', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    if (req.user.role === 'docente' || req.user.role === 'auxiliar') {
      await pool.query('DELETE FROM communications WHERE id=? AND author_id=?', [req.params.id, req.user.id]);
    } else {
      await pool.query('DELETE FROM communications WHERE id=?', [req.params.id]);
    }
    broadcast();
    res.json({ message: 'Comunicado eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
