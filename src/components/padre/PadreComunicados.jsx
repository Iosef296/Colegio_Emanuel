import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import AvanceAdjuntos from '../common/AvanceAdjuntos';

const formatDate = (d) => new Date(d).toLocaleDateString('es-PE');
const toDateStr = (d) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);
const formatDateShort = (d) =>
  new Date(toDateStr(d) + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });

const statusColor = { temprano: '#16A34A', tarde: '#D97706', falta: '#DC2626', justificado: '#2563EB' };
const statusLabel = { temprano: 'Temprano', tarde: 'Tardanza', falta: 'Falta', justificado: 'Justificado' };

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

function AttCard({ a, hasSalida }) {
  const c = statusColor[a.status] || '#64748B';
  const label = statusLabel[a.status] || a.status;
  const turnoLabel = `Turno: ${a.turno === 'tarde' ? 'Tarde' : 'Mañana'}`;
  const timeStr = a.updated_at
    ? new Date(a.updated_at).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  return (
    <div className="card" style={{ marginBottom: 8, borderLeft: `3px solid ${c}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{formatDateShort(a.date)}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{turnoLabel}{timeStr ? ` · ${timeStr}` : ''}</p>
          {a.first_name && <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{a.first_name} {a.last_name}</p>}
          <p style={{ fontSize: 11, marginTop: 3, fontWeight: 600, color: hasSalida ? '#16A34A' : '#D97706' }}>
            {hasSalida ? 'Ya salio' : 'Aun en el colegio'}
          </p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: c, background: c + '18', borderRadius: 10, padding: '3px 10px' }}>{label}</span>
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

function SectionHeader({ title, count, open, onToggle }) {
  return (
    <div onClick={onToggle}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 0', borderBottom: '2px solid var(--border)', marginBottom: open ? 12 : 0, userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 20, padding: '1px 8px' }}>{count}</span>
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{open ? '▼' : '▶'}</span>
    </div>
  );
}

export default function PadreComunicados() {
  const [tab, setTab] = useState('comunicados');
  const [comms, setComms] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState({ curso: true, asistencia: true });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const isEarlyMonth = now.getDate() <= 7;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const load = useCallback(() => {
    const attPrev = isEarlyMonth
      ? api.get(`/attendance?month=${prevMonth}&year=${prevYear}`)
      : Promise.resolve([]);
    Promise.all([
      api.get('/communications'),
      api.get(`/attendance?month=${month}&year=${year}`),
      attPrev,
    ]).then(([c, a, ap]) => {
      setComms(c);
      setAttendance([...a, ...ap]);
      setLoading(false);
    }).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  if (loading) return <div className="loading">Cargando...</div>;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const direccionComms = comms.filter(c => c.type === 'general' || c.type === 'grado');
  const cursoComms = comms.filter(c =>
    (c.type === 'curso' || c.type === 'alumno') && new Date(c.created_at) >= thirtyDaysAgo
  );
  const salidaKeys = new Set(
    attendance
      .filter(a => a.tipo === 'salida' && a.status === 'salida' && toDateStr(a.date) >= sevenDaysAgoStr)
      .map(a => `${a.student_id}-${toDateStr(a.date)}-${a.turno}`)
  );
  const recentAttendance = attendance
    .filter(a => toDateStr(a.date) >= sevenDaysAgoStr && a.tipo !== 'salida')
    .sort((a, b) => toDateStr(b.date).localeCompare(toDateStr(a.date)));

  const byCourse = {};
  cursoComms.forEach(c => {
    const k = c.course_name || c.grade_name || 'Sin curso';
    if (!byCourse[k]) byCourse[k] = { items: [], color: c.course_color || 'var(--primary)' };
    byCourse[k].items.push(c);
  });

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
              <span className="badge badge-primary">{selected.course_name || selected.grade_name || 'General'}</span>
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

  return (
    <div>
      <div className="page-header">
        <h1>Comunicados</h1>
        <p>Avisos y mensajes</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 0', marginBottom: 0 }}>
        {[
          { key: 'comunicados', label: 'Comunicados', count: direccionComms.length },
          { key: 'avisos', label: 'Avisos', count: cursoComms.length + recentAttendance.length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: tab === t.key ? 'var(--primary)' : 'var(--bg)',
              color: tab === t.key ? 'white' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            {t.label}
            {t.count > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                background: tab === t.key ? 'rgba(255,255,255,0.25)' : 'var(--primary-light)',
                color: tab === t.key ? 'white' : 'var(--primary)',
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="content-area" style={{ paddingTop: 12 }}>
        {tab === 'comunicados' && (
          direccionComms.length === 0
            ? <div className="empty-state"><p>No hay comunicados de Dirección</p></div>
            : direccionComms.map(c => <CommCard key={c.id} c={c} onClick={() => setSelected(c)} />)
        )}

        {tab === 'avisos' && (
          cursoComms.length === 0 && recentAttendance.length === 0
            ? <div className="empty-state"><p>No hay avisos recientes</p></div>
            : <>
                {cursoComms.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <SectionHeader
                      title="Comunicados de Curso"
                      count={cursoComms.length}
                      open={openSections.curso}
                      onToggle={() => setOpenSections(s => ({ ...s, curso: !s.curso }))}
                    />
                    {openSections.curso && Object.entries(byCourse)
                      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
                      .map(([name, { items, color }]) => (
                        <CourseSubSection key={name} name={name} comms={items} color={color} onSelect={setSelected} />
                      ))}
                  </div>
                )}
                {recentAttendance.length > 0 && (
                  <div>
                    <SectionHeader
                      title="Asistencia esta semana"
                      count={recentAttendance.length}
                      open={openSections.asistencia}
                      onToggle={() => setOpenSections(s => ({ ...s, asistencia: !s.asistencia }))}
                    />
                    {openSections.asistencia && recentAttendance.map(a => (
                      <AttCard key={`${a.student_id}-${toDateStr(a.date)}-${a.turno}`} a={a} hasSalida={salidaKeys.has(`${a.student_id}-${toDateStr(a.date)}-${a.turno}`)} />
                    ))}
                  </div>
                )}
              </>
        )}
      </div>
    </div>
  );
}
