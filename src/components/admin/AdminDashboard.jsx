import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Icon from '../common/Icon';

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/admin').then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      <div className="page-header" style={{ paddingBottom: 50, borderRadius: '0 0 30px 30px' }}>
        <p style={{ opacity: 0.7, fontSize: 13 }}>Panel de Administración</p>
        <h1>{user.full_name}</h1>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ padding: '0 16px', marginTop: -30, marginBottom: 20 }}>
        {[
          { label: 'Profesores', value: data?.totalTeachers || 0, color: 'var(--primary)', bg: 'var(--primary-light)' },
          { label: 'Alumnos', value: data?.totalStudents || 0, color: 'var(--success)', bg: '#D1FAE5' },
          { label: 'Cursos', value: data?.totalCourses || 0, color: 'var(--warning)', bg: '#FEF3C7' },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

<div className="content-area">
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Gestión</h3>
        <div className="grid-2">
          {[
            { icon: 'users', label: 'Profesores', desc: 'Gestionar profesores', to: '/admin/usuarios', color: '#3B82F6', bg: '#EFF6FF' },
            { icon: 'user', label: 'Alumnos', desc: 'Gestionar alumnos', to: '/admin/alumnos', color: '#10B981', bg: '#D1FAE5' },
            { icon: 'book', label: 'Cursos', desc: 'Gestionar cursos', to: '/admin/cursos', color: '#F59E0B', bg: '#FEF3C7' },
            { icon: 'clipboard', label: 'Asignaciones', desc: 'Docente-Curso', to: '/admin/asignaciones', color: '#8B5CF6', bg: '#EDE9FE' },
            { icon: 'dollar', label: 'Pagos', desc: 'Gestionar pagos', to: '/admin/pagos', color: '#EC4899', bg: '#FCE7F3' },
            { icon: 'bell', label: 'Comunicados', desc: 'Editar y eliminar', to: '/admin/comunicados', color: '#F59E0B', bg: '#FEF3C7' },
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
