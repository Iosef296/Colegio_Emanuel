// DocenteDashboard.jsx
// Panel de inicio del docente. Muestra un saludo personalizado, estadísticas
// rápidas (total de cursos y alumnos), acciones de navegación frecuentes
// (Comunicados y Avances) y la lista de cursos asignados con enlace directo
// a la pantalla de notas de cada uno.
// También genera y muestra el código QR personal del docente para que el
// auxiliar lo pueda escanear al registrar asistencia.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function DocenteDashboard() {
  // Obtiene el objeto del usuario autenticado (nombre, username, rol, etc.)
  // desde el contexto de autenticación compartido en la aplicación.
  const { user } = useAuth();

  // Hook de React Router para navegar programáticamente a otras rutas.
  const navigate = useNavigate();

  // Datos del dashboard cargados desde el servidor: totalCourses, totalStudents
  // y el arreglo de cursos asignados al docente.
  const [data, setData] = useState(null);

  // Indicador de carga inicial; mientras sea true se muestra el spinner.
  const [loading, setLoading] = useState(true);

  // URL de datos (data URL base64) de la imagen QR generada con la librería `qrcode`.
  // Se almacena para poder renderizarla en un <img> sin peticiones adicionales.
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Controla si el modal del código QR personal está visible.
  const [showQr, setShowQr] = useState(false);

  const [lightbox, setLightbox] = useState(false);

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

  // Función de carga del dashboard memorizada con useCallback para que la
  // referencia sea estable entre renders. Esto es necesario para que el efecto
  // y el hook useAutoRefresh no provoquen bucles infinitos.
  // El parámetro `silent` está reservado para actualizaciones silenciosas en
  // segundo plano (sin mostrar el spinner), aunque actualmente no se usa.
  const load = useCallback((silent = false) => {
    api.get('/dashboard/docente').then(data => { setData(data); setLoading(false); }).catch(console.error);
  }, []);

  // Carga los datos del dashboard al montar el componente por primera vez.
  useEffect(() => { load(); }, [load]);

  // Configura la actualización automática en segundo plano usando el hook
  // personalizado useAutoRefresh, que llama a load(true) periódicamente
  // para mantener las estadísticas actualizadas sin que el docente recargue.
  useAutoRefresh(() => load(true));

  // Genera el código QR personal del docente al montar el componente (o cuando
  // cambia el usuario autenticado). El QR codifica el username del docente,
  // que es el mismo valor que el auxiliar escanea en la pantalla de asistencia.
  // Se usa un tamaño de 220px y margen 2 para que sea legible en pantalla móvil.
  useEffect(() => {
    if (user?.username) {
      QRCode.toDataURL(user.username, { width: 220, margin: 2 })
        .then(url => setQrDataUrl(url))
        .catch(console.error);
    }
  }, [user]);

  // Muestra pantalla de carga mientras los datos del dashboard no están disponibles.
  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      {/* Encabezado del dashboard con saludo, estadísticas rápidas y botón QR.
          El padding bottom extra permite que las tarjetas de stats se superpongan
          visualmente al borde inferior del header con el efecto de tarjeta flotante. */}
      <div className="page-header" style={{ paddingBottom: 50, borderRadius: '0 0 30px 30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div className="header-photo-mobile" onClick={() => setLightbox(true)} style={{ cursor: 'pointer' }}>
                {user?.photo_url
                  ? <img src={user.photo_url} />
                  : <Icon name="user" color="white" size={28} />
                }
              </div>
              {qrDataUrl && (
                <button
                  className="qr-btn-mobile"
                  onClick={() => setShowQr(true)}
                  style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', alignItems: 'center', gap: 4, color: 'white', fontSize: 11, fontWeight: 600 }}
                >
                  <Icon name="qr" color="white" size={14} />
                  <span>QR</span>
                </button>
              )}
            </div>
            <div>
              <p style={{ opacity: 0.7, fontSize: 13 }}>Bienvenido</p>
              <h1>{user.full_name}</h1>
              <p style={{ opacity: 0.8, fontSize: 13, marginTop: 4 }}>
                {data?.totalCourses || 0} cursos · {data?.totalStudents || 0} alumnos
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {qrDataUrl && (
              <button
                className="qr-btn-desktop"
                onClick={() => setShowQr(true)}
                style={{ background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)', borderRadius: 16, width: 90, height: 90, cursor: 'pointer', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'white', fontWeight: 700, fontSize: 14 }}
              >
                <Icon name="qr" color="white" size={38} />
                <span>QR</span>
              </button>
            )}
            <img src="/logo.png" alt="Logo" className="mobile-only-logo" style={{ width: 64, height: 64, objectFit: 'contain' }} />
          </div>
        </div>
      </div>

      {/* Tarjetas de estadísticas (Cursos y Alumnos).
          El margen negativo superior las superpone al encabezado para crear
          la ilusión de que "emergen" del header. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '0 16px', marginTop: -30, marginBottom: 20 }}>
        <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>{data?.totalCourses || 0}</div>
          <div className="stat-label">Cursos</div>
        </div>
        <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{data?.totalStudents || 0}</div>
          <div className="stat-label">Alumnos</div>
        </div>
      </div>

      <div className="content-area">
        {/* Sección de accesos rápidos a las funciones más usadas por el docente:
            Comunicados y Avances. Al tocar cada tarjeta navega a la ruta indicada. */}
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Acciones Rápidas</h3>
        <div className="grid-2">
          {[
            { icon: 'bell', label: 'Comunicados', to: '/docente/comunicados', color: '#EC4899', bg: '#FCE7F3' },
            { icon: 'chart', label: 'Avances', to: '/docente/avances', color: '#14B8A6', bg: '#CCFBF1' },
          ].map((item, i) => (
            <div key={i} onClick={() => navigate(item.to)} className="card" style={{ cursor: 'pointer' }}>
              {/* Icono de la acción con fondo de color temático */}
              <div style={{ width: 36, height: 36, borderRadius: 10, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Icon name={item.icon} color={item.color} size={18} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</p>
            </div>
          ))}
        </div>

        {/* Lista de cursos asignados al docente.
            Cada tarjeta muestra el nombre del curso, el grado/sección y navega
            a la pantalla de notas de ese curso al tocarla. */}
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 12px' }}>Notas</h3>
        <div className="grid-2">
          {(data?.courses || []).map(c => (
            <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/docente/cursos/${c.id}`)}>
              {/* Icono de libro con fondo semi-transparente del color del curso */}
              <div style={{ width: 42, height: 42, borderRadius: 12, background: c.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon name="book" color={c.color} size={22} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{c.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.grade_name}{c.section ? ` "${c.section}"` : ''}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Modal del código QR personal del docente.
          El fondo oscuro semitransparente actúa como overlay. Al tocarlo fuera
          de la tarjeta blanca, el modal se cierra (stopPropagation en la tarjeta
          evita que el click interior lo cierre). */}
      {lightbox && (
        <div onClick={() => setLightbox(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, gap: 16 }}>
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

      {showQr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowQr(false)}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 300, width: '100%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{user.full_name}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Docente</p>
            {/* Imagen QR generada a partir del username del docente */}
            <img src={qrDataUrl} alt="QR Code" style={{ width: 220, height: 220, display: 'block', margin: '0 auto 12px' }} />
            {/* Username en monospace para que el auxiliar lo pueda leer si necesita ingresarlo manualmente */}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, fontFamily: 'monospace' }}>{user.username}</p>
            <button onClick={() => setShowQr(false)} className="btn btn-secondary" style={{ width: '100%' }}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
