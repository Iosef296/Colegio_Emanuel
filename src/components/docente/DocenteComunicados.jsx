import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import AvanceAdjuntos from '../common/AvanceAdjuntos';
import Icon from '../common/Icon';

const formatDate = (d) => new Date(d).toLocaleDateString('es-PE');

const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const supportsWebP = (() => {
  const c = document.createElement('canvas');
  return c.toDataURL('image/webp').startsWith('data:image/webp');
})();

const compressImageToBlob = (file) => new Promise((resolve) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
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
  img.src = url;
});

function CommCard({ c, onRefresh, editable }) {
  const { user } = useAuth();
  const canEdit = editable !== undefined ? editable : c.author_id === user?.id;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const [body, setBody] = useState(c.body || '');
  // existingUrls: attachment URLs kept from original; newFiles: new blobs to upload
  const existingInit = c.attachments ? (typeof c.attachments === 'string' ? JSON.parse(c.attachments) : c.attachments) : [];
  const [existingUrls, setExistingUrls] = useState(existingInit);
  const [newFiles, setNewFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileRef = useRef(null);

  const resetEdit = () => {
    setEditing(false);
    setTitle(c.title);
    setBody(c.body || '');
    setExistingUrls(existingInit);
    setNewFiles([]);
  };

  const handleFiles = async (e) => {
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
    setNewFiles(prev => [...prev, ...added]);
    fileRef.current.value = '';
  };

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const uploaded = [];
      for (let i = 0; i < newFiles.length; i++) {
        const f = newFiles[i];
        setUploadProgress(`Subiendo ${i + 1}/${newFiles.length}...`);
        const formData = new FormData();
        formData.append('photo', f.blob, f.type === 'pdf' ? f.name : f.uploadName);
        const { url } = await api.upload('/upload', formData);
        uploaded.push(url);
      }
      setUploadProgress('');
      const allAttachments = [...existingUrls, ...uploaded];
      await api.put(`/communications/${c.id}`, {
        title: title.trim(),
        body,
        attachments: allAttachments,
      });
      setEditing(false);
      onRefresh();
    } catch (err) { alert(err.message); setUploadProgress(''); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!window.confirm('¿Eliminar este comunicado?')) return;
    try {
      await api.delete(`/communications/${c.id}`);
      onRefresh();
    } catch (err) { alert(err.message); }
  };

  if (editing) {
    return (
      <div className="card" style={{ marginBottom: 8 }}>
        <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Título" style={{ marginBottom: 8, fontSize: 13 }} />
        <textarea className="form-textarea" rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="Mensaje (opcional)" style={{ marginBottom: 8, fontSize: 13 }} />

        {/* Existing attachments */}
        {existingUrls.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {existingUrls.map((url, i) => {
              const isPdf = url.endsWith('.pdf');
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>
                  <Icon name={isPdf ? 'pdf' : 'image'} color={isPdf ? 'var(--primary)' : 'var(--text-muted)'} size={13} />
                  <span style={{ fontSize: 11, color: 'var(--text)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isPdf ? `PDF ${i + 1}` : `Imagen ${i + 1}`}
                  </span>
                  <button type="button" onClick={() => setExistingUrls(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                    <Icon name="x" color="var(--text-muted)" size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* New files to upload */}
        {newFiles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {newFiles.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(37,99,235,0.06)', border: '1px solid var(--primary)', borderRadius: 6, padding: '3px 8px' }}>
                <Icon name={f.type === 'pdf' ? 'pdf' : 'image'} color="var(--primary)" size={13} />
                <span style={{ fontSize: 11, color: 'var(--text)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <button type="button" onClick={() => setNewFiles(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                  <Icon name="x" color="var(--primary)" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleFiles} style={{ display: 'none' }} />
        <button type="button" onClick={() => fileRef.current.click()}
          style={{ width: '100%', padding: '7px', border: '2px dashed var(--border)', borderRadius: 8, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
          <Icon name="camera" color="var(--text-muted)" size={14} />
          {newFiles.length > 0 ? 'Agregar más' : 'Agregar foto o PDF'}
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
            {saving ? (uploadProgress || 'Guardando...') : 'Guardar'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={resetEdit} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
        </div>
      </div>
    );
  }

  const accent = (c.type === 'curso' || c.type === 'alumno') && c.course_color ? c.course_color : null;
  return (
    <div className="card" style={{ marginBottom: 8, borderLeft: accent ? `3px solid ${accent}` : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {accent && c.course_name && <p style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 2 }}>{c.course_name}</p>}
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, wordBreak: 'break-word' }}>{c.title}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: c.body ? 4 : 0 }}>{c.author_name} · {formatDate(c.created_at)}</p>
          {c.body && <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, wordBreak: 'break-word' }}>{c.body}</p>}
          <AvanceAdjuntos avance={c} />
        </div>
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 13, lineHeight: 1 }} title="Editar">✏️</button>
            <button onClick={remove} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 13, lineHeight: 1 }} title="Eliminar">🗑️</button>
          </div>
        )}
      </div>
    </div>
  );
}

function StudentInCourse({ name, comms, onRefresh, color = 'var(--primary)' }) {
  const [open, setOpen] = useState(false);
  const rgb12 = color.startsWith('#') ? hexToRgba(color, 0.12) : 'rgba(37,99,235,0.12)';
  return (
    <div style={{ marginBottom: 6, paddingLeft: 8, borderLeft: `2px solid ${rgb12}` }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '5px 0', marginBottom: open ? 6 : 0, userSelect: 'none' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10, color, background: rgb12, borderRadius: 10, padding: '1px 6px' }}>{comms.length}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1 }}>{open ? '▼' : '▶'}</span>
        </div>
      </div>
      {open && comms.map(c => <CommCard key={c.id} c={c} onRefresh={onRefresh} />)}
    </div>
  );
}

