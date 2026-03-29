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
      `SELECT gl.*, ap.name as period_name, u.full_name as tutor_name, u.photo_url as tutor_photo,
              (SELECT COUNT(*) FROM group_members WHERE group_id = gl.id) as member_count
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
router.post('/', authorizeRoles('admin', 'director', 'secretaria'), async (req, res) => {
  try {
    const { name, section, color, photo_url } = req.body;

    // Validación mínima: el nombre del grado es imprescindible.
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

    // Obtener el período activo; si no hay uno marcado como activo usa el de mayor id
    const [periods] = await pool.query(
      'SELECT id FROM academic_periods ORDER BY id DESC LIMIT 1'
    );
    const periodId = periods[0]?.id || 1;
    const [result] = await pool.query(
      'INSERT INTO grade_levels (name, section, period_id, color, photo_url) VALUES (?,?,?,?,?) RETURNING id',
      [name.trim(), section ? section.trim() : '', periodId, color || null, photo_url || null]
    );

    // Compatibilidad: RETURNING devuelve result[0].id en PG;
    // insertId es el fallback para drivers que no soportan RETURNING.
    broadcast();
    res.status(201).json({ id: result[0]?.id || result.insertId, name, section });
  } catch (err) {
    console.error('Error creando grado:', err.message);
    res.status(500).json({ error: err.message });
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
router.put('/:id', authorizeRoles('admin', 'director', 'secretaria'), async (req, res) => {
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
// GET /api/grade-levels/:id/members
// Devuelve los alumnos miembros del grupo (grados tipo "Otros").
// Hace JOIN con students para devolver nombre, foto, grado base.
// ------------------------------------------------------------
router.get('/:id/members', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, gl.name as grade_name, gl.color as grade_color
       FROM group_members gm
       JOIN students s ON s.id = gm.student_id
       JOIN grade_levels gl ON gl.id = s.grade_level_id
       WHERE gm.group_id = ? AND s.active = true
       ORDER BY s.last_name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// POST /api/grade-levels/:id/members
// Agrega un alumno al grupo. Solo admin.
// Ignora duplicados con ON CONFLICT DO NOTHING.
// ------------------------------------------------------------
router.post('/:id/members', authorizeRoles('admin', 'director', 'secretaria'), async (req, res) => {
  try {
    const { student_id } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id requerido' });
    await pool.query(
      'INSERT INTO group_members (group_id, student_id) VALUES (?,?) ON CONFLICT DO NOTHING',
      [req.params.id, student_id]
    );
    res.status(201).json({ message: 'Miembro agregado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// DELETE /api/grade-levels/:id/members/:student_id
// Quita un alumno del grupo. Solo admin.
// ------------------------------------------------------------
router.delete('/:id/members/:student_id', authorizeRoles('admin', 'director', 'secretaria'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM group_members WHERE group_id=? AND student_id=?',
      [req.params.id, req.params.student_id]
    );
    res.json({ message: 'Miembro eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// DELETE /api/grade-levels/:id
// Elimina un grado de forma forzada.
// Los alumnos del grado eliminado se mueven automáticamente al
// grado especial "Alumnos sin asignar" (se crea si no existe).
// Las asignaciones de docentes (teacher_courses) se eliminan.
// Los miembros del grupo (group_members) se eliminan en cascada.
// ------------------------------------------------------------
router.delete('/:id', authorizeRoles('admin', 'director', 'secretaria'), async (req, res) => {
  try {
    const gradeId = req.params.id;

    // Buscar o crear el grado de reserva "Alumnos sin asignar"
    let [sinAsignar] = await pool.query(
      "SELECT id FROM grade_levels WHERE name='Alumnos sin asignar' LIMIT 1"
    );
    let sinAsignarId;
    if (sinAsignar.length > 0) {
      sinAsignarId = sinAsignar[0].id;
    } else {
      const [created] = await pool.query(
        "INSERT INTO grade_levels (name, section, period_id, color) VALUES ('Alumnos sin asignar','',1,'#9CA3AF') RETURNING id"
      );
      sinAsignarId = created[0]?.id || created.insertId;
    }

    if (String(gradeId) === String(sinAsignarId)) {
      return res.status(400).json({ error: 'No se puede eliminar el grado "Alumnos sin asignar".' });
    }

    // 1. Mover alumnos al grado de reserva
    await pool.query('UPDATE students SET grade_level_id=? WHERE grade_level_id=?', [sinAsignarId, gradeId]);

    // 2. Eliminar comunicados del grado
    await pool.query('DELETE FROM communications WHERE grade_level_id=?', [gradeId]);

    // 3. Eliminar dependencias de teacher_courses en 2 queries (sin loop N+1)
    await pool.query(
      `DELETE FROM grades WHERE teacher_course_id IN (SELECT id FROM teacher_courses WHERE grade_level_id=?)`,
      [gradeId]
    );
    await pool.query(
      `DELETE FROM daily_progress WHERE teacher_course_id IN (SELECT id FROM teacher_courses WHERE grade_level_id=?)`,
      [gradeId]
    );
    await pool.query('DELETE FROM teacher_courses WHERE grade_level_id=?', [gradeId]);

    // 4. Eliminar el grado (group_members se elimina en cascada)
    await pool.query('DELETE FROM grade_levels WHERE id=?', [gradeId]);

    broadcast();
    res.json({ message: 'Grado eliminado' });
  } catch (err) {
    console.error('Error eliminando grado:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
