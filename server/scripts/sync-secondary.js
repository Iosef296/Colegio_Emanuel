/**
 * sync-secondary.js
 * Copia todos los datos de la DB primaria (Neon) a la secundaria (Supabase).
 * Ejecutar UNA VEZ dentro del container de Fly.io:
 *   node scripts/sync-secondary.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const src = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 15000,
});

const dst = new Pool({
  connectionString: process.env.DATABASE_URL_SECONDARY,
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 15000,
});

// Tablas en orden de dependencia (FKs)
const TABLES = [
  'users',
  'academic_periods',
  'grade_levels',
  'students',
  'parent_student',
  'courses',
  'teacher_courses',
  'grades',
  'attendance',
  'payments',
  'communications',
  'daily_progress',
  'push_tokens',
  'settings',
  'teacher_attendance',
  'whatsapp_auth',
  'group_members',
];

async function copyTable(name) {
  // Get all rows from source
  const { rows } = await src.query(`SELECT * FROM ${name}`);
  if (rows.length === 0) {
    console.log(`  ${name}: vacío, skip`);
    return;
  }

  const cols = Object.keys(rows[0]);
  const colList = cols.map(c => `"${c}"`).join(', ');

  // Build INSERT ... ON CONFLICT DO NOTHING in batches of 100
  let inserted = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const valuePlaceholders = batch.map((_, ri) =>
      `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
    ).join(', ');
    const flatValues = batch.flatMap(row => cols.map(c => row[c]));

    await dst.query(
      `INSERT INTO ${name} (${colList}) VALUES ${valuePlaceholders} ON CONFLICT DO NOTHING`,
      flatValues
    );
    inserted += batch.length;
  }

  console.log(`  ${name}: ${inserted} filas copiadas`);
}

async function resetSequences() {
  // After bulk insert, reset sequences so new rows don't conflict
  const seqQuery = `
    SELECT
      table_name,
      column_name,
      pg_get_serial_sequence(table_name, column_name) AS seq
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_default LIKE 'nextval%'
  `;
  const { rows } = await dst.query(seqQuery);
  for (const { table_name, column_name, seq } of rows) {
    if (!seq) continue;
    try {
      await dst.query(
        `SELECT setval($1, COALESCE((SELECT MAX("${column_name}") FROM ${table_name}), 0) + 1, false)`,
        [seq]
      );
    } catch (e) {
      console.warn(`  Seq reset warning (${table_name}.${column_name}):`, e.message);
    }
  }
  console.log('  Secuencias restablecidas');
}

async function main() {
  console.log('=== Sincronizando Neon → Supabase ===\n');
  try {
    // Disable FK checks during load (wrap in deferred)
    await dst.query('SET session_replication_role = replica');

    for (const table of TABLES) {
      try {
        await copyTable(table);
      } catch (err) {
        console.warn(`  ${table}: error — ${err.message}`);
      }
    }

    await dst.query('SET session_replication_role = DEFAULT');
    await resetSequences();

    console.log('\n=== Sincronización completa ===');
  } catch (err) {
    console.error('Error fatal:', err.message);
  } finally {
    await src.end();
    await dst.end();
    process.exit(0);
  }
}

main();
