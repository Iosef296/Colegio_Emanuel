import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Icon from '../common/Icon';

export default function DocenteDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/docente').then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      <div className="page-header" style={{ paddingBottom: 50, borderRadius: '0 0 30px 30px' }}>
        <p style={{ opacity: 0.7, fontSize: 13 }}>Bienvenido</p>
        <h1>{user.full_name}</h1>
        <p style={{ opacity: 0.8, fontSize: 13, marginTop: 4 }}>
          {data?.totalCourses || 0} cursos · {data?.totalStudents || 0} alumnos
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, padding: '0 16px', marginTop: -30, marginBottom: 20 }}>
        <div className="stat-card" style={{ flex: 1 }}>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>{data?.totalCourses || 0}</div>
          <div className="stat-label">Cursos</div>
        </div>
        <div className="stat-card" style={{ flex: 1 }}>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{data?.totalStudents || 0}</div>
          <div className="stat-label">Alumnos</div>
        </div>
      </div>

      <div className="content-area">
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Mis Cursos</h3>
        <div className="grid-2">
          {(data?.courses || []).map(c => (
            <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/docente/cursos/${c.id}`)}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: c.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon name="book" color={c.color} size={22} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{c.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.grade_name} "{c.section}"</p>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 12px' }}>Acciones Rápidas</h3>
        <div className="grid-2">
          {[
            { icon: 'calendar', label: 'Registrar Asistencia', to: '/docente/asistencia', color: '#10B981', bg: '#D1FAE5' },
            { icon: 'bell', label: 'Nuevo Comunicado', to: '/docente/comunicados/nuevo', color: '#EC4899', bg: '#FCE7F3' },
            { icon: 'chart', label: 'Nuevo Avance', to: '/docente/avances/nuevo', color: '#14B8A6', bg: '#CCFBF1' },
          ].map((item, i) => (
            <div key={i} onClick={() => navigate(item.to)} className="card" style={{ cursor: 'pointer' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Icon name={item.icon} color={item.color} size={18} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
