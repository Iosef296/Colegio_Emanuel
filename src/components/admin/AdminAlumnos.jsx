import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function AdminAlumnos() {
  const [students, setStudents] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', dni: '', birth_date: '', grade_level_id: '', monthly_fee: '350' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [qrStudent, setQrStudent] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.get('/students'),
      api.get('/grade-levels'),
    ]).then(([s, gl]) => {
      setStudents(s);
      setGradeLevels(gl);
      setLoading(false);
    }).catch(console.error);
  };

  useEffect(load, []);
  useAutoRefresh(() => load(true));

  useEffect(() => {
    if (qrStudent?.codigo) {
      QRCode.toDataURL(qrStudent.codigo, { width: 200, margin: 2 })
        .then(url => setQrDataUrl(url))
        .catch(console.error);
    } else {
      setQrDataUrl('');
    }
  }, [qrStudent]);

  // Build grade groups
  const gradeMap = {};
  students.forEach(s => {
    const key = s.grade_level_id;
    if (!gradeMap[key]) gradeMap[key] = { grade_level_id: key, grade_name: s.grade_name, section: s.section, students: [] };
    gradeMap[key].students.push(s);
  });
  const grades = Object.values(gradeMap).sort((a, b) => a.grade_name.localeCompare(b.grade_name));

  const resetForm = () => {
    setForm({ first_name: '', last_name: '', dni: '', birth_date: '', grade_level_id: '', monthly_fee: '350' });
    setEditing(null);
    setShowForm(false);
    setMessage('');
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleEdit = async (s) => {
    let monthly_fee = '350';
    try {
      const payments = await api.get('/payments');
      const unpaid = payments.find(p => p.student_id === s.id && !p.paid);
      const any = payments.find(p => p.student_id === s.id);
      if (unpaid) monthly_fee = String(unpaid.amount);
      else if (any) monthly_fee = String(any.amount);
    } catch { /* keep default */ }
    setForm({
      first_name: s.first_name,
      last_name: s.last_name,
      dni: s.dni || '',
      birth_date: s.birth_date ? s.birth_date.split('T')[0] : '',
      grade_level_id: s.grade_level_id,
      monthly_fee,
    });
    setPhotoFile(null);
    setPhotoPreview(s.photo_url || null);
    setEditing(s.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    const trimmedFirst = form.first_name.trim();
    const trimmedLast = form.last_name.trim();
    if (!trimmedFirst || !trimmedLast) return setMessage('Error: Nombres y apellidos son obligatorios');
    if (form.dni && !/^\d{8}$/.test(form.dni)) return setMessage('Error: El DNI debe tener exactamente 8 dígitos');
    if (form.birth_date && new Date(form.birth_date) > new Date()) return setMessage('Error: La fecha de nacimiento no puede ser futura');

    setSaving(true);
    try {
      let photo_url = photoFile ? null : (photoPreview || null);
      if (photoFile) {
        const fd = new FormData();
        fd.append('photo', photoFile);
        const result = await api.upload('/upload', fd);
        photo_url = result.url;
      }
      const data = { ...form, first_name: trimmedFirst, last_name: trimmedLast, grade_level_id: Number(form.grade_level_id), monthly_fee: Number(form.monthly_fee), photo_url };
      if (editing) {
        await api.put(`/students/${editing}`, data);
        setMessage('Alumno actualizado');
        load();
        setTimeout(resetForm, 1000);
      } else {
        const created = await api.post('/students', data);
        const gl = gradeLevels.find(g => g.id === Number(form.grade_level_id));
        const newStudent = {
          id: created.id,
          first_name: trimmedFirst,
          last_name: trimmedLast,
          codigo: created.codigo,
          grade_name: gl?.name || '',
          section: gl?.section || '',
          username: created.username,
          password: created.password,
        };
        load();
        resetForm();
        setQrStudent(newStudent);
      }
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl || !qrStudent) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR-${qrStudent.first_name}-${qrStudent.last_name}.png`;
    a.click();
  };

  const handleGenerateCodigo = async () => {
    try {
      const { codigo } = await api.post(`/students/${qrStudent.id}/codigo`, {});
      setQrStudent({ ...qrStudent, codigo });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const closeQr = () => {
    setQrStudent(null);
    setQrDataUrl('');
  };

  const handleDelete = async (s) => {
    if (!confirm(`¿Eliminar a ${s.first_name} ${s.last_name}?`)) return;
    try {
      await api.delete(`/students/${s.id}`);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleGeneratePayments = async () => {
    if (!confirm('¿Generar mensualidades (Marzo-Diciembre) para todos los alumnos activos?')) return;
    try {
      const res = await api.post('/students/generate-payments', {});
      alert(res.message);
      load();
    } catch (err) {
      alert('Error al generar mensualidades');
    }
  };

  if (loading) return <div className="loading">Cargando...</div>;

  // Modals (shared between views)
  const modals = (
    <>
      {showForm && (
        <div className="modal-overlay" onClick={() => resetForm()}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{editing ? 'Editar Alumno' : 'Nuevo Alumno'}</h3>
            {message && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{message}</div>}
            <form onSubmit={handleSubmit}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <label htmlFor="student-photo-input" style={{ cursor: 'pointer' }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', border: `2px dashed ${photoPreview ? 'var(--primary)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', overflow: 'hidden', background: '#F9FAFB' }}>
                    {photoPreview
                      ? <img src={photoPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Icon name="camera" color="var(--text-muted)" size={28} />
                    }
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Toca para tomar o escoger foto</p>
                </label>
                <input id="student-photo-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Nombres</label>
                <input className="form-input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Apellidos</label>
                <input className="form-input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">DNI</label>
                <input className="form-input" value={form.dni} onChange={e => setForm({ ...form, dni: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de nacimiento</label>
                <input type="date" className="form-input" value={form.birth_date} onChange={e => setForm({ ...form, birth_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Grado</label>
                <select className="form-select" value={form.grade_level_id} onChange={e => setForm({ ...form, grade_level_id: e.target.value })} required>
                  <option value="">Seleccionar...</option>
                  {gradeLevels.map(gl => (
                    <option key={gl.id} value={gl.id}>{gl.name} "{gl.section}"</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Mensualidad (S/){editing && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>(actualiza cuotas pendientes)</span>}</label>
                <input className="form-input" type="number" step="0.01" min="0" value={form.monthly_fee} onChange={e => setForm({ ...form, monthly_fee: e.target.value })} required />
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

      {qrStudent && (
        <div className="modal-overlay" onClick={closeQr}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>QR - {qrStudent.first_name} {qrStudent.last_name}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
              {qrStudent.grade_name} "{qrStudent.section}"
            </p>
            {qrStudent.codigo ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Código: {qrStudent.codigo}</p>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  {qrDataUrl
                    ? <img src={qrDataUrl} alt="QR Code" style={{ width: 200, height: 200 }} />
                    : <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Generando QR...</div>
                  }
                </div>
                {qrStudent.username && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 12, marginBottom: 16, textAlign: 'left' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>Credenciales de acceso</p>
                    <p style={{ fontSize: 13, marginBottom: 4 }}>Usuario: <strong style={{ fontFamily: 'monospace' }}>{qrStudent.username}</strong></p>
                    <p style={{ fontSize: 13 }}>Contraseña: <strong style={{ fontFamily: 'monospace' }}>{qrStudent.password || qrStudent.dni || 'su DNI'}</strong></p>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleDownloadQr} disabled={!qrDataUrl}>
                    Descargar PNG
                  </button>
                  <button className="btn btn-secondary" onClick={closeQr}>Cerrar</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Este alumno no tiene código QR asignado.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleGenerateCodigo}>
                    Generar código
                  </button>
                  <button className="btn btn-secondary" onClick={closeQr}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );

  // ── VIEW 2: Students in grade ──
  if (selectedGrade) {
    const gradeStudents = gradeMap[selectedGrade.grade_level_id]?.students || [];
    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div onClick={() => setSelectedGrade(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>←</div>
              <div>
                <h1>{selectedGrade.grade_name}</h1>
                <p>Sección "{selectedGrade.section}" · {gradeStudents.length} alumnos</p>
              </div>
            </div>
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
              onClick={() => { resetForm(); setForm(f => ({ ...f, grade_level_id: selectedGrade.grade_level_id })); setShowForm(true); }}>
              + Nuevo
            </button>
          </div>
        </div>
        <div className="content-area">
          {gradeStudents.length === 0 && <div className="empty-state"><p>Sin alumnos en este grado</p></div>}
          {gradeStudents.map(s => (
            <div key={s.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {s.photo_url
                    ? <img src={s.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Icon name="user" color="var(--success)" size={20} />
                  }
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{s.first_name} {s.last_name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.dni ? `DNI: ${s.dni}` : 'Sin DNI'}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setQrStudent(s)} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }} title="Ver QR">
                  <Icon name="qr" size={14} />
                </button>
                <button onClick={() => handleEdit(s)} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }}>
                  <Icon name="edit" size={14} />
                </button>
                <button onClick={() => handleDelete(s)} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          ))}
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
            <h1>Alumnos</h1>
            <p>{students.length} alumnos registrados</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', fontSize: 11 }} onClick={handleGeneratePayments}>
              Generar mensualidades
            </button>
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
              onClick={() => { resetForm(); setShowForm(true); }}>
              + Nuevo
            </button>
          </div>
        </div>
      </div>
      <div className="content-area">
        {grades.map(g => (
          <div key={g.grade_level_id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 8 }}
            onClick={() => setSelectedGrade(g)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="users" color="var(--success)" size={20} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700 }}>{g.grade_name} "{g.section}"</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.students.length} alumnos</p>
              </div>
            </div>
            <Icon name="back" color="var(--text-muted)" size={18} style={{ transform: 'rotate(180deg)' }} />
          </div>
        ))}
      </div>
      {modals}
    </div>
  );
}
