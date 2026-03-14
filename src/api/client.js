// ============================================================
// Cliente HTTP centralizado para todas las llamadas a la API REST.
//
// Responsabilidades:
//  — Determinar la URL base según el entorno (desarrollo vs producción).
//  — Adjuntar automáticamente el token JWT a cada petición.
//  — Manejar respuestas no-OK de forma uniforme (errores 4xx/5xx).
//  — Redirigir automáticamente al login cuando la sesión expira (401/403).
//  — Proveer métodos de conveniencia (get, post, put, delete, upload)
//    para no repetir lógica de fetch en cada componente.
// ============================================================

// ---------------------------------------------------------------------------
// URL base de la API
// En desarrollo Vite proxea /api → localhost:3001 (ver vite.config.js).
// En producción apunta directamente al servidor en Fly.io.
// ---------------------------------------------------------------------------
const API_BASE =
  import.meta.env.MODE === 'development'
    ? '/api'
    : 'https://colegio-emanuel-api.fly.dev/api';

/**
 * request — función interna que ejecuta un fetch con autenticación JWT.
 *
 * Comportamiento:
 *  1. Lee el token JWT del localStorage (guardado al hacer login).
 *  2. Construye los headers base (Content-Type + Authorization si hay token).
 *  3. Realiza el fetch y espera la respuesta como texto para no fallar
 *     con respuestas vacías (p. ej. 204 No Content).
 *  4. Parsea el texto como JSON solo si no está vacío.
 *  5. Si la respuesta es 401/403:
 *     — En la página de login: lanza el mensaje de error del servidor
 *       para mostrárselo al usuario (credenciales incorrectas, etc.).
 *     — En cualquier otra página: limpia el almacenamiento local y
 *       redirige al login (sesión expirada o token inválido).
 *  6. Si la respuesta no es OK (cualquier otro error), lanza el mensaje
 *     de error recibido del servidor.
 *  7. Devuelve el objeto JSON parseado.
 *
 * @param {string} path — ruta relativa a API_BASE, ej. '/students'
 * @param {RequestInit} [options={}] — opciones adicionales de fetch (method, body, headers...)
 * @returns {Promise<any>} — datos JSON de la respuesta
 */
async function request(path, options = {}) {
  // Lee el token JWT guardado en localStorage tras el login exitoso
  const token = localStorage.getItem('token');

  // Construye los headers de la petición:
  //  - Content-Type siempre es JSON para los endpoints estándar
  //  - Authorization se adjunta solo si existe un token (algunas rutas son públicas)
  //  - Se permite sobreescribir o agregar headers adicionales vía options.headers
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  // Ejecuta el fetch combinando las opciones recibidas con los headers construidos
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Lee el cuerpo de la respuesta como texto para manejar respuestas vacías
  // (JSON.parse('') lanzaría error; así controlamos el caso)
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  // Manejo de errores de autenticación y autorización
  if (res.status === 401 || res.status === 403) {
    // Si el error ocurre en la página de login, el servidor está respondiendo
    // con un mensaje específico (usuario no existe, contraseña incorrecta, etc.)
    // — lo propagamos directamente para mostrarlo en el formulario
    if (window.location.pathname.startsWith('/login')) {
      throw new Error(data.error || 'Error al iniciar sesión');
    }
    // En cualquier otra página, la sesión expiró o el token fue invalidado.
    // Limpiamos localStorage para forzar un nuevo login.
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('No autorizado');
  }

  // Cualquier otro error HTTP (400, 404, 409, 500, etc.) — lanza el mensaje del servidor
  if (!res.ok) throw new Error(data.error || 'Error del servidor');

  // Todo OK — devuelve los datos parseados para que el componente los consuma
  return data;
}

// ---------------------------------------------------------------------------
// API pública — métodos de conveniencia que envuelven `request`
// ---------------------------------------------------------------------------
export const api = {
  /**
   * get — realiza una petición GET.
   * @param {string} path — ruta del endpoint, ej. '/students'
   */
  get: (path) => request(path),

  /**
   * post — realiza una petición POST con cuerpo JSON.
   * @param {string} path — ruta del endpoint
   * @param {object} body — datos a enviar en el cuerpo
   */
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),

  /**
   * put — realiza una petición PUT para actualizar un recurso.
   * @param {string} path — ruta del endpoint (normalmente incluye el ID)
   * @param {object} body — datos actualizados
   */
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),

  /**
   * delete — realiza una petición DELETE para eliminar un recurso.
   * @param {string} path — ruta del endpoint con el ID del recurso
   */
  delete: (path) => request(path, { method: 'DELETE' }),

  /**
   * upload — sube archivos (FormData) al servidor.
   *
   * No usa `request` porque FormData no debe llevar Content-Type: application/json;
   * el navegador asigna automáticamente multipart/form-data con el boundary correcto
   * cuando no se especifica Content-Type en el header.
   *
   * @param {string} path — ruta del endpoint de subida (ej. '/upload')
   * @param {FormData} formData — datos del formulario con el archivo adjunto
   * @returns {Promise<any>} — respuesta JSON del servidor (p. ej. { url: '...' })
   */
  upload: (path, formData) => {
    // Lee el token para autenticar la subida (el endpoint de upload también está protegido)
    const token = localStorage.getItem('token');
    return fetch(`${API_BASE}${path}`, {
      method: 'POST',
      // Solo adjunta Authorization; omite Content-Type para que el navegador
      // genere el boundary correcto para multipart/form-data
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async res => {
      // Lee el cuerpo de la respuesta como texto (igual que en `request`)
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      // Si el servidor rechazó la subida, lanza el error con su mensaje
      if (!res.ok) throw new Error(data.error || 'Error al subir imagen');
      return data;
    });
  },
};
