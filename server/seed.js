import bcrypt from 'bcryptjs';
import pool from './config/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function seed() {
  const conn = await pool.getConnection();
  try {
    const hash = await bcrypt.hash('admin123', 10);

    // Check if users already exist
    const [existing] = await conn.query('SELECT COUNT(*) as c FROM users');
    if (existing[0].c > 0) {
      console.log('Database already seeded. Updating passwords...');
      await conn.query('UPDATE users SET password_hash = ?', [hash]);
      console.log('All passwords updated to "admin123"');
      return;
    }

    console.log('Seeding database...');

    // Users
    await conn.query(`INSERT INTO users (id, username, password_hash, role, full_name, dni, email, phone) VALUES
      (1, 'admin', ?, 'admin', 'Administrador del Sistema', '00000000', 'admin@emanuel.edu.pe', '999000000'),
      (2, 'garcia.maria', ?, 'docente', 'María García', '12345678', 'garcia@emanuel.edu.pe', '999111111'),
      (3, 'lopez.juan', ?, 'docente', 'Juan López', '87654321', 'lopez@emanuel.edu.pe', '999222222'),
      (4, 'quispe.pedro', ?, 'padre', 'Pedro Quispe', '11111111', 'quispe@email.com', '999333333')`,
      [hash, hash, hash, hash]);

    console.log('Users seeded');
    console.log('Run database/schema.sql first, then database/seed.sql for full data.');
    console.log('Or use this script after running schema.sql to set proper password hashes.');
  } catch (err) {
    console.error('Seed error:', err.message);
  } finally {
    conn.release();
    process.exit();
  }
}

seed();
