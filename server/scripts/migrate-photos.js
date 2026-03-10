// Migration: move base64 photos from DB to R2
// Run on Fly.io: node scripts/migrate-photos.js

import pg from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : { host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, port: parseInt(process.env.DB_PORT || '5432') }
);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function run() {
  const { rows } = await pool.query(
    `SELECT id, photo_url FROM daily_progress WHERE photo_url LIKE 'data:image%'`
  );

  console.log(`Found ${rows.length} base64 photos to migrate`);
  if (rows.length === 0) { await pool.end(); return; }

  let ok = 0, fail = 0;

  for (const row of rows) {
    try {
      const match = row.photo_url.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) { console.warn(`Row ${row.id}: unrecognized format, skipping`); fail++; continue; }

      const mimeType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const ext = mimeType === 'image/png' ? 'png' : 'jpg';
      const key = `avances/migrated-${row.id}-${Date.now()}.${ext}`;

      await s3.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }));

      const url = `${process.env.R2_PUBLIC_URL}/${key}`;
      await pool.query(`UPDATE daily_progress SET photo_url=$1 WHERE id=$2`, [url, row.id]);

      console.log(`✓ Row ${row.id} → ${url}`);
      ok++;
    } catch (err) {
      console.error(`✗ Row ${row.id}: ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} migrated, ${fail} failed`);
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
