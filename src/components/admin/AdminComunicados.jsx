import { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import AvanceAdjuntos from '../common/AvanceAdjuntos';

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

export default function AdminComunicados() {
  const [comunicados, setComunicados] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);
  const [editExistingUrls, setEditExistingUrls] = useState([]);
  const [editNewFiles, setEditNewFiles] = useState([]);
  const [editUploadProgress, setEditUploadProgress] = useState('');
  const editFileRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', body: '', type: 'general', grade_level_id: '', course_id: '' });
  const [createFiles, setCreateFiles] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createUploadProgress, setCreateUploadProgress] = useState('');
  const [createError, setCreateError] = useState('');
  const createFileRef = useRef(null);
  const [openSections, setOpenSections] = useState({ general: false, curso: false, alumno: false });
  const [openCourseGroups, setOpenCourseGroups] = useState({});

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    return api.get('/communications').then(data => { setComunicados(data); setLoading(false); }).catch(console.error);
  };

  useEffect(() => {
    Promise.all([load(), api.get('/grade-levels'), api.get('/courses')])
      .then(([, gl, c]) => { setGradeLevels(gl); setCourses(c); })
      .catch(console.error);
  }, []);
  useAutoRefresh(() => load(true));

  const handleEditFiles = async (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;
    const added = await Promise.all(selected.map(async (file) => {
      if (file.type === 'application/pdf') {
        return { blob: file, type: 'pdf', name: file.name, preview: URL.createObjectURL(file) };
      }
      const blob = await compressImageToBlob(file);
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      return { blob, type: 'image', name: file.name, uploadName: `photo.${ext}`, preview: URL.createObjectURL(blob) };
    }));
    setEditNewFiles(prev => [...prev, ...added]);
    editFileRef.current.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const uploaded = [];
      for (let i = 0; i < editNewFiles.length; i++) {
        const f = editNewFiles[i];
        setEditUploadProgress(`Subiendo ${i + 1}/${editNewFiles.length}...`);
        const formData = new FormData();
        formData.append('photo', f.blob, f.type === 'pdf' ? f.name : f.uploadName);
        const { url } = await api.upload('/upload', formData);
        uploaded.push(url);
      }
      setEditUploadProgress('');
      await api.put(`/communications/${editando.id}`, {
        title: editando.title,
        body: editando.body,
        attachments: [...editExistingUrls, ...uploaded],
      });
      setEditando(null);
      setEditNewFiles([]);
      load();
    } catch (err) {
      alert(err.message);
      setEditUploadProgress('');
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

  const handleCreateFiles = async (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;
    const added = await Promise.all(selected.map(async (file) => {
      if (file.type === 'application/pdf') {
        return { blob: file, type: 'pdf', name: file.name, preview: URL.createObjectURL(file) };
      } else {
        const blob = await compressImageToBlob(file);
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        return { blob, type: 'image', name: file.name, uploadName: `photo.${ext}`, preview: URL.createObjectURL(blob) };
      }
    }));
    setCreateFiles(prev => [...prev, ...added]);
    createFileRef.current.value = '';
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const attachments = [];
      for (let i = 0; i < createFiles.length; i++) {
        const f = createFiles[i];
        setCreateUploadProgress(`Subiendo archivo ${i + 1} de ${createFiles.length}...`);
        const formData = new FormData();
        formData.append('photo', f.blob, f.type === 'pdf' ? f.name : f.uploadName);
        const { url } = await api.upload('/upload', formData);
        attachments.push(url);
      }
      setCreateUploadProgress('');
      await api.post('/communications', {
        title: createForm.title,
        body: createForm.body,
        type: createForm.type,
        grade_level_id: createForm.grade_level_id ? Number(createForm.grade_level_id) : null,
        course_id: createForm.course_id ? Number(createForm.course_id) : null,
        attachments: attachments.length ? attachments : undefined,
      });
      setShowCreate(false);
      setCreateForm({ title: '', body: '', type: 'general', grade_level_id: '', course_id: '' });
      setCreateFiles([]);
      load();
    } catch (err) {
      setCreateError(err.message);
      setCreateUploadProgress('');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

  const typeLabel = { general: 'General', curso: 'Curso', grado: 'Grado', tarea: 'Tarea' };
  const typeColor = { general: '#3B82F6', curso: '#8B5CF6', grado: '#10B981', tarea: '#F59E0B' };
  const typeBg   = { general: '#EFF6FF', curso: '#EDE9FE', grado: '#D1FAE5', tarea: '#FEF3C7' };

  const generalComms = comunicados.filter(c => c.type === 'general' || c.type === 'grado');
  const cursoComms = comunicados.filter(c => c.type === 'curso');
  const alumnoComms = comunicados.filter(c => c.type === 'alumno' || c.type === 'tarea');

  const groupByCourse = (comms) => {
    const map = {};
    comms.forEach(c => {
      const k = c.course_name || 'Sin curso';
      if (!map[k]) map[k] = { items: [], color: c.course_color || 'var(--primary)' };
      map[k].items.push(c);
    });
    return Object.entries(map).map(([name, v]) => ({ name, items: v.items, color: v.color }));
  };

  const groupByStudent = (comms) => {
    const map = {};
    comms.forEach(c => {
      const students = c.students_list
        ? (typeof c.students_list === 'string' ? JSON.parse(c.students_list) : c.students_list)
        : [];
      if (!students.length) {
        if (!map['Sin alumno']) map['Sin alumno'] = [];
        map['Sin alumno'].push(c);
      } else {
        students.forEach(s => {
          if (!map[s.name]) map[s.name] = [];
          map[s.name].push(c);
        });
      }
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  };

  const renderCard = (c, opts = {}) => {
    const accent = c.course_color || null;
    return (
    <div key={c.id} className="card" style={{ marginBottom: 10, borderLeft: opts.accentBorder && accent ? `3px solid ${accent}` : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>
            {!opts.hideBadge && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: typeBg[c.type] || '#EFF6FF', color: typeColor[c.type] || '#3B82F6' }}>
                {typeLabel[c.type] || c.type}
              </span>
            )}
            {c.course_name && <span style={{ fontSize: opts.hideBadge ? 12 : 10, fontWeight: opts.hideBadge ? 700 : 400, color: opts.hideBadge && accent ? accent : 'var(--text-muted)' }}>{c.course_name}</span>}
            {c.grade_name && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.grade_name}</span>}
          </div>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{c.title}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{c.author_name} · {formatDate(c.created_at)}</p>
          {c.body && <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.body}</p>}
          <AvanceAdjuntos avance={c} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => {
              const urls = c.attachments ? (typeof c.attachments === 'string' ? JSON.parse(c.attachments) : c.attachments) : [];
              setEditExistingUrls(urls);
              setEditNewFiles([]);
              setEditando({ id: c.id, title: c.title, body: c.body });
            }}
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
  );};

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

        {/* General */}
        {generalComms.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div onClick={() => setOpenSections(s => ({ ...s, general: !s.general }))}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 0', borderBottom: '2px solid var(--border)', marginBottom: openSections.general ? 12 : 0, userSelect: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>General</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 20, padding: '1px 8px' }}>{generalComms.length}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{openSections.general ? '▼' : '▶'}</span>
            </div>
            {openSections.general && generalComms.map(c => renderCard(c))}
          </div>
        )}

        {/* Por Curso */}
        {cursoComms.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div onClick={() => setOpenSections(s => ({ ...s, curso: !s.curso }))}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 0', borderBottom: '2px solid var(--border)', marginBottom: openSections.curso ? 12 : 0, userSelect: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Por Curso</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 20, padding: '1px 8px' }}>{cursoComms.length}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{openSections.curso ? '▼' : '▶'}</span>
            </div>
            {openSections.curso && groupByCourse(cursoComms).map(({ name: courseName, items, color }) => {
              const key = `curso-${courseName}`;
              const open = openCourseGroups[key] === true;
              return (
                <div key={key} style={{ marginBottom: 8, paddingLeft: 8, borderLeft: `3px solid ${color}` }}>
                  <div onClick={() => setOpenCourseGroups(g => ({ ...g, [key]: !open }))}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '6px 0', marginBottom: open ? 8 : 0, userSelect: 'none' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>{courseName}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{open ? '▼' : '▶'}</span>
                  </div>
                  {open && items.map(c => renderCard(c))}
                </div>
              );
            })}
          </div>
        )}

        {/* Por Alumno */}
        {alumnoComms.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div onClick={() => setOpenSections(s => ({ ...s, alumno: !s.alumno }))}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 0', borderBottom: '2px solid var(--border)', marginBottom: openSections.alumno ? 12 : 0, userSelect: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Por Alumno</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 20, padding: '1px 8px' }}>{alumnoComms.length}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{openSections.alumno ? '▼' : '▶'}</span>
            </div>
            {openSections.alumno && groupByStudent(alumnoComms).map(([studentName, comms]) => {
              const key = `alumno-${studentName}`;
              const open = openCourseGroups[key] === true;
              return (
                <div key={key} style={{ marginBottom: 8, paddingLeft: 8, borderLeft: '3px solid #8B5CF6' }}>
                  <div onClick={() => setOpenCourseGroups(g => ({ ...g, [key]: !open }))}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '6px 0', marginBottom: open ? 8 : 0, userSelect: 'none' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{studentName}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{open ? '▼' : '▶'}</span>
                  </div>
                  {open && comms.map(c => renderCard(c, { hideBadge: true, accentBorder: true }))}
                </div>
              );
            })}
          </div>
        )}
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
                <label className="form-label">Mensaje (opcional)</label>
                <textarea className="form-textarea" rows={4} value={createForm.body} onChange={e => setCreateForm({ ...createForm, body: e.target.value })} placeholder="Opcional..." />
              </div>
              <div className="form-group">
                <label className="form-label">Adjuntos (fotos o PDFs, opcional)</label>
                <input ref={createFileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleCreateFiles} style={{ display: 'none' }} />
                {createFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {createFiles.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 12 }}>
                        <Icon name={f.type === 'pdf' ? 'pdf' : 'image'} color="var(--text-muted)" size={13} />
                        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <button type="button" onClick={() => setCreateFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                          <Icon name="x" color="var(--text-muted)" size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => createFileRef.current.click()}
                  style={{ width: '100%', padding: '8px', border: '2px dashed var(--border)', borderRadius: 8, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
                  <Icon name="camera" color="var(--text-muted)" size={14} />
                  {createFiles.length > 0 ? 'Agregar más' : 'Foto, imagen o PDF'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={creating} style={{ flex: 1, justifyContent: 'center' }}>
                  {creating ? (createUploadProgress || 'Publicando...') : 'Publicar'}
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

            {/* Existing attachments */}
            {editExistingUrls.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {editExistingUrls.map((url, i) => {
                  const isPdf = url.endsWith('.pdf');
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>
                      <Icon name={isPdf ? 'pdf' : 'image'} color={isPdf ? 'var(--primary)' : 'var(--text-muted)'} size={13} />
                      <span style={{ fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isPdf ? `PDF ${i + 1}` : `Imagen ${i + 1}`}</span>
                      <button type="button" onClick={() => setEditExistingUrls(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                        <Icon name="x" color="var(--text-muted)" size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* New files */}
            {editNewFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {editNewFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(37,99,235,0.06)', border: '1px solid var(--primary)', borderRadius: 6, padding: '3px 8px' }}>
                    <Icon name={f.type === 'pdf' ? 'pdf' : 'image'} color="var(--primary)" size={13} />
                    <span style={{ fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button type="button" onClick={() => setEditNewFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                      <Icon name="x" color="var(--primary)" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input ref={editFileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleEditFiles} style={{ display: 'none' }} />
            <button type="button" onClick={() => editFileRef.current.click()}
              style={{ width: '100%', padding: '7px', border: '2px dashed var(--border)', borderRadius: 8, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
              <Icon name="camera" color="var(--text-muted)" size={14} />
              {editNewFiles.length > 0 ? 'Agregar más' : 'Agregar foto o PDF'}
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditando(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
              <button onClick={handleSave} className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                {saving ? (editUploadProgress || 'Guardando...') : 'Guardar'}
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
