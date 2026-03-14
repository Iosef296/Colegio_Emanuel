// ============================================================
// Rutas de Grados — /api/grade-levels
// CRUD completo para los grados/secciones del colegio
// (ej: "1° Primaria", sección "A"). Cada grado pertenece a
// un período académico (academic_periods) y puede tener un
// tutor asignado (usuario con rol 'docente'), un color
// identificador y una foto de portada.
// Solo el rol 'admin' puede crear, editar y eliminar.
// Todos los roles autenticados pueden listar grados.
// ============================================================

import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { broadcast } from '../utils/sse.js';

// Router principal; todas las rutas heredan el middleware de autenticación.
const router = Router();
router.use(authenticateToken);

// ------------------------------------------------------------
// GET /api/grade-levels
// Devuelve todos los grados con su período académico y los
// datos del tutor asignado (nombre completo y foto). Se usa
// LEFT JOIN en el tutor para que los grados sin tutor también
// aparezcan en la lista (tutor_name y tutor_photo serán null).
// Ordenado alfabéticamente por nombre de grado.
// ------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    // JOIN con academic_periods para mostrar el nombre del período (ej: "2025").
    // LEFT JOIN con users para el tutor: puede no haber tutor asignado.
    const [rows] = await pool.query(
      `SELECT gl.*, ap.name as period_name, u.full_name as tutor_name, u.photo_url as tutor_photo
       FROM grade_levels gl
       JOIN academic_periods ap ON gl.period_id = ap.id
       LEFT JOIN users u ON u.id = gl.tutor_id
       ORDER BY gl.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// POST /api/grade-levels
// Crea un nuevo grado. Solo admin.
// El campo 'name' es obligatorio; si no se envía se rechaza
// con 400 antes de tocar la base de datos.
// El período académico se fija en id=1 (período activo actual)
// ya que el sistema maneja un único período escolar activo.
// La sección se normaliza con trim() para evitar espacios
// accidentales que generarían duplicados inconsistentes.
// Devuelve el ID del grado creado usando RETURNING o insertId
// (compatibilidad entre PG nativo y la capa de pool).
// ------------------------------------------------------------
router.post('/', authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, section, color, photo_url } = req.body;

    // Validación mínima: el nombre del grado es imprescindible.
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

    // period_id=1 hardcodeado porque el sistema solo gestiona un período activo.
    // Si se necesitan múltiples períodos en el futuro, este valor deberá
    // obtenerse de la tabla academic_periods con un SELECT WHERE active=true.
    const [result] = await pool.query(
      'INSERT INTO grade_levels (name, section, period_id, color, photo_url) VALUES (?,?,1,?,?) RETURNING id',
      [name.trim(), section ? section.trim() : '', color || null, photo_url || null]
    );

    // Compatibilidad: RETURNING devuelve result[0].id en PG;
    // insertId es el fallback para drivers que no soportan RETURNING.
    broadcast();
    res.status(201).json({ id: result[0]?.id || result.insertId, name, section });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// PUT /api/grade-levels/:id
// Actualiza un grado. Solo admin.
// Existe una bifurcación importante según los campos enviados:
//
//   a) Si se envía solo 'tutor_id': actualización rápida del
//      tutor del grado. Se permite tutor_id=null para quitar
//      el tutor asignado. El frontend usa este caso desde el
//      panel de asignaciones.
//
//   b) En cualquier otro caso: actualización completa de
//      nombre, sección, color y foto (formulario de edición).
//      No se mezclan ambos casos en una sola lógica para
//      evitar pisar campos no enviados con valores vacíos.
// ------------------------------------------------------------
router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, section, tutor_id, color, photo_url } = req.body;

    if (tutor_id !== undefined) {
      // Caso a: solo cambiar el tutor del grado.
      // tutor_id=null elimina la asignación del tutor actual.
      await pool.query('UPDATE grade_levels SET tutor_id=? WHERE id=?', [tutor_id || null, req.params.id]);
    } else {
      // Caso b: actualizar los metadatos del grado (nombre, sección, color, foto).
      // section?.trim() ?? '' maneja tanto section=undefined como section=null.
      await pool.query(
        'UPDATE grade_levels SET name=?, section=?, color=?, photo_url=? WHERE id=?',
        [name.trim(), section?.trim() ?? '', color || null, photo_url || null, req.params.id]
      );
    }

    // Notificar a los clientes SSE para que refresquen la lista de grados.
    broadcast();
    res.json({ message: 'Grado actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// DELETE /api/grade-levels/:id
// Elimina un grado. Solo admin.
// PRECAUCIÓN: si el grado tiene alumnos o asignaciones de
// cursos con FK, PostgreSQL lanzará un error de integridad
// referencial. En ese caso el servidor responde con 500
// genérico; el admin debe reubicar o eliminar los alumnos
// del grado antes de borrarlo.
// ------------------------------------------------------------
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM grade_levels WHERE id=?', [req.params.id]);

    // Avisar a clientes SSE del cambio.
    broadcast();
    res.json({ message: 'Grado eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
