import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Icon from './Icon';

// ─── Items de navegación por rol ──────────────────────────────────────────────

// Define los enlaces de la barra lateral (sidebar) para cada rol del sistema.
// Cada entrada incluye la ruta, el nombre del icono y la etiqueta visible.
// La propiedad `end: true` hace que React Router solo marque el enlace como activo
// cuando la ruta es una coincidencia exacta (evita que "/" quede activo en subrutas).
const NAV_ITEMS = {
  padre: [
    { to: '/padre', icon: 'home', label: 'Inicio', end: true },
    { to: '/padre/cursos', icon: 'star', label: 'Notas' },
    { to: '/padre/asistencia', icon: 'calendar', label: 'Asistencia' },
    { to: '/padre/mensualidades', icon: 'dollar', label: 'Mensualidades' },
    { to: '/padre/avances', icon: 'chart', label: 'Avances' },
    { to: '/padre/comunicados', icon: 'bell', label: 'Comunicados' },
  ],
  docente: [
    { to: '/docente', icon: 'home', label: 'Inicio', end: true },
    { to: '/docente/cursos', icon: 'book', label: 'Notas' },
    { to: '/docente/comunicados', icon: 'bell', label: 'Comunicados' },
    { to: '/docente/avances', icon: 'chart', label: 'Avances' },
    { to: '/docente/informes', icon: 'eye', label: 'Informes' },
  ],
  auxiliar: [
    { to: '/auxiliar', icon: 'home', label: 'Inicio', end: true },
    { to: '/auxiliar/asistencia', icon: 'calendar', label: 'Asistencia' },
    { to: '/auxiliar/comunicados', icon: 'bell', label: 'Comunicados' },
    { to: '/auxiliar/informes', icon: 'eye', label: 'Informes' },
  ],
  admin: [
    { to: '/admin', icon: 'home', label: 'Inicio', end: true },
    { to: '/admin/asistencia', icon: 'calendar', label: 'Asistencia' },
    { to: '/admin/usuarios', icon: 'users', label: 'Profesores' },
    { to: '/admin/grados', icon: 'clipboard', label: 'Grados' },
    { to: '/admin/cursos', icon: 'book', label: 'Cursos' },
    { to: '/admin/pagos', icon: 'dollar', label: 'Pagos' },
    { to: '/admin/comunicados', icon: 'bell', label: 'Comunicados' },
    { to: '/admin/informes', icon: 'eye', label: 'Informes' },
    { to: '/admin/whatsapp', icon: 'whatsapp', label: 'WhatsApp' },
  ],
};

// El director y la secretaria comparten exactamente los mismos permisos de navegación
// que el administrador, por lo que reutilizamos la misma lista.
NAV_ITEMS.director = NAV_ITEMS.admin;
NAV_ITEMS.secretaria = NAV_ITEMS.admin;

// ─── Items de navegación inferior (móvil) ─────────────────────────────────────

// La barra de navegación inferior del móvil tiene un subconjunto reducido de enlaces
// comparado con el sidebar, porque el espacio es limitado.
// Para el docente y auxiliar se reordena para priorizar las secciones más usadas.
const MOBILE_NAV = {
  padre: [
    { to: '/padre', icon: 'home', label: 'Inicio', end: true },
    { to: '/padre/cursos', icon: 'star', label: 'Notas' },
    { to: '/padre/asistencia', icon: 'calendar', label: 'Asistencia' },
    { to: '/padre/mensualidades', icon: 'dollar', label: 'Mensualidades' },
    { to: '/padre/avances', icon: 'chart', label: 'Avances' },
    { to: '/padre/comunicados', icon: 'bell', label: 'Comunicados' },
  ],
  docente: [
    { to: '/docente', icon: 'home', label: 'Inicio', end: true },
    { to: '/docente/avances', icon: 'chart', label: 'Avances' },
    { to: '/docente/cursos', icon: 'book', label: 'Notas' },
    { to: '/docente/comunicados', icon: 'bell', label: 'Comunicados' },
    { to: '/docente/informes', icon: 'eye', label: 'Informes' },
  ],
  auxiliar: [
    { to: '/auxiliar', icon: 'home', label: 'Inicio', end: true },
    { to: '/auxiliar/asistencia', icon: 'calendar', label: 'Asistencia' },
    { to: '/auxiliar/comunicados', icon: 'bell', label: 'Avisos' },
    { to: '/auxiliar/informes', icon: 'eye', label: 'Informes' },
  ],
  admin: [
    { to: '/admin', icon: 'home', label: 'Inicio', end: true },
    { to: '/admin/asistencia', icon: 'calendar', label: 'Asistencia' },
    { to: '/admin/grados', icon: 'clipboard', label: 'Grados' },
    { to: '/admin/pagos', icon: 'dollar', label: 'Pagos' },
    { to: '/admin/comunicados', icon: 'bell', label: 'Avisos' },
    { to: '/admin/informes', icon: 'eye', label: 'Informes' },
    { to: '/admin/whatsapp', icon: 'whatsapp', label: 'WhatsApp' },
  ],
};

// Igual que con NAV_ITEMS, director y secretaria heredan la nav del admin.
MOBILE_NAV.director = MOBILE_NAV.admin;
MOBILE_NAV.secretaria = MOBILE_NAV.admin;

// ─── Componente Layout ─────────────────────────────────────────────────────────

