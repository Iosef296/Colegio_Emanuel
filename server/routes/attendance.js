import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { broadcast } from '../utils/sse.js';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const { student_id, month, year, date, turno } = req.query;
    let query = `SELECT a.id, a.student_id, a.date, a.status, a.turno,
      s.first_name, s.last_name
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      WHERE 1=1`;
    const params = [];

    if (req.user.role === 'padre') {
      query += ` AND a.student_id IN (SELECT student_id FROM parent_student WHERE parent_id=?)`;
      params.push(req.user.id);
    } else if (req.user.role === 'docente') {
      query += ` AND s.grade_level_id IN (SELECT DISTINCT grade_level_id FROM teacher_courses WHERE teacher_id=?)`;
      params.push(req.user.id);
    }

    if (student_id) { query += ` AND a.student_id=?`; params.push(student_id); }
    if (date) { query += ` AND a.date=?`; params.push(date); }
    if (turno) { query += ` AND a.turno=?`; params.push(turno); }
    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM a.date)=? AND EXTRACT(YEAR FROM a.date)=?`;
      params.push(month, year);
    }

    query += ' ORDER BY a.date DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    const { student_id, date, status, turno = 'mañana' } = req.body;
    await pool.query(
      `INSERT INTO attendance (student_id, date, status, turno)
       VALUES (?,?,?,?) ON CONFLICT (student_id, date, turno) DO UPDATE SET status=EXCLUDED.status`,
      [student_id, date, status, turno]
    );
    broadcast();
    res.status(201).json({ message: 'Asistencia registrada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/bulk', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    const { records } = req.body; // [{student_id, date, status, turno?}]
    if (!records || !records.length) return res.status(400).json({ error: 'Sin registros' });

    const params = [];
    const valueClauses = records.map((r, i) => {
      const offset = i * 4;
      params.push(r.student_id, r.date, r.status, r.turno || 'mañana');
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
    });
    await pool._pool.query(
      `INSERT INTO attendance (student_id, date, status, turno)
       VALUES ${valueClauses.join(', ')} ON CONFLICT (student_id, date, turno) DO UPDATE SET status=EXCLUDED.status`,
      params
    );
    broadcast();
    res.status(201).json({ message: `${records.length} registros guardados` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
