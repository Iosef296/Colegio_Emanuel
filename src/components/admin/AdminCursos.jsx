import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';

export default function AdminCursos() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#3B82F6', description: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    api.get('/courses').then(setCourses).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

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
        {showForm && (
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
        )}

        <div className="grid-2">
          {courses.map(c => (
            <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => handleEdit(c)}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: c.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon name="book" color={c.color} size={24} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{c.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.description || 'Sin descripción'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
