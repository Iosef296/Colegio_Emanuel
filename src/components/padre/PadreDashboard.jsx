import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Icon from '../common/Icon';

export default function PadreDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    api.get('/dashboard/padre').then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const codigo = data?.student?.codigo;
    if (codigo) {
      QRCode.toDataURL(codigo, { width: 220, margin: 2 })
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <p style={{ opacity: 0.7, fontSize: 13 }}>Bienvenido</p>
            <h1>{student?.name || user.full_name}</h1>
          </div>
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => navigate('/padre/comunicados')}>
            <Icon name="bell" color="white" size={22} />
            {stats.comunicados > 0 && (
              <div style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, background: 'var(--danger)', borderRadius: '50%', border: '2px solid var(--nav-bg)' }} />
            )}
          </div>
        </div>
        {student && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ opacity: 0.8, fontSize: 13 }}>
              {student.grade} "{student.section}"
            </p>
            {qrDataUrl && (
              <button
                onClick={() => setShowQr(true)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'white', fontSize: 12 }}
              >
                <Icon name="qr" color="white" size={16} />
                <span>QR</span>
              </button>
            )}
          </div>
        )}
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
        {/* Pagos vencidos (regla del 15) */}
        <div className="stat-card" style={{ flex: 1, minWidth: 90 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: stats.deudaVencida > 0 ? '#FEE2E2' : '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: stats.deudaVencida > 0 ? 'var(--danger)' : 'var(--warning)' }}>{stats.deudaVencida || 0}</span>
          </div>
          <p className="stat-label">Pagos<br />Vencidos</p>
        </div>
        {/* Tareas pendientes */}
        <div className="stat-card" style={{ flex: 1, minWidth: 90 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#8B5CF6' }}>{stats.tareasPendientes || 0}</span>
          </div>
          <p className="stat-label">Tareas<br />Pendientes</p>
        </div>
        {/* Promedio — visible solo si mes actual pagado */}
        <div className="stat-card" style={{ flex: 1, minWidth: 90 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', position: 'relative' }}>
            {stats.deudaVencida === 0
              ? <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)' }}>{stats.promedio || 0}</span>
              : <Icon name="lock" color="var(--primary)" size={18} />
            }
          </div>
          <p className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <Icon name="eye" color="var(--text-muted)" size={11} />
            Promedio<br />Actual
          </p>
        </div>
      </div>

      {/* Menu Grid */}
      <div className="content-area">
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Menú Principal</h3>
        <div className="grid-2">
          {[
            { icon: 'book', label: 'Cursos', desc: 'Ver materias', to: '/padre/cursos', color: '#3B82F6', bg: '#EFF6FF' },
            { icon: 'star', label: 'Notas', desc: 'Calificaciones', to: '/padre/notas', color: '#F59E0B', bg: '#FEF3C7' },
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

      {/* QR Modal */}
      {showQr && student && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowQr(false)}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 300, width: '100%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{student.name}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{student.grade} "{student.section}"</p>
            <img src={qrDataUrl} alt="QR Code" style={{ width: 220, height: 220, display: 'block', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, fontFamily: 'monospace' }}>{student.codigo}</p>
            <button onClick={() => setShowQr(false)} className="btn btn-secondary" style={{ width: '100%' }}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
