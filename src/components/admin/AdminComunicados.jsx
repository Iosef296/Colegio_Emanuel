import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';

export default function AdminComunicados() {
  const [comunicados, setComunicados] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', body: '', type: 'general', grade_level_id: '', course_id: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = () => api.get('/communications').then(setComunicados).catch(console.error).finally(() => setLoading(false));

  useEffect(() => {
    Promise.all([load(), api.get('/grade-levels'), api.get('/courses')])
      .then(([, gl, c]) => { setGradeLevels(gl); setCourses(c); })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/communications/${editando.id}`, { title: editando.title, body: editando.body });
      setEditando(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/communications/${id}`);
      setConfirmDelete(null);
      setComunicados(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      await api.post('/communications', {
        title: createForm.title,
        body: createForm.body,
        type: createForm.type,
        grade_level_id: createForm.grade_level_id ? Number(createForm.grade_level_id) : null,
        course_id: createForm.course_id ? Number(createForm.course_id) : null,
      });
      setShowCreate(false);
      setCreateForm({ title: '', body: '', type: 'general', grade_level_id: '', course_id: '' });
      load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

  const typeLabel = { general: 'General', curso: 'Curso', grado: 'Grado', tarea: 'Tarea' };
  const typeColor = { general: '#3B82F6', curso: '#8B5CF6', grado: '#10B981', tarea: '#F59E0B' };
  const typeBg   = { general: '#EFF6FF', curso: '#EDE9FE', grado: '#D1FAE5', tarea: '#FEF3C7' };

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Comunicados</h1>
            <p>Gestionar todos los comunicados y avisos</p>
          </div>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
            onClick={() => setShowCreate(true)}>
            + Nuevo
          </button>
        </div>
      </div>

      <div className="content-area">
        {comunicados.length === 0 && <div className="empty-state"><p>No hay comunicados</p></div>}

        {comunicados.map(c => (
          <div key={c.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: typeBg[c.type] || '#EFF6FF', color: typeColor[c.type] || '#3B82F6' }}>
                    {typeLabel[c.type] || c.type}
                  </span>
                  {c.course_name && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.course_name}</span>}
                  {c.grade_name && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.grade_name}</span>}
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{c.title}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{c.author_name} · {formatDate(c.created_at)}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.body}</p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => setEditando({ id: c.id, title: c.title, body: c.body })}
                  style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#EFF6FF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="edit" color="#3B82F6" size={15} />
                </button>
                <button onClick={() => setConfirmDelete(c)}
                  style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#FEE2E2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="trash" color="var(--danger)" size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Nuevo Comunicado</h3>
            {createError && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: '#FEE2E2', color: 'var(--danger)', fontSize: 13 }}>{createError}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-select" value={createForm.type} onChange={e => setCreateForm({ ...createForm, type: e.target.value, grade_level_id: '', course_id: '' })}>
                  <option value="general">General (todos)</option>
                  <option value="grado">Por grado</option>
                  <option value="curso">Por curso</option>
                </select>
              </div>
              {createForm.type === 'grado' && (
                <div className="form-group">
                  <label className="form-label">Grado</label>
                  <select className="form-select" value={createForm.grade_level_id} onChange={e => setCreateForm({ ...createForm, grade_level_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {gradeLevels.map(gl => <option key={gl.id} value={gl.id}>{gl.name}{gl.section ? ` "${gl.section}"` : ''}</option>)}
                  </select>
                </div>
              )}
              {createForm.type === 'curso' && (
                <div className="form-group">
                  <label className="form-label">Curso</label>
                  <select className="form-select" value={createForm.course_id} onChange={e => setCreateForm({ ...createForm, course_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Título</label>
                <input className="form-input" value={createForm.title} onChange={e => setCreateForm({ ...createForm, title: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Mensaje</label>
                <textarea className="form-textarea" rows={4} value={createForm.body} onChange={e => setCreateForm({ ...createForm, body: e.target.value })} required />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={creating} style={{ flex: 1, justifyContent: 'center' }}>
                  {creating ? 'Publicando...' : 'Publicar'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setEditando(null)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Editar comunicado</h3>
            <div className="form-group">
              <label className="form-label">Título</label>
              <input className="form-input" value={editando.title} onChange={e => setEditando(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Contenido</label>
              <textarea className="form-textarea" rows={4} value={editando.body} onChange={e => setEditando(p => ({ ...p, body: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setEditando(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
              <button onClick={handleSave} className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setConfirmDelete(null)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Icon name="trash" color="var(--danger)" size={22} />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>¿Eliminar comunicado?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>"{confirmDelete.title}"</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete.id)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--danger)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
