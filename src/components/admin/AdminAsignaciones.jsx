import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';

export default function AdminAsignaciones() {
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ teacher_id: '', course_id: '', grade_level_id: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    Promise.all([
      api.get('/teacher-courses'),
      api.get('/users'),
      api.get('/courses'),
      api.get('/grade-levels'),
    ]).then(([a, u, c, gl]) => {
      setAssignments(a);
      setTeachers(u.filter(x => x.role === 'docente'));
      setCourses(c);
      setGradeLevels(gl);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/teacher-courses', {
        teacher_id: Number(form.teacher_id),
        course_id: Number(form.course_id),
        grade_level_id: Number(form.grade_level_id),
        period_id: 1,
      });
      setMessage('Asignación creada');
      load();
      setTimeout(() => { setShowForm(false); setMessage(''); }, 1000);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta asignación?')) return;
    try {
      await api.delete(`/teacher-courses/${id}`);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Asignaciones</h1>
            <p>Docente - Curso - Grado</p>
          </div>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }} onClick={() => setShowForm(true)}>
            + Nueva
          </button>
        </div>
      </div>
      <div className="content-area">
        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3>Nueva Asignación</h3>
              {message && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{message}</div>}
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Docente</label>
                  <select className="form-select" value={form.teacher_id} onChange={e => setForm({ ...form, teacher_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Curso</label>
                  <select className="form-select" value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Grado</label>
                  <select className="form-select" value={form.grade_level_id} onChange={e => setForm({ ...form, grade_level_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {gradeLevels.map(gl => <option key={gl.id} value={gl.id}>{gl.name} "{gl.section}"</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                    {saving ? 'Guardando...' : 'Crear'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {assignments.map(a => (
          <div key={a.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: a.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="book" color={a.color} size={20} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{a.course_name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.teacher_name} · {a.grade_name} "{a.section}"</p>
              </div>
            </div>
            <button onClick={() => handleDelete(a.id)} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
              <Icon name="trash" color="white" size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
