import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../common/Icon';

export default function PadreCursoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [grades, setGrades] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/teacher-courses'),
      api.get(`/grades?teacher_course_id=${id}`),
      api.get('/daily-progress'),
    ]).then(([courses, g, p]) => {
      setCourse(courses.find(c => c.id === Number(id)));
      setGrades(g);
      setProgress(p.filter(pr => pr.teacher_course_id === Number(id)));
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading">Cargando...</div>;
  if (!course) return <div className="empty-state"><p>Curso no encontrado</p></div>;

  const gradeMap = {};
  grades.forEach(g => { gradeMap[g.evaluation_name] = g.score; });
  const scores = ['N1', 'N2', 'N3'].map(n => gradeMap[n]);
  const validScores = scores.filter(s => s != null);
  const avg = validScores.length ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1) : '-';

  return (
    <div>
      <div className="page-header" style={{ background: course.color || 'var(--nav-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div onClick={() => navigate('/padre/cursos')} style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="back" color="white" size={18} />
          </div>
          <div>
            <h1>{course.course_name}</h1>
            <p>{course.teacher_name}</p>
          </div>
        </div>
      </div>

      <div className="content-area">
        {/* Notas */}
        <div className="card" style={{ marginBottom: 14 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Notas</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['N1', 'N2', 'N3'].map((n, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: 'var(--bg)', borderRadius: 10 }}>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{n}</p>
                <p style={{ fontSize: 18, fontWeight: 800 }}>{scores[i] ?? '-'}</p>
              </div>
            ))}
            <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: 'var(--primary-light)', borderRadius: 10 }}>
              <p style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>Prom</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{avg}</p>
            </div>
          </div>
        </div>

        {/* Avances */}
        <div className="card">
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Avances Recientes</h4>
          {progress.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Sin avances registrados</p>
          ) : progress.map((a, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: i < progress.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <p style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginBottom: 4 }}>{a.date}</p>
              <p style={{ fontSize: 13, lineHeight: 1.4 }}>{a.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
