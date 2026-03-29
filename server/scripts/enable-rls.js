import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Runs against Supabase (primary when SWAP_DB_ROLES=true, else secondary)
const url = process.env.SWAP_DB_ROLES === 'true'
  ? process.env.DATABASE_URL_SECONDARY  // Supabase is primary
  : process.env.DATABASE_URL_SECONDARY; // Supabase is always secondary key

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const tables = [
  'users', 'academic_periods', 'grade_levels', 'students',
  'parent_student', 'courses', 'teacher_courses', 'grades',
  'attendance', 'payments', 'communications', 'daily_progress',
  'push_tokens', 'settings', 'teacher_attendance', 'whatsapp_auth',
  'group_members',
];

for (const table of tables) {
  try {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    console.log(`RLS enabled: ${table}`);
  } catch (err) {
    console.warn(`  ${table}: ${err.message}`);
  }
}

console.log('\nListo — API pública bloqueada, conexión PostgreSQL intacta.');
await pool.end();
