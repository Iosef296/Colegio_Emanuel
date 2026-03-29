import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const src = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const dst = new pg.Pool({ connectionString: process.env.DATABASE_URL_SECONDARY, ssl: { rejectUnauthorized: false } });

const r1 = await src.query('SELECT COUNT(*) as total FROM students');
const r2 = await dst.query('SELECT COUNT(*) as total FROM students');
console.log('NEON students:', r1.rows[0].total);
console.log('SUPABASE students:', r2.rows[0].total);

// Students in Supabase but NOT in Neon (ghosts)
const neonIds = (await src.query('SELECT id FROM students')).rows.map(r => r.id);
const supaRows = (await dst.query('SELECT id, first_name, last_name FROM students')).rows;
const ghosts = supaRows.filter(r => !neonIds.includes(r.id));
if (ghosts.length) {
  console.log('Alumnos en Supabase pero YA NO en Neon (borrados):', JSON.stringify(ghosts));
}

// Check cleanup log — look for recently deleted from attendance/grades
const r3 = await src.query("SELECT * FROM students WHERE created_at < NOW() - INTERVAL '90 days' ORDER BY created_at LIMIT 5");
console.log('Alumnos mas antiguos en Neon:', JSON.stringify(r3.rows.map(r => ({id:r.id,nombre:r.first_name+' '+r.last_name,creado:r.created_at}))));

await src.end();
await dst.end();
