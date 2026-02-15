import bcrypt from 'bcryptjs';
import pool from './config/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function seed() {
  const client = await pool._pool.connect();
  try {
    const hash = await bcrypt.hash('admin123', 10);

    // Check if users already exist
    const existing = await client.query('SELECT COUNT(*) as c FROM users');
    if (parseInt(existing.rows[0].c) > 0) {
      console.log('Database already seeded. Updating passwords...');
      await client.query('UPDATE users SET password_hash = $1', [hash]);
      console.log('All passwords updated to "admin123"');
      return;
    }

    console.log('Seeding database...');

    // Users
    await client.query(`INSERT INTO users (id, username, password_hash, role, full_name, dni, email, phone) VALUES
      (1, 'admin', $1, 'admin', 'Administrador del Sistema', '00000000', 'admin@emanuel.edu.pe', '999000000'),
      (2, 'garcia.maria', $2, 'docente', 'María García', '12345678', 'garcia@emanuel.edu.pe', '999111111'),
      (3, 'lopez.juan', $3, 'docente', 'Juan López', '87654321', 'lopez@emanuel.edu.pe', '999222222'),
      (4, 'quispe.pedro', $4, 'padre', 'Pedro Quispe', '11111111', 'quispe@email.com', '999333333')`,
      [hash, hash, hash, hash]);

    console.log('Users seeded');
    console.log('Run database/schema.sql first, then database/seed.sql for full data.');
    console.log('Or use this script after running schema.sql to set proper password hashes.');
  } catch (err) {
    console.error('Seed error:', err.message);
  } finally {
    client.release();
    process.exit();
  }
}

seed();
