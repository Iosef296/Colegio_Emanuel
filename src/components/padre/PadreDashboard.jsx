import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Icon from '../common/Icon';

export default function PadreDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/padre').then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Cargando...</div>;

  const student = data?.student;
  const stats = data?.stats || {};

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ paddingBottom: 60, borderRadius: '0 0 30px 30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <p style={{ opacity: 0.7, fontSize: 13 }}>Bienvenido</p>
            <h1>{user.full_name}</h1>
          </div>
          <div style={{ position: 'relative' }}>
            <Icon name="bell" color="white" size={22} />
            {stats.comunicados > 0 && (
              <div style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, background: 'var(--danger)', borderRadius: '50%', border: '2px solid var(--nav-bg)' }} />
            )}
          </div>
        </div>
        {student && (
          <p style={{ opacity: 0.8, fontSize: 13 }}>
            Alumno: {student.name} — {student.grade} "{student.section}"
          </p>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '0 16px', marginTop: -40, marginBottom: 20 }}>
        {[
          { label: 'Pagos\nPendientes', value: stats.pagosPendientes || 0, color: 'var(--warning)', bg: '#FEF3C7' },
          { label: 'Total\nNotas', value: stats.totalNotas || 0, color: 'var(--success)', bg: '#D1FAE5' },
          { label: 'Promedio\nActual', value: stats.promedio || 0, color: 'var(--primary)', bg: 'var(--primary-light)' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ flex: 1 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</span>
            </div>
            <p className="stat-label">{s.label.split('\n').map((l, j) => <span key={j}>{l}<br /></span>)}</p>
          </div>
        ))}
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
    </div>
  );
}
