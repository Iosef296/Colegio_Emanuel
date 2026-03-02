import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

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

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://colegio-emanuel.onrender.com',
  ],
  credentials: true,
}));
app.use(express.json());

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

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

