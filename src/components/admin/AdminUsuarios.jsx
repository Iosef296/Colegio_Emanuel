import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';

export default function AdminUsuarios() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'docente', full_name: '', dni: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    api.get('/users').then(data => setUsers(data.filter(u => u.role === 'docente'))).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const resetForm = () => {
    setForm({ username: '', password: '', role: 'padre', full_name: '', dni: '', email: '', phone: '' });
    setEditing(null);
    setShowForm(false);
    setMessage('');
  };

  const handleEdit = (u) => {
    setForm({ username: u.username, password: '', role: u.role, full_name: u.full_name, dni: u.dni || '', email: u.email || '', phone: u.phone || '' });
    setEditing(u.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (editing) {
        const data = { ...form };
        if (!data.password) delete data.password;
        await api.put(`/users/${editing}`, data);
        setMessage('Usuario actualizado');
      } else {
        await api.post('/users', form);
        setMessage('Usuario creado');
      }
      load();
      setTimeout(resetForm, 1000);
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

  const roleBadge = { padre: 'badge-primary', docente: 'badge-success', admin: 'badge-warning' };

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Profesores</h1>
            <p>{users.length} profesores registrados</p>
          </div>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }} onClick={() => { resetForm(); setShowForm(true); }}>
            + Nuevo
          </button>
        </div>
      </div>
      <div className="content-area">
        {/* Form modal */}
        {showForm && (
          <div className="modal-overlay" onClick={() => resetForm()}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3>{editing ? 'Editar Profesor' : 'Nuevo Profesor'}</h3>
              {message && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{message}</div>}
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Nombre completo</label>
                  <input className="form-input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Usuario</label>
                  <input className="form-input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Contraseña {editing && '(dejar vacío para no cambiar)'}</label>
                  <input className="form-input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} {...(!editing && { required: true })} />
                </div>
                <div className="form-group">
                  <label className="form-label">DNI</label>
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

        {/* User list */}
        {users.map(u => (
          <div key={u.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="user" color="var(--text-muted)" size={20} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{u.full_name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{u.username}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className={`badge ${roleBadge[u.role]}`}>{u.role}</span>
              <button onClick={() => handleEdit(u)} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }}>
                <Icon name="edit" size={14} />
              </button>
              <button onClick={() => handleToggleActive(u)} className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-success'}`} style={{ padding: '4px 8px', fontSize: 10 }}>
                {u.active ? 'Desact.' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
