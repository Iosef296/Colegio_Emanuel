// ============================================================
// server/routes/teacher-attendance.js
// Rutas REST para registrar, consultar y eliminar la asistencia
// de los docentes (y demás personal) del colegio.
//
// Tabla: teacher_attendance
//   id          SERIAL PK
//   teacher_id  INT → users.id
//   date        DATE
//   turno       TEXT  ('mañana' | 'tarde')
//   tipo        TEXT  ('entrada' | 'salida')
//   status      TEXT  ('temprano' | 'tarde' | 'falta' | 'presente')
//   created_at  TIMESTAMPTZ
//
// Todas las rutas requieren token JWT válido.
// Las rutas de escritura (POST, DELETE) solo están disponibles para
// los roles: admin, auxiliar, director y secretaria.
// ============================================================

import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

// ── Crear router de Express ───────────────────────────────────
// Se exporta como módulo para montarlo en el servidor principal.
const router = Router();

// ── Middleware global: autenticación ─────────────────────────
// Aplica `authenticateToken` a TODAS las rutas de este router.
// Cualquier petición sin JWT válido recibirá un 401 antes de llegar
// a cualquier handler individual.
router.use(authenticateToken);

// ══════════════════════════════════════════════════════════════
// GET /teacher-attendance
// Consulta los registros de asistencia con filtros opcionales.
//
// Query params:
//   teacher_id — ID del docente para filtrar sus registros.
//   month      — Número de mes (1–12) para filtrar por período.
//   year       — Año para filtrar por período.
//
// Si no se pasan filtros, devuelve TODOS los registros (útil para
// reportes globales). Los resultados se ordenan de más reciente a
// más antiguo y, dentro del mismo día, por turno.
//
// Acceso: cualquier usuario autenticado (sin restricción de rol).
// ══════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    // Extraer filtros opcionales de la query string.
    const { teacher_id, month, year } = req.query;

    // ── Construcción dinámica del query SQL ───────────────
    // Se usa el patrón "WHERE 1=1" para poder encadenar cláusulas
    // AND de forma condicional sin preocuparse del primero.
    // La capa `pool.query` convierte automáticamente los `?` a `$N`.
    let query = `SELECT ta.id, ta.teacher_id, ta.date, ta.turno, ta.tipo, ta.status, ta.created_at,
      u.full_name
      FROM teacher_attendance ta
      JOIN users u ON ta.teacher_id = u.id
      WHERE 1=1`;
    const params = [];

    // ── Filtro por docente específico ─────────────────────
    // Si se pasa `teacher_id`, solo devolver registros de ese docente.
    if (teacher_id) {
      query += ` AND ta.teacher_id=?`;
      params.push(teacher_id);
    }

    // ── Filtro por mes y año ──────────────────────────────
    // Ambos filtros deben estar presentes para aplicar el filtro de período.
    // Se usa EXTRACT de PostgreSQL para comparar partes de la fecha.
    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM ta.date)=? AND EXTRACT(YEAR FROM ta.date)=?`;
      params.push(month, year);
    }

    // ── Ordenamiento: más reciente primero, luego por turno ──
    query += ' ORDER BY ta.date DESC, ta.turno';

    // Ejecutar la consulta construida.
    const [rows] = await pool.query(query, params);

    // Devolver los registros como array JSON.
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /teacher-attendance
// Registra o actualiza la asistencia de un docente para un día,
// turno y tipo específicos.
//
// Body JSON:
//   teacher_id — ID del docente (requerido).
//   date       — Fecha en formato ISO 'YYYY-MM-DD' (requerido).
//   turno      — 'mañana' | 'tarde'  (default: 'mañana').
//   tipo       — 'entrada' | 'salida' (default: 'entrada').
//   status     — 'temprano' | 'tarde' | 'falta' (requerido).
//
// Usa INSERT ... ON CONFLICT ... DO UPDATE para que sea idempotente:
// si ya existe un registro para (teacher_id, date, turno, tipo),
// simplemente actualiza el status en lugar de duplicar la fila.
// Esto permite corregir un marcado erróneo sin lógica adicional.
//
// Acceso: admin, auxiliar, director, secretaria.
// ══════════════════════════════════════════════════════════════
router.post('/', authorizeRoles('admin', 'auxiliar', 'director', 'secretaria'), async (req, res) => {
  try {
    // Extraer y desestructurar el cuerpo de la petición con valores por defecto.
    const { teacher_id, date, turno = 'mañana', tipo = 'entrada', status } = req.body;

    // ── Validación de campos obligatorios ─────────────────
    // Sin estos tres campos no se puede crear un registro válido.
    if (!teacher_id || !date || !status) {
      return res.status(400).json({ error: 'Faltan campos' });
    }

    // ── Upsert de asistencia ──────────────────────────────
    // La restricción UNIQUE en (teacher_id, date, turno, tipo) permite
    // usar ON CONFLICT para actualizar si el registro ya existe.
    // EXCLUDED.status hace referencia al valor que se intentó insertar.
    await pool.query(
      `INSERT INTO teacher_attendance (teacher_id, date, turno, tipo, status)
       VALUES (?,?,?,?,?) ON CONFLICT (teacher_id, date, turno, tipo) DO UPDATE SET status=EXCLUDED.status`,
      [teacher_id, date, turno, tipo, status]
    );

    // Respuesta 201 Created para indicar que el recurso fue procesado.
    res.status(201).json({ message: 'Asistencia registrada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE /teacher-attendance/:id
// Elimina permanentemente un registro de asistencia por su ID.
//
// Path param:
//   id — ID primario del registro a eliminar.
//
// Nota técnica: se usa `pool._pool.query` con placeholder `$1`
// (PostgreSQL nativo) en lugar del helper de pool que convierte `?`,
// porque este DELETE no requiere JOIN ni lógica compleja y la
// sintaxis nativa `$N` es más explícita para una sola consulta.
//
// Acceso: admin, auxiliar, director, secretaria.
// ══════════════════════════════════════════════════════════════
router.delete('/:id', authorizeRoles('admin', 'auxiliar', 'director', 'secretaria'), async (req, res) => {
  try {
    // Obtener el ID del registro desde los parámetros de la URL.
    const { id } = req.params;

    // Ejecutar la eliminación usando el pool interno con placeholder $1 de PostgreSQL.
    await pool._pool.query(`DELETE FROM teacher_attendance WHERE id=$1`, [id]);

    // Confirmar la eliminación al cliente.
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Exportar el router para montarlo en server/index.js bajo /api/teacher-attendance.
export default router;
