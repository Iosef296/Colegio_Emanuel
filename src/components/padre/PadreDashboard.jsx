import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function PadreDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
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

  const load = useCallback((silent = false) => {
    api.get('/dashboard/padre').then(data => { setData(data); setLoading(false); }).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load(true));

  useEffect(() => {
    const codigo = data?.student?.codigo;
    if (codigo) {
      QRCode.toDataURL(codigo, { width: 300, margin: 2, errorCorrectionLevel: 'H' })
        .then(url => setQrDataUrl(url))
        .catch(console.error);
    }
  }, [data]);

  if (loading) return <div className="loading">Cargando...</div>;

  const student = data?.student;
  const stats = data?.stats || {};

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ paddingBottom: 60, borderRadius: '0 0 30px 30px' }}>
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
              <h1>{student?.name || user.full_name}</h1>
              {student && (
                <p style={{ opacity: 0.8, fontSize: 13, marginTop: 2 }}>
                  {student.grade}{student.section ? ` "${student.section}"` : ''}
                </p>
              )}
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

      {/* Debt alert */}
      {stats.deudaTotal > 0 && (
        <div style={{ margin: '-30px 16px 0', marginBottom: 12 }}>
          <div style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)', borderRadius: 16, padding: '12px 16px', color: 'white' }}>
            <p style={{ fontSize: 12, opacity: 0.85 }}>⚠ Deuda vencida ({stats.deudaVencida} {stats.deudaVencida === 1 ? 'mes' : 'meses'})</p>
            <p style={{ fontSize: 26, fontWeight: 800 }}>S/ {Number(stats.deudaTotal).toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '0 16px', marginTop: stats.deudaTotal > 0 ? 12 : -40, marginBottom: 20 }}>
        {/* Días de retraso */}
        <div className="stat-card" style={{ flex: 1, minWidth: 90 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: stats.diasRetraso > 0 ? '#FEE2E2' : '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: stats.diasRetraso > 0 ? 'var(--danger)' : 'var(--success)' }}>{stats.diasRetraso || 0}</span>
          </div>
          <p className="stat-label">Días de<br />Retraso</p>
        </div>
        {/* Tareas pendientes */}
        <div className="stat-card" style={{ flex: 1, minWidth: 90 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#8B5CF6' }}>{stats.tareasPendientes || 0}</span>
          </div>
          <p className="stat-label">Tareas<br />Pendientes</p>
        </div>
        {/* Promedio — visible solo si mes actual pagado */}
        <div
          className="stat-card"
          style={{ flex: 1, minWidth: 90, cursor: 'pointer' }}
          onClick={() => navigate('/padre/cursos')}
        >
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
            <Icon name="star" color="var(--primary)" size={18} />
          </div>
          <p className="stat-label">Ver<br />Notas</p>
        </div>
      </div>

      {/* Menu Grid */}
      <div className="content-area">
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Menú Principal</h3>
        <div className="grid-2">
          {[
            { icon: 'book', label: 'Cursos', desc: 'Ver materias y notas', to: '/padre/cursos', color: '#3B82F6', bg: '#EFF6FF' },
            { icon: 'calendar', label: 'Asistencia', desc: 'Control diario', to: '/padre/asistencia', color: '#10B981', bg: '#D1FAE5' },
            { icon: 'dollar', label: 'Mensualidades', desc: 'Estado de pagos', to: '/padre/mensualidades', color: '#8B5CF6', bg: '#EDE9FE' },
            { icon: 'bell', label: 'Comunicados', desc: 'Avisos y tareas', to: '/padre/comunicados', color: '#EC4899', bg: '#FCE7F3' },
            { icon: 'chart', label: 'Avances', desc: 'Progreso diario', to: '/padre/avances', color: '#14B8A6', bg: '#CCFBF1' },
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

      {/* Payment required modal */}
      {showPayModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowPayModal(false)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: 300, width: '100%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="lock" color="var(--danger)" size={24} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Mensualidad pendiente</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
              Aún no se ha pagado la mensualidad del mes actual. Por favor realiza el pago para ver las notas.
            </p>
            <button onClick={() => setShowPayModal(false)} className="btn btn-secondary" style={{ width: '100%' }}>Cerrar</button>
          </div>
        </div>
      )}

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

      {/* QR Modal */}
      {showQr && student && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowQr(false)}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 300, width: '100%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{student.name}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{student.grade}{student.section ? ` "${student.section}"` : ''}</p>
            <img src={qrDataUrl} alt="QR Code" style={{ width: '100%', height: 'auto', display: 'block', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { const a = document.createElement('a'); a.href = qrDataUrl; a.download = `QR-${student.name}.png`; a.click(); }} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Descargar</button>
              <button onClick={() => setShowQr(false)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
