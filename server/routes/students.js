import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

const SCHOOL_MONTHS = ['Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

async function generatePayments(studentId, year, amount = 350) {
  for (const month of SCHOOL_MONTHS) {
    try {
      await pool.query(
        'INSERT INTO payments (student_id, month, year, amount, paid) VALUES (?,?,?,?,?)',
        [studentId, month, year, amount, false]
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
      query = `SELECT s.*, gl.name as grade_name, gl.section, u.username
        FROM students s
        JOIN grade_levels gl ON s.grade_level_id = gl.id
        LEFT JOIN parent_student ps ON ps.student_id = s.id
        LEFT JOIN users u ON u.id = ps.parent_id AND u.active = true
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
    const { first_name, last_name, dni, birth_date, grade_level_id, monthly_fee, photo_url } = req.body;
    const [result] = await pool.query(
      'INSERT INTO students (first_name, last_name, dni, birth_date, grade_level_id, photo_url) VALUES (?,?,?,?,?,?) RETURNING id',
      [first_name, last_name, dni, birth_date, grade_level_id, photo_url || null]
    );
    const id = result[0].id;
    const year = new Date().getFullYear();
    const codigo = `EMN-${year}-${String(id).padStart(4, '0')}`;
    await pool.query('UPDATE students SET codigo=? WHERE id=?', [codigo, id]);

    // Auto-create user account
    const firstLastName = last_name.trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const firstFirstName = first_name.trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let username = `${firstLastName}.${firstFirstName}`;

    // Handle duplicate usernames with sequential counter
    const [existing] = await pool.query('SELECT COUNT(*) as c FROM users WHERE username LIKE ? AND active = true', [`${username}%`]);
    if (existing[0].c > 0) username = `${username}${Number(existing[0].c) + 1}`;

    const password = dni || `alumno${id}`;
    const hash = await bcrypt.hash(password, 10);
    const [userResult] = await pool.query(
      'INSERT INTO users (username, password_hash, role, full_name, dni) VALUES (?,?,?,?,?) RETURNING id',
      [username, hash, 'padre', `${first_name} ${last_name}`, dni || null]
    );
    await pool.query('INSERT INTO parent_student (parent_id, student_id) VALUES (?,?)', [userResult[0].id, id]);

    // Auto-generate school year payments
    await generatePayments(id, year, monthly_fee ? Number(monthly_fee) : 350);

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
    const { first_name, last_name, dni, birth_date, grade_level_id, active, monthly_fee, photo_url } = req.body;
    const fields = [];
    const values = [];

    if (first_name !== undefined) { fields.push('first_name=?'); values.push(first_name); }
    if (last_name !== undefined) { fields.push('last_name=?'); values.push(last_name); }
    if (dni !== undefined) { fields.push('dni=?'); values.push(dni); }
    if (birth_date !== undefined) { fields.push('birth_date=?'); values.push(birth_date); }
    if (grade_level_id !== undefined) { fields.push('grade_level_id=?'); values.push(grade_level_id); }
    if (active !== undefined) { fields.push('active=?'); values.push(active); }
    if (photo_url !== undefined) { fields.push('photo_url=?'); values.push(photo_url || null); }

    if (fields.length === 0 && monthly_fee === undefined) return res.status(400).json({ error: 'Sin campos' });

    if (fields.length > 0) {
      values.push(req.params.id);
      await pool.query(`UPDATE students SET ${fields.join(',')} WHERE id=?`, values);
    }

    if (monthly_fee !== undefined) {
      await pool.query('UPDATE payments SET amount=? WHERE student_id=? AND paid=false', [Number(monthly_fee), req.params.id]);
    }

    res.json({ message: 'Alumno actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE students SET active=false WHERE id=?', [req.params.id]);
    // Free the username of the linked user account
    await pool.query(
      "UPDATE users SET active=false, username=CONCAT('_del', id, '_', username) WHERE id IN (SELECT parent_id FROM parent_student WHERE student_id=?)",
      [req.params.id]
    );
    res.json({ message: 'Alumno eliminado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
