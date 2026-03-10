import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
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

export default function DocenteComunicadoForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileRef = useRef(null);
  const isDocente = user?.role === 'docente';
  const isAuxiliar = user?.role === 'auxiliar';
  const backPath = isDocente ? '/docente/comunicados' : '/auxiliar/comunicados';

  const [courses, setCourses] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({
    title: '', body: '',
    type: isDocente ? 'curso' : 'general',
    course_id: '', grade_level_id: '',
  });
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [searchStudent, setSearchStudent] = useState('');
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isDocente) {
      api.get('/teacher-courses').then(setCourses).catch(console.error);
      api.get('/students').then(setStudents).catch(console.error);
    }
    if (isAuxiliar) {
      api.get('/grade-levels').then(setGradeLevels).catch(console.error);
    }
  }, [isDocente, isAuxiliar]);

  // Group students by grade for display
  const studentsByGrade = students.reduce((acc, s) => {
    const key = s.grade_name + (s.section ? ` "${s.section}"` : '');
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const filteredStudents = searchStudent.trim()
    ? students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchStudent.toLowerCase()))
    : null; // null means show grouped by grade

  const toggleStudent = (id) => {
    setSelectedStudents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
    setFiles(prev => [...prev, ...added]);
    fileRef.current.value = '';
  };

  const toggleCollapse = (i) => setFiles(prev => prev.map((f, j) => j === i ? { ...f, collapsed: !f.collapsed } : f));
  const removeFile = (i) => setFiles(prev => prev.filter((_, j) => j !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.type === 'alumno' && selectedStudents.size === 0) {
      setError('Selecciona al menos un alumno');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const attachments = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadProgress(`Subiendo archivo ${i + 1} de ${files.length}...`);
        const formData = new FormData();
        formData.append('photo', f.blob, f.type === 'pdf' ? f.name : f.uploadName);
        const { url } = await api.upload('/upload', formData);
        attachments.push(url);
      }
      setUploadProgress('');
      await api.post('/communications', {
        title: form.title,
        body: form.body,
        type: form.type,
        course_id: form.course_id ? Number(form.course_id) : null,
        grade_level_id: form.grade_level_id ? Number(form.grade_level_id) : null,
        student_ids: form.type === 'alumno' ? Array.from(selectedStudents) : undefined,
        attachments: attachments.length ? attachments : undefined,
      });
      navigate(backPath);
    } catch (err) {
      setError(err.message);
      setUploadProgress('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div onClick={() => navigate(backPath)} style={{ cursor: 'pointer', opacity: 0.8 }}>← Volver</div>
          <h1>Nuevo Comunicado</h1>
        </div>
      </div>
      <div className="content-area">
        <form className="card" onSubmit={handleSubmit}>
          {error && <div style={{ marginBottom: 12, padding: 10, background: '#FEE2E2', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>{error}</div>}

          {isDocente && (
            <div className="form-group">
              <label className="form-label">Destinatarios</label>
              <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value, course_id: '', grade_level_id: '' })}>
                <option value="curso">Por curso</option>
                <option value="alumno">Alumnos específicos</option>
              </select>
            </div>
          )}

          {isAuxiliar && (
            <div className="form-group">
              <label className="form-label">Destinatarios</label>
              <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value, grade_level_id: '' })}>
                <option value="general">General (todos)</option>
                <option value="grado">Por grado</option>
              </select>
            </div>
          )}

          {isAuxiliar && form.type === 'grado' && (
            <div className="form-group">
              <label className="form-label">Grado</label>
              <select className="form-select" value={form.grade_level_id} onChange={e => setForm({ ...form, grade_level_id: e.target.value })} required>
                <option value="">Seleccionar...</option>
                {gradeLevels.map(gl => <option key={gl.id} value={gl.id}>{gl.name}{gl.section ? ` "${gl.section}"` : ''}</option>)}
              </select>
            </div>
          )}

          {isDocente && (
            <div className="form-group">
              <label className="form-label">Curso</label>
              <select className="form-select" value={form.course_id} onChange={e => {
                const tc = courses.find(c => c.course_id === Number(e.target.value));
                setForm({ ...form, course_id: e.target.value, grade_level_id: tc?.grade_level_id || '' });
              }} required>
                <option value="">Seleccionar...</option>
                {courses.map(c => (
                  <option key={c.id} value={c.course_id}>{c.course_name} - {c.grade_name}</option>
                ))}
              </select>
            </div>
          )}

          {isDocente && form.type === 'alumno' && (
            <div className="form-group">
              <label className="form-label">
                Alumnos {selectedStudents.size > 0 && <span style={{ color: 'var(--primary)', fontWeight: 700 }}>({selectedStudents.size} seleccionados)</span>}
              </label>
              <input
                className="form-input"
                placeholder="Buscar alumno..."
                value={searchStudent}
                onChange={e => setSearchStudent(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 4 }}>
                {filteredStudents ? (
                  filteredStudents.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', margin: 0 }}>Sin resultados</p>
                  ) : filteredStudents.map(s => (
                    <StudentRow key={s.id} s={s} checked={selectedStudents.has(s.id)} onToggle={toggleStudent} />
                  ))
                ) : (
                  Object.entries(studentsByGrade).map(([grade, gradeStudents]) => (
                    <div key={grade}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 12px 2px', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>{grade}</p>
                      {gradeStudents.map(s => (
                        <StudentRow key={s.id} s={s} checked={selectedStudents.has(s.id)} onToggle={toggleStudent} />
                      ))}
                    </div>
                  ))
                )}
              </div>
              {selectedStudents.size > 0 && (
                <button type="button" onClick={() => setSelectedStudents(new Set())}
                  style={{ marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', padding: 0 }}>
                  Limpiar selección
                </button>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Título</label>
            <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
          </div>

          <div className="form-group">
            <label className="form-label">Mensaje</label>
            <textarea className="form-textarea" rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Opcional..." />
          </div>

          <div className="form-group">
            <label className="form-label">Adjuntos (fotos o PDFs, opcional)</label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleFiles} style={{ display: 'none' }} />

            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                {files.map((f, i) => (
                  <div key={i}>
                    {f.type === 'image' ? (
                      <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg)', cursor: 'pointer' }} onClick={() => toggleCollapse(i)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <Icon name="image" color="var(--text-muted)" size={16} />
                            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <span style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1 }}>{f.collapsed ? '▶' : '▼'}</span>
                            <button type="button" onClick={e => { e.stopPropagation(); removeFile(i); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                              <Icon name="x" color="var(--text-muted)" size={14} />
                            </button>
                          </div>
                        </div>
                        {!f.collapsed && <img src={f.preview} alt="preview" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', display: 'block', background: '#f0f0f0' }} />}
                      </div>
                    ) : (
                      <div style={{ border: '1.5px solid var(--primary)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg)', cursor: 'pointer' }} onClick={() => toggleCollapse(i)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <Icon name="pdf" color="var(--primary)" size={16} />
                            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <span style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1 }}>{f.collapsed ? '▶' : '▼'}</span>
                            <button type="button" onClick={e => { e.stopPropagation(); removeFile(i); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
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
              {files.length > 0 ? 'Agregar más archivos' : 'Foto, imagen o PDF'}
            </button>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
            {saving ? (uploadProgress || 'Publicando...') : 'Publicar Comunicado'}
          </button>
        </form>
      </div>
    </div>
  );
}

function StudentRow({ s, checked, onToggle }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer', borderRadius: 6, background: checked ? 'rgba(37,99,235,0.06)' : 'transparent' }}>
      <input type="checkbox" checked={checked} onChange={() => onToggle(s.id)}
        style={{ width: 15, height: 15, accentColor: 'var(--primary)', flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{s.last_name}, {s.first_name}</span>
    </label>
  );
}
