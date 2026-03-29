import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const dst = new pg.Pool({ connectionString: process.env.DATABASE_URL_SECONDARY, ssl: { rejectUnauthorized: false } });

await dst.query('SET session_replication_role = replica');
await dst.query('DELETE FROM parent_student WHERE student_id=111');
await dst.query('DELETE FROM attendance WHERE student_id=111');
await dst.query('DELETE FROM grades WHERE student_id=111');
await dst.query('DELETE FROM payments WHERE student_id=111');
await dst.query('DELETE FROM students WHERE id=111');
await dst.query('SET session_replication_role = DEFAULT');

const r = await dst.query('SELECT COUNT(*) as total FROM students');
console.log('Supabase students ahora:', r.rows[0].total);
await dst.end();