// Shell principal de la aplicación autenticada.
// Renderiza:
//   - Sidebar (visible en escritorio): logo, navegación vertical, perfil y botón de salir.
//   - Área de contenido principal: renderiza los `children` de la ruta activa.
//   - Bottom nav (visible en móvil): navegación horizontal compacta + botón de salir.
export default function Layout({ children }) {
  // Obtenemos el usuario autenticado y la función de cierre de sesión del contexto.
  const { user, logout } = useAuth();
  const [lightbox, setLightbox] = useState(false);

  // Hook de React Router para redireccionar al login tras cerrar sesión.
  const navigate = useNavigate();

  // Seleccionamos los items de nav del sidebar según el rol del usuario.
  // Si el rol no existe en el mapa, devolvemos un array vacío (nav vacío).
  const items = NAV_ITEMS[user?.role] || [];

  // Seleccionamos los items de la nav inferior según el rol del usuario.
  const mobileItems = MOBILE_NAV[user?.role] || [];

  // ── Efecto: trampa de botón "Atrás" en PWA ──────────────────────────────────

  // En una PWA instalada, el botón "Atrás" del sistema puede cerrar la app
  // si no hay más entradas en el historial. Para evitarlo, interceptamos el
  // evento `popstate` y, cuando detectamos que estamos en el "piso" de la app
  // (idx=0 o entrada marcada como __appFloor), empujamos un nuevo estado al
  // historial para que el siguiente "Atrás" no salga de la app.
  // Excepción: si el escáner QR está abierto (__scannerOpen), dejamos pasar
  // el evento para que el escáner pueda cerrarse con el botón Atrás.
  useEffect(() => {
    const handler = (e) => {
      if (window.__scannerOpen) return;
      // Fire when we've reached the floor entry (idx=0 or __appFloor) or the
      // original PWA entry below it (no idx at all). Push a new floor so the
      // next back press doesn't exit the app.
      const s = e.state;
      if (!s?.idx || s?.__appFloor) {
        window.history.pushState({ __appFloor: true }, '', window.location.href);
      }
    };
    window.addEventListener('popstate', handler);
    // Limpiamos el listener al desmontar para evitar fugas de memoria.
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // ── Handler de cierre de sesión ────────────────────────────────────────────

  // Limpia el contexto de autenticación y redirige al login.
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleDownloadPhoto = async (e) => {
    e.stopPropagation();
    const proxyUrl = `https://colegio-emanuel-api.fly.dev/api/download?url=${encodeURIComponent(user.photo_url)}`;
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = 'foto-perfil.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Etiquetas legibles en español para cada rol, usadas en el sidebar.
  const roleLabel = { padre: 'Alumno', docente: 'Docente', admin: 'Administrador', auxiliar: 'Auxiliar', director: 'Director', secretaria: 'Secretaria' };

  return (
    <div className="app-layout">
      {/* ── Sidebar (solo escritorio) ────────────────────────────────────────
          Contiene el logo del colegio, la navegación principal por rol,
          el bloque de perfil del usuario y el botón de cerrar sesión. */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/logo.png" alt="Colegio Emanuel" style={{ width: 180, height: 180, objectFit: 'contain' }} />
        </div>
        <nav className="sidebar-nav">
          {/* Generamos un NavLink por cada item del rol activo.
              isActive proviene de React Router y aplica la clase 'active'
              cuando la URL actual coincide con la ruta del item. */}
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <Icon name={item.icon} color="currentColor" size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          {/* Bloque de perfil: muestra foto (si existe en R2) o icono de usuario */}
          <div className="sidebar-user">
            <div className="sidebar-user-avatar" style={{ overflow: 'hidden', padding: 0, cursor: 'pointer' }} onClick={() => setLightbox(true)}>
              {user?.photo_url
                ? <img src={user.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <Icon name="user" color="white" size={18} />
              }
            </div>
            <div className="sidebar-user-info">
              <p>{user?.full_name}</p>
              <span>{roleLabel[user?.role]}</span>
            </div>
          </div>
          {/* Botón de cierre de sesión del sidebar */}
          <button onClick={handleLogout} className="btn-logout">
            <Icon name="logout" color="white" size={16} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ── Área de contenido principal ──────────────────────────────────────
          Renderiza la página activa inyectada por React Router como children. */}
      <main className="main-content">
        {children}
      </main>

      {/* ── Bottom nav (solo móvil) ───────────────────────────────────────────
          Barra inferior fija con los enlaces más importantes del rol.
          Incluye al final un botón de "Salir" para cerrar sesión desde móvil. */}
      {lightbox && (
        <div onClick={() => setLightbox(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16, gap: 16 }}>
          {user?.photo_url
            ? <img src={user.photo_url} alt="Foto" style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8 }} />
            : <Icon name="user" color="white" size={100} />
          }
          {user?.photo_url && (
            <button onClick={handleDownloadPhoto} style={{ background: 'white', color: '#1E3A5F', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}>
              Descargar foto
            </button>
          )}
        </div>
      )}

      <nav className="bottom-nav">
        {mobileItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon name={item.icon} color="currentColor" size={20} />
            {item.label}
          </NavLink>
        ))}
        {/* Botón de salir en la nav inferior; usa estilos inline para diferenciarlo
            de los NavLinks y pintarlo en rojo de peligro. */}
        <button onClick={handleLogout} className="bottom-nav-item" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
          <Icon name="logout" color="var(--danger)" size={20} />
          Salir
        </button>
      </nav>
    </div>
  );
}
