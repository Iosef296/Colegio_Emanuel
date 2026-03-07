import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../common/Icon';

export default function DocenteGradeEntry() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showEvalConfig, setShowEvalConfig] = useState(false);
  const [evalNames, setEvalNames] = useState([]);
  const [savingEvals, setSavingEvals] = useState(false);

  const loadData = () => {
    return Promise.all([
      api.get('/teacher-courses'),
      api.get('/students'),
      api.get(`/grades?teacher_course_id=${id}`),
    ]).then(([courses, studs, grds]) => {
      const c = courses.find(c => c.id === Number(id));
      setCourse(c);
      let evalNamesArr;
      try {
        evalNamesArr = typeof c?.eval_names === 'string' ? JSON.parse(c.eval_names) : (c?.eval_names || ['N1', 'N2', 'N3']);
      } catch { evalNamesArr = ['N1', 'N2', 'N3']; }
      setEvalNames(evalNamesArr);
      setStudents(studs.sort((a, b) => a.last_name.localeCompare(b.last_name)));
      const gMap = {};
      // Default all to 0
      studs.forEach(s => evalNamesArr.forEach(n => { gMap[`${s.id}_${n}`] = 0; }));
      // Override with existing grades
      grds.forEach(g => { gMap[`${g.student_id}_${g.evaluation_name}`] = g.score; });
      setGrades(gMap);
    });
  };

  useEffect(() => {
    loadData().catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const handleChange = (studentId, evalName, value) => {
    setGrades(prev => ({ ...prev, [`${studentId}_${evalName}`]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      for (const [key, score] of Object.entries(grades)) {
        if (score === '' || score == null || score === undefined) continue;
        const parts = key.split('_');
        const student_id = parts[0];
        const evaluation_name = parts.slice(1).join('_');
        await api.post('/grades', {
          student_id: Number(student_id),
          teacher_course_id: Number(id),
          evaluation_name,
          score: Number(score),
        });
      }
      setMessage('Notas guardadas correctamente');
    } catch (err) {
      setMessage('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEvals = async () => {
    const trimmed = evalNames.map(n => n.trim()).filter(Boolean);
    if (trimmed.length === 0) return;
    setSavingEvals(true);
    try {
      await api.put(`/teacher-courses/${id}/eval-names`, { eval_names: trimmed });
      setEvalNames(trimmed);
      setShowEvalConfig(false);
      // Reset grades map keys that no longer exist
      setGrades(prev => {
        const next = {};
        Object.entries(prev).forEach(([key, val]) => {
          const parts = key.split('_');
          const evalPart = parts.slice(1).join('_');
          if (trimmed.includes(evalPart)) next[key] = val;
        });
        return next;
      });
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSavingEvals(false);
    }
  };

  if (loading) return <div className="loading">Cargando...</div>;
  if (!course) return <div className="empty-state"><p>Curso no encontrado</p></div>;

  const colTemplate = `2fr ${evalNames.map(() => '1fr').join(' ')} 1fr`;

  const getAvg = (studentId) => {
    const scores = evalNames
      .map(n => grades[`${studentId}_${n}`])
      .filter(v => v !== '' && v != null)
      .map(Number)
      .filter(n => !isNaN(n));
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  };

  return (
    <div>
      <div className="page-header" style={{ background: course.color || 'var(--nav-bg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div onClick={() => navigate('/docente/cursos')} style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="back" color="white" size={18} />
            </div>
            <div>
              <h1>{course.course_name}</h1>
              <p>Registro de notas - {course.grade_name}</p>
            </div>
          </div>
          <button onClick={() => setShowEvalConfig(true)}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 10, padding: '6px 12px', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            ⚙ Evaluaciones
          </button>
        </div>
      </div>

      <div className="content-area">
        {message && (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13, fontWeight: 600 }}>
            {message}
          </div>
        )}

        <div className="table-scroll">
          <div className="table-container">
            <div className="table-header" style={{ gridTemplateColumns: colTemplate }}>
              <span>Alumno</span>
              {evalNames.map(n => <span key={n} style={{ textAlign: 'center' }}>{n}</span>)}
              <span style={{ textAlign: 'center' }}>Prom.</span>
            </div>
            {students.map(s => {
              const avg = getAvg(s.id);
              return (
                <div key={s.id} className="table-row" style={{ gridTemplateColumns: colTemplate }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{s.last_name}, {s.first_name}</span>
                  {evalNames.map(n => (
                    <input
                      key={n}
                      type="number"
                      min="0"
                      max="20"
                      step="0.5"
                      value={grades[`${s.id}_${n}`] ?? ''}
                      onChange={e => handleChange(s.id, n, e.target.value)}
                      style={{ width: '100%', textAlign: 'center', padding: '4px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
                    />
                  ))}
                  <span style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: avg === null ? 'var(--text-muted)' : avg >= 11 ? 'var(--success)' : 'var(--danger)' }}>
                    {avg !== null ? avg.toFixed(1) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}
          style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
          {saving ? 'Guardando...' : 'Guardar Notas'}
        </button>
      </div>

      {/* Eval config modal */}
      {showEvalConfig && (
        <div className="modal-overlay" onClick={() => setShowEvalConfig(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Configurar Evaluaciones</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Define los nombres y cantidad de evaluaciones para este curso.
            </p>
            {evalNames.map((name, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input
                  className="form-input"
                  style={{ flex: 1 }}
                  value={name}
                  onChange={e => {
                    const next = [...evalNames];
                    next[i] = e.target.value;
                    setEvalNames(next);
                  }}
                  placeholder={`Evaluación ${i + 1}`}
                />
                <button onClick={() => setEvalNames(evalNames.filter((_, j) => j !== i))}
                  style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: '#FEE2E2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="trash" color="var(--danger)" size={14} />
                </button>
              </div>
            ))}
            <button onClick={() => setEvalNames([...evalNames, `N${evalNames.length + 1}`])}
              className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: 16 }}>
              + Agregar evaluación
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowEvalConfig(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
              <button onClick={handleSaveEvals} className="btn btn-primary" disabled={savingEvals} style={{ flex: 1, justifyContent: 'center' }}>
                {savingEvals ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
