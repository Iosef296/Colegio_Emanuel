import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from './Icon';

const NAV_ITEMS = {
  padre: [
    { to: '/padre', icon: 'home', label: 'Inicio', end: true },
    { to: '/padre/cursos', icon: 'book', label: 'Cursos' },
    { to: '/padre/notas', icon: 'star', label: 'Notas' },
    { to: '/padre/asistencia', icon: 'calendar', label: 'Asistencia' },
    { to: '/padre/mensualidades', icon: 'dollar', label: 'Pagos' },
    { to: '/padre/comunicados', icon: 'bell', label: 'Comunicados' },
    { to: '/padre/avances', icon: 'chart', label: 'Avances' },
  ],
  docente: [
    { to: '/docente', icon: 'home', label: 'Inicio', end: true },
    { to: '/docente/cursos', icon: 'book', label: 'Mis Cursos' },
    { to: '/docente/asistencia', icon: 'calendar', label: 'Asistencia' },
    { to: '/docente/comunicados', icon: 'bell', label: 'Comunicados' },
    { to: '/docente/avances', icon: 'chart', label: 'Avances' },
  ],
  admin: [
    { to: '/admin', icon: 'home', label: 'Inicio', end: true },
    { to: '/admin/usuarios', icon: 'users', label: 'Usuarios' },
    { to: '/admin/alumnos', icon: 'user', label: 'Alumnos' },
    { to: '/admin/cursos', icon: 'book', label: 'Cursos' },
    { to: '/admin/asignaciones', icon: 'clipboard', label: 'Asignaciones' },
    { to: '/admin/pagos', icon: 'dollar', label: 'Pagos' },
  ],
};

const MOBILE_NAV = {
  padre: [
    { to: '/padre', icon: 'home', label: 'Inicio', end: true },
    { to: '/padre/cursos', icon: 'book', label: 'Cursos' },
    { to: '/padre/notas', icon: 'star', label: 'Notas' },
    { to: '/padre/comunicados', icon: 'bell', label: 'Avisos' },
  ],
  docente: [
    { to: '/docente', icon: 'home', label: 'Inicio', end: true },
    { to: '/docente/cursos', icon: 'book', label: 'Cursos' },
    { to: '/docente/asistencia', icon: 'calendar', label: 'Asistencia' },
    { to: '/docente/comunicados', icon: 'bell', label: 'Avisos' },
  ],
  admin: [
    { to: '/admin', icon: 'home', label: 'Inicio', end: true },
    { to: '/admin/usuarios', icon: 'users', label: 'Usuarios' },
    { to: '/admin/alumnos', icon: 'user', label: 'Alumnos' },
    { to: '/admin/pagos', icon: 'dollar', label: 'Pagos' },
  ],
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV_ITEMS[user?.role] || [];
  const mobileItems = MOBILE_NAV[user?.role] || [];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleLabel = { padre: 'Alumno', docente: 'Docente', admin: 'Administrador' };

  return (
    <div className="app-layout">
      {/* Sidebar (desktop) */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Colegio Emanuel</h2>
          <p>Sistema Escolar</p>
        </div>
        <nav className="sidebar-nav">
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
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              <Icon name="user" color="white" size={18} />
            </div>
            <div className="sidebar-user-info">
              <p>{user?.full_name}</p>
              <span>{roleLabel[user?.role]}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-logout">
            <Icon name="logout" color="white" size={16} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        {children}
      </main>

      {/* Bottom nav (mobile) */}
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
        <button onClick={handleLogout} className="bottom-nav-item" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
          <Icon name="logout" color="var(--danger)" size={20} />
          Salir
        </button>
      </nav>
    </div>
  );
}
