/**
 * routes/communications.js
 * Gestión de comunicados escolares: creación, lectura, edición y eliminación.
 * Cada rol (admin/auxiliar/docente/padre) tiene acceso y permisos distintos.
 * Al crear un comunicado se disparan notificaciones push (FCM + Web Push)
 * y mensajes de WhatsApp a los padres correspondientes.
 */

import { Router } from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { broadcast } from '../utils/sse.js';
import { getParentIdsForStudent, getTokensForUsers, sendToTokens } from '../utils/fcm.js';
import { getWebSubscriptionsForUsers, sendWebPush } from '../utils/webpush.js';
import { sendWhatsApp } from '../utils/whatsapp.js';

const router = Router();

// Protege todas las rutas de este módulo: el usuario debe tener JWT válido.
router.use(authenticateToken);

/**
 * GET /communications
 * Devuelve la lista de comunicados que el usuario autenticado tiene derecho a ver.
 * La consulta JOIN incluye datos del autor, el curso y el grado, además de
 * un subquery para obtener los nombres de alumnos vinculados al comunicado.
 *
 * Filtros por rol:
 *  - padre   → solo ve comunicados generales, los de su grado o los dirigidos a sus hijos.
 *  - docente → ve sus propios comunicados + los de tipo 'general' o 'grado'.
 *  - auxiliar → ve todos los comunicados sin restricción adicional.
 */
