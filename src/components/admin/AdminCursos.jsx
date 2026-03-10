import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function AdminCursos() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState(null); // { grade_level_id, grade_name, section }
  const [grades, setGrades] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [courseTeacherCourses, setCourseTeacherCourses] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#3B82F6', description: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    api.get('/courses').then(data => { setCourses(data); setLoading(false); }).catch(console.error);
  };

  useEffect(load, []);
  useAutoRefresh(() => load(true));

  const handleSelectCourse = (c) => {
    setSelectedCourse(c);
    setSelectedGrade(null);
    setDataLoading(true);
    Promise.all([
      api.get(`/grades?course_id=${c.id}`),
      api.get('/students'),
      api.get('/teacher-courses'),
    ]).then(([gr, st, tc]) => {
      setGrades(gr);
      setAllStudents(st);
      setCourseTeacherCourses(tc.filter(t => t.course_id === c.id));
    }).catch(console.error)
      .finally(() => setDataLoading(false));
  };

  const resetForm = () => {
    setForm({ name: '', color: '#3B82F6', description: '' });
    setEditing(null);
    setShowForm(false);
    setMessage('');
  };

  const handleEdit = (c) => {
    setForm({ name: c.name, color: c.color, description: c.description || '' });
    setEditing(c.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (editing) {
        await api.put(`/courses/${editing}`, form);
        setMessage('Curso actualizado');
        if (selectedCourse?.id === editing) setSelectedCourse(c => ({ ...c, ...form }));
      } else {
        await api.post('/courses', form);
        setMessage('Curso creado');
      }
      load();
      setTimeout(resetForm, 1000);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Cargando...</div>;

  const formModal = showForm && (
    <div className="modal-overlay" onClick={() => resetForm()}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>{editing ? 'Editar Curso' : 'Nuevo Curso'}</h3>
        {message && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{message}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre</label>
            <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="form-label">Color</label>
            <input type="color" className="form-input" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ height: 40, padding: 4 }} />
          </div>
          <div className="form-group">
            <label className="form-label">Descripción</label>
            <textarea className="form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
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
  );

  // ── VIEW 3: Students in grade for this course ──
  if (selectedCourse && selectedGrade) {
    const gradeStudents = allStudents
      .filter(s => s.grade_level_id === selectedGrade.grade_level_id)
      .sort((a, b) => a.last_name.localeCompare(b.last_name));

    // Build evaluations per student
    const evalMap = {};
    grades
      .filter(g => g.grade_name === selectedGrade.grade_name && g.section === selectedGrade.section)
      .forEach(g => {
        if (!evalMap[g.student_id]) evalMap[g.student_id] = [];
        evalMap[g.student_id].push({ name: g.evaluation_name, score: Number(g.score) });
      });

    const color = selectedCourse.color;

    return (
      <div>
        <div className="page-header" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div onClick={() => setSelectedGrade(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>←</div>
              <div>
                <h1>{selectedGrade.grade_name}{selectedGrade.section ? ` "${selectedGrade.section}"` : ''}</h1>
                <p>{selectedCourse.name} · {gradeStudents.length} alumnos</p>
              </div>
            </div>
          </div>
        </div>
        <div className="content-area">
          {gradeStudents.length === 0 && <div className="empty-state"><p>Sin alumnos en este grado</p></div>}
          {gradeStudents.map(s => {
            const evals = evalMap[s.id] || [];
            const avg = evals.length > 0 ? evals.reduce((a, e) => a + e.score, 0) / evals.length : null;
            return (
              <div key={s.id} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: evals.length > 0 ? 10 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="user" color={color} size={16} />
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700 }}>{s.first_name} {s.last_name}</p>
                  </div>
                  {avg !== null && (
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Promedio</p>
                      <p style={{ fontSize: 16, fontWeight: 800, color: avg >= 11 ? 'var(--success)' : 'var(--danger)' }}>{avg.toFixed(1)}</p>
                    </div>
                  )}
                </div>
                {evals.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {evals.map((ev, i) => (
                      <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: '4px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 1 }}>{ev.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: ev.score >= 11 ? 'var(--success)' : 'var(--danger)' }}>{ev.score}</span>
                      </div>
                    ))}
                  </div>
                )}
                {evals.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin notas</p>}
              </div>
            );
          })}
        </div>
        {formModal}
      </div>
    );
  }

  // ── VIEW 2: Grades for this course ──
  if (selectedCourse) {
    // Build grade list from teacher_courses + students
    const gradeMap = {};
    courseTeacherCourses.forEach(tc => {
      gradeMap[tc.grade_level_id] = {
        grade_level_id: tc.grade_level_id,
        grade_name: tc.grade_name,
        section: tc.section,
        students: allStudents.filter(s => s.grade_level_id === tc.grade_level_id),
      };
    });
    const gradeList = Object.values(gradeMap).sort((a, b) => a.grade_name.localeCompare(b.grade_name));

    const color = selectedCourse.color;

    return (
      <div>
        <div className="page-header" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div onClick={() => setSelectedCourse(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>←</div>
              <div>
                <h1>{selectedCourse.name}</h1>
                <p>{selectedCourse.description || 'Selecciona un grado'}</p>
              </div>
            </div>
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
              onClick={() => handleEdit(selectedCourse)}>
              <Icon name="edit" size={14} color="white" />
            </button>
          </div>
        </div>
        <div className="content-area">
          {dataLoading && <div className="loading">Cargando...</div>}
          {!dataLoading && gradeList.length === 0 && (
            <div className="empty-state"><p>Sin grados asignados a este curso</p></div>
          )}
          {!dataLoading && gradeList.map(g => {
            const gradeGrades = grades.filter(gr => gr.grade_name === g.grade_name && gr.section === g.section);
            const studentsWithGrades = new Set(gradeGrades.map(gr => gr.student_id)).size;
            return (
              <div key={g.grade_level_id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 8 }}
                onClick={() => setSelectedGrade(g)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="users" color={color} size={20} />
                  </div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700 }}>{g.grade_name}{g.section ? ` "${g.section}"` : ''}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {g.students.length} alumnos · {studentsWithGrades} con notas
                    </p>
                  </div>
                </div>
                <Icon name="back" color="var(--text-muted)" size={18} style={{ transform: 'rotate(180deg)' }} />
              </div>
            );
          })}
        </div>
        {formModal}
      </div>
    );
  }

  // ── VIEW 1: Courses grid ──
  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Cursos</h1>
            <p>{courses.length} cursos</p>
          </div>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }} onClick={() => { resetForm(); setShowForm(true); }}>
            + Nuevo
          </button>
        </div>
      </div>
      <div className="content-area">
        <div className="grid-2">
          {courses.map(c => (
            <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => handleSelectCourse(c)}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: c.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon name="book" color={c.color} size={24} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{c.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.description || 'Sin descripción'}</p>
            </div>
          ))}
        </div>
      </div>
      {formModal}
    </div>
  );
}
