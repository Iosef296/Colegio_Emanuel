import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
dotenv.config();

import pool from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import studentRoutes from './routes/students.js';
import courseRoutes from './routes/courses.js';
import teacherCourseRoutes from './routes/teacher-courses.js';
import gradeRoutes from './routes/grades.js';
import attendanceRoutes from './routes/attendance.js';
import paymentRoutes from './routes/payments.js';
import communicationRoutes from './routes/communications.js';
import dailyProgressRoutes from './routes/daily-progress.js';
import dashboardRoutes from './routes/dashboard.js';
import gradeLevelRoutes from './routes/grade-levels.js';
import eventsRoutes from './routes/events.js';
import uploadRoutes from './routes/upload.js';
import pushTokenRoutes from './routes/push-tokens.js';
import settingsRoutes from './routes/settings.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(compression());
app.use(cors({
  origin: ['https://colegio-emanuel.pages.dev', 'https://colegioemanuel.es', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/teacher-courses', teacherCourseRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/communications', communicationRoutes);
app.use('/api/daily-progress', dailyProgressRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/grade-levels', gradeLevelRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/push-tokens', pushTokenRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

pool.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS codigo VARCHAR(20) UNIQUE')
  .then(() => console.log('DB: columna codigo OK'))
  .catch(err => console.error('DB migration error:', err.message));

pool.query("ALTER TYPE communication_type ADD VALUE IF NOT EXISTS 'tarea'")
  .catch(() => {});

pool.query("ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'salida'")
  .then(() => console.log('DB: attendance_status salida OK'))
  .catch(() => {});

pool.query("ALTER TYPE communication_type ADD VALUE IF NOT EXISTS 'alumno'")
  .then(() => console.log('DB: enum alumno OK'))
  .catch(() => {});

pool.query('ALTER TABLE daily_progress ADD COLUMN IF NOT EXISTS photo_url TEXT')
  .then(() => console.log('DB: columna photo_url OK'))
  .catch(err => console.error('DB migration error:', err.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS push_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform VARCHAR(20) NOT NULL DEFAULT 'web',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, token)
  )
`).then(() => console.log('DB: push_tokens OK')).catch(err => console.error(err.message));
pool.query(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id)`).catch(() => {});
pool.query(`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS p256dh TEXT`).catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`).then(() => console.log('DB: settings OK')).catch(err => console.error(err.message));
pool.query(`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS auth_key TEXT`).catch(() => {});

pool.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT')
  .then(() => console.log('DB: students.photo_url OK'))
  .catch(err => console.error('DB migration error:', err.message));

pool.query('ALTER TABLE daily_progress ADD COLUMN IF NOT EXISTS attachments TEXT')
  .then(() => console.log('DB: columna attachments OK'))
  .catch(err => console.error('DB migration error:', err.message));

pool.query('ALTER TABLE daily_progress ADD COLUMN IF NOT EXISTS title VARCHAR(255)')
  .then(() => console.log('DB: columna title OK'))
  .catch(err => console.error('DB migration error:', err.message));

pool.query('ALTER TABLE communications ADD COLUMN IF NOT EXISTS attachments TEXT')
  .then(() => console.log('DB: communications.attachments OK'))
  .catch(err => console.error('DB migration error:', err.message));

pool.query('ALTER TABLE communications ADD COLUMN IF NOT EXISTS student_ids TEXT')
  .then(() => console.log('DB: communications.student_ids OK'))
  .catch(err => console.error('DB migration error:', err.message));

pool.query(`ALTER TABLE teacher_courses ADD COLUMN IF NOT EXISTS eval_names TEXT DEFAULT '["N1","N2","N3"]'`)
  .then(() => console.log('DB: columna eval_names OK'))
  .catch(err => console.error('DB migration error:', err.message));

pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'auxiliar'`)
  .then(() => console.log('DB: user_role enum OK'))
  .catch(err => console.error('DB migration error:', err.message));

pool.query(`ALTER TABLE grade_levels ALTER COLUMN level DROP NOT NULL`)
  .then(() => console.log('DB: grade_levels.level nullable OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Indexes for query performance
pool._pool.query(`
  CREATE INDEX IF NOT EXISTS idx_students_active ON students(active);
  CREATE INDEX IF NOT EXISTS idx_students_grade_level ON students(grade_level_id);
  CREATE INDEX IF NOT EXISTS idx_parent_student_parent ON parent_student(parent_id);
  CREATE INDEX IF NOT EXISTS idx_parent_student_student ON parent_student(student_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
  CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
  CREATE INDEX IF NOT EXISTS idx_grades_teacher_course ON grades(teacher_course_id);
  CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
  CREATE INDEX IF NOT EXISTS idx_payments_paid ON payments(student_id, paid);
  CREATE INDEX IF NOT EXISTS idx_communications_grade_level ON communications(grade_level_id);
  CREATE INDEX IF NOT EXISTS idx_daily_progress_teacher_course ON daily_progress(teacher_course_id);
  CREATE INDEX IF NOT EXISTS idx_teacher_courses_teacher ON teacher_courses(teacher_id);
  CREATE INDEX IF NOT EXISTS idx_teacher_courses_grade_level ON teacher_courses(grade_level_id);
`).then(() => console.log('DB: indexes OK'))
  .catch(err => console.error('DB index error:', err.message));

// Atomic: add turno column + update unique constraint in order
pool._pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='attendance' AND column_name='turno'
    ) THEN
      ALTER TABLE attendance ADD COLUMN turno VARCHAR(20) NOT NULL DEFAULT 'mañana';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='attendance' AND column_name='tipo'
    ) THEN
      ALTER TABLE attendance ADD COLUMN tipo VARCHAR(10) NOT NULL DEFAULT 'entrada';
    END IF;
    ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_id_date_key;
    ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_id_date_turno_key;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name='attendance_student_id_date_turno_tipo_key' AND table_name='attendance'
    ) THEN
      ALTER TABLE attendance ADD CONSTRAINT attendance_student_id_date_turno_tipo_key UNIQUE (student_id, date, turno, tipo);
    END IF;
  END $$
`).then(() => console.log('DB: turno+tipo migration OK'))
  .catch(err => console.error('DB turno migration error:', err.message));

// Auto-delete communications and daily_progress older than 105 days (3.5 months)
async function cleanupOldRecords() {
  try {
    const [c] = await pool.query(`DELETE FROM communications WHERE created_at < NOW() - INTERVAL '105 days'`);
    const [d] = await pool.query(`DELETE FROM daily_progress WHERE created_at < NOW() - INTERVAL '105 days'`);
    const cc = c.rowCount ?? 0, dc = d.rowCount ?? 0;
    if (cc + dc > 0) console.log(`Cleanup: ${cc} comunicados, ${dc} avances eliminados`);
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}
cleanupOldRecords();
setInterval(cleanupOldRecords, 24 * 60 * 60 * 1000); // daily

const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// Graceful shutdown — lets in-flight requests finish before stopping
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando servidor...');
  server.close(() => {
    console.log('Servidor cerrado');
    process.exit(0);
  });
  // Force exit after 10s if requests don't finish
  setTimeout(() => process.exit(0), 10000);
});

