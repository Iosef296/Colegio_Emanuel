import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../common/Icon';

export default function AuxiliarDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  return (
    <div>
      <div className="page-header" style={{ paddingBottom: 50, borderRadius: '0 0 30px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="header-photo-mobile" onClick={() => setLightbox(true)} style={{ cursor: 'pointer' }}>
              {user?.photo_url
                ? <img src={user.photo_url} />
                : <Icon name="user" color="white" size={28} />
              }
            </div>
            <div>
              <p style={{ opacity: 0.7, fontSize: 13 }}>Panel Auxiliar</p>
              <h1>{user.full_name}</h1>
            </div>
          </div>
          <img src="/logo.png" alt="Logo" className="mobile-only-logo" style={{ width: 64, height: 64, objectFit: 'contain' }} />
        </div>
      </div>
      <div className="content-area" style={{ marginTop: -20 }}>
        <div className="grid-2">
          {[
            { icon: 'calendar', label: 'Asistencia', desc: 'Registrar asistencia', to: '/auxiliar/asistencia', color: '#3B82F6', bg: '#EFF6FF' },
            { icon: 'bell', label: 'Comunicados', desc: 'Ver y publicar avisos', to: '/auxiliar/comunicados', color: '#F59E0B', bg: '#FEF3C7' },
          ].map((item, i) => (
            <div key={i} onClick={() => navigate(item.to)} className="card" style={{ cursor: 'pointer' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon name={item.icon} color={item.color} size={22} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{item.label}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
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
    </div>
  );
}
