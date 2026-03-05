import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api/client';
import Icon from '../common/Icon';

export default function AdminUsuarios() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', dni: '', email: '', phone: '' });
  const [editForm, setEditForm] = useState({ full_name: '', password: '', dni: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [credentials, setCredentials] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const load = () => {
    api.get('/users').then(data => setUsers(data.filter(u => u.role === 'docente'))).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    if (credentials?.username) {
      QRCode.toDataURL(credentials.username, { width: 200, margin: 2 })
        .then(url => setQrDataUrl(url))
        .catch(console.error);
    }
  }, [credentials]);

  const resetForm = () => {
    setForm({ first_name: '', last_name: '', dni: '', email: '', phone: '' });
    setEditing(null);
    setShowForm(false);
    setMessage('');
  };

  const handleEdit = (u) => {
    setEditForm({ full_name: u.full_name, password: '', dni: u.dni || '', email: u.email || '', phone: u.phone || '' });
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
        setMessage('Profesor actualizado');
        load();
        setTimeout(resetForm, 1000);
      } else {
        const created = await api.post('/users', { ...form, role: 'docente' });
        load();
        resetForm();
        setCredentials({ username: created.username, password: created.password, full_name: created.full_name });
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
        {/* Create / Edit modal */}
        {showForm && (
          <div className="modal-overlay" onClick={() => resetForm()}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3>{editing ? 'Editar Profesor' : 'Nuevo Profesor'}</h3>
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

        {/* Credentials + QR modal */}
        {credentials && (
          <div className="modal-overlay" onClick={() => setCredentials(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3>Profesor creado</h3>
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

        {/* Teacher list */}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
