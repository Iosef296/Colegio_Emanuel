import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT gl.*, ap.name as period_name FROM grade_levels gl JOIN academic_periods ap ON gl.period_id = ap.id ORDER BY gl.name'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
