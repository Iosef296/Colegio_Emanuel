import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../common/Icon';

const supportsWebP = (() => {
  const c = document.createElement('canvas');
  return c.toDataURL('image/webp').startsWith('data:image/webp');
})();

const compressImageToBlob = (file) => new Promise((resolve) => {
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    const maxSize = 1200;
    let { width, height } = img;
    if (width > maxSize || height > maxSize) {
      if (width > height) { height = Math.round((height / width) * maxSize); width = maxSize; }
      else { width = Math.round((width / height) * maxSize); height = maxSize; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    if (supportsWebP) canvas.toBlob(resolve, 'image/webp', 0.85);
    else canvas.toBlob(resolve, 'image/jpeg', 0.92);
  };
  img.src = objectUrl;
});

function isPdf(url) { return String(url).toLowerCase().endsWith('.pdf'); }
function normDate(d) { return String(d).split('T')[0]; }

export default function DocenteAvanceEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(null);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/daily-progress/${id}`),
      api.get('/teacher-courses'),
    ]).then(([avance, courseList]) => {
      setForm({
        teacher_course_id: String(avance.teacher_course_id),
        date: normDate(avance.date),
        title: avance.title || '',
        content: avance.content || '',
      });
      const atts = avance.attachments
        ? JSON.parse(avance.attachments)
        : (avance.photo_url ? [avance.photo_url] : []);
      setExistingAttachments(atts);
      setCourses(courseList);
    }).catch(err => setError(err.message));
  }, [id]);

  const handleFiles = async (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;
    const added = await Promise.all(selected.map(async (file) => {
      if (file.type === 'application/pdf') {
        return { blob: file, type: 'pdf', name: file.name, preview: URL.createObjectURL(file), collapsed: false };
      } else {
        const blob = await compressImageToBlob(file);
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        return { blob, type: 'image', name: file.name, uploadName: `photo.${ext}`, preview: URL.createObjectURL(blob), collapsed: false };
      }
    }));
    setNewFiles(prev => [...prev, ...added]);
    fileRef.current.value = '';
  };

  const toggleNew = (i) => setNewFiles(prev => prev.map((f, j) => j === i ? { ...f, collapsed: !f.collapsed } : f));
  const removeNew = (i) => setNewFiles(prev => prev.filter((_, j) => j !== i));
  const removeExisting = (i) => setExistingAttachments(prev => prev.filter((_, j) => j !== i));

  const handleDelete = async () => {
    try {
      await api.delete(`/daily-progress/${id}`);
      navigate('/docente/avances');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const uploadedUrls = [];
      for (let i = 0; i < newFiles.length; i++) {
        const f = newFiles[i];
        setUploadProgress(`Subiendo archivo ${i + 1} de ${newFiles.length}...`);
        const formData = new FormData();
        formData.append('photo', f.blob, f.type === 'pdf' ? f.name : f.uploadName);
        const { url } = await api.upload('/upload', formData);
        uploadedUrls.push(url);
      }
      setUploadProgress('');
      const allAttachments = [...existingAttachments, ...uploadedUrls];
      await api.put(`/daily-progress/${id}`, {
        teacher_course_id: Number(form.teacher_course_id),
        date: form.date,
        title: form.title || undefined,
        content: form.content,
        attachments: allAttachments.length ? allAttachments : undefined,
      });
      navigate('/docente/avances');
    } catch (err) {
      setError(err.message);
      setUploadProgress('');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <div className="loading">{error || 'Cargando...'}</div>;

  const DeleteConfirm = confirmDelete ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={() => setConfirmDelete(false)}>
      <div style={{ background: 'white', borderRadius: 20, padding: 24, width: '100%', maxWidth: 320, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <Icon name="trash" color="var(--danger)" size={22} />
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>¿Eliminar avance?</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Esta acción no se puede deshacer.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setConfirmDelete(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
          <button onClick={handleDelete} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--danger)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Eliminar</button>
        </div>
      </div>
    </div>
  ) : null;

  const totalFiles = existingAttachments.length + newFiles.length;

  // Label for existing attachments
  let imgCount = 0, pdfCount = 0;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div onClick={() => navigate('/docente/avances')} style={{ cursor: 'pointer', opacity: 0.8 }}>← Volver</div>
            <h1>Editar Avance</h1>
          </div>
          <button onClick={() => setConfirmDelete(true)}
            style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="trash" color="white" size={17} />
          </button>
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
            <label className="form-label">Título</label>
            <input type="text" className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Tema o título del avance..." required />
          </div>

          <div className="form-group">
            <label className="form-label">Contenido <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>(opcional)</span></label>
            <textarea className="form-textarea" rows={5} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="Describa lo trabajado en clase..." />
          </div>

          <div className="form-group">
            <label className="form-label">Adjuntos</label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleFiles} style={{ display: 'none' }} />

            {totalFiles > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                {existingAttachments.map((url, i) => {
                  const pdf = isPdf(url);
                  const label = pdf ? `PDF ${++pdfCount}` : `Imagen ${++imgCount}`;
                  return (
                    <div key={`ex-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', border: `1.5px solid ${pdf ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, background: 'var(--bg)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name={pdf ? 'pdf' : 'image'} color={pdf ? 'var(--primary)' : 'var(--text-muted)'} size={16} />
                        <span style={{ fontSize: 12, color: 'var(--text)' }}>{label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(guardado)</span>
                      </div>
                      <button type="button" onClick={() => removeExisting(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                        <Icon name="x" color="var(--text-muted)" size={14} />
                      </button>
                    </div>
                  );
                })}

                {newFiles.map((f, i) => (
                  <div key={`new-${i}`}>
                    {f.type === 'image' ? (
                      <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg)', cursor: 'pointer' }} onClick={() => toggleNew(i)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <Icon name="image" color="var(--text-muted)" size={16} />
                            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <span style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1 }}>{f.collapsed ? '▶' : '▼'}</span>
                            <button type="button" onClick={e => { e.stopPropagation(); removeNew(i); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                              <Icon name="x" color="var(--text-muted)" size={14} />
                            </button>
                          </div>
                        </div>
                        {!f.collapsed && <img src={f.preview} alt="preview" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', display: 'block', background: '#f0f0f0' }} />}
                      </div>
                    ) : (
                      <div style={{ border: '1.5px solid var(--primary)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg)', cursor: 'pointer' }} onClick={() => toggleNew(i)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <Icon name="pdf" color="var(--primary)" size={16} />
                            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <span style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1 }}>{f.collapsed ? '▶' : '▼'}</span>
                            <button type="button" onClick={e => { e.stopPropagation(); removeNew(i); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                              <Icon name="x" color="var(--text-muted)" size={14} />
                            </button>
                          </div>
                        </div>
                        {!f.collapsed && <iframe src={f.preview} style={{ width: '100%', height: 320, border: 'none', display: 'block' }} title={f.name} />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={() => fileRef.current.click()}
              style={{ width: '100%', padding: '10px', border: '2px dashed var(--border)', borderRadius: 10, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
              <Icon name="camera" color="var(--text-muted)" size={16} />
              {totalFiles > 0 ? 'Agregar más archivos' : 'Foto, imagen o PDF'}
            </button>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
            {saving ? (uploadProgress || 'Guardando...') : 'Guardar Cambios'}
          </button>
        </form>
      </div>
      {DeleteConfirm}
    </div>
  );
}
