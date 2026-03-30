// ============================================================
// Punto de entrada principal del servidor Express.
// Registra middlewares globales, monta todas las rutas de la API,
// ejecuta migraciones de base de datos al arrancar y lanza los
// servicios secundarios (WhatsApp, recordatorio de pagos, cleanup).
// ============================================================

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import bcrypt from 'bcryptjs'; // Para hashear contraseñas de usuarios semilla
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config(); // Carga variables de entorno desde el archivo .env

// Pool de conexiones a PostgreSQL con conversión automática ?→$N
import pool from './config/db.js';

// Importación de todos los módulos de rutas de la API
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
import whatsappRoutes from './routes/whatsapp.js';
import teacherAttendanceRoutes from './routes/teacher-attendance.js';
import schedulesRoutes from './routes/schedules.js';

// Servicios adicionales que corren en paralelo al servidor HTTP
import { connectWhatsApp } from './utils/whatsapp.js';
import { startPaymentReminderJob } from './utils/paymentReminder.js';

// ---------------------------------------------------------------------------
// Instancia de la aplicación Express y puerto de escucha
// ---------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3001; // Fly.io inyecta PORT; 3001 es el fallback local

// ---------------------------------------------------------------------------
// Middlewares globales
// ---------------------------------------------------------------------------

// Comprime las respuestas HTTP con gzip/deflate para reducir el ancho de banda
app.use(compression());

// Habilita CORS solo para los orígenes autorizados del frontend (producción y desarrollo)
app.use(cors({
  origin: ['https://colegio-emanuel.pages.dev', 'https://colegioemanuel.es', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // Cachea el preflight 24h — evita OPTIONS repetidos
}));

// Rate limiting en login: máx 10 intentos cada 15 minutos por IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
});

// Parsea el cuerpo de las peticiones como JSON; límite de 1 MB para evitar payloads excesivos
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Registro de rutas — cada módulo maneja su propio prefijo bajo /api
// ---------------------------------------------------------------------------
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);                         // Login / registro / refresh token
app.use('/api/users', userRoutes);                        // CRUD de usuarios (docentes, padres, etc.)
app.use('/api/students', studentRoutes);                  // CRUD de alumnos
app.use('/api/courses', courseRoutes);                    // CRUD de cursos
app.use('/api/teacher-courses', teacherCourseRoutes);     // Asignaciones docente↔curso
app.use('/api/grades', gradeRoutes);                      // Notas por alumno y curso
app.use('/api/attendance', attendanceRoutes);             // Registros de asistencia
app.use('/api/payments', paymentRoutes);                  // Mensualidades y pagos
app.use('/api/communications', communicationRoutes);      // Comunicados y avisos
app.use('/api/daily-progress', dailyProgressRoutes);      // Avances diarios del docente
app.use('/api/dashboard', dashboardRoutes);               // Resúmenes del panel principal
app.use('/api/grade-levels', gradeLevelRoutes);           // Grados y secciones
app.use('/api/events', eventsRoutes);                     // Eventos del calendario escolar
app.use('/api/upload', uploadRoutes);                     // Subida de imágenes a Cloudflare R2

// Proxy de descarga: evita CORS al descargar imágenes desde R2
app.get('/api/download', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith(process.env.R2_PUBLIC_URL)) {
    return res.status(400).json({ error: 'URL no permitida' });
  }
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="foto.${ext}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: 'Error al descargar' });
  }
});
app.use('/api/push-tokens', pushTokenRoutes);             // Tokens para notificaciones push (FCM/Web Push)
app.use('/api/settings', settingsRoutes);                 // Configuración global de la aplicación
app.use('/api/whatsapp', whatsappRoutes);                 // Integración con WhatsApp (Baileys)
app.use('/api/teacher-attendance', teacherAttendanceRoutes); // Asistencia del personal docente
app.use('/api/schedules', schedulesRoutes);                  // Horarios semanales por grado

