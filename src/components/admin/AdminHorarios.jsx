import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const COLORS = ['#DBEAFE','#D1FAE5','#FEF3C7','#FCE7F3','#EDE9FE','#FEE2E2','#CCFBF1','#FEF9C3'];

const LEVEL_ORDER = ['Inicial', 'Primaria', 'Secundaria', 'Otros'];
const LEVEL_COLOR = {
  Inicial:    { color: '#92400E', bg: '#FEF3C7', border: '#FCD34D' },
  Primaria:   { color: '#1E40AF', bg: '#DBEAFE', border: '#93C5FD' },
  Secundaria: { color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' },
  Otros:      { color: '#5B21B6', bg: '#EDE9FE', border: '#C4B5FD' },
};

function getLevel(name = '') {
  const n = name.toLowerCase();
  if (n.includes('inicial'))    return 'Inicial';
  if (n.includes('primaria'))   return 'Primaria';
  if (n.includes('secundaria')) return 'Secundaria';
  return 'Otros';
}

function fmt(time) {
  // "HH:MM:SS" → "HH:MM"
  return time ? time.slice(0, 5) : '';
}

const EMPTY_FORM = { day_of_week: 1, start_time: '07:30', end_time: '08:15', subject: '', teacher_id: '', color: COLORS[0] };

export default function AdminHorarios() {
  const [grades, setGrades]       = useState([]);
  const [teachers, setTeachers]   = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading]     = useState(true);

  const [selectedLevel, setSelectedLevel] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState(null);

  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState(null); // slot being edited, or null for new
  const [form, setForm]       = useState(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/grade-levels'),
      api.get('/users/staff'),
      api.get('/schedules'),
    ]).then(([gls, usrs, schs]) => {
      setGrades(gls);
      setTeachers(usrs);
      setSchedules(schs);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const reloadSchedules = () =>
    api.get('/schedules').then(setSchedules).catch(console.error);

  // ── Agrupación de grados por nivel ──
  const grouped = LEVEL_ORDER
    .map(lvl => ({ lvl, list: grades.filter(g => getLevel(g.name) === lvl) }))
    .filter(({ list }) => list.length > 0);

  // ── Horarios del grado seleccionado ──
  const gradeSchedules = schedules.filter(s => s.grade_level_id === selectedGrade);

  // Filas: pares únicos (start_time, end_time) ordenados
  const timeRows = [...new Map(
    gradeSchedules.map(s => [`${s.start_time}-${s.end_time}`, { start: s.start_time, end: s.end_time }])
  ).values()].sort((a, b) => a.start.localeCompare(b.start));

  // ── Abrir modal para nuevo slot ──
  const openAdd = (prefill = {}) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, ...prefill });
    setModal(true);
  };

  // ── Abrir modal para editar slot existente ──
  const openEdit = (slot) => {
    setEditing(slot);
    setForm({
      day_of_week: slot.day_of_week,
      start_time: fmt(slot.start_time),
      end_time: fmt(slot.end_time),
      subject: slot.subject,
      teacher_id: slot.teacher_id || '',
      color: slot.color || COLORS[0],
    });
    setModal(true);
  };

  // ── Guardar (crear o actualizar) ──
  const handleSave = async () => {
    if (!form.subject.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/schedules/${editing.id}`, {
          start_time: form.start_time,
          end_time: form.end_time,
          subject: form.subject,
          teacher_id: form.teacher_id || null,
          color: form.color,
        });
      } else {
        await api.post('/schedules', {
          grade_level_id: selectedGrade,
          day_of_week: Number(form.day_of_week),
          start_time: form.start_time,
          end_time: form.end_time,
          subject: form.subject,
          teacher_id: form.teacher_id || null,
          color: form.color,
        });
      }
      await reloadSchedules();
      setModal(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Eliminar slot ──
  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este bloque del horario?')) return;
    await api.delete(`/schedules/${id}`).catch(console.error);
    await reloadSchedules();
    setModal(false);
  };

  if (loading) return <div className="loading">Cargando...</div>;

  const selectedGradeObj = grades.find(g => g.id === selectedGrade);

  return (
    <div>
      <div className="page-header">
        <h1>Horarios</h1>
        <p>Horario semanal por grado</p>
      </div>

      <div className="content-area">

        {/* ── Selector de nivel ── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {grouped.map(({ lvl }) => {
            const lc = LEVEL_COLOR[lvl];
            const active = selectedLevel === lvl;
            return (
              <button
                key={lvl}
                onClick={() => { setSelectedLevel(active ? null : lvl); setSelectedGrade(null); }}
                style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 1,
                  padding: '4px 14px', borderRadius: 20, border: `1.5px solid ${lc.border}`,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: active ? lc.color : lc.bg,
                  color: active ? 'white' : lc.color,
                }}
              >
                {lvl.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* ── Selector de grado ── */}
        {selectedLevel && (() => {
          const lc = LEVEL_COLOR[selectedLevel];
          const list = grouped.find(g => g.lvl === selectedLevel)?.list || [];
          return (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {list.map(g => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGrade(selectedGrade === g.id ? null : g.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                    border: `1.5px solid ${selectedGrade === g.id ? 'transparent' : lc.border}`,
                    background: selectedGrade === g.id ? 'var(--primary)' : 'white',
                    color: selectedGrade === g.id ? 'white' : lc.color,
                  }}
                >
                  {g.name}{g.section ? ` ${g.section}` : ''}
                </button>
              ))}
            </div>
          );
        })()}

        {/* ── Grilla semanal ── */}
        {selectedGrade && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {selectedGradeObj?.name}{selectedGradeObj?.section ? ` ${selectedGradeObj.section}` : ''}
              </p>
              <button
                onClick={() => openAdd()}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 13 }}
              >
                <Icon name="plus" color="white" size={16} />
                Agregar bloque
              </button>
            </div>

            {timeRows.length === 0 ? (
              <div className="empty-state">
                <p>Sin horario aún. Pulsa "Agregar bloque" para comenzar.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Hora</th>
                      {DAYS.map(d => <th key={d} style={thStyle}>{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {timeRows.map(({ start, end }) => (
                      <tr key={`${start}-${end}`}>
                        <td style={{ ...tdStyle, fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', background: 'var(--bg)' }}>
                          {fmt(start)}<br />{fmt(end)}
                        </td>
                        {[1, 2, 3, 4, 5].map(day => {
                          const slot = gradeSchedules.find(s => s.day_of_week === day && s.start_time === start);
                          return (
                            <td key={day} style={tdStyle}>
                              {slot ? (
                                <button
                                  onClick={() => openEdit(slot)}
                                  style={{
                                    width: '100%', padding: '8px 6px', borderRadius: 8, border: 'none',
                                    background: slot.color || COLORS[0], cursor: 'pointer',
                                    textAlign: 'left', fontSize: 11, lineHeight: 1.4,
                                  }}
                                >
                                  <strong style={{ display: 'block', fontSize: 12 }}>{slot.subject}</strong>
                                  {slot.teacher_name && (
                                    <span style={{ color: '#374151', fontSize: 10 }}>{slot.teacher_name}</span>
                                  )}
                                </button>
                              ) : (
                                <button
                                  onClick={() => openAdd({ day_of_week: day, start_time: fmt(start), end_time: fmt(end) })}
                                  style={{
                                    width: '100%', padding: '8px 4px', borderRadius: 8,
                                    border: '1.5px dashed var(--border)', background: 'none',
                                    cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1,
                                  }}
                                >
                                  +
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {!selectedGrade && (
          <div className="empty-state">
            <p>Selecciona un nivel y un grado para ver o editar su horario.</p>
          </div>
        )}
      </div>

      {/* ── Modal agregar / editar ── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 24 }}>
            <h3 style={{ marginBottom: 16 }}>{editing ? 'Editar bloque' : 'Nuevo bloque'}</h3>

            {/* Día (solo al crear) */}
            {!editing && (
              <div style={{ marginBottom: 12 }}>
                <label className="form-label">Día</label>
                <select className="form-input" value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))}>
                  {DAYS.map((d, i) => <option key={i + 1} value={i + 1}>{d}</option>)}
                </select>
              </div>
            )}

            {/* Hora inicio / fin */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Inicio</label>
                <input type="time" className="form-input" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Fin</label>
                <input type="time" className="form-input" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>

            {/* Materia */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Materia *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej: Matemática"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>

            {/* Docente */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Docente (opcional)</label>
              <select className="form-input" value={form.teacher_id} onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}>
                <option value="">— Sin asignar —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>

            {/* Color */}
            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Color</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{
                      width: 28, height: 28, borderRadius: 6, background: c, border: 'none', cursor: 'pointer',
                      outline: form.color === c ? '2.5px solid var(--primary)' : '2px solid transparent',
                      outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Acciones */}
            <div style={{ display: 'flex', gap: 8 }}>
              {editing && (
                <button
                  onClick={() => handleDelete(editing.id)}
                  className="btn"
                  style={{ background: '#FEE2E2', color: 'var(--danger)', border: 'none', flex: '0 0 auto', padding: '9px 14px' }}
                >
                  <Icon name="trash" color="var(--danger)" size={16} />
                </button>
              )}
              <button onClick={() => setModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
              <button onClick={handleSave} className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: '8px 6px', background: '#1E3A5F', color: 'white',
  fontSize: 11, fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap',
};
const tdStyle = {
  padding: 4, border: '1px solid var(--border)', verticalAlign: 'top', minWidth: 80,
};
