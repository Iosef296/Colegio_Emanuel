import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

export default function DocenteAvanceForm() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({ teacher_course_id: '', date: new Date().toISOString().split('T')[0], content: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/teacher-courses').then(setCourses).catch(console.error);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/daily-progress', {
        teacher_course_id: Number(form.teacher_course_id),
        date: form.date,
        content: form.content,
      });
      navigate('/docente/avances');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div onClick={() => navigate('/docente/avances')} style={{ cursor: 'pointer', opacity: 0.8 }}>← Volver</div>
          <h1>Nuevo Avance</h1>
        </div>
      </div>
      <div className="content-area">
        <form className="card" onSubmit={handleSubmit}>
          {error && <div style={{ marginBottom: 12, padding: 10, background: '#FEE2E2', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>{error}</div>}

          <div className="form-group">
            <label className="form-label">Curso</label>
            <select className="form-select" value={form.teacher_course_id} onChange={e => setForm({ ...form, teacher_course_id: e.target.value })} required>
              <option value="">Seleccionar...</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.course_name} - {c.grade_name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input type="date" className="form-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
          </div>

          <div className="form-group">
            <label className="form-label">Contenido</label>
            <textarea className="form-textarea" rows={5} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="Describa lo trabajado en clase..." required />
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
            {saving ? 'Guardando...' : 'Guardar Avance'}
          </button>
        </form>
      </div>
    </div>
  );
}
