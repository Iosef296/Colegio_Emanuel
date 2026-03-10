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

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

pool.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS codigo VARCHAR(20) UNIQUE')
  .then(() => console.log('DB: columna codigo OK'))
  .catch(err => console.error('DB migration error:', err.message));

pool.query("ALTER TYPE communication_type ADD VALUE IF NOT EXISTS 'tarea'")
  .catch(() => {});

pool.query("ALTER TYPE communication_type ADD VALUE IF NOT EXISTS 'alumno'")
  .then(() => console.log('DB: enum alumno OK'))
  .catch(() => {});

pool.query('ALTER TABLE daily_progress ADD COLUMN IF NOT EXISTS photo_url TEXT')
  .then(() => console.log('DB: columna photo_url OK'))
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
    ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_id_date_key;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name='attendance_student_id_date_turno_key' AND table_name='attendance'
    ) THEN
      ALTER TABLE attendance ADD CONSTRAINT attendance_student_id_date_turno_key UNIQUE (student_id, date, turno);
    END IF;
  END $$
`).then(() => console.log('DB: turno migration OK'))
  .catch(err => console.error('DB turno migration error:', err.message));

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

