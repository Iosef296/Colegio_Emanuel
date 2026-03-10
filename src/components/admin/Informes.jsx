import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import AvanceAdjuntos from '../common/AvanceAdjuntos';

const formatDate = (d) => new Date(d).toLocaleDateString('es-PE');

const STATUS_LABEL = { temprano: 'Temprano', tarde: 'Tarde', falta: 'Falta', presente: 'Presente', ausente: 'Ausente', tardanza: 'Tardanza' };
const STATUS_COLOR = { temprano: '#16A34A', tarde: '#D97706', falta: '#DC2626', presente: '#16A34A', ausente: '#DC2626', tardanza: '#D97706' };

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const sectionHeader = (title, open, onToggle, extra = null) => (
  <div onClick={onToggle}
    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 0', borderBottom: '2px solid var(--border)', marginBottom: open ? 12 : 0, userSelect: 'none' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
      {extra}
    </div>
    <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{open ? '▼' : '▶'}</span>
  </div>
);

function AttendanceCalendar({ attendance }) {
  const [openMonths, setOpenMonths] = useState({});
  const toggleMonth = (key) => setOpenMonths(s => ({ ...s, [key]: !s[key] }));

  // Group by year-month, then by day → { mañana: status, tarde: status }
  const byMonth = {};
  attendance.forEach(a => {
    const ds = (a.date || '').split('T')[0];
    const [y, mo, d] = ds.split('-').map(Number);
    if (!y) return;
    const key = `${y}-${String(mo).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = {};
    if (!byMonth[key][d]) byMonth[key][d] = {};
    byMonth[key][d][a.turno || 'mañana'] = a.status;
  });

  return (
    <>
      {Object.entries(byMonth).sort().map(([key, dayMap]) => {
        const [y, mo] = key.split('-').map(Number);
        const monthName = MONTH_NAMES[mo - 1];
        const daysInMonth = new Date(y, mo, 0).getDate();
        const pad = n => String(n).padStart(2, '0');

        // Build weeks Mon–Fri, attach Sat/Sun only if they have records
        const weeks = [];
        let weekdays = [];
        for (let d = 1; d <= daysInMonth; d++) {
          const dow = new Date(y, mo - 1, d).getDay();
          if (dow >= 1 && dow <= 5) {
            weekdays.push(d);
            if (dow === 5 || d === daysInMonth) {
              weeks.push({ days: [...weekdays], sat: null, sun: null });
              weekdays = [];
            }
          }
        }
        if (weekdays.length > 0) weeks.push({ days: [...weekdays], sat: null, sun: null });
        weeks.forEach(week => {
          const last = Math.max(...week.days);
          const satD = last + 1, sunD = last + 2;
          if (satD <= daysInMonth && new Date(y, mo - 1, satD).getDay() === 6 && dayMap[satD]) week.sat = satD;
          if (sunD <= daysInMonth && new Date(y, mo - 1, sunD).getDay() === 0 && dayMap[sunD]) week.sun = sunD;
        });

        const hasSat = weeks.some(w => w.sat);
        const hasSun = weeks.some(w => w.sun);
        const colCount = 5 + (hasSat ? 1 : 0) + (hasSun ? 1 : 0);
        const headers = ['L','M','Mi','J','V',...(hasSat?['S']:[]),...(hasSun?['D']:[])];
        const dowList = [1,2,3,4,5,...(hasSat?[6]:[]),...(hasSun?[0]:[])];

        // Per-month counts
        const monthCounts = {};
        Object.values(dayMap).forEach(rec => {
          ['mañana','tarde'].forEach(t => { if (rec[t]) monthCounts[rec[t]] = (monthCounts[rec[t]] || 0) + 1; });
        });

        const isOpen = openMonths[key] === true;
        return (
          <div key={key} style={{ marginBottom: 16 }}>
            <div onClick={() => toggleMonth(key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: isOpen ? 10 : 0, cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{monthName}</p>
                {['temprano','tarde','falta'].filter(s => monthCounts[s]).map(s => (
                  <span key={s} style={{ fontSize: 11, color: STATUS_COLOR[s], background: STATUS_COLOR[s] + '18', borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>
                    {monthCounts[s]} {STATUS_LABEL[s].toLowerCase()}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
            </div>
            {isOpen && <>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: 6, marginBottom: 6, marginTop: 10 }}>
              {headers.map(h => (
                <div key={h} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: 4 }}>{h}</div>
              ))}
            </div>
            {weeks.map((week, wi) => {
              const wDays = dowList.map(dow => {
                if (dow === 6) return week.sat || null;
                if (dow === 0) return week.sun || null;
                return week.days.find(d => new Date(y, mo - 1, d).getDay() === dow) || null;
              });
              const wRecs = wDays.map(d => d ? dayMap[d] : null);
              const wHasTarde = wRecs.some(r => r?.['tarde']);
              return (
                <div key={wi}>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '8px 0 4px', fontWeight: 600 }}>Semana {wi + 1}</p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                    {wDays.map((d, i) => {
                      if (!d) return <div key={i} style={{ flex: 1 }} />;
                      const rec = wRecs[i];
                      const numBox = (
                        <div style={{ border: '2px solid #1D4ED8', borderRadius: rec ? '10px 10px 0 0' : 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>{d}</span>
                        </div>
                      );
                      if (!rec) return <div key={i} style={{ flex: 1 }}>{numBox}</div>;
                      const man = rec['mañana'];
                      const tar = rec['tarde'];
                      if (man && tar) {
                        const mc = STATUS_COLOR[man] || '#2563EB';
                        const tc = STATUS_COLOR[tar] || '#2563EB';
                        return (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            {numBox}
                            <div style={{ background: mc + '25', borderLeft: `2px solid ${mc}`, borderRight: `2px solid ${mc}`, borderBottom: `2px solid ${mc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                              <span style={{ fontSize: 7, fontWeight: 700, color: mc, lineHeight: 1 }}>{`M: ${STATUS_LABEL[man] || man}`}</span>
                            </div>
                            <div style={{ background: tc + '25', borderLeft: `2px solid ${tc}`, borderRight: `2px solid ${tc}`, borderBottom: `2px solid ${tc}`, borderRadius: '0 0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                              <span style={{ fontSize: 7, fontWeight: 700, color: tc, lineHeight: 1 }}>{`T: ${STATUS_LABEL[tar] || tar}`}</span>
                            </div>
                          </div>
                        );
                      }
                      const c = man ? (STATUS_COLOR[man] || '#2563EB') : (STATUS_COLOR[tar] || '#2563EB');
                      const lbl = man ? (STATUS_LABEL[man] || man) : (STATUS_LABEL[tar] || tar);
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          {numBox}
                          <div style={{ flex: wHasTarde ? 1 : undefined, padding: wHasTarde ? undefined : '4px 0', background: c + '25', border: `2px solid ${c}`, borderTop: 'none', borderRadius: '0 0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 7, fontWeight: 700, color: c, lineHeight: 1 }}>{lbl}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </>}
          </div>
        );
      })}
    </>
  );
}