function CourseSubSection({ name, comms, onRefresh, color = 'var(--primary)' }) {
  const [open, setOpen] = useState(false);
  const rgb12 = color.startsWith('#') ? hexToRgba(color, 0.12) : 'rgba(37,99,235,0.12)';
  return (
    <div style={{ marginBottom: 10, paddingLeft: 8, borderLeft: `3px solid ${color}` }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '6px 0', marginBottom: open ? 8 : 0, userSelect: 'none' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color, background: rgb12, borderRadius: 10, padding: '1px 7px' }}>{comms.length}</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1 }}>{open ? '▼' : '▶'}</span>
        </div>
      </div>
      {open && comms.map(c => <CommCard key={c.id} c={c} onRefresh={onRefresh} />)}
    </div>
  );
}

const sectionHeader = (title, count, open, onToggle) => (
  <div onClick={onToggle}
    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 0', borderBottom: '2px solid var(--border)', marginBottom: open ? 12 : 0, userSelect: 'none' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 20, padding: '1px 8px' }}>{count}</span>
    </div>
    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{open ? '▼' : '▶'}</span>
  </div>
);

export default function DocenteComunicados() {
  const [comms, setComms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState({ general: false, curso: false, alumno: false });
  const navigate = useNavigate();
  const { user } = useAuth();
  const newPath = user?.role === 'auxiliar' ? '/auxiliar/comunicados/nuevo' : '/docente/comunicados/nuevo';

  const load = useCallback(() => {
    api.get('/communications').then(data => { setComms(data); setLoading(false); }).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  if (loading) return <div className="loading">Cargando...</div>;

  const generalComms = comms.filter(c => c.type === 'general' || c.type === 'grado');
  const cursoComms = comms.filter(c => c.type === 'curso');
  const alumnoComms = comms.filter(c => c.type === 'alumno');

  const byCourse = {};
  cursoComms.forEach(c => {
    const k = c.course_name || 'Sin curso';
    if (!byCourse[k]) byCourse[k] = { items: [], color: c.course_color || 'var(--primary)' };
    byCourse[k].items.push(c);
  });

  const byStudent = {};
  alumnoComms.forEach(c => {
    const students = c.students_list
      ? (typeof c.students_list === 'string' ? JSON.parse(c.students_list) : c.students_list)
      : [];
    if (!students.length) {
      if (!byStudent['Sin alumno']) byStudent['Sin alumno'] = [];
      byStudent['Sin alumno'].push(c);
    } else {
      students.forEach(s => {
        if (!byStudent[s.name]) byStudent[s.name] = [];
        byStudent[s.name].push(c);
      });
    }
  });

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Comunicados</h1>
            <p>Mis comunicados</p>
          </div>
          <button
            className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
            onClick={() => navigate(newPath)}
          >
            + Nuevo
          </button>
        </div>
      </div>
      <div className="content-area">
        {/* General */}
        {generalComms.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {sectionHeader('Comunicados de Dirección', generalComms.length, openSections.general, () => setOpenSections(s => ({ ...s, general: !s.general })))}
            {openSections.general && generalComms.map(c => <CommCard key={c.id} c={c} onRefresh={load} />)}
          </div>
        )}

        {/* Por Curso */}
        {cursoComms.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {sectionHeader('Por Curso', cursoComms.length, openSections.curso, () => setOpenSections(s => ({ ...s, curso: !s.curso })))}
            {openSections.curso && Object.entries(byCourse).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([name, { items, color }]) => (
              <CourseSubSection key={name} name={name} comms={items} color={color} onRefresh={load} />
            ))}
          </div>
        )}

        {/* Por Alumno */}
        {alumnoComms.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {sectionHeader('Por Alumno', alumnoComms.length, openSections.alumno, () => setOpenSections(s => ({ ...s, alumno: !s.alumno })))}
            {openSections.alumno && Object.entries(byStudent).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([name, items]) => (
              <StudentInCourse key={name} name={name} comms={items} onRefresh={load} color={items[0]?.course_color || '#8B5CF6'} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
