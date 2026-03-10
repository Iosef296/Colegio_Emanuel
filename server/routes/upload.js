import { Router } from 'express';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { PDFDocument } from 'pdf-lib';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);
router.use(authorizeRoles('docente', 'admin', 'auxiliar'));

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo imágenes o PDF permitidos'));
  },
});

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

router.post('/', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

  const extMap = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
  const ext = extMap[req.file.mimetype] || 'jpg';
  const key = `avances/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  try {
    let body = req.file.buffer;

    // Compress PDF via pdf-lib object stream compression (non-destructive, 10-40% reduction)
    if (req.file.mimetype === 'application/pdf') {
      try {
        const pdfDoc = await PDFDocument.load(body, { ignoreEncryption: true });
        const compressed = await pdfDoc.save({ useObjectStreams: true });
        const compressedBuf = Buffer.from(compressed);
        if (compressedBuf.length < body.length) {
          console.log(`PDF compressed: ${body.length} → ${compressedBuf.length} bytes (${Math.round((1 - compressedBuf.length / body.length) * 100)}% reduction)`);
          body = compressedBuf;
        }
      } catch (pdfErr) {
        console.warn('PDF compression skipped:', pdfErr.message);
      }
    }

    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: req.file.mimetype,
    }));

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;
    res.json({ url });
  } catch (err) {
    console.error('R2 upload error:', err);
    res.status(500).json({ error: 'Error al subir archivo' });
  }
});

export default router;
