import { useState } from 'react';
import AvanceAdjuntos from './AvanceAdjuntos';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CAP = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function normDate(dateStr) {
  return String(dateStr).split('T')[0];
}

function getWeekMonday(dateStr) {
  const d = new Date(normDate(dateStr) + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}

function dayLabel(dateStr) {
  const d = new Date(normDate(dateStr) + 'T12:00:00');
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function groupAvances(avances) {
  const months = {};
  avances.forEach(a => {
    const dateKey = normDate(a.date);
    const d = new Date(dateKey + 'T12:00:00');
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monday = getWeekMonday(dateKey);
    const weekKey = monday.toISOString().split('T')[0];

    if (!months[monthKey]) months[monthKey] = { year: d.getFullYear(), month: d.getMonth(), weeks: {} };
    if (!months[monthKey].weeks[weekKey]) months[monthKey].weeks[weekKey] = { monday, days: {} };
    if (!months[monthKey].weeks[weekKey].days[dateKey]) months[monthKey].weeks[weekKey].days[dateKey] = {};

    const cKey = a.course_name;
    if (!months[monthKey].weeks[weekKey].days[dateKey][cKey])
      months[monthKey].weeks[weekKey].days[dateKey][cKey] = { color: a.color, items: [] };
    months[monthKey].weeks[weekKey].days[dateKey][cKey].items.push(a);
  });

  return Object.entries(months)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, monthData]) => {
      const sortedWeekEntries = Object.entries(monthData.weeks)
        .sort(([a], [b]) => a.localeCompare(b)); // ascending for numbering

      return {
        key: monthKey,
        year: monthData.year,
        month: monthData.month,
        weeks: sortedWeekEntries
          .map(([weekKey, week], idx) => ({
            key: weekKey,
            weekNum: idx + 1,
            days: Object.entries(week.days)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([dateKey, courses]) => ({
                date: dateKey,
                courses: Object.entries(courses).map(([name, { color, items }]) => ({ name, color, items })),
              })),
          }))
          .reverse(), // most recent week first
      };
    });
}

export default function AvancesLista({ avances, onEdit, hideCourseLabel = false }) {
  const [collapsedMonths, setCollapsedMonths] = useState({});
  const [collapsedWeeks, setCollapsedWeeks] = useState({});
  const [collapsedDays, setCollapsedDays] = useState({});
  const [collapsedCourses, setCollapsedCourses] = useState({});

  if (!avances.length) return <div className="empty-state"><p>No hay avances registrados</p></div>;

  const grouped = groupAvances(avances);
  const toggle = (setter, key) => setter(p => ({ ...p, [key]: p[key] !== false ? false : true }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, alignItems: 'start' }}>
      {grouped.map((monthData) => {
        const monthCollapsed = collapsedMonths[monthData.key] !== false;
        return (
          <div key={monthData.key}>
            {/* Month header */}
            <div onClick={() => toggle(setCollapsedMonths, monthData.key)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'linear-gradient(135deg, var(--nav-bg), #2563EB)', borderRadius: 8, marginBottom: monthCollapsed ? 0 : 10, cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{MESES_CAP[monthData.month]} {monthData.year}</span>
              <span style={{ color: 'white', fontSize: 14 }}>{monthCollapsed ? '▶' : '▼'}</span>
            </div>

            {!monthCollapsed && monthData.weeks.map((week) => {
              const weekCollapsed = collapsedWeeks[week.key] !== false;
              return (
                <div key={week.key} style={{ marginBottom: 10, paddingLeft: 8, borderLeft: '3px solid rgba(37,99,235,0.3)' }}>
                  {/* Week header */}
                  <div onClick={() => toggle(setCollapsedWeeks, week.key)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', background: 'rgba(37,99,235,0.08)', borderRadius: 6, marginBottom: weekCollapsed ? 0 : 8, cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>Semana {week.weekNum}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{weekCollapsed ? '▶' : '▼'}</span>
                  </div>

                  {!weekCollapsed && week.days.map((day, di) => {
                    const dayKey = week.key + day.date;
                    const dayCollapsed = collapsedDays[dayKey] !== false;
                    return (
                      <div key={di} style={{ marginBottom: 10, paddingLeft: 8, borderLeft: '3px solid var(--border)' }}>
                        {/* Day header */}
                        <div onClick={() => toggle(setCollapsedDays, dayKey)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: dayCollapsed ? 0 : 8, cursor: 'pointer', userSelect: 'none' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{dayLabel(day.date)}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dayCollapsed ? '▶' : '▼'}</span>
                        </div>

                        {!dayCollapsed && day.courses.map((course, ci) => {
                          const courseKey = dayKey + course.name;
                          const courseCollapsed = collapsedCourses[courseKey] !== false;
                          return (
                            <div key={ci} style={{ marginBottom: 8, paddingLeft: 8, borderLeft: `3px solid ${course.color || 'var(--primary)'}` }}>
                              {/* Course header */}
                              {!hideCourseLabel && (
                                <div onClick={() => toggle(setCollapsedCourses, courseKey)}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: courseCollapsed ? 0 : 6, cursor: 'pointer', userSelect: 'none' }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: course.color || 'var(--primary)' }}>{course.name}</span>
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{courseCollapsed ? '▶' : '▼'}</span>
                                </div>
                              )}

                              {(hideCourseLabel || !courseCollapsed) && course.items.map((a, ai) => (
                                <div key={ai} className="card" style={{ marginBottom: 6 }}>
                                  {onEdit && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                                      <button onClick={() => onEdit(a.id)}
                                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                                        Editar
                                      </button>
                                    </div>
                                  )}
                                  {a.title && <p style={{ fontSize: 13, fontWeight: 700, marginBottom: a.content ? 4 : 0 }}>{a.title}</p>}
                                  {a.content && <p style={{ fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word', marginBottom: 0 }}>{a.content}</p>}
                                  <AvanceAdjuntos avance={a} />
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
