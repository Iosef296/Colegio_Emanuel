// ============================================================
// Rutas de Alumnos — /api/students
// Gestiona el CRUD de alumnos, creación automática de cuentas
// de padre, generación de pagos mensuales y notificaciones
// vía WhatsApp cuando se vincula un número de celular.
// ============================================================

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { sendWhatsApp } from '../utils/whatsapp.js';
import { broadcast } from '../utils/sse.js';

// Router principal; todas las rutas heredan el middleware de autenticación.
const router = Router();
router.use(authenticateToken);

// Meses del año escolar del Colegio Emanuel (Marzo–Diciembre).
// Se usa para generar las cuotas al momento de matricular un alumno.
const SCHOOL_MONTHS = ['Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ------------------------------------------------------------
// generatePayments(studentId, year, amount)
// Crea un registro de pago (mensualidad) por cada mes escolar
// para el alumno dado. Si el registro ya existe (código 23505 =
// violación de unicidad en PG), simplemente se ignora para
// permitir llamadas idempotentes (doble matrícula, regeneración).
// El monto por defecto es S/. 350 si no se especifica otro.
// ------------------------------------------------------------
async function generatePayments(studentId, year, amount = 350) {
  for (const month of SCHOOL_MONTHS) {
    try {
      await pool.query(
        'INSERT INTO payments (student_id, month, year, amount, paid) VALUES (?,?,?,?,?)',
        [studentId, month, year, amount, false]
      );
    } catch (err) {
      // Error 23505 = unique_violation: el pago ya existía, se omite sin lanzar.
      if (err.code !== '23505') throw err; // ignore duplicates
    }
  }
}

// ------------------------------------------------------------
// GET /api/students
// Devuelve la lista de alumnos filtrada según el rol del usuario:
//   - padre    → solo sus hijos vinculados en parent_student
//   - docente  → alumnos de los grados donde dicta cursos
//   - admin/otros → todos los alumnos con datos del apoderado
// ------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    let query, params;

    if (req.user.role === 'padre') {
      // El padre solo puede ver a sus propios hijos vinculados.
      query = `SELECT s.*, gl.name as grade_name, gl.section
        FROM students s
        JOIN grade_levels gl ON s.grade_level_id = gl.id
        JOIN parent_student ps ON ps.student_id = s.id
        WHERE ps.parent_id = ? AND s.active = true`;
      params = [req.user.id];
    } else if (req.user.role === 'docente') {
      // El docente ve los alumnos de todos los grados que le fueron asignados
      // mediante teacher_courses. DISTINCT evita duplicados cuando dicta
      // varios cursos en el mismo grado.
      query = `SELECT DISTINCT s.*, gl.name as grade_name, gl.section
        FROM students s
        JOIN grade_levels gl ON s.grade_level_id = gl.id
        JOIN teacher_courses tc ON tc.grade_level_id = s.grade_level_id
        WHERE tc.teacher_id = ? AND s.active = true`;
      params = [req.user.id];
    } else {
      // Admin y roles privilegiados: lista completa con datos del apoderado.
      // LEFT JOIN porque puede haber alumnos sin apoderado registrado.
      // Ordenado por estado activo primero, luego alfabéticamente por apellido.
      query = `SELECT s.*, gl.name as grade_name, gl.section, u.username, u.phone as parent_phone, u.id as parent_id
        FROM students s
        JOIN grade_levels gl ON s.grade_level_id = gl.id
        LEFT JOIN parent_student ps ON ps.student_id = s.id
        LEFT JOIN users u ON u.id = ps.parent_id AND u.active = true
        ORDER BY s.active DESC, s.last_name, s.first_name`;
      params = [];
    }

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// POST /api/students
// Crea un nuevo alumno. Solo el rol 'admin' puede hacerlo.
// Flujo completo:
//   1. Inserta el alumno en la tabla students.
//   2. Genera el código único EMN-AÑO-NNNN.
//   3. Crea automáticamente una cuenta de usuario con rol 'padre'.
//   4. Vincula el apoderado al alumno en parent_student.
//   5. Genera las mensualidades del año escolar en curso.
//   6. Si se proporcionó teléfono, envía mensaje WhatsApp de bienvenida.
// ------------------------------------------------------------
router.post('/', authorizeRoles('admin'), async (req, res) => {
  try {
    const { first_name, last_name, dni, birth_date, grade_level_id, monthly_fee, photo_url } = req.body;

    // Paso 1: Insertar alumno y obtener el ID generado por la DB.
    const [result] = await pool.query(
      'INSERT INTO students (first_name, last_name, dni, birth_date, grade_level_id, photo_url) VALUES (?,?,?,?,?,?) RETURNING id',
      [first_name, last_name, dni, birth_date, grade_level_id, photo_url || null]
    );
    const id = result[0].id;

    // Paso 2: Construir y guardar el código institucional del alumno.
    // Formato: EMN-2025-0001 (4 dígitos con ceros a la izquierda).
    const year = new Date().getFullYear();
    const codigo = `EMN-${year}-${String(id).padStart(4, '0')}`;
    await pool.query('UPDATE students SET codigo=? WHERE id=?', [codigo, id]);

    // Paso 3: Derivar nombre de usuario a partir del nombre y apellido del alumno,
    // normalizando tildes (NFD + eliminación de diacríticos) y pasando a minúsculas.
    // Esto crea credenciales predecibles para el apoderado (ej: juan.perez).
    const firstLastName = last_name.trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const firstFirstName = first_name.trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let username = `${firstFirstName}.${firstLastName}`;

    // Handle duplicate usernames with sequential counter
    // Si ya existe un usuario con ese nombre base, se añade un contador al final
    // para garantizar unicidad (ej: juan.perez2, juan.perez3…).
    const [existing] = await pool.query('SELECT COUNT(*) as c FROM users WHERE username LIKE ? AND active = true', [`${username}%`]);
    if (existing[0].c > 0) username = `${username}${Number(existing[0].c) + 1}`;

    // La contraseña inicial es el DNI del alumno; si no hay DNI se usa alumnoID.
    // Se almacena siempre hasheada con bcrypt (10 rondas de sal).
    const password = dni || `alumno${id}`;
    const hash = await bcrypt.hash(password, 10);
    const { parent_phone } = req.body;

    // Paso 4: Insertar el usuario con rol 'padre' y asociarlo al alumno.
    const [userResult] = await pool.query(
      'INSERT INTO users (username, password_hash, role, full_name, dni, phone) VALUES (?,?,?,?,?,?) RETURNING id',
      [username, hash, 'padre', `${first_name} ${last_name}`, dni || null, parent_phone || null]
    );
    // Vincular apoderado ↔ alumno en la tabla intermedia parent_student.
    await pool.query('INSERT INTO parent_student (parent_id, student_id) VALUES (?,?)', [userResult[0].id, id]);

    // Paso 5: Generar mensualidades del año escolar actual.
    // Si se indica monthly_fee se usa ese monto; de lo contrario se aplica el defecto (S/. 350).
    // Auto-generate school year payments
    await generatePayments(id, year, monthly_fee ? Number(monthly_fee) : 350);

    // Paso 6: Notificar al apoderado por WhatsApp si se registró su celular.
    // Se hace con .catch(() => {}) para no bloquear la respuesta si falla el envío.
    // Notify parent via WhatsApp
    if (parent_phone) {
      sendWhatsApp(parent_phone, `📢 *Colegio Emanuel*\n\nNúmero vinculado a *${first_name} ${last_name}*.\n\n_Enviado por: ${req.user.role === 'director' ? 'Director' : req.user.role === 'secretaria' ? 'Secretaria' : 'Administrador'} ${req.user.full_name}_`).catch(() => {});
    }

    // Notificar a clientes SSE que los datos cambiaron (refresco en tiempo real).
    broadcast();
    // Devolver ID, código, usuario y contraseña en texto plano para que el admin
    // pueda entregarlas al apoderado en ese momento (la única vez que se muestra).
    res.status(201).json({ id, codigo, username, password });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// POST /api/students/generate-payments
// Genera (o regenera) las mensualidades del año en curso para
// TODOS los alumnos activos. Útil al inicio del año escolar.
// Solo admin puede invocarlo. Mensualidades duplicadas se ignoran
// gracias a la lógica idempotente de generatePayments.
// ------------------------------------------------------------
router.post('/generate-payments', authorizeRoles('admin'), async (req, res) => {
  try {
    const year = new Date().getFullYear();
    // Obtener IDs de todos los alumnos activos para iterar.
    const [students] = await pool.query('SELECT id FROM students WHERE active = true');
    for (const s of students) {
      await generatePayments(s.id, year);
    }
    res.json({ message: `Mensualidades generadas para ${students.length} alumnos` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// POST /api/students/:id/codigo
// (Re)genera el código institucional EMN-AÑO-NNNN para un
// alumno específico. Útil si el código se corrompió o nunca
// fue generado para alumnos importados de sistemas anteriores.
// ------------------------------------------------------------
router.post('/:id/codigo', authorizeRoles('admin'), async (req, res) => {
  try {
    const year = new Date().getFullYear();
    // El código se construye con el año actual y el ID del alumno
    // con relleno de ceros hasta 4 dígitos (máx. 9999 alumnos).
    const codigo = `EMN-${year}-${String(req.params.id).padStart(4, '0')}`;
    await pool.query('UPDATE students SET codigo=? WHERE id=?', [codigo, req.params.id]);
    res.json({ codigo });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// PUT /api/students/:id
// Actualiza los datos de un alumno de forma parcial (solo los
// campos presentes en el body se modifican). Solo admin.
// Casos especiales:
//   - active: al desactivar un alumno, también se desactiva su
//     cuenta de apoderado y se registra la fecha de baja.
//   - monthly_fee: actualiza solo las cuotas aún no pagadas
//     para no alterar el historial de pagos anteriores.
//   - parent_phone: actualiza el teléfono del apoderado y envía
//     WhatsApp de confirmación si el número es válido.
// ------------------------------------------------------------
router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const { first_name, last_name, dni, birth_date, grade_level_id, active, monthly_fee, photo_url, parent_phone } = req.body;

    // Construcción dinámica del SET de la consulta UPDATE:
    // solo se incluyen los campos que llegaron en el request body.
    const fields = [];
    const values = [];

    if (first_name !== undefined) { fields.push('first_name=?'); values.push(first_name); }
    if (last_name !== undefined) { fields.push('last_name=?'); values.push(last_name); }
    if (dni !== undefined) { fields.push('dni=?'); values.push(dni); }
    if (birth_date !== undefined) { fields.push('birth_date=?'); values.push(birth_date); }
    if (grade_level_id !== undefined) { fields.push('grade_level_id=?'); values.push(grade_level_id); }

    if (active !== undefined) {
      fields.push('active=?'); values.push(active);
      // Registrar la fecha de baja solo al desactivar; al reactivar se limpia.
      fields.push('deactivated_at=?'); values.push(active ? null : new Date());

      // Sync parent user account active status
      // Sincronizar el estado del usuario apoderado para que no pueda
      // iniciar sesión mientras el alumno está inactivo (baja o egreso).
      const deactivatedAt = active ? null : new Date();
      await pool.query(
        'UPDATE users SET active=?, deactivated_at=? WHERE id IN (SELECT parent_id FROM parent_student WHERE student_id=?)',
        [active, deactivatedAt, req.params.id]
      );
    }

    if (photo_url !== undefined) { fields.push('photo_url=?'); values.push(photo_url || null); }

    // Validar que se enviaron campos válidos para actualizar.
    if (fields.length === 0 && monthly_fee === undefined) return res.status(400).json({ error: 'Sin campos' });

    // Ejecutar el UPDATE del alumno solo si hay campos de la tabla students que cambiar.
    if (fields.length > 0) {
      values.push(req.params.id); // Parámetro WHERE id=?
      await pool.query(`UPDATE students SET ${fields.join(',')} WHERE id=?`, values);
    }

    // Actualizar el monto de las cuotas NO pagadas.
    // Las cuotas ya pagadas conservan el monto original (integridad de comprobantes).
    if (monthly_fee !== undefined) {
      await pool.query('UPDATE payments SET amount=? WHERE student_id=? AND paid=false', [Number(monthly_fee), req.params.id]);
    }

    // Actualizar el teléfono del apoderado y notificar si cambió.
    if (parent_phone !== undefined) {
      await pool.query(
        `UPDATE users SET phone=? WHERE id IN (SELECT parent_id FROM parent_student WHERE student_id=?)`,
        [parent_phone || null, req.params.id]
      );
      // Notify new phone via WhatsApp
      // Enviar confirmación al nuevo número para que el apoderado sepa que quedó vinculado.
      if (parent_phone) {
        const [stu] = await pool.query('SELECT first_name, last_name FROM students WHERE id=?', [req.params.id]);
        if (stu.length) {
          sendWhatsApp(parent_phone, `📢 *Colegio Emanuel*\n\nNúmero vinculado a *${stu[0].first_name} ${stu[0].last_name}*.\n\n_Enviado por: ${req.user.role === 'director' ? 'Director' : req.user.role === 'secretaria' ? 'Secretaria' : 'Administrador'} ${req.user.full_name}_`).catch(() => {});
        }
      }
    }

    // Avisar a los clientes SSE del cambio para refrescar listas en tiempo real.
    broadcast();
    res.json({ message: 'Alumno actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ------------------------------------------------------------
// DELETE /api/students/:id
// Elimina permanentemente un alumno y toda su información
// asociada. Solo admin. El borrado sigue este orden para
// respetar las restricciones de clave foránea en PostgreSQL:
//   1. Asistencias del alumno.
//   2. Calificaciones del alumno.
//   3. Pagos del alumno.
//   4. Relación apoderado–alumno.
//   5. Registro del alumno.
//   6. Cuentas de apoderado que ya no tienen otros hijos
//      (incluyendo sus tokens de notificación push).
// Se usa pool._pool.query con $N para consultas sin la capa
// de conversión automática de ? → $N (operaciones de verificación).
// ------------------------------------------------------------
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const id = req.params.id;

    // Grab parent IDs before deleting anything
    // Obtener los apoderados vinculados ANTES de borrar parent_student,
    // porque después no existirá la relación para consultarla.
    const parentResult = await pool._pool.query(
      `SELECT parent_id FROM parent_student WHERE student_id=$1`, [id]
    );
    const parentIds = parentResult.rows.map(r => r.parent_id);

    // Delete student data
    // Eliminar en cascada los registros dependientes del alumno.
    await pool.query('DELETE FROM attendance WHERE student_id=?', [id]);
    await pool.query('DELETE FROM grades WHERE student_id=?', [id]);
    await pool.query('DELETE FROM payments WHERE student_id=?', [id]);
    await pool.query('DELETE FROM parent_student WHERE student_id=?', [id]);
    await pool.query('DELETE FROM students WHERE id=?', [id]);

    // Delete parent users that have no other children
    // Verificar cada apoderado: si quedó sin otros hijos vinculados,
    // se elimina también su cuenta de usuario y sus tokens push,
    // ya que no tendría razón de seguir en el sistema.
    for (const parentId of parentIds) {
      const { rows } = await pool._pool.query(
        `SELECT 1 FROM parent_student WHERE parent_id=$1 LIMIT 1`, [parentId]
      );
      if (!rows.length) {
        // El apoderado no tiene más hijos → eliminar tokens push y luego el usuario.
        await pool.query('DELETE FROM push_tokens WHERE user_id=?', [parentId]);
        await pool.query('DELETE FROM users WHERE id=?', [parentId]);
      }
    }

    // Notificar a clientes SSE para que refresquen la lista de alumnos.
    broadcast();
    res.json({ message: 'Alumno eliminado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