function StudentDetail({ student }) {
  const [attendance, setAttendance] = useState(null);
  const [grades, setGrades] = useState(null);
  const [comms, setComms] = useState(null);
  const [open, setOpen] = useState({ asistencia: false, notas: false, comunicados: false });

  useEffect(() => {
    setAttendance(null); setGrades(null); setComms(null);
    setOpen({ asistencia: false, notas: false, comunicados: false });
    setOpenCourses({});
    api.get(`/attendance?student_id=${student.id}`).then(setAttendance).catch(console.error);
    api.get(`/grades?student_id=${student.id}`).then(setGrades).catch(console.error);
    api.get('/communications').then(data => {
      const personal = data.filter(c => {
        if (c.type !== 'alumno') return false;
        const ids = c.student_ids
          ? (typeof c.student_ids === 'string' ? JSON.parse(c.student_ids) : c.student_ids)
          : [];
        return ids.includes(student.id) || ids.map(Number).includes(student.id);
      });
      setComms(personal);
    }).catch(console.error);
  }, [student.id]);

  // Grades grouped by course
  const byCourse = grades
    ? grades.reduce((acc, g) => {
        const k = g.course_name;
        if (!acc[k]) acc[k] = { color: g.color, evals: [] };
        acc[k].evals.push(g);
        return acc;
      }, {})
    : null;

  const toggle = (k) => setOpen(s => ({ ...s, [k]: !s[k] }));
  const [openCourses, setOpenCourses] = useState({});
  const toggleCourse = (k) => setOpenCourses(s => ({ ...s, [k]: !s[k] }));

  return (
    <div>
      {/* Asistencia */}
      <div style={{ marginBottom: 16 }}>
        {sectionHeader('Asistencia', open.asistencia, () => toggle('asistencia'))}
        {open.asistencia && (
          attendance === null
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Cargando...</p>
            : attendance.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin registros</p>
            : <AttendanceCalendar attendance={attendance} />
        )}
      </div>

      {/* Notas */}
      <div style={{ marginBottom: 16 }}>
        {sectionHeader('Notas', open.notas, () => toggle('notas'))}
        {open.notas && (
          byCourse === null
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Cargando...</p>
            : Object.keys(byCourse).length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin notas</p>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, alignItems: 'start' }}>
                {Object.entries(byCourse).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([course, { color, evals }]) => {
                  const avg = evals.length ? (evals.reduce((s, g) => s + Number(g.score), 0) / evals.length) : null;
                  const avgColor = avg !== null ? (avg >= 11 ? '#16A34A' : '#DC2626') : 'var(--text-muted)';
                  const courseOpen = openCourses[course] === true;
                  return (
                    <div key={course} style={{ border: `2px solid ${color || 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--bg)' }}>
                      <div onClick={() => toggleCourse(course)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '8px 10px' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--primary)', margin: 0 }}>{course}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {avg !== null && <span style={{ fontSize: 15, fontWeight: 800, color: avgColor }}>{avg.toFixed(1)}</span>}
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{courseOpen ? '▼' : '▶'}</span>
                        </div>
                      </div>
                      {courseOpen && (
                        <div style={{ borderTop: `1px solid ${color || 'var(--border)'}`, padding: '6px 10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {evals.map(g => (
                            <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{g.evaluation_name}</span>
                              <span style={{ fontSize: 14, fontWeight: 800, color: g.score >= 11 ? '#16A34A' : '#DC2626' }}>{g.score}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
        )}
      </div>

      {/* Comunicados personales */}
      <div style={{ marginBottom: 16 }}>
        {sectionHeader(
          'Comunicados personales',
          open.comunicados,
          () => toggle('comunicados'),
          comms && comms.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 20, padding: '1px 8px' }}>{comms.length}</span>
          )
        )}
        {open.comunicados && (
          comms === null
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Cargando...</p>
            : comms.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin comunicados personales</p>
            : comms.map(c => {
                const accent = c.course_color;
                return (
                  <div key={c.id} className="card" style={{ marginBottom: 8, borderLeft: accent ? `3px solid ${accent}` : undefined }}>
                    {accent && c.course_name && <p style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 2 }}>{c.course_name}</p>}
                    <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, wordBreak: 'break-word' }}>{c.title}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: c.body ? 4 : 0 }}>{c.author_name} · {formatDate(c.created_at)}</p>
                    {c.body && <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, wordBreak: 'break-word' }}>{c.body}</p>}
                    <AvanceAdjuntos avance={c} />
                  </div>
                );
              })
        )}
      </div>
    </div>
  );
}

export default function Informes() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const [openGrades, setOpenGrades] = useState({});
  const toggleGrade = (k) => setOpenGrades(s => ({ ...s, [k]: !s[k] }));

  const load = useCallback(() => {
    api.get('/students').then(data => { setStudents(data); setLoading(false); }).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">Cargando...</div>;

  const filtered = search.trim()
    ? students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()))
    : students;

  const byGrade = filtered.reduce((acc, s) => {
    const k = s.grade_name + (s.section ? ` "${s.section}"` : '');
    if (!acc[k]) acc[k] = [];
    acc[k].push(s);
    return acc;
  }, {});

  if (selected) {
    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div onClick={() => setSelected(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>← Volver</div>
            <div>
              <h1>{selected.last_name}, {selected.first_name}</h1>
              <p>{selected.grade_name}{selected.section ? ` "${selected.section}"` : ''}</p>
            </div>
          </div>
        </div>
        <div className="content-area">
          <StudentDetail student={selected} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Informes</h1>
        <p>Asistencia, notas y comunicados por alumno</p>
      </div>
      <div className="content-area">
        <input
          className="form-input"
          placeholder="Buscar alumno..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        {filtered.length === 0 ? (
          <div className="empty-state"><p>Sin resultados</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'start' }}>
            {Object.entries(byGrade)
              .sort((a, b) => {
                const n = s => parseInt(s[0].match(/\d+/) || 0);
                return n(a) - n(b) || a[0].localeCompare(b[0], 'es');
              })
              .map(([grade, gradeStudents]) => {
                const isOpen = openGrades[grade] === true;
                return (
                  <div key={grade} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div onClick={() => toggleGrade(grade)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '10px 12px' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>{grade}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 20, padding: '1px 7px', fontWeight: 600 }}>{gradeStudents.length}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {gradeStudents.map(s => (
                          <div key={s.id} style={{ cursor: 'pointer', padding: '7px 8px', borderRadius: 8, background: 'var(--bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onClick={() => setSelected(s)}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{s.last_name}, {s.first_name}</span>
                            <span style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1 }}>›</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            }
          </div>
        )}
      </div>
    </div>
  );
}
