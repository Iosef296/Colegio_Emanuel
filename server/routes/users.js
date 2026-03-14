// Rutas de gestión de usuarios (CRUD completo).
// Todas las rutas requieren autenticación JWT (middleware global al final del archivo).
// El admin tiene acceso completo; director y secretaria tienen acceso restringido
// (no pueden modificar ni eliminar cuentas de admin ni su propia cuenta).

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { broadcast } from '../utils/sse.js';

// Instancia del enrutador de Express para agrupar todas las rutas de usuarios
const router = Router();

// Aplicar verificación de token JWT a todas las rutas de este archivo.
// Sin un token válido en el header Authorization, ninguna ruta es accesible.
router.use(authenticateToken);

// ─────────────────────────────────────────────
// GET /api/users/staff
// Devuelve la lista mínima del personal activo (docentes, auxiliares, directores,
// secretarias). La usa el escáner QR del auxiliar para identificar al personal
// por su código QR sin exponer datos sensibles como contraseñas o DNI.
// ─────────────────────────────────────────────
router.get('/staff', authorizeRoles('admin', 'auxiliar', 'director', 'secretaria'), async (req, res) => {
  try {
    // Solo se devuelven los campos mínimos necesarios para la identificación QR.
    // Se filtra por roles de personal (excluye padres y alumnos) y solo activos.
    const [rows] = await pool.query(
      "SELECT id, username, full_name, role FROM users WHERE role IN ('docente','auxiliar','director','secretaria') AND active=true ORDER BY full_name"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─────────────────────────────────────────────
// GET /api/users
// Devuelve la lista completa de todos los usuarios del sistema.
// Solo accesible para el administrador; incluye datos sensibles como DNI y foto.
// ─────────────────────────────────────────────
router.get('/', authorizeRoles('admin'), async (req, res) => {
  try {
    // Se recuperan todos los campos necesarios para la pantalla AdminUsuarios.
    // password_hash se omite deliberadamente por seguridad.
    const [rows] = await pool.query(
      'SELECT id, username, role, full_name, dni, email, phone, photo_url, active, created_at FROM users ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─────────────────────────────────────────────
// POST /api/users
// Crea un nuevo usuario en el sistema.
// Si se proveen first_name y last_name, genera automáticamente el username y
// la contraseña inicial, lo que agiliza el alta masiva de docentes o padres.
// Solo accesible para el administrador.
// ─────────────────────────────────────────────
router.post('/', authorizeRoles('admin'), async (req, res) => {
  try {
    // Extraer todos los campos posibles del cuerpo de la petición
    let { username, password, role, full_name, first_name, last_name, dni, email, phone, photo_url } = req.body;

    // ── Generación automática de credenciales ────────────────────────────
    // Cuando se envían nombre y apellido por separado (flujo de alta rápida),
    // se construye automáticamente el nombre completo, el username y la
    // contraseña inicial para evitar que el admin tenga que inventarlos.
    if (first_name && last_name) {
      // Concatenar nombre y apellido para formar el nombre completo visible
      full_name = `${first_name.trim()} ${last_name.trim()}`;

      // Función normalizadora: toma la primera palabra, la pone en minúsculas
      // y elimina tildes/diacríticos para generar un username ASCII limpio.
      // Ejemplo: "María José" → "maria", "Quispe Ramos" → "quispe"
      const normalize = s => s.trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      // Username en formato nombre.apellido (ej: "maria.quispe")
      username = `${normalize(first_name)}.${normalize(last_name)}`;

      // Contraseña inicial: se usa el DNI si está disponible (fácil de recordar),
      // o se genera una cadena única con el rol y timestamp como fallback
      password = dni || `${role || 'user'}${Date.now()}`;

      // Verificar si ya existe un usuario activo con el mismo username base.
      // Si hay colisión, se añade un sufijo numérico para garantizar unicidad.
      // Ejemplo: "maria.quispe" ya existe → "maria.quispe2"
      const [existing] = await pool.query('SELECT COUNT(*) as c FROM users WHERE username LIKE ? AND active = true', [`${username}%`]);
      if (existing[0].c > 0) username = `${username}${Number(existing[0].c) + 1}`;
    }

    // Hashear la contraseña con bcrypt (coste 10) antes de persistirla.
    // Nunca se almacena la contraseña en texto plano.
    const hash = await bcrypt.hash(password, 10);

    // Insertar el nuevo usuario en la BD y obtener el id generado automáticamente.
    // Los campos opcionales (dni, email, phone, photo_url) se almacenan como null
    // si no se proporcionan, para mantener la integridad referencial.
    const [result] = await pool.query(
      'INSERT INTO users (username, password_hash, role, full_name, dni, email, phone, photo_url) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
      [username, hash, role, full_name, dni || null, email || null, phone || null, photo_url || null]
    );

    // Notificar a todos los clientes conectados via SSE que la lista de usuarios cambió,
    // para que la tabla en AdminUsuarios se actualice en tiempo real sin recargar.
    broadcast();

    // Devolver el id, username y contraseña en texto plano SOLO en esta respuesta,
    // ya que es la única oportunidad de mostrarla al admin antes de que se hashee.
    res.status(201).json({ id: result[0].id, username, password, role, full_name });
  } catch (err) {
    // Código 23505 = violación de unicidad en PostgreSQL (username duplicado)
    if (err.code === '23505') return res.status(409).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─────────────────────────────────────────────
// PUT /api/users/:id
// Actualiza uno o más campos de un usuario existente.
// Soporta actualización parcial: solo se modifican los campos enviados en el body.
// Solo accesible para el administrador, con restricciones adicionales para
// director y secretaria (no pueden tocarse a sí mismos ni a cuentas admin).
// ─────────────────────────────────────────────
router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    // ── Restricciones de seguridad para roles privilegiados no-admin ─────
    // Director y secretaria tienen permiso 'admin' en la UI pero con limitaciones:
    // no pueden modificar su propia cuenta (evita escalada de privilegios accidental)
    // ni cuentas con rol 'admin' (evita que tomen control del sistema).
    if (req.user.role === 'director' || req.user.role === 'secretaria') {
      // Bloquear auto-modificación comparando el id del token con el id de la ruta
      if (String(req.params.id) === String(req.user.id)) return res.status(403).json({ error: 'No puedes modificar tu propio usuario' });

      // Consultar el rol del usuario destino para bloquear modificaciones a admins
      const [target] = await pool.query('SELECT role FROM users WHERE id=?', [req.params.id]);
      if (target[0]?.role === 'admin') return res.status(403).json({ error: 'No autorizado' });
    }

    // Extraer todos los campos actualizables del cuerpo de la petición
    const { username, password, role, full_name, dni, email, phone, active, photo_url } = req.body;

    // Construir la cláusula SET de forma dinámica para soportar actualizaciones parciales.
    // Solo se incluyen en el UPDATE los campos que fueron enviados en la petición.
    const fields = []; // Lista de fragmentos "campo=?" para el SQL
    const values = []; // Valores correspondientes a cada "?"

    // Agregar cada campo al UPDATE solo si fue enviado en el body (no undefined)
    if (username !== undefined) { fields.push('username=?'); values.push(username); }

    // Si se envía una nueva contraseña, hashearla antes de almacenarla.
    // Se usa `if (password)` (truthy) para ignorar strings vacíos.
    if (password) { fields.push('password_hash=?'); values.push(await bcrypt.hash(password, 10)); }

    if (role !== undefined) { fields.push('role=?'); values.push(role); }
    if (full_name !== undefined) { fields.push('full_name=?'); values.push(full_name); }
    if (dni !== undefined) { fields.push('dni=?'); values.push(dni); }
    if (email !== undefined) { fields.push('email=?'); values.push(email); }
    if (phone !== undefined) { fields.push('phone=?'); values.push(phone); }

    // El campo 'active' requiere actualizar también 'deactivated_at':
    // al desactivar se registra la fecha/hora; al reactivar se borra (null).
    // Esto permite auditar cuándo fue desactivado un usuario.
    if (active !== undefined) {
      fields.push('active=?'); values.push(active);
      fields.push('deactivated_at=?'); values.push(active ? null : new Date());
    }

    if (photo_url !== undefined) { fields.push('photo_url=?'); values.push(photo_url); }

    // Si no se envió ningún campo, devolver error 400 para evitar un UPDATE vacío
    if (fields.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

    // El id del usuario a modificar va al final como parámetro del WHERE
    values.push(req.params.id);

    // Ejecutar el UPDATE dinámico con todos los campos acumulados
    await pool.query(`UPDATE users SET ${fields.join(',')} WHERE id=?`, values);

    // Notificar a los clientes SSE conectados para refrescar la lista de usuarios
    broadcast();

    res.json({ message: 'Usuario actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/users/:id
// Elimina permanentemente un usuario del sistema.
// Antes de eliminar el usuario, borra sus tokens de notificaciones push
// para evitar registros huérfanos en la tabla push_tokens.
// Solo accesible para el administrador, con las mismas restricciones que el PUT.
// ─────────────────────────────────────────────
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    // ── Restricciones de seguridad para roles privilegiados no-admin ─────
    // Misma lógica que en PUT: director y secretaria no pueden eliminarse
    // a sí mismos ni eliminar cuentas con rol 'admin'.
    if (req.user.role === 'director' || req.user.role === 'secretaria') {
      // Prevenir auto-eliminación del usuario autenticado
      if (String(req.params.id) === String(req.user.id)) return res.status(403).json({ error: 'No puedes eliminar tu propio usuario' });

      // Consultar el rol del usuario objetivo para proteger cuentas de admin
      const [target] = await pool.query('SELECT role FROM users WHERE id=?', [req.params.id]);
      if (target[0]?.role === 'admin') return res.status(403).json({ error: 'No autorizado' });
    }

    // Eliminar primero los tokens de push notifications del usuario.
    // Es necesario hacerlo antes de borrar el usuario para respetar la
    // restricción de clave foránea push_tokens.user_id → users.id.
    await pool.query('DELETE FROM push_tokens WHERE user_id=?', [req.params.id]);

    // Eliminar el registro del usuario de la tabla principal
    await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);

    // Notificar a los clientes SSE para que actualicen la tabla en tiempo real
    broadcast();

    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
