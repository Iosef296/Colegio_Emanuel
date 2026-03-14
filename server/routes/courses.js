// ============================================================
// Rutas de Cursos — /api/courses
// CRUD completo para los cursos del colegio (Matemáticas,
// Comunicación, etc.). Cada curso tiene nombre, color HEX
// y descripción opcional. El color se usa en la UI para
// identificar visualmente los cursos en comunicados y horarios.
// Solo el rol 'admin' puede crear, editar y eliminar.
// Todos los roles autenticados pueden listar cursos.
// ============================================================

import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { broadcast } from '../utils/sse.js';

// Router principal; todas las rutas heredan el middleware de autenticación.
const router = Router();
router.use(authenticateToken);

// ------------------------------------------------------------
// GET /api/courses
// Devuelve todos los cursos ordenados alfabéticamente por
// nombre. No filtra por rol: cualquier usuario autenticado
// puede consultar el catálogo de cursos (necesario para los
// formularios de asignación de docentes y comunicados).
// ------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM courses ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// POST /api/courses
// Crea un nuevo curso. Solo admin.
// El color tiene valor por defecto #3B82F6 (azul Tailwind 500)
// si no se especifica, para garantizar que siempre haya un
// color válido al renderizar las tarjetas en la UI.
// Devuelve el ID generado por la base de datos.
// ------------------------------------------------------------
router.post('/', authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, color, description } = req.body;

    // Insertar el curso y recuperar el ID con RETURNING para
    // evitar una segunda consulta SELECT LAST_INSERT_ID().
    const [result] = await pool.query(
      'INSERT INTO courses (name, color, description) VALUES (?,?,?) RETURNING id',
      [name, color || '#3B82F6', description]
    );

    // Avisar a los clientes SSE que el catálogo de cursos cambió.
    broadcast();
    res.status(201).json({ id: result[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// PUT /api/courses/:id
// Actualiza nombre, color y descripción de un curso existente.
// Solo admin. A diferencia de students (actualización parcial),
// aquí siempre se envían los tres campos para simplificar el
// formulario de edición en el frontend.
// ------------------------------------------------------------
router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, color, description } = req.body;
    await pool.query('UPDATE courses SET name=?, color=?, description=? WHERE id=?',
      [name, color, description, req.params.id]);

    // Notificar a clientes SSE del cambio para refrescar listas.
    broadcast();
    res.json({ message: 'Curso actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// DELETE /api/courses/:id
// Elimina un curso. Solo admin.
// Si el curso tiene asignaciones activas (teacher_courses u
// otras tablas con FK), la base de datos lanza el error 23503
// (foreign_key_violation). En ese caso se responde con 409
// Conflict y un mensaje descriptivo en lugar del genérico 500,
// para que el admin entienda que debe eliminar las asignaciones
// antes de poder borrar el curso.
// ------------------------------------------------------------
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM courses WHERE id=?', [req.params.id]);

    // Notificar a clientes SSE del cambio.
    broadcast();
    res.json({ message: 'Curso eliminado' });
  } catch (err) {
    // Error 23503 = foreign_key_violation: el curso referenciado por otra tabla.
    // Se devuelve 409 Conflict con un mensaje orientado al usuario final.
    if (err.code === '23503') return res.status(409).json({ error: 'El curso tiene asignaciones activas. Elimina las asignaciones primero.' });
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
