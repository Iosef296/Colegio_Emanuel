import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const baseConfig = {
  max: 2,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000,
};

function makePool(connectionString) {
  if (!connectionString) return null;
  return new Pool({
    ...baseConfig,
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

const primaryPool = process.env.DATABASE_URL
  ? makePool(process.env.DATABASE_URL)
  : new Pool({
      ...baseConfig,
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'colegio_emanuel',
      port: parseInt(process.env.DB_PORT || '5432'),
    });

const secondaryPool = makePool(process.env.DATABASE_URL_SECONDARY);

// --- Failover state ---
let primaryOk = true;
const RETRY_INTERVAL_MS = 60_000;

async function checkPrimary() {
  try {
    await primaryPool.query('SELECT 1');
    if (!primaryOk) {
      primaryOk = true;
      console.log('[DB] Primary restored — switching back to Neon');
    }
  } catch {
    if (primaryOk) {
      primaryOk = false;
      console.error('[DB] Primary down, switching to secondary (Supabase)');
    }
  }
}

// Probe primary every 60s to detect recovery
setInterval(checkPrimary, RETRY_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Schema initialization for secondary (Supabase)
// Runs once at startup; all statements are idempotent.
// ---------------------------------------------------------------------------
async function initSecondarySchema() {
  if (!secondaryPool) return;
  try {
    // ENUMs — use DO $$ blocks because PostgreSQL < 9.6 lacks CREATE TYPE IF NOT EXISTS
    await secondaryPool.query(`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('padre', 'docente', 'admin', 'auxiliar', 'director', 'secretaria');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE grade_level_type AS ENUM ('inicial', 'primaria', 'secundaria');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE attendance_status AS ENUM ('temprano', 'tarde', 'falta', 'justificado', 'salida');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE communication_type AS ENUM ('general', 'curso', 'grado', 'tarea', 'alumno');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await secondaryPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role user_role NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        dni VARCHAR(15),
        email VARCHAR(100),
        phone VARCHAR(20),
        active BOOLEAN DEFAULT TRUE,
        photo_url TEXT,
        deactivated_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS academic_periods (
        id SERIAL PRIMARY KEY,
        year INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        start_date DATE,
        end_date DATE
      );

      CREATE TABLE IF NOT EXISTS grade_levels (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        section VARCHAR(5) NOT NULL,
        level grade_level_type,
        period_id INT NOT NULL REFERENCES academic_periods(id),
        tutor_id INT REFERENCES users(id),
        color VARCHAR(20),
        photo_url TEXT
      );

      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        dni VARCHAR(15),
        birth_date DATE,
        grade_level_id INT NOT NULL REFERENCES grade_levels(id),
        codigo VARCHAR(20) UNIQUE,
        active BOOLEAN DEFAULT TRUE,
        photo_url TEXT,
        deactivated_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS parent_student (
        id SERIAL PRIMARY KEY,
        parent_id INT NOT NULL REFERENCES users(id),
        student_id INT NOT NULL REFERENCES students(id),
        UNIQUE (parent_id, student_id)
      );

      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        color VARCHAR(10) DEFAULT '#3B82F6',
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS teacher_courses (
        id SERIAL PRIMARY KEY,
        teacher_id INT NOT NULL REFERENCES users(id),
        course_id INT NOT NULL REFERENCES courses(id),
        grade_level_id INT NOT NULL REFERENCES grade_levels(id),
        period_id INT NOT NULL REFERENCES academic_periods(id),
        eval_names TEXT,
        UNIQUE (teacher_id, course_id, grade_level_id, period_id)
      );

      CREATE TABLE IF NOT EXISTS grades (
        id SERIAL PRIMARY KEY,
        student_id INT NOT NULL REFERENCES students(id),
        teacher_course_id INT NOT NULL REFERENCES teacher_courses(id),
        evaluation_name VARCHAR(20) NOT NULL,
        score DECIMAL(4,1) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (student_id, teacher_course_id, evaluation_name)
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        student_id INT NOT NULL REFERENCES students(id),
        date DATE NOT NULL,
        status attendance_status NOT NULL,
        turno VARCHAR(20) DEFAULT 'mañana',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (student_id, date, turno)
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        student_id INT NOT NULL REFERENCES students(id),
        month VARCHAR(20) NOT NULL,
        year INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        paid BOOLEAN DEFAULT FALSE,
        paid_date DATE,
        UNIQUE (student_id, month, year)
      );

      CREATE TABLE IF NOT EXISTS communications (
        id SERIAL PRIMARY KEY,
        author_id INT NOT NULL REFERENCES users(id),
        course_id INT REFERENCES courses(id),
        grade_level_id INT REFERENCES grade_levels(id),
        student_ids TEXT,
        title VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        type communication_type DEFAULT 'general',
        attachments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS daily_progress (
        id SERIAL PRIMARY KEY,
        teacher_course_id INT NOT NULL REFERENCES teacher_courses(id),
        date DATE NOT NULL,
        content TEXT NOT NULL,
        photo_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS push_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        platform VARCHAR(20) NOT NULL DEFAULT 'web',
        p256dh TEXT,
        auth_key TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, token)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS teacher_attendance (
        id SERIAL PRIMARY KEY,
        teacher_id INT NOT NULL REFERENCES users(id),
        date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'presente',
        turno VARCHAR(20) DEFAULT 'mañana',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(teacher_id, date, turno)
      );

      CREATE TABLE IF NOT EXISTS whatsapp_auth (
        id SERIAL PRIMARY KEY,
        key_id VARCHAR(255) UNIQUE NOT NULL,
        value JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS group_members (
        id SERIAL PRIMARY KEY,
        group_name VARCHAR(100) NOT NULL,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(group_name, user_id)
      );
    `);

    // Indexes
    await secondaryPool.query(`
      CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
      CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
      CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
    `);

    console.log('[DB] Secondary schema initialized (Supabase ready)');
  } catch (err) {
    console.error('[DB] Secondary schema init error:', err.message);
  }
}

// Run schema init async — don't block server startup
initSecondarySchema();

// Convert MySQL-style ? placeholders to PostgreSQL $1, $2, ...
function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function isMutation(sql) {
  return /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)/i.test(sql);
}

// Wrapper that mimics mysql2's [rows, fields] return format
const pool = {
  async query(sql, params = []) {
    const pgSql = convertPlaceholders(sql);
    const activePool = (primaryOk || !secondaryPool) ? primaryPool : secondaryPool;

    let result;
    try {
      result = await activePool.query(pgSql, params);
      // If we used primary and there's a secondary, replicate mutations async
      if (primaryOk && secondaryPool && isMutation(pgSql)) {
        secondaryPool.query(pgSql, params).catch((err) => {
          console.warn('[DB] Secondary dual-write failed (non-critical):', err.message);
        });
      }
    } catch (err) {
      // If primary failed mid-query, mark it down and retry on secondary
      if (activePool === primaryPool && secondaryPool) {
        primaryOk = false;
        console.error('[DB] Primary query failed, switching to secondary:', err.message);
        result = await secondaryPool.query(pgSql, params);
      } else {
        throw err;
      }
    }

    return [result.rows, result.fields];
  },
  // Expose raw pg pool for direct access (e.g. seed.js, migrations)
  _pool: primaryPool,
};

export default pool;
