import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const baseConfig = {
  max: 2,                         // pocas conexiones → Neon suspende el cómputo más rápido
  idleTimeoutMillis: 5000,        // cierra conexiones inactivas en 5 s para liberar cómputo
  connectionTimeoutMillis: 10000, // más margen para el cold start de Neon tras auto-suspend
};

const pgPool = new Pool(
  process.env.DATABASE_URL
    ? { ...baseConfig, connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : { ...baseConfig, host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'postgres', password: process.env.DB_PASS || '', database: process.env.DB_NAME || 'colegio_emanuel', port: parseInt(process.env.DB_PORT || '5432') }
);

// Convert MySQL-style ? placeholders to PostgreSQL $1, $2, ...
function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// Wrapper that mimics mysql2's [rows, fields] return format
const pool = {
  async query(sql, params = []) {
    const pgSql = convertPlaceholders(sql);
    const result = await pgPool.query(pgSql, params);
    // mysql2 returns [rows, fields]; we return [rows, result.fields]
    return [result.rows, result.fields];
  },
  // Expose raw pg pool for direct access (e.g. seed.js)
  _pool: pgPool,
};

export default pool;
