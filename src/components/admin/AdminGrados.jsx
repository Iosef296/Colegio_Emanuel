import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function AdminGrados() {
  const [grades, setGrades] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [gradeGrades, setGradeGrades] = useState([]);
  const [gradeCourses, setGradeCourses] = useState([]); // teacher_courses del grado
  const [payments, setPayments] = useState([]);
  const [gradeGradesLoading, setGradeGradesLoading] = useState(false);
  const [expandedStudents, setExpandedStudents] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', section: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([api.get('/grade-levels'), api.get('/students')])
      .then(([gl, s]) => { setGrades(gl); setStudents(s); setLoading(false); })
      .catch(console.error);
  };

  useEffect(load, []);
  useAutoRefresh(() => load(true));

  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const currentMonth = MONTHS[new Date().getMonth()];
  const currentYear = new Date().getFullYear();

  const handleSelectGrade = (g) => {
    setSelectedGrade(g);
    setExpandedStudents({});
    setGradeGradesLoading(true);
    Promise.all([
      api.get(`/grades?grade_level_id=${g.id}`),
      api.get('/payments'),
      api.get('/teacher-courses'),
    ]).then(([gr, py, tc]) => {
      setGradeGrades(gr);
      setPayments(py);
      setGradeCourses(tc.filter(c => c.grade_level_id === g.id));
    })
      .catch(console.error)
      .finally(() => setGradeGradesLoading(false));
  };

  const toggleStudent = (id) => setExpandedStudents(prev => ({ ...prev, [id]: !prev[id] }));

  const hasPaidCurrentMonth = (studentId) =>
    payments.some(p => p.student_id === studentId && p.paid && p.month === currentMonth && p.year === currentYear);

  const resetForm = () => {
    setForm({ name: '', section: '' });
    setEditing(null);
    setShowForm(false);
    setMessage('');
  };

  const handleEdit = (g) => {
    setForm({ name: g.name, section: g.section });
    setEditing(g.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (editing) {
        await api.put(`/grade-levels/${editing}`, form);
        setMessage('Grado actualizado');
        if (selectedGrade?.id === editing) setSelectedGrade(g => ({ ...g, ...form }));
      } else {
        await api.post('/grade-levels', form);
        setMessage('Grado creado');
      }
      load();
      setTimeout(resetForm, 1000);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g) => {
    try {
      await api.delete(`/grade-levels/${g.id}`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const countStudents = (gradeId) => students.filter(s => s.grade_level_id === gradeId).length;

  if (loading) return <div className="loading">Cargando...</div>;

  const modals = (
    <>
      {showForm && (
        <div className="modal-overlay" onClick={() => resetForm()}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{editing ? 'Editar Grado' : 'Nuevo Grado'}</h3>
            {message && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{message}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre del grado</label>
                <input className="form-input" placeholder="Ej: 1° Primaria" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Sección <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(opcional)</span></label>
                <input className="form-input" placeholder="Ej: A" value={form.section} onChange={e => setForm({ ...form, section: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Icon name="trash" color="var(--danger)" size={22} />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>¿Eliminar grado?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              {confirmDelete.name}{confirmDelete.section ? ` "${confirmDelete.section}"` : ''}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--danger)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ── VIEW 2: Students + grades ──
  if (selectedGrade) {
    const gradeStudents = students
      .filter(s => s.grade_level_id === selectedGrade.id)
      .sort((a, b) => a.last_name.localeCompare(b.last_name));

    // Build map: student_id → { courses: { course_name, color, evaluations[] } }
    const studentMap = {};
    gradeStudents.forEach(s => {
      studentMap[s.id] = { ...s, courses: {} };
      // Pre-populate all courses assigned to this grade (even without grades)
      gradeCourses.forEach(tc => {
        if (!studentMap[s.id].courses[tc.course_name]) {
          studentMap[s.id].courses[tc.course_name] = { color: tc.color || '#6B7280', evaluations: [] };
        }
      });
    });
    gradeGrades.forEach(g => {
      if (!studentMap[g.student_id]) return;
      if (!studentMap[g.student_id].courses[g.course_name]) {
        studentMap[g.student_id].courses[g.course_name] = { color: g.color, evaluations: [] };
      }
      studentMap[g.student_id].courses[g.course_name].evaluations.push({
        name: g.evaluation_name,
        score: Number(g.score),
      });
    });

    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div onClick={() => setSelectedGrade(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>←</div>
              <div>
                <h1>{selectedGrade.name}{selectedGrade.section ? ` "${selectedGrade.section}"` : ''}</h1>
                <p>{gradeStudents.length} alumnos</p>
              </div>
            </div>
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
              onClick={() => handleEdit(selectedGrade)}>
              <Icon name="edit" size={14} color="white" />
            </button>
          </div>
        </div>

        <div className="content-area">
          {gradeGradesLoading && <div className="loading">Cargando notas...</div>}

          {!gradeGradesLoading && gradeStudents.length === 0 && (
            <div className="empty-state"><p>Sin alumnos en este grado</p></div>
          )}

          {!gradeGradesLoading && gradeStudents.map(s => {
            const courseEntries = Object.entries(studentMap[s.id]?.courses || {});
            const allScores = courseEntries.flatMap(([, c]) => c.evaluations.map(e => e.score));
            const avg = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null;
            const paid = hasPaidCurrentMonth(s.id);
            const expanded = !!expandedStudents[s.id];

            return (
              <div key={s.id} className="card" style={{ marginBottom: 10 }}>
                {/* Row: avatar | nombre | pago | promedio + botón */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="user" color="#7C3AED" size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700 }}>{s.first_name} {s.last_name}</p>
                  </div>
                  {/* Average + toggle */}
                  {avg !== null && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>Prom.</p>
                      <p style={{ fontSize: 15, fontWeight: 800, color: avg >= 11 ? 'var(--success)' : 'var(--danger)' }}>{avg.toFixed(1)}</p>
                    </div>
                  )}
                  <button onClick={() => toggleStudent(s.id)}
                    style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                    {expanded ? '▲' : '▼'}
                  </button>
                </div>

                {/* Grades (collapsible) */}
                {expanded && (
                  <div style={{ marginTop: 12 }}>
                    {courseEntries.length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin notas registradas</p>
                    )}
                    {courseEntries.map(([courseName, { color, evaluations }]) => {
                      const courseAvg = evaluations.reduce((a, e) => a + e.score, 0) / evaluations.length;
                      return (
                        <div key={courseName} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color }}>{courseName}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: courseAvg >= 11 ? 'var(--success)' : 'var(--danger)' }}>{courseAvg.toFixed(1)}</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {evaluations.map((ev, i) => (
                              <div key={i} style={{ background: 'var(--bg)', borderRadius: 7, padding: '3px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 52 }}>
                                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{ev.name}</span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: ev.score >= 11 ? 'var(--success)' : 'var(--danger)' }}>{ev.score}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {modals}
      </div>
    );
  }

  // ── VIEW 1: Grades list ──
  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Grados</h1>
            <p>{grades.length} grados registrados</p>
          </div>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
            onClick={() => { resetForm(); setShowForm(true); }}>
            + Nuevo
          </button>
        </div>
      </div>

      <div className="content-area">
        {grades.map(g => {
          const total = countStudents(g.id);
          return (
            <div key={g.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer' }}
              onClick={() => handleSelectGrade(g)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="users" color="#7C3AED" size={20} />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700 }}>{g.name}{g.section ? ` "${g.section}"` : ''}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total} alumno{total !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={e => { e.stopPropagation(); handleEdit(g); }} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }}>
                  <Icon name="edit" size={14} />
                </button>
                <button onClick={e => { e.stopPropagation(); setConfirmDelete(g); }} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
                  <Icon name="trash" size={14} />
                </button>
                <Icon name="back" color="var(--text-muted)" size={18} style={{ transform: 'rotate(180deg)' }} />
              </div>
            </div>
          );
        })}
      </div>
      {modals}
    </div>
  );
}
