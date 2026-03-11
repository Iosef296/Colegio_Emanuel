import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function PadreCursoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [grades, setGrades] = useState([]);
  const [mesActualPagado, setMesActualPagado] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([
      api.get('/teacher-courses'),
      api.get(`/grades?teacher_course_id=${id}`),
      api.get('/dashboard/padre'),
    ]).then(([courses, g, d]) => {
      setCourse(courses.find(c => c.id === Number(id)));
      setGrades(g);
      setMesActualPagado(d?.stats?.mesActualPagado ?? false);
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  if (loading) return <div className="loading">Cargando...</div>;
  if (!course) return <div className="empty-state"><p>Curso no encontrado</p></div>;

  const gradeMap = {};
  grades.forEach(g => { gradeMap[g.evaluation_name] = Number(g.score); });
  const scores = ['N1', 'N2', 'N3'].map(n => gradeMap[n]);
  const validScores = scores.filter(s => s != null);
  const avg = validScores.length ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1) : '-';

  return (
    <div>
      <div className="page-header" style={{ background: course.color || 'var(--nav-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
        <div className="card">
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Notas</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['N1', 'N2', 'N3'].map((n, i) => (
              <div key={i} onClick={() => !mesActualPagado && setShowPayModal(true)}
                style={{ flex: 1, minWidth: 60, textAlign: 'center', padding: '8px 0', background: 'var(--bg)', borderRadius: 10, cursor: mesActualPagado ? 'default' : 'pointer' }}>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{n}</p>
                {mesActualPagado
                  ? <p style={{ fontSize: 18, fontWeight: 800 }}>{scores[i] ?? '-'}</p>
                  : <Icon name="eye" color="var(--text-muted)" size={16} />
                }
              </div>
            ))}
            <div onClick={() => !mesActualPagado && setShowPayModal(true)}
              style={{ flex: 1, minWidth: 60, textAlign: 'center', padding: '8px 0', background: 'var(--primary-light)', borderRadius: 10, cursor: mesActualPagado ? 'default' : 'pointer' }}>
              <p style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>Prom</p>
              {mesActualPagado
                ? <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{avg}</p>
                : <Icon name="eye" color="var(--primary)" size={16} />
              }
            </div>
          </div>
        </div>
      </div>

      {showPayModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={() => setShowPayModal(false)}>
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
    </div>
  );
}
