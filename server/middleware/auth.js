// ============================================================
// Middlewares de autenticación y autorización basados en JWT.
// Todos los endpoints protegidos de la API pasan por aquí
// antes de llegar al handler de la ruta correspondiente.
// ============================================================

import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

/**
 * authenticateToken — middleware de autenticación via JWT Bearer.
 *
 * Flujo:
 *  1. Extrae el token del header Authorization (formato: "Bearer <token>").
 *  2. Si no hay token, rechaza con 401.
 *  3. Verifica la firma y expiración del token con JWT_SECRET.
 *  4. Consulta la BD para confirmar que el usuario sigue activo
 *     (permite invalidar sesiones al desactivar un usuario sin revocar el token).
 *  5. Adjunta el payload decodificado a req.user para que los handlers
 *     puedan acceder a id, role, etc.
 *  6. Llama a next() para continuar la cadena de middlewares/rutas.
 *
 * Errores posibles:
 *  — 401 Token requerido: no se envió el header Authorization.
 *  — 401 Sesión cerrada: el usuario fue desactivado en la BD.
 *  — 403 Token inválido: firma incorrecta o token expirado.
 *  — 500 Error del servidor: error inesperado en la consulta a BD o JWT.
 */
export async function authenticateToken(req, res, next) {
  // Lee el header Authorization; puede estar ausente si la petición no lo envía
  const authHeader = req.headers['authorization'];

  // Extrae solo el token (segunda parte del string "Bearer <token>")
  const token = authHeader && authHeader.split(' ')[1];

  // Si no existe token, la petición no está autenticada — rechaza inmediatamente
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  try {
    // Verifica la firma y vigencia del JWT usando el secreto compartido del servidor
    const user = jwt.verify(token, process.env.JWT_SECRET);

    // Aunque el token sea válido criptográficamente, verifica que el usuario
    // no haya sido desactivado en la BD después de que el token fue emitido.
    // Esto permite al admin "revocar" acceso sin esperar a que expire el JWT.
    const [rows] = await pool.query('SELECT active FROM users WHERE id=?', [user.id]);
    if (!rows.length || !rows[0].active) {
      // El usuario no existe o fue dado de baja — la sesión ya no es válida
      return res.status(401).json({ error: 'Sesión cerrada' });
    }

    // Adjunta el payload del JWT a la petición para uso posterior en los handlers
    req.user = user;

    // Continúa con el siguiente middleware o handler de la ruta
    next();
  } catch (err) {
    // Errores específicos de JWT: firma inválida o token expirado
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token inválido' });
    }
    // Cualquier otro error (p. ej. fallo en la consulta a BD)
    return res.status(500).json({ error: 'Error del servidor' });
  }
}

/**
 * authorizeRoles — fábrica de middlewares de autorización por rol.
 *
 * Recibe una lista de roles permitidos y devuelve un middleware que
 * comprueba si el usuario autenticado (req.user.role) tiene permiso.
 *
 * Normalización de roles:
 *  - 'director' y 'secretaria' se tratan como 'admin' para simplificar
 *    las comprobaciones en las rutas (no hay que listar tres roles en cada
 *    llamada a authorizeRoles — basta con pasar 'admin').
 *
 * Ejemplo de uso:
 *   router.get('/ruta', authenticateToken, authorizeRoles('admin', 'docente'), handler)
 *
 * @param {...string} roles — roles que tienen acceso al endpoint
 * @returns middleware Express
 */
export function authorizeRoles(...roles) {
  return (req, res, next) => {
    // Normaliza director/secretaria a 'admin' para unificar la lógica de permisos
    const effectiveRole = (req.user.role === 'director' || req.user.role === 'secretaria') ? 'admin' : req.user.role;

    // Si el rol efectivo del usuario no está en la lista permitida, deniega el acceso
    if (!roles.includes(effectiveRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // El rol es válido — continúa con el handler de la ruta
    next();
  };
}
