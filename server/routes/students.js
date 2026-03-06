import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

const SCHOOL_MONTHS = ['Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

async function generatePayments(studentId, year) {
  for (const month of SCHOOL_MONTHS) {
    try {
      await pool.query(
        'INSERT INTO payments (student_id, month, year, amount, paid) VALUES (?,?,?,?,?)',
        [studentId, month, year, 350, false]
      );
    } catch (err) {
      if (err.code !== '23505') throw err; // ignore duplicates
    }
  }
}

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
    const id = result[0].id;
    const year = new Date().getFullYear();
    const codigo = `EMN-${year}-${String(id).padStart(4, '0')}`;
    await pool.query('UPDATE students SET codigo=? WHERE id=?', [codigo, id]);

    // Auto-create user account
    const firstLastName = last_name.trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const firstFirstName = first_name.trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let username = `${firstLastName}.${firstFirstName}`;

    // Handle duplicate usernames
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) username = `${username}${id}`;

    const password = dni || `alumno${id}`;
    const hash = await bcrypt.hash(password, 10);
    const [userResult] = await pool.query(
      'INSERT INTO users (username, password_hash, role, full_name, dni) VALUES (?,?,?,?,?) RETURNING id',
      [username, hash, 'padre', `${first_name} ${last_name}`, dni || null]
    );
    await pool.query('INSERT INTO parent_student (parent_id, student_id) VALUES (?,?)', [userResult[0].id, id]);

    // Auto-generate school year payments
    await generatePayments(id, year);

    res.status(201).json({ id, codigo, username, password });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/generate-payments', authorizeRoles('admin'), async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const [students] = await pool.query('SELECT id FROM students WHERE active = true');
    for (const s of students) {
      await generatePayments(s.id, year);
    }
    res.json({ message: `Mensualidades generadas para ${students.length} alumnos` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/:id/codigo', authorizeRoles('admin'), async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const codigo = `EMN-${year}-${String(req.params.id).padStart(4, '0')}`;
    await pool.query('UPDATE students SET codigo=? WHERE id=?', [codigo, req.params.id]);
    res.json({ codigo });
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
