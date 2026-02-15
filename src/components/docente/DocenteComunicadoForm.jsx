import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

export default function DocenteComunicadoForm() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', course_id: '', type: 'curso', grade_level_id: '' });
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
      const data = {
        title: form.title,
        body: form.body,
        type: form.type,
        course_id: form.course_id ? Number(form.course_id) : null,
        grade_level_id: form.grade_level_id ? Number(form.grade_level_id) : null,
      };
      await api.post('/communications', data);
      navigate('/docente/comunicados');
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
          <div onClick={() => navigate('/docente/comunicados')} style={{ cursor: 'pointer', opacity: 0.8 }}>← Volver</div>
          <h1>Nuevo Comunicado</h1>
        </div>
      </div>
      <div className="content-area">
        <form className="card" onSubmit={handleSubmit}>
          {error && <div style={{ marginBottom: 12, padding: 10, background: '#FEE2E2', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>{error}</div>}

          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="curso">Por curso</option>
              <option value="general">General</option>
            </select>
          </div>

          {form.type === 'curso' && (
            <div className="form-group">
              <label className="form-label">Curso</label>
              <select className="form-select" value={form.course_id} onChange={e => {
                const tc = courses.find(c => c.course_id === Number(e.target.value));
                setForm({ ...form, course_id: e.target.value, grade_level_id: tc?.grade_level_id || '' });
              }}>
                <option value="">Seleccionar...</option>
                {courses.map(c => (
                  <option key={c.id} value={c.course_id}>{c.course_name} - {c.grade_name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Título</label>
            <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
          </div>

          <div className="form-group">
            <label className="form-label">Mensaje</label>
            <textarea className="form-textarea" rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} required />
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
            {saving ? 'Publicando...' : 'Publicar Comunicado'}
          </button>
        </form>
      </div>
    </div>
  );
}
