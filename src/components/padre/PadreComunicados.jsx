import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import AvanceAdjuntos from '../common/AvanceAdjuntos';

const formatDate = (d) => new Date(d).toLocaleDateString('es-PE');

const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

function CommCard({ c, onClick }) {
  const accent = (c.type === 'curso' || c.type === 'alumno') && c.course_color ? c.course_color : null;
  return (
    <div className="card" style={{ marginBottom: 8, cursor: 'pointer', borderLeft: accent ? `3px solid ${accent}` : undefined }} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {accent && c.course_name && <p style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 2 }}>{c.course_name}</p>}
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, wordBreak: 'break-word' }}>{c.title}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: c.body ? 4 : 0 }}>{c.author_name} · {formatDate(c.created_at)}</p>
          {c.body && <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{c.body}</p>}
        </div>
      </div>
    </div>
  );
}

function CourseSubSection({ name, comms, onSelect, color = 'var(--primary)' }) {
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
      {open && comms.map(c => <CommCard key={c.id} c={c} onClick={() => onSelect(c)} />)}
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

export default function PadreComunicados() {
  const [comms, setComms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState({ direccion: false, curso: false });

  const load = useCallback(() => {
    api.get('/communications').then(data => { setComms(data); setLoading(false); }).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  if (loading) return <div className="loading">Cargando...</div>;

  if (selected) {
    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div onClick={() => setSelected(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>← Volver</div>
            <h1>Comunicado</h1>
          </div>
        </div>
        <div className="content-area">
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 4 }}>
              <span className="badge badge-primary">
                {selected.course_name || selected.grade_name || 'General'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(selected.created_at)}</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, wordBreak: 'break-word' }}>{selected.title}</h3>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14 }}>De: {selected.author_name}</p>
            <p style={{ fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word' }}>{selected.body}</p>
            <AvanceAdjuntos avance={selected} />
          </div>
        </div>
      </div>
    );
  }

  const direccionComms = comms.filter(c => c.type === 'general' || c.type === 'grado');
  const cursoComms = comms.filter(c => c.type === 'curso' || c.type === 'alumno');

  const byCourse = {};
  cursoComms.forEach(c => {
    const k = c.course_name || c.grade_name || 'Sin curso';
    if (!byCourse[k]) byCourse[k] = { items: [], color: c.course_color || 'var(--primary)' };
    byCourse[k].items.push(c);
  });

  return (
    <div>
      <div className="page-header">
        <h1>Comunicados</h1>
        <p>Avisos y mensajes</p>
      </div>
      <div className="content-area">
        {comms.length === 0 ? (
          <div className="empty-state"><p>No hay comunicados</p></div>
        ) : (
          <>
            {direccionComms.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {sectionHeader('Comunicados de Dirección', direccionComms.length, openSections.direccion, () => setOpenSections(s => ({ ...s, direccion: !s.direccion })))}
                {openSections.direccion && direccionComms.map(c => <CommCard key={c.id} c={c} onClick={() => setSelected(c)} />)}
              </div>
            )}
            {cursoComms.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {sectionHeader('Por Curso', cursoComms.length, openSections.curso, () => setOpenSections(s => ({ ...s, curso: !s.curso })))}
                {openSections.curso && Object.entries(byCourse).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([name, { items, color }]) => (
                  <CourseSubSection key={name} name={name} comms={items} color={color} onSelect={setSelected} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
