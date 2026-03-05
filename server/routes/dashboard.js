import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/padre', authorizeRoles('padre'), async (req, res) => {
  try {
    // Get parent's students
    const [students] = await pool.query(
      `SELECT s.id, s.first_name, s.last_name, s.codigo, gl.name as grade_name, gl.section
       FROM students s
       JOIN parent_student ps ON ps.student_id = s.id
       JOIN grade_levels gl ON s.grade_level_id = gl.id
       WHERE ps.parent_id = ? AND s.active = true`,
      [req.user.id]
    );

    if (students.length === 0) return res.json({ student: null, stats: {} });

    const student = students[0];

    // Get grades average
    const [grades] = await pool.query(
      'SELECT AVG(score) as avg_score, COUNT(*) as total FROM grades WHERE student_id = ?',
      [student.id]
    );

    // Pending payments
    const [payments] = await pool.query(
      'SELECT COUNT(*) as pending FROM payments WHERE student_id = ? AND paid = false',
      [student.id]
    );

    // Recent attendance
    const [attendance] = await pool.query(
      `SELECT status, COUNT(*) as count FROM attendance WHERE student_id = ?
       GROUP BY status`,
      [student.id]
    );

    const attendanceMap = {};
    attendance.forEach(a => { attendanceMap[a.status] = a.count; });

    // Unread communications count
    const [comms] = await pool.query(
      `SELECT COUNT(*) as total FROM communications
       WHERE type='general' OR grade_level_id IN
       (SELECT grade_level_id FROM students WHERE id=?)`,
      [student.id]
    );

    res.json({
      student: {
        name: `${student.first_name} ${student.last_name}`,
        grade: student.grade_name,
        section: student.section,
        codigo: student.codigo || null
      },
      stats: {
        promedio: grades[0].avg_score ? Number(grades[0].avg_score).toFixed(1) : 0,
        totalNotas: grades[0].total,
        pagosPendientes: payments[0].pending,
        asistencia: attendanceMap,
        comunicados: comms[0].total
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/docente', authorizeRoles('docente'), async (req, res) => {
  try {
    const [courses] = await pool.query(
      `SELECT tc.id, c.name, c.color, gl.name as grade_name, gl.section
       FROM teacher_courses tc
       JOIN courses c ON tc.course_id = c.id
       JOIN grade_levels gl ON tc.grade_level_id = gl.id
       WHERE tc.teacher_id = ?`,
      [req.user.id]
    );

    const [studentCount] = await pool.query(
      `SELECT COUNT(DISTINCT s.id) as total
       FROM students s
       JOIN teacher_courses tc ON tc.grade_level_id = s.grade_level_id
       WHERE tc.teacher_id = ? AND s.active = true`,
      [req.user.id]
    );

    res.json({
      courses,
      totalStudents: studentCount[0].total,
      totalCourses: courses.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/admin', authorizeRoles('admin'), async (req, res) => {
  try {
    const [users] = await pool.query('SELECT COUNT(*) as total FROM users WHERE active=true');
    const [students] = await pool.query('SELECT COUNT(*) as total FROM students WHERE active=true');
    const [courses] = await pool.query('SELECT COUNT(*) as total FROM courses');
    const [pendingPayments] = await pool.query(
      'SELECT COUNT(*) as count, SUM(amount) as total FROM payments WHERE paid=false'
    );

    res.json({
      totalUsers: users[0].total,
      totalStudents: students[0].total,
      totalCourses: courses[0].total,
      pendingPayments: pendingPayments[0].count,
      pendingAmount: pendingPayments[0].total || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
