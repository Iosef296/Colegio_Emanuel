import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function DocenteCursos() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback((silent = false) => {
    api.get('/teacher-courses').then(data => { setCourses(data); setLoading(false); }).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load(true));

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Mis Cursos</h1>
        <p>Cursos asignados</p>
      </div>
      <div className="content-area">
        <div className="grid-2">
          {courses.map(c => (
            <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/docente/cursos/${c.id}`)}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: c.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon name="book" color={c.color} size={24} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{c.course_name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.grade_name} "{c.section}"</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
