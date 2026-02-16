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

  useEffect(() => {
    Promise.all([
      api.get('/teacher-courses'),
      api.get('/students'),
      api.get(`/grades?teacher_course_id=${id}`),
    ]).then(([courses, studs, grds]) => {
      setCourse(courses.find(c => c.id === Number(id)));
      setStudents(studs);
      const gMap = {};
      grds.forEach(g => {
        const key = `${g.student_id}_${g.evaluation_name}`;
        gMap[key] = g.score;
      });
      setGrades(gMap);
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const handleChange = (studentId, eval_name, value) => {
    const key = `${studentId}_${eval_name}`;
    setGrades(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      for (const [key, score] of Object.entries(grades)) {
        if (score === '' || score == null) continue;
        const [student_id, evaluation_name] = key.split('_');
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

  if (loading) return <div className="loading">Cargando...</div>;
  if (!course) return <div className="empty-state"><p>Curso no encontrado</p></div>;

  return (
    <div>
      <div className="page-header" style={{ background: course.color || 'var(--nav-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div onClick={() => navigate('/docente/cursos')} style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="back" color="white" size={18} />
          </div>
          <div>
            <h1>{course.course_name}</h1>
            <p>Registro de notas - {course.grade_name}</p>
          </div>
        </div>
      </div>

      <div className="content-area">
        {message && (
          <div className={`card`} style={{ marginBottom: 12, padding: 12, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13, fontWeight: 600 }}>
            {message}
          </div>
        )}

        <div className="table-scroll">
        <div className="table-container">
          <div className="table-header" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
            <span>Alumno</span>
            <span style={{ textAlign: 'center' }}>N1</span>
            <span style={{ textAlign: 'center' }}>N2</span>
            <span style={{ textAlign: 'center' }}>N3</span>
          </div>
          {students.map(s => (
            <div key={s.id} className="table-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{s.first_name} {s.last_name}</span>
              {['N1', 'N2', 'N3'].map(n => (
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
            </div>
          ))}
        </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
        >
          {saving ? 'Guardando...' : 'Guardar Notas'}
        </button>
      </div>
    </div>
  );
}