// ---------------------------------------------------------------------------
// Endpoint de salud — usado por Fly.io para confirmar que el proceso está vivo
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ===========================================================================
// MIGRACIONES DE BASE DE DATOS
// Se ejecutan automáticamente en cada arranque del servidor.
// Usan IF NOT EXISTS / IF NOT IN para ser idempotentes (sin riesgo de error
// si la columna/tabla/enum ya existe).
// ===========================================================================

// Agrega la columna `codigo` a students para identificar al alumno por código único
pool.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS codigo VARCHAR(20) UNIQUE')
  .then(() => console.log('DB: columna codigo OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Agrega el valor 'tarea' al enum communication_type para distinguir tareas de comunicados
pool.query("ALTER TYPE communication_type ADD VALUE IF NOT EXISTS 'tarea'")
  .catch(() => {}); // Silenciado: si el valor ya existe, PostgreSQL lanza error que ignoramos

// Agrega el valor 'salida' al enum attendance_status para registrar la hora de salida
pool.query("ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'salida'")
  .then(() => console.log('DB: attendance_status salida OK'))
  .catch(() => {});

// Agrega el valor 'alumno' para permitir comunicados dirigidos a un alumno específico
pool.query("ALTER TYPE communication_type ADD VALUE IF NOT EXISTS 'alumno'")
  .then(() => console.log('DB: enum alumno OK'))
  .catch(() => {});

// Agrega la columna photo_url en daily_progress para almacenar la URL de la foto del avance (Cloudflare R2)
pool.query('ALTER TABLE daily_progress ADD COLUMN IF NOT EXISTS photo_url TEXT')
  .then(() => console.log('DB: columna photo_url OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Crea la tabla de tokens de notificaciones push si no existe.
// Cada fila vincula un usuario con un token de dispositivo (FCM o Web Push).
// La restricción UNIQUE(user_id, token) evita duplicados por usuario/dispositivo.
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

// Índice para acelerar búsquedas de tokens por usuario
pool.query(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id)`).catch(() => {});

// Agrega columna p256dh para Web Push VAPID (clave pública del suscriptor)
pool.query(`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS p256dh TEXT`).catch(() => {});

// Crea la tabla de configuración clave-valor usada por AdminSettings / pagos, etc.
pool.query(`
  CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`).then(() => console.log('DB: settings OK')).catch(err => console.error(err.message));

// Agrega columna auth_key para Web Push VAPID (secreto compartido de autenticación)
pool.query(`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS auth_key TEXT`).catch(() => {});

// Agrega updated_at en attendance para saber cuándo fue modificado el último registro
pool.query('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()')
  .then(() => console.log('DB: attendance.updated_at OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Corrige filas con valor de turno corrupto causado por mala codificación de Windows (ñ → U+FFFD).
// Restablece cualquier valor inválido al turno por defecto 'mañana'.
pool._pool.query(`UPDATE attendance SET turno = 'ma\u00f1ana' WHERE turno NOT IN ('ma\u00f1ana', 'tarde')`)
  .then(r => { if (r.rowCount > 0) console.log('DB: fixed', r.rowCount, 'corrupted turno rows'); })
  .catch(err => console.error('DB turno fix error:', err.message));

// Agrega photo_url en students para mostrar la foto del alumno en la interfaz
pool.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT')
  .then(() => console.log('DB: students.photo_url OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Crea la tabla de asistencia del personal docente/auxiliar.
// La restricción UNIQUE evita duplicar registros para el mismo docente, fecha, turno y tipo.
pool.query(`
  CREATE TABLE IF NOT EXISTS teacher_attendance (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    turno VARCHAR(20) NOT NULL DEFAULT 'mañana',
    tipo VARCHAR(10) NOT NULL DEFAULT 'entrada',
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(teacher_id, date, turno, tipo)
  )
`).then(() => console.log('DB: teacher_attendance OK')).catch(err => console.error(err.message));

// Agrega photo_url en users para mostrar el avatar del docente/admin
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT')
  .then(() => console.log('DB: users.photo_url OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Agrega tutor_id en grade_levels para asignar un tutor responsable a cada grado
pool.query('ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS tutor_id INTEGER REFERENCES users(id) ON DELETE SET NULL')
  .then(() => console.log('DB: grade_levels.tutor_id OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Agrega color en grade_levels para identificar visualmente el grado en la UI
pool.query('ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS color VARCHAR(20)')
  .then(() => console.log('DB: grade_levels.color OK'))
  .catch(() => {});

// Agrega photo_url en grade_levels para la imagen de portada del grado
pool.query('ALTER TABLE grade_levels ADD COLUMN IF NOT EXISTS photo_url TEXT')
  .then(() => console.log('DB: grade_levels.photo_url OK'))
  .catch(() => {});

// Agrega deactivated_at en users para registrar cuándo fue dado de baja un usuario
// (usado en el proceso de limpieza automática de registros antiguos)
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ')
  .then(() => console.log('DB: users.deactivated_at OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Agrega deactivated_at en students para controlar el ciclo de vida del alumno inactivo
pool.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ')
  .then(() => console.log('DB: students.deactivated_at OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Agrega attachments en daily_progress para adjuntar documentos/imágenes adicionales al avance
pool.query('ALTER TABLE daily_progress ADD COLUMN IF NOT EXISTS attachments TEXT')
  .then(() => console.log('DB: columna attachments OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Agrega title en daily_progress para que el avance tenga un título descriptivo además del contenido
pool.query('ALTER TABLE daily_progress ADD COLUMN IF NOT EXISTS title VARCHAR(255)')
  .then(() => console.log('DB: columna title OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Agrega attachments en communications para que los comunicados puedan incluir archivos adjuntos
pool.query('ALTER TABLE communications ADD COLUMN IF NOT EXISTS attachments TEXT')
  .then(() => console.log('DB: communications.attachments OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Agrega student_ids en communications para comunicados dirigidos a alumnos específicos (tipo 'alumno')
pool.query('ALTER TABLE communications ADD COLUMN IF NOT EXISTS student_ids TEXT')
  .then(() => console.log('DB: communications.student_ids OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Agrega eval_names en teacher_courses para personalizar los nombres de las evaluaciones por curso
// Por defecto ["N1","N2","N3"]; el docente puede renombrarlos (ej. "Examen Parcial")
pool.query(`ALTER TABLE teacher_courses ADD COLUMN IF NOT EXISTS eval_names TEXT DEFAULT '["N1","N2","N3"]'`)
  .then(() => console.log('DB: columna eval_names OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Agrega el rol 'auxiliar' al enum user_role para permitir el nuevo perfil de personal auxiliar
pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'auxiliar'`)
  .then(() => console.log('DB: user_role enum OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Agrega los roles 'director' y 'secretaria' al enum user_role.
// Después de agregar los valores, garantiza que los usuarios semilla existan en la BD:
// — Corrige el username del director si fue guardado con error tipográfico.
// — Crea el usuario director si aún no existe.
// — Crea el usuario secretaria si aún no existe.
pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'director'`)
  .then(() => pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'secretaria'`))
  .then(async () => {
    console.log('DB: user_role director/secretaria OK');
    // Corrige variantes incorrectas del username del director (errores tipográficos históricos)
    await pool.query("UPDATE users SET username='esteban.herbozo', full_name='Esteban Herbozo Morales' WHERE username IN ('estaba.herboso', 'esteban.herboso')");

    // Si el director aún no existe, lo crea con contraseña hasheada
    const [existing] = await pool.query("SELECT id FROM users WHERE username='esteban.herbozo'");
    if (!existing.length) {
      const hash = await bcrypt.hash('41794655', 10);
      await pool.query(
        "INSERT INTO users (username, password_hash, role, full_name, active) VALUES (?, ?, 'director', 'Esteban Herbozo Morales', true)",
        ['esteban.herbozo', hash]
      );
      console.log('DB: director user created');
    }

    // Si la secretaria aún no existe, la crea con contraseña hasheada
    const [existingSec] = await pool.query("SELECT id FROM users WHERE username='ruth.estofanero'");
    if (!existingSec.length) {
      const hash = await bcrypt.hash('45461705', 10);
      await pool.query(
        "INSERT INTO users (username, password_hash, role, full_name, active) VALUES (?, ?, 'secretaria', 'Ruth Estofanero', true)",
        ['ruth.estofanero', hash]
      );
      console.log('DB: secretaria user created');
    }
  })
  .catch(err => console.error('DB director/secretaria error:', err.message));

// Hace que la columna `level` de grade_levels sea anulable.
// Antes era NOT NULL, lo que impedía crear grados sin nivel numérico asignado.
pool.query(`ALTER TABLE grade_levels ALTER COLUMN level DROP NOT NULL`)
  .then(() => console.log('DB: grade_levels.level nullable OK'))
  .catch(err => console.error('DB migration error:', err.message));

// ---------------------------------------------------------------------------
// Índices de rendimiento — mejoran las consultas más frecuentes de la app
// Se crean con IF NOT EXISTS para ser idempotentes en cada arranque
// ---------------------------------------------------------------------------
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
  CREATE INDEX IF NOT EXISTS idx_communications_type ON communications(type);
  CREATE INDEX IF NOT EXISTS idx_communications_created ON communications(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_grades_student_tc ON grades(student_id, teacher_course_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_date_student ON attendance(date, student_id);
`).then(() => console.log('DB: indexes OK'))
  .catch(err => console.error('DB index error:', err.message));

// Tabla de horarios semanales
pool.query(`
  CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    grade_level_id INT NOT NULL REFERENCES grade_levels(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subject VARCHAR(100) NOT NULL DEFAULT '',
    teacher_id INT REFERENCES users(id) ON DELETE SET NULL,
    color VARCHAR(10),
    UNIQUE(grade_level_id, day_of_week, start_time)
  );
  CREATE INDEX IF NOT EXISTS idx_schedules_grade ON schedules(grade_level_id);
`).then(() => console.log('DB: schedules OK'))
  .catch(err => console.error('DB schedules error:', err.message));

// ---------------------------------------------------------------------------
// Migración atómica con bloque PL/pgSQL:
// 1. Agrega columna `turno` (mañana/tarde) a attendance si no existe.
// 2. Agrega columna `tipo` (entrada/salida) si no existe.
// 3. Elimina restricciones únicas antiguas que no incluían turno/tipo.
// 4. Crea la nueva restricción UNIQUE(student_id, date, turno, tipo) para
//    permitir registrar entrada y salida por separado en el mismo día y turno.
// Se usa DO $$ ... $$ para ejecutar múltiples DDL en una sola transacción.
// ---------------------------------------------------------------------------
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

// Tabla de miembros de grupos para grados de tipo "Otros" (círculos de estudio)
pool.query(`
  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER REFERENCES grade_levels(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, student_id)
  )
`).then(() => console.log('DB: group_members OK'))
  .catch(err => console.error('DB migration error:', err.message));

// Amplía el campo name de grade_levels de VARCHAR(30) a VARCHAR(100)
pool.query(`ALTER TABLE grade_levels ALTER COLUMN name TYPE VARCHAR(100)`)
  .then(() => console.log('DB: grade_levels.name VARCHAR(100) OK'))
  .catch(err => console.error('DB grade_levels.name migration error:', err.message));

// ===========================================================================
// LIMPIEZA AUTOMÁTICA DE REGISTROS ANTIGUOS
// Se ejecuta una vez al arrancar y luego cada 24 horas.
// Elimina datos caducados para mantener la BD dentro del límite gratuito de Neon.
// ===========================================================================

/**
 * cleanupOldRecords — elimina registros obsoletos según las reglas de retención:
 *  - Comunicados de tipo 'curso'/'alumno' → 30 días de vida
 *  - Comunicados generales/de grado → 105 días de vida
 *  - Avances diarios → 105 días de vida
 *  - Alumnos inactivos con más de 100 días dados de baja → eliminación en cascada
 *    (asistencia, notas, pagos, usuario padre si no tiene otro hijo activo)
 *  - Docentes/auxiliares inactivos con más de 100 días dados de baja → eliminados
 */
async function cleanupOldRecords() {
  try {
    // Elimina comunicados de curso y alumno que superaron los 30 días de retención
    const [c1] = await pool.query(`DELETE FROM communications WHERE type IN ('curso','alumno') AND created_at < NOW() - INTERVAL '30 days'`);
    // Elimina comunicados generales y de grado que superaron los 105 días de retención
    const [c2] = await pool.query(`DELETE FROM communications WHERE type NOT IN ('curso','alumno') AND created_at < NOW() - INTERVAL '105 days'`);
    // Elimina avances diarios que superaron los 105 días de retención
    const [d] = await pool.query(`DELETE FROM daily_progress WHERE created_at < NOW() - INTERVAL '105 days'`);

    // Busca alumnos dados de baja hace más de 100 días para eliminarlos definitivamente
    const oldStudents = await pool._pool.query(
      `SELECT id FROM students WHERE active=false AND deactivated_at < NOW() - INTERVAL '100 days'`
    );
    for (const s of oldStudents.rows) {
      // Elimina todos los registros relacionados al alumno antes de borrar al alumno mismo
      await pool.query('DELETE FROM attendance WHERE student_id=?', [s.id]);
      await pool.query('DELETE FROM grades WHERE student_id=?', [s.id]);
      await pool.query('DELETE FROM payments WHERE student_id=?', [s.id]);
      // Elimina el usuario padre solo si no tiene otros hijos activos en el sistema
      await pool._pool.query(
        `DELETE FROM users WHERE id IN (SELECT parent_id FROM parent_student WHERE student_id=$1)
         AND id NOT IN (SELECT parent_id FROM parent_student WHERE student_id<>$1)`,
        [s.id]
      );
      await pool.query('DELETE FROM parent_student WHERE student_id=?', [s.id]);
      await pool.query('DELETE FROM students WHERE id=?', [s.id]);
    }

    // Elimina docentes y auxiliares inactivos por más de 100 días
    const [u] = await pool.query(
      `DELETE FROM users WHERE active=false AND deactivated_at < NOW() - INTERVAL '100 days' AND role IN ('docente','auxiliar')`
    );

    // Solo registra en consola si hubo algo que eliminar, para no saturar los logs
    const total = (c1.rowCount ?? 0) + (c2.rowCount ?? 0) + (d.rowCount ?? 0) + oldStudents.rows.length + (u.rowCount ?? 0);
    if (total > 0) console.log(`Cleanup: ${(c1.rowCount??0)+(c2.rowCount??0)} comunicados, ${d.rowCount??0} avances, ${oldStudents.rows.length} alumnos, ${u.rowCount??0} usuarios eliminados`);
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

// Ejecuta la limpieza inmediatamente al arrancar (por si el servidor estuvo apagado varios días)
cleanupOldRecords();
// Programa la limpieza para que se repita cada 24 horas (86 400 000 ms)
setInterval(cleanupOldRecords, 24 * 60 * 60 * 1000); // daily

// ===========================================================================
// INICIO DEL SERVIDOR HTTP
// ===========================================================================

/**
 * Crea el servidor HTTP y comienza a escuchar peticiones.
 * Después de que el servidor está listo, lanza los servicios secundarios:
 * — connectWhatsApp: conecta el cliente de WhatsApp vía Baileys
 * — startPaymentReminderJob: tarea diaria que envía recordatorios de pago
 */
const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  // Inicia la conexión de WhatsApp (Baileys); si falla, solo registra el error sin detener el servidor
  connectWhatsApp().catch(err => console.error('WA init error:', err.message));
  // Inicia el cron job de recordatorio de pagos pendientes
  startPaymentReminderJob();
});

// ---------------------------------------------------------------------------
// Apagado controlado (graceful shutdown)
// Fly.io envía SIGTERM antes de detener el contenedor.
// Cerramos el servidor para que las peticiones en vuelo terminen
// antes de que el proceso muera, en lugar de cortarlas abruptamente.
// ---------------------------------------------------------------------------
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando servidor...');
  server.close(() => {
    console.log('Servidor cerrado');
    process.exit(0);
  });
  // Si pasados 10 segundos aún hay peticiones colgadas, forzamos la salida
  // para evitar que el contenedor quede zombi en Fly.io
  setTimeout(() => process.exit(0), 10000);
});
