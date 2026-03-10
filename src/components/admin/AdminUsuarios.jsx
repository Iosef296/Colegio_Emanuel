import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function AdminUsuarios() {
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', dni: '', email: '', phone: '', role: 'docente' });
  const [editForm, setEditForm] = useState({ full_name: '', password: '', dni: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [credentials, setCredentials] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignForm, setAssignForm] = useState({ course_id: '', grade_level_id: '' });
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignMessage, setAssignMessage] = useState('');

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.get('/users'),
      api.get('/teacher-courses'),
      api.get('/courses'),
      api.get('/grade-levels'),
    ]).then(([u, a, c, gl]) => {
      setUsers(u.filter(x => x.role === 'docente' || x.role === 'auxiliar'));
      setAssignments(a);
      setCourses(c);
      setGradeLevels(gl);
      setLoading(false);
    }).catch(console.error);
  };

  useEffect(load, []);
  useAutoRefresh(() => load(true));

  useEffect(() => {
    if (credentials?.username) {
      QRCode.toDataURL(credentials.username, { width: 200, margin: 2 })
        .then(url => setQrDataUrl(url))
        .catch(console.error);
    }
  }, [credentials]);

  // Keep selectedTeacher in sync after reload
  useEffect(() => {
    if (selectedTeacher) {
      const updated = users.find(u => u.id === selectedTeacher.id);
      if (updated) setSelectedTeacher(updated);
    }
  }, [users]);

  const resetForm = () => {
    setForm({ first_name: '', last_name: '', dni: '', email: '', phone: '', role: 'docente' });
    setEditing(null);
    setShowForm(false);
    setMessage('');
  };

  const handleEdit = (u) => {
    setEditForm({ full_name: u.full_name, password: '', dni: u.dni || '', email: u.email || '', phone: u.phone || '', role: u.role });
    setEditing(u);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (editing) {
        const data = { ...editForm };
        if (!data.password) delete data.password;
        await api.put(`/users/${editing.id}`, data);
        setMessage('Usuario actualizado');
        load();
        setTimeout(resetForm, 1000);
      } else {
        const created = await api.post('/users', { ...form, role: form.role });
        load();
        resetForm();
        setCredentials({ username: created.username, password: created.password, full_name: created.full_name, role: form.role });
      }
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { active: u.active ? 0 : 1 });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl || !credentials) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR-${credentials.full_name}.png`;
    a.click();
  };

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    setAssignSaving(true);
    setAssignMessage('');
    try {
      await api.post('/teacher-courses', {
        teacher_id: selectedTeacher.id,
        course_id: Number(assignForm.course_id),
        grade_level_id: Number(assignForm.grade_level_id),
        period_id: 1,
      });
      setAssignMessage('Asignación creada');
      setAssignForm({ course_id: '', grade_level_id: '' });
      load();
      setTimeout(() => { setShowAssignForm(false); setAssignMessage(''); }, 800);
    } catch (err) {
      setAssignMessage('Error: ' + err.message);
    } finally {
      setAssignSaving(false);
    }
  };

  const handleDeleteAssignment = async (id) => {
    if (!confirm('¿Eliminar esta asignación?')) return;
    try {
      await api.delete(`/teacher-courses/${id}`);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="loading">Cargando...</div>;

  const teacherAssignments = selectedTeacher
    ? assignments.filter(a => a.teacher_id === selectedTeacher.id)
    : [];

  // Shared modals
  const modals = (
    <>
      {showForm && (
        <div className="modal-overlay" onClick={() => resetForm()}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{editing ? 'Editar Usuario' : (form.role === 'auxiliar' ? 'Nuevo Auxiliar' : 'Nuevo Profesor')}</h3>
            {message && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{message}</div>}
            <form onSubmit={handleSubmit}>
              {editing ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Nombre completo</label>
                    <input className="form-input" value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Usuario</label>
                    <input className="form-input" value={editing.username} disabled style={{ opacity: 0.6 }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nueva contraseña (dejar vacío para no cambiar)</label>
                    <input className="form-input" type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">DNI</label>
                    <input className="form-input" value={editForm.dni} onChange={e => setEditForm({ ...editForm, dni: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Rol</label>
                    <select className="form-select" value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                      <option value="docente">Docente</option>
                      <option value="auxiliar">Auxiliar</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Nombres</label>
                    <input className="form-input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apellidos</label>
                    <input className="form-input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">DNI <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(se usará como contraseña)</span></label>
                    <input className="form-input" value={form.dni} onChange={e => setForm({ ...form, dni: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Rol</label>
                    <select className="form-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                      <option value="docente">Docente</option>
                      <option value="auxiliar">Auxiliar</option>
                    </select>
                  </div>
                </>
              )}
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

      {credentials && (
        <div className="modal-overlay" onClick={() => setCredentials(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{credentials.role === 'auxiliar' ? 'Auxiliar creado' : 'Profesor creado'}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{credentials.full_name}</p>
            {qrDataUrl && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <img src={qrDataUrl} alt="QR Code" style={{ width: 200, height: 200 }} />
              </div>
            )}
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>Credenciales de acceso</p>
              <p style={{ fontSize: 13, marginBottom: 4 }}>Usuario: <strong style={{ fontFamily: 'monospace' }}>{credentials.username}</strong></p>
              <p style={{ fontSize: 13 }}>Contraseña: <strong style={{ fontFamily: 'monospace' }}>{credentials.password}</strong></p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleDownloadQr} disabled={!qrDataUrl}>
                Descargar QR
              </button>
              <button className="btn btn-secondary" onClick={() => setCredentials(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {showAssignForm && (
        <div className="modal-overlay" onClick={() => { setShowAssignForm(false); setAssignMessage(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Nueva Asignación</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{selectedTeacher?.full_name}</p>
            {assignMessage && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: assignMessage.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: assignMessage.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{assignMessage}</div>}
            <form onSubmit={handleCreateAssignment}>
              <div className="form-group">
                <label className="form-label">Curso</label>
                <select className="form-select" value={assignForm.course_id} onChange={e => setAssignForm({ ...assignForm, course_id: e.target.value })} required>
                  <option value="">Seleccionar...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Grado</label>
                <select className="form-select" value={assignForm.grade_level_id} onChange={e => setAssignForm({ ...assignForm, grade_level_id: e.target.value })} required>
                  <option value="">Seleccionar...</option>
                  {gradeLevels.map(gl => <option key={gl.id} value={gl.id}>{gl.name} "{gl.section}"</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={assignSaving} style={{ flex: 1, justifyContent: 'center' }}>
                  {assignSaving ? 'Guardando...' : 'Asignar'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignForm(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );

  // ── VIEW 2: Teacher detail + assignments ──
  if (selectedTeacher) {
    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div onClick={() => setSelectedTeacher(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>←</div>
              <div>
                <h1>{selectedTeacher.full_name}</h1>
                <p>@{selectedTeacher.username}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
                onClick={() => handleEdit(selectedTeacher)}>
                <Icon name="edit" size={14} color="white" />
              </button>
              {selectedTeacher.role === 'docente' && (
                <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
                  onClick={() => setShowAssignForm(true)}>
                  + Asignar
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="content-area">
          {selectedTeacher.role === 'auxiliar' ? (
            <div className="empty-state"><p>El auxiliar tiene acceso a Asistencia y Comunicados.</p></div>
          ) : (
            <>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Cursos asignados ({teacherAssignments.length})
              </p>
              {teacherAssignments.length === 0 && (
                <div className="empty-state"><p>Sin asignaciones. Usa "+ Asignar" para agregar.</p></div>
              )}
              {teacherAssignments.map(a => (
                <div key={a.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: (a.color || '#3B82F6') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="book" color={a.color || '#3B82F6'} size={18} />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700 }}>{a.course_name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.grade_name} "{a.section}"</p>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteAssignment(a.id)} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
                    <Icon name="trash" color="white" size={14} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
        {modals}
      </div>
    );
  }

  // ── VIEW 1: Teachers list ──
  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Personal</h1>
            <p>{users.filter(u => u.role === 'docente').length} docentes · {users.filter(u => u.role === 'auxiliar').length} auxiliares</p>
          </div>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
            onClick={() => { resetForm(); setShowForm(true); }}>
            + Nuevo
          </button>
        </div>
      </div>
      <div className="content-area">
        {users.map(u => {
          const count = assignments.filter(a => a.teacher_id === u.id).length;
          return (
            <div key={u.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }}
              onClick={() => setSelectedTeacher(u)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="user" color="var(--text-muted)" size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{u.full_name}</p>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: u.role === 'auxiliar' ? '#FEF3C7' : '#EFF6FF', color: u.role === 'auxiliar' ? '#92400E' : '#1D4ED8' }}>
                      {u.role === 'auxiliar' ? 'Auxiliar' : 'Docente'}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{u.username}{u.role === 'docente' ? ` · ${count} curso${count !== 1 ? 's' : ''}` : ''}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={e => { e.stopPropagation(); handleToggleActive(u); }}
                  className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-success'}`}
                  style={{ padding: '4px 8px', fontSize: 10 }}>
                  {u.active ? 'Desact.' : 'Activar'}
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
