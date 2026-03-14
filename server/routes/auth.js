// Rutas de autenticación: login y consulta del usuario autenticado actual.
// Usa bcryptjs para verificar contraseñas y jsonwebtoken para emitir tokens JWT.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

// Instancia del enrutador de Express para agrupar las rutas de autenticación
const router = Router();

// ─────────────────────────────────────────────
// POST /api/auth/login
// Verifica las credenciales del usuario y devuelve un token JWT si son válidas.
// También adjunta la foto del primer hijo (si el usuario es padre) para mostrarla en la UI.
// ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    // Extraer usuario y contraseña del cuerpo de la petición
    const { username, password } = req.body;

    // Validar que ambos campos estén presentes; sin ellos no se puede autenticar
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    // Buscar al usuario en la base de datos por nombre de usuario.
    // Se recuperan solo los campos necesarios para la autenticación y generación del token.
    const [rows] = await pool.query(
      'SELECT id, username, password_hash, role, full_name, active FROM users WHERE username = ?',
      [username]
    );

    // Si no existe ningún usuario con ese nombre, rechazar con 401
    if (rows.length === 0) {
      return res.status(401).json({ error: 'El usuario no existe' });
    }

    const user = rows[0];

    // Verificar que la cuenta esté activa.
    // Las cuentas desactivadas por el administrador no pueden iniciar sesión.
    if (!user.active) {
      return res.status(403).json({ error: 'Usuario desactivado. Acérquese a Dirección.' });
    }

    // Comparar la contraseña en texto plano con el hash almacenado usando bcrypt.
    // bcrypt.compare es asíncrono y resistente a ataques de temporización.
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Generar un token JWT que caduca en 24 horas.
    // El payload incluye id, username, rol y nombre completo para que el frontend
    // pueda personalizar la UI sin consultar la BD en cada petición.
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Para los padres de familia, recuperar la foto del primer hijo asociado
    // que tenga foto disponible. Esto permite mostrar el avatar del alumno
    // en el encabezado del panel del padre sin una petición adicional.
    let photo_url = null;
    if (user.role === 'padre') {
      const [photos] = await pool.query(
        'SELECT s.photo_url FROM students s JOIN parent_student ps ON ps.student_id = s.id WHERE ps.parent_id = ? AND s.photo_url IS NOT NULL LIMIT 1',
        [user.id]
      );
      // Si el alumno tiene foto registrada, usarla; de lo contrario queda null
      if (photos.length > 0) photo_url = photos[0].photo_url;
    }

    // Devolver el token y los datos básicos del usuario al cliente.
    // El cliente almacenará el token en localStorage/sessionStorage para
    // incluirlo en el header Authorization de las siguientes peticiones.
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, photo_url }
    });
  } catch (err) {
    // Registrar el error completo en consola para diagnóstico en producción
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─────────────────────────────────────────────
// GET /api/auth/me
// Devuelve el perfil completo del usuario autenticado según el token JWT.
// Requiere el header Authorization: Bearer <token> (verificado por authenticateToken).
// Se usa para refrescar los datos del usuario en sesión sin hacer un nuevo login.
// ─────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Obtener los datos actualizados del usuario desde la BD usando el id
    // que viene decodificado del token por el middleware authenticateToken.
    // Se excluye password_hash por seguridad.
    const [rows] = await pool.query(
      'SELECT id, username, role, full_name, dni, email, phone FROM users WHERE id = ?',
      [req.user.id]
    );

    // Si el usuario fue eliminado después de emitir el token, responder con 404
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const userData = rows[0];

    // Al igual que en el login, adjuntar la foto del primer alumno
    // asociado cuando el usuario tiene rol de padre.
    // Esto permite que el frontend actualice el avatar sin login adicional.
    if (userData.role === 'padre') {
      const [photos] = await pool.query(
        'SELECT s.photo_url FROM students s JOIN parent_student ps ON ps.student_id = s.id WHERE ps.parent_id = ? AND s.photo_url IS NOT NULL LIMIT 1',
        [userData.id]
      );
      // Asignar la URL de la foto si existe, o null si el alumno no tiene foto
      userData.photo_url = photos.length > 0 ? photos[0].photo_url : null;
    }

    // Retornar el objeto de usuario completo (sin contraseña)
    res.json(userData);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

export default router;
