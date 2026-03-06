import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../common/Icon';

const compressImage = (file) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const maxSize = 800;
    let { width, height } = img;
    if (width > maxSize || height > maxSize) {
      if (width > height) { height = Math.round((height / width) * maxSize); width = maxSize; }
      else { width = Math.round((width / height) * maxSize); height = maxSize; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    resolve(canvas.toDataURL('image/jpeg', 0.72));
  };
  img.src = URL.createObjectURL(file);
});

export default function DocenteAvanceForm() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({ teacher_course_id: '', date: new Date().toISOString().split('T')[0], content: '' });
  const [photoUrl, setPhotoUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/teacher-courses').then(setCourses).catch(console.error);
  }, []);

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setPhotoUrl(compressed);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/daily-progress', {
        teacher_course_id: Number(form.teacher_course_id),
        date: form.date,
        content: form.content,
        photo_url: photoUrl || undefined,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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

          {/* Photo upload */}
          <div className="form-group">
            <label className="form-label">Foto (opcional)</label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: 'none' }} />
            {photoUrl ? (
              <div style={{ position: 'relative' }}>
                <img src={photoUrl} alt="preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10 }} />
                <button type="button" onClick={() => { setPhotoUrl(null); fileRef.current.value = ''; }}
                  style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="x" color="white" size={14} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current.click()}
                style={{ width: '100%', padding: '12px', border: '2px dashed var(--border)', borderRadius: 10, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                <Icon name="camera" color="var(--text-muted)" size={18} />
                Tomar o subir foto
              </button>
            )}
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
            {saving ? 'Guardando...' : 'Guardar Avance'}
          </button>
        </form>
      </div>
    </div>
  );
}