router.get('/', async (req, res) => {
  try {
    // Consulta base: trae metadatos del comunicado, autor, curso y grado.
    // El subquery STRING_AGG construye una cadena con los apellidos y nombres de
    // los alumnos indicados en student_ids (columna JSONB).
    // El subquery JSON_AGG construye un array de objetos {id, name} para el
    // mismo conjunto de alumnos, útil en el frontend para mostrar chips.
    let query = `SELECT co.id, co.author_id, co.title, co.body, co.type, co.attachments, co.student_ids, co.created_at,
      u.full_name as author_name, u.role as author_role,
      c.name as course_name, c.color as course_color, gl.name as grade_name,
      (SELECT STRING_AGG(s.last_name || ' ' || s.first_name, ', ' ORDER BY s.last_name, s.first_name)
       FROM students s WHERE co.student_ids IS NOT NULL
         AND s.id::text IN (SELECT jsonb_array_elements_text(co.student_ids::jsonb))) as student_names,
      (SELECT JSON_AGG(JSON_BUILD_OBJECT('id', s.id, 'name', s.last_name || ' ' || s.first_name) ORDER BY s.last_name, s.first_name)
       FROM students s WHERE co.student_ids IS NOT NULL
         AND s.id::text IN (SELECT jsonb_array_elements_text(co.student_ids::jsonb))) as students_list
      FROM communications co
      JOIN users u ON co.author_id = u.id
      LEFT JOIN courses c ON co.course_id = c.id
      LEFT JOIN grade_levels gl ON co.grade_level_id = gl.id
      WHERE 1=1`;
    const params = [];

    if (req.user.role === 'padre') {
      // El padre solo recibe:
      //   1. Comunicados de tipo 'general' (para toda la escuela).
      //   2. Comunicados dirigidos al grado en que están matriculados sus hijos.
      //   3. Comunicados dirigidos explícitamente a uno de sus hijos (student_ids contiene el id del alumno).
      query += ` AND (
        co.type='general'
        OR co.grade_level_id IN (SELECT s.grade_level_id FROM students s JOIN parent_student ps ON ps.student_id=s.id WHERE ps.parent_id=?)
        OR (co.student_ids IS NOT NULL AND EXISTS (
          SELECT 1 FROM students s2 JOIN parent_student ps2 ON ps2.student_id=s2.id
          WHERE ps2.parent_id=? AND co.student_ids::jsonb @> jsonb_build_array(s2.id)
        ))
      )`;
      // El id del padre se usa dos veces: una para el filtro de grado y otra para el filtro de alumno.
      params.push(req.user.id, req.user.id);
    } else if (req.user.role === 'docente') {
      // El docente ve sus propios comunicados (author_id) y todos los de tipo
      // 'general' o 'grado' emitidos por dirección/auxiliar.
      query += ` AND (co.author_id=? OR co.type='general' OR co.type='grado')`;
      params.push(req.user.id);
    } else if (req.user.role === 'auxiliar') {
      // El auxiliar no tiene restricción adicional: ve absolutamente todo.
      // (El bloque queda vacío a propósito.)
    }

    // Ordena por fecha de creación descendente y pagina (50 por página)
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;
    query += ' ORDER BY co.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * POST /communications
 * Crea un nuevo comunicado y envía notificaciones push + WhatsApp a los padres.
 * Solo pueden crear comunicados los roles: docente, admin y auxiliar.
 *
 * Restricciones de tipo según rol:
 *  - docente  → solo 'curso' o 'alumno'.
 *  - auxiliar → solo 'general' o 'grado'.
 *  - admin    → cualquier tipo excepto 'curso'.
 *
 * Flujo asíncrono post-respuesta:
 *  1. Determinar qué padres reciben la notificación (según student_ids / grade / todos).
 *  2. Obtener nombre del curso y del grado para personalizar el mensaje.
 *  3. Enviar Web Push (si VAPID configurado) y FCM (si Firebase configurado).
 *  4. Enviar mensaje de WhatsApp a cada padre con teléfono registrado.
 */
router.post('/', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    const { course_id, grade_level_id, title, body, type, attachments, student_ids } = req.body;

    // Validación de permisos por tipo de comunicado según el rol del emisor.
    if (req.user.role === 'docente' && type !== 'curso' && type !== 'alumno')
      return res.status(400).json({ error: 'El docente solo puede enviar comunicados por curso o a alumnos específicos' });
    if (req.user.role === 'auxiliar' && type !== 'general' && type !== 'grado')
      return res.status(400).json({ error: 'El auxiliar solo puede enviar comunicados generales o por grado' });
    if (req.user.role === 'admin' && type === 'curso')
      return res.status(400).json({ error: 'El director no puede enviar comunicados por curso' });

    // Serializar arrays a JSON para almacenamiento en columnas TEXT/JSONB.
    // Si el array está vacío o no existe se guarda NULL para no contaminar la DB.
    const attachmentsJson = attachments?.length ? JSON.stringify(attachments) : null;
    const studentIdsJson = student_ids?.length ? JSON.stringify(student_ids) : null;

    // Insertar el comunicado en la base de datos y recuperar el id generado.
    const [result] = await pool.query(
      'INSERT INTO communications (author_id, course_id, grade_level_id, title, body, type, attachments, student_ids) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
      [req.user.id, course_id || null, grade_level_id || null, title, body || '', type || 'general', attachmentsJson, studentIdsJson]
    );

    // Notificar a los clientes conectados vía SSE para actualización en tiempo real.
    broadcast();

    // Responder de inmediato al cliente sin esperar el envío de notificaciones,
    // ya que push/WhatsApp pueden tardar varios segundos.
    res.status(201).json({ id: result[0].id });

    // ── Bloque de notificaciones asíncrono ────────────────────────────────────
    // Se ejecuta en paralelo con Promise.all para obtener simultáneamente:
    //   [0] parentIds   → IDs de los padres que deben recibir la notificación.
    //   [1] courseName  → Nombre del curso (si aplica), para el cuerpo del mensaje.
    //   [2] gradeName   → Nombre del grado (si aplica), para el cuerpo del mensaje.
    //   [3] studentNames → Nombres de los alumnos (si aplica), para personalización.
    Promise.all([
      // [0] Resolver la lista de padres destinatarios según el alcance del comunicado.
      student_ids?.length
        // Si el comunicado es para alumnos específicos, obtener los padres de cada uno.
        ? Promise.all(student_ids.map(sid => getParentIdsForStudent(sid))).then(n => [...new Set(n.flat())])
        : grade_level_id
          // Si es por grado, obtener los padres de alumnos activos del grado.
          // La condición OR incluye tanto alumnos asignados directamente (grade_level_id)
          // como alumnos miembros del grupo (group_members), para cubrir los círculos de estudio.
          ? pool._pool.query(
              `SELECT DISTINCT ps.parent_id FROM parent_student ps
               JOIN students s ON s.id = ps.student_id
               WHERE s.active = true AND (
                 s.grade_level_id = $1
                 OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = $1 AND gm.student_id = s.id)
               )`,
              [grade_level_id]
            ).then(r => r.rows.map(row => row.parent_id))
          // Si es general (toda la escuela), notificar a todos los padres vinculados.
          : pool._pool.query(`SELECT DISTINCT parent_id FROM parent_student`)
              .then(r => r.rows.map(row => row.parent_id)),

      // [1] Nombre del curso para el mensaje (puede ser null si el comunicado es general/grado).
      course_id
        ? pool._pool.query('SELECT name FROM courses WHERE id=$1', [course_id]).then(r => r.rows[0]?.name || null)
        : Promise.resolve(null),

      // [2] Nombre del grado para el mensaje (puede ser null).
      grade_level_id
        ? pool._pool.query('SELECT name FROM grade_levels WHERE id=$1', [grade_level_id]).then(r => r.rows[0]?.name || null)
        : Promise.resolve(null),

      // [3] Nombres de los alumnos destinatarios separados por coma (puede ser null).
      student_ids?.length
        ? pool._pool.query(
            `SELECT first_name || ' ' || last_name AS name FROM students WHERE id = ANY($1)`,
            [student_ids]
          ).then(r => r.rows.map(s => s.name).join(', '))
        : Promise.resolve(null),

      // [4] IDs de docentes destinatarios: solo para comms general/grado del director/secretaria/auxiliar.
      // general → todos los docentes activos; grado → docentes que dictan en ese grado.
      (type === 'general' || type === 'grado') && (req.user.role === 'director' || req.user.role === 'secretaria' || req.user.role === 'auxiliar' || req.user.role === 'admin')
        ? grade_level_id
          ? pool._pool.query(
              `SELECT DISTINCT teacher_id AS id FROM teacher_courses WHERE grade_level_id=$1`,
              [grade_level_id]
            ).then(r => r.rows.map(row => row.id))
          : pool._pool.query(`SELECT id FROM users WHERE role='docente'`)
              .then(r => r.rows.map(row => row.id))
        : Promise.resolve([]),
    ]).then(([parentIds, courseName, gradeName, studentNames, docenteIds]) => {
      // Si no hay destinatarios en absoluto, no se envía nada.
      if (!parentIds.length && !docenteIds.length) return;

      // Etiqueta legible del rol del emisor para mostrar al pie del mensaje.
      const roleLabel = req.user.role === 'auxiliar' ? 'Auxiliar' : req.user.role === 'docente' ? 'Docente' : req.user.role === 'director' ? 'Director' : req.user.role === 'secretaria' ? 'Secretaria' : 'Administrador del Sistema';

      // Construir el bloque de contexto (alumno / área / grado) que se añade al mensaje.
      // El orden de prioridad es: alumno específico > curso > grado.
      let context = '';
      if (studentNames) {
        context = `\n👤 Alumno: ${studentNames}`;
        if (courseName) context += `\n📚 Área: ${courseName}`;
        if (gradeName) context += `\n🏫 Grado: ${gradeName}`;
      } else if (courseName) {
        context = `\n📚 Área: ${courseName}`;
        if (gradeName) context += `\n🏫 Grado: ${gradeName}`;
      } else if (gradeName) {
        context = `\n🏫 Grado: ${gradeName}`;
      }

      // El admin/director no repite su nombre porque el rol ya lo identifica.
      const sender = req.user.role === 'admin' ? roleLabel : `${roleLabel} ${req.user.full_name}`;

      // Objeto de notificación estándar para push (título + cuerpo breve).
      const notification = { title: 'Nuevo comunicado', body: title };
      // Datos adicionales: `tab` indica a qué pestaña de /padre/comunicados navegar.
      // Dirección (general/grado) → tab "comunicados"; curso/alumno/tarea → tab "avisos".
      const isDirectionComm = type === 'general' || type === 'grado';
      const notifData = { type: 'communication', tab: isDirectionComm ? 'comunicados' : 'avisos' };

      // Enviar Web Push solo si las claves VAPID están configuradas en el servidor.
      if (process.env.VAPID_PRIVATE_KEY) {
        const allWebIds = [...new Set([...parentIds, ...docenteIds])];
        getWebSubscriptionsForUsers(allWebIds)
          .then(subs => sendWebPush(subs, notification, notifData))
          .catch(err => console.error('Push communication web:', err.message));
      }

      // Enviar notificación FCM (Android/iOS) solo si Firebase está configurado.
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const allFcmIds = [...new Set([...parentIds, ...docenteIds])];
        getTokensForUsers(allFcmIds)
          .then(tokens => sendToTokens(tokens, notification, notifData))
          .catch(err => console.error('Push communication FCM:', err.message));
      }

      // ── WhatsApp ──────────────────────────────────────────────────────────
      // Componer el mensaje de WhatsApp con formato Markdown de Baileys:
      //   *texto* → negrita, _texto_ → cursiva.
      const waMsg = `📢 *Colegio Emanuel*\n\n*${title}*${body ? '\n\n' + body : ''}${context}\n\n_Enviado por: ${sender}_`;

      // Ventana de distribución según el tipo de comunicado para evitar ráfagas:
      //   general  → 30 min (muchos destinatarios, mayor riesgo de ban)
      //   grado    → 10 min
      //   curso    → 10 min
      //   alumno   → inmediato (un solo padre, sin riesgo)
      const waWindowMs = type === 'general' ? 30 * 60 * 1000
                       : (type === 'grado' || type === 'curso') ? 10 * 60 * 1000
                       : 0;

      // Consultar los teléfonos de los padres destinatarios y distribuir los envíos
      // uniformemente dentro de la ventana con jitter de ±15 s para evitar patrones exactos.
      pool._pool.query(
        `SELECT phone FROM users WHERE id = ANY($1) AND phone IS NOT NULL AND phone <> ''`,
        [parentIds]
      ).then(r => {
        const phones = r.rows.map(row => row.phone);
        if (!phones.length) return;
        const spacing = phones.length > 1 && waWindowMs > 0 ? waWindowMs / (phones.length - 1) : 0;
        phones.forEach((phone, i) => {
          const jitter = (Math.random() - 0.5) * 30000; // ±15 s
          const delay = Math.max(0, Math.round(i * spacing + jitter));
          setTimeout(
            () => sendWhatsApp(phone, waMsg).catch(e => console.error('WA comunicado:', e.message)),
            delay
          );
        });
      }).catch(() => {});
    }).catch(err => console.error('Notif communication error:', err.message));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * PUT /communications/:id
 * Actualiza el título, cuerpo y/o adjuntos de un comunicado existente.
 * Solo pueden editar el comunicado su propio autor (docente/auxiliar)
 * o un admin (que puede editar cualquiera sin restricción de autoría).
 *
 * Si 'attachments' no viene en el body (undefined), se omite la columna
 * del UPDATE para no sobrescribir adjuntos existentes accidentalmente.
 */
router.put('/:id', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    const { title, body, attachments } = req.body;

    // Convertir el array de adjuntos a JSON solo si viene en el cuerpo del request.
    // Si es undefined no se toca la columna; si es un array vacío se guarda NULL.
    const attachmentsJson = attachments !== undefined
      ? (attachments?.length ? JSON.stringify(attachments) : null)
      : undefined;

    if (req.user.role === 'docente' || req.user.role === 'auxiliar') {
      // Docente y auxiliar solo pueden editar sus propios comunicados (AND author_id=?).
      if (attachmentsJson !== undefined) {
        // Incluir adjuntos en el UPDATE cuando se enviaron explícitamente.
        await pool.query('UPDATE communications SET title=?, body=?, attachments=? WHERE id=? AND author_id=?', [title, body, attachmentsJson, req.params.id, req.user.id]);
      } else {
        // Sin adjuntos: actualizar solo título y cuerpo.
        await pool.query('UPDATE communications SET title=?, body=? WHERE id=? AND author_id=?', [title, body, req.params.id, req.user.id]);
      }
    } else {
      // Admin puede editar cualquier comunicado, sin verificar autoría.
      if (attachmentsJson !== undefined) {
        await pool.query('UPDATE communications SET title=?, body=?, attachments=? WHERE id=?', [title, body, attachmentsJson, req.params.id]);
      } else {
        await pool.query('UPDATE communications SET title=?, body=? WHERE id=?', [title, body, req.params.id]);
      }
    }

    // Notificar a los clientes SSE para que recarguen la lista de comunicados.
    broadcast();
    res.json({ message: 'Comunicado actualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/**
 * DELETE /communications/:id
 * Elimina un comunicado de la base de datos.
 * Docente y auxiliar solo pueden borrar sus propios comunicados.
 * El admin puede borrar cualquier comunicado sin restricción de autoría.
 * Tras eliminar se emite un broadcast SSE para que los clientes actualicen la vista.
 */
router.delete('/:id', authorizeRoles('docente', 'admin', 'auxiliar'), async (req, res) => {
  try {
    if (req.user.role === 'docente' || req.user.role === 'auxiliar') {
      // El filtro AND author_id=? impide que un usuario elimine comunicados ajenos.
      await pool.query('DELETE FROM communications WHERE id=? AND author_id=?', [req.params.id, req.user.id]);
    } else {
      // Admin elimina sin restricción de autoría.
      await pool.query('DELETE FROM communications WHERE id=?', [req.params.id]);
    }
    // Notificar a los clientes SSE para refrescar la lista.
    broadcast();
    res.json({ message: 'Comunicado eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
