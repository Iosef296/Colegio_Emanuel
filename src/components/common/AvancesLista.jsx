import { useState } from 'react';
import AvanceAdjuntos from './AvanceAdjuntos';

// ─── Constantes de localización ────────────────────────────────────────────────

// Nombres de los días de la semana en español, indexados por getDay() (0=Domingo).
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Nombres de los meses en español, indexados por getMonth() (0=Enero).
const MESES_CAP = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ─── Utilidades de fecha ────────────────────────────────────────────────────────

// Normaliza cualquier valor de fecha a la parte de solo fecha 'YYYY-MM-DD',
// descartando la parte de hora. Esto es necesario porque algunos registros
// traen timestamps completos (p.ej. '2024-05-15T00:00:00.000Z') y queremos
// evitar desfases de zona horaria al construir objetos Date.
function normDate(dateStr) {
  return String(dateStr).split('T')[0];
}

// Dado un string de fecha, devuelve el objeto Date correspondiente al lunes
// de esa semana ISO. Se usa para agrupar los avances por semana.
// La hora T12:00:00 evita que el cambio de zona horaria desplace el día.
function getWeekMonday(dateStr) {
  const d = new Date(normDate(dateStr) + 'T12:00:00');
  const day = d.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
  // Si es domingo (0), el lunes anterior es 6 días atrás (-6).
  // Para cualquier otro día, retrocedemos hasta el lunes de esa semana.
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}

// Calcula el número de semana dentro del mes (1–5) al que pertenece un lunes dado.
// Itera los 7 días a partir del lunes para encontrar el primer día que caiga
// dentro del año/mes especificado y calcula Math.ceil(día / 7).
// Esto asegura que semanas que cruzan meses se numeran desde el punto de vista
// del mes que estamos mostrando.
function weekNumInMonth(year, month, weekMondayStr) {
  const weekMonday = new Date(weekMondayStr + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekMonday);
    d.setDate(weekMonday.getDate() + i);
    if (d.getFullYear() === year && d.getMonth() + 1 === month)
      return Math.ceil(d.getDate() / 7);
  }
  return 1; // valor de respaldo para semanas que empiezan en el mes anterior
}

// Extrae del string de fecha el nombre del día de semana, el número de día
// y el nombre del mes, en español. Se usa para el encabezado de cada día.
function dayParts(dateStr) {
  const d = new Date(normDate(dateStr) + 'T12:00:00');
  return { dow: DIAS[d.getDay()], day: d.getDate(), month: MESES_CAP[d.getMonth()] };
}

// ─── Función de agrupación principal ──────────────────────────────────────────

// Agrupa el array plano de avances en una estructura jerárquica:
//   Mes → Semana → Día → Curso → Grado → [avances]
// Esta estructura permite renderizar la lista con acordeones anidados
// a cuatro niveles de profundidad.
function groupAvances(avances) {
  const months = {};

  avances.forEach(a => {
    // Normalizamos la fecha para usarla como clave de agrupación.
    const dateKey = normDate(a.date);
    const d = new Date(dateKey + 'T12:00:00');

    // Clave de mes: 'YYYY-MM' para ordenar cronológicamente.
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    // El lunes de la semana se usa como clave de semana y como identificador
    // de número de semana dentro del mes.
    const monday = getWeekMonday(dateKey);
    const weekKey = monday.toISOString().split('T')[0];

    // Creamos los nodos del árbol si no existen todavía.
    if (!months[monthKey]) months[monthKey] = { year: d.getFullYear(), month: d.getMonth(), weeks: {} };
    if (!months[monthKey].weeks[weekKey]) months[monthKey].weeks[weekKey] = { monday, days: {} };
    if (!months[monthKey].weeks[weekKey].days[dateKey]) months[monthKey].weeks[weekKey].days[dateKey] = {};

    // Agrupamos por nombre de curso dentro del día.
    const cKey = a.course_name;
    if (!months[monthKey].weeks[weekKey].days[dateKey][cKey])
      months[monthKey].weeks[weekKey].days[dateKey][cKey] = { color: a.color, byGrade: {} };

    // Dentro del curso, agrupamos por grado+sección para diferenciar
    // cuando un docente tiene el mismo curso en varios grados.
    const gradeKey = a.grade_name + (a.section ? ` "${a.section}"` : '');
    if (!months[monthKey].weeks[weekKey].days[dateKey][cKey].byGrade[gradeKey])
      months[monthKey].weeks[weekKey].days[dateKey][cKey].byGrade[gradeKey] = [];
    months[monthKey].weeks[weekKey].days[dateKey][cKey].byGrade[gradeKey].push(a);
  });

  // Convertimos el objeto de meses en un array ordenado cronológicamente
  // y transformamos cada nivel en un array también ordenado para facilitar el render.
  return Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b)) // orden ascendente por 'YYYY-MM'
    .map(([monthKey, monthData]) => {
      // Las semanas se ordenan por fecha del lunes para numerarlas correctamente.
      const sortedWeekEntries = Object.entries(monthData.weeks)
        .sort(([a], [b]) => a.localeCompare(b)); // ascending for numbering

      return {
        key: monthKey,
        year: monthData.year,
        month: monthData.month,
        weeks: sortedWeekEntries
          .map(([weekKey, week]) => ({
            key: weekKey,
            // Número de semana dentro del mes para la etiqueta "Semana N".
            weekNum: weekNumInMonth(monthData.year, monthData.month + 1, weekKey),
            days: Object.entries(week.days)
              .sort(([a], [b]) => a.localeCompare(b)) // orden cronológico de días
              .map(([dateKey, courses]) => ({
                date: dateKey,
                // Convertimos los cursos en un array con nombre, color y grupos por grado.
                courses: Object.entries(courses).map(([name, { color, byGrade }]) => ({
                  name, color,
                  byGrade: Object.entries(byGrade).sort(([a], [b]) => a.localeCompare(b, 'es')).map(([grade, items]) => ({ grade, items })),
                })),
              })),
          }))
      };
    });
}

// ─── Función de gradiente de acento ───────────────────────────────────────────

// Genera un gradiente CSS lineal (oscuro→claro) a partir de un color hex.
// Usado en los encabezados de mes, día y curso para mantener coherencia visual.
// Si el color no es un hex válido, usa el gradiente azul institucional por defecto.
const accentGradient = (color) => {
  if (!color || !color.startsWith('#')) return 'linear-gradient(135deg, #1E3A5F, #2563EB)';
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  // La versión oscura se obtiene multiplicando cada canal por 0.55.
  const dark = v => Math.round(v * 0.55).toString(16).padStart(2, '0');
  return `linear-gradient(135deg, #${dark(r)}${dark(g)}${dark(b)}, ${color})`;
};

// ─── Componente AvancesLista ───────────────────────────────────────────────────

// Lista jerárquica de avances organizada por Mes → Semana → Día → Curso → Grado.
// Cada nivel tiene un acordeón independiente para que el usuario pueda
// colapsar/expandir el detalle que le interesa.
//
// Props:
//   avances        — array de objetos avance (con date, course_name, grade_name, etc.)
//   onEdit         — callback opcional; si se pasa, muestra botón "Editar" en cada item.
//   hideCourseLabel— si true, oculta el encabezado de curso/grado (usado en vista de padre
//                    donde ya se conoce el curso en contexto).
//   accentColor    — color hex de acento para los gradientes; por defecto azul primario.
export default function AvancesLista({ avances, onEdit, hideCourseLabel = false, accentColor }) {
  // Color de acento: puede ser el del curso activo o el azul institucional por defecto.
  const accent = accentColor || '#2563EB';

  // Estados de colapso independientes para cada nivel del árbol.
  // La convención es que `estado[key] !== false` significa "colapsado",
  // y `estado[key] === false` significa "expandido".
  // Esto permite que los items nuevos arranquen colapsados sin necesidad
  // de inicializar su clave explícitamente.
  const [collapsedMonths,  setCollapsedMonths]  = useState({});
  const [collapsedWeeks,   setCollapsedWeeks]   = useState({});
  const [collapsedDays,    setCollapsedDays]    = useState({});
  const [collapsedCourses, setCollapsedCourses] = useState({});

  // Si no hay avances, mostramos el estado vacío en lugar del árbol.
  if (!avances.length) return <div className="empty-state"><p>No hay avances registrados</p></div>;

  // Agrupamos los avances en la estructura jerárquica para el render.
  const grouped = groupAvances(avances);

  // Función genérica para alternar el estado colapsado/expandido de un nodo.
  // Si el nodo no estaba en el mapa (nuevo), lo pasa a `false` (expandido).
  // Si ya estaba en `false` (expandido), lo pasa a `true` (colapsado).
  // Esta lógica invertida es intencional: la ausencia de clave = colapsado por defecto.
  const toggle = (setter, key) => setter(p => ({ ...p, [key]: p[key] !== false ? false : true }));

  return (
    // Grid de 2 columnas para distribuir los meses en pantallas anchas.
    // En móvil el CSS global lo aplana a 1 columna.
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, alignItems: 'start' }}>
      {grouped.map((monthData) => {
        // Un mes está colapsado cuando su clave no existe en el mapa
        // (estado inicial) o cuando su valor es distinto de false.
        const monthCollapsed = collapsedMonths[monthData.key] !== false;

        // Total de avances en este mes, mostrado en el badge del encabezado.
        const totalItems = monthData.weeks.flatMap(w => w.days.flatMap(d => d.courses.flatMap(c => c.byGrade.flatMap(g => g.items)))).length;
        return (
          <div key={monthData.key} style={{ background: 'var(--card-bg, white)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
            {/* ── Encabezado de mes ────────────────────────────────────────────
                Gradiente de acento, nombre del mes, contador total y flecha.
                Al hacer clic colapsa/expande todo el mes. */}
            <div onClick={() => toggle(setCollapsedMonths, monthData.key)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: accentGradient(accent), cursor: 'pointer', userSelect: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{MESES_CAP[monthData.month]} {monthData.year}</span>
                {/* Badge semitransparente con el total de avances del mes */}
                <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: 20, padding: '1px 8px', fontWeight: 600 }}>{totalItems}</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>{monthCollapsed ? '▶' : '▼'}</span>
            </div>

            {/* Contenido del mes: solo se renderiza si no está colapsado */}
            {!monthCollapsed && (
              <div style={{ padding: '12px 14px' }}>
                {monthData.weeks.map((week) => {
                  const weekCollapsed = collapsedWeeks[week.key] !== false;
                  return (
                    <div key={week.key} style={{ marginBottom: 12 }}>
                      {/* ── Divisor de semana ──────────────────────────────────
                          Línea horizontal con la etiqueta "Semana N" al centro.
                          Al hacer clic colapsa/expande los días de esa semana. */}
                      <div onClick={() => toggle(setCollapsedWeeks, week.key)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: weekCollapsed ? 0 : 10, cursor: 'pointer', userSelect: 'none' }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>
                          Semana {week.weekNum} {weekCollapsed ? '▶' : '▼'}
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      </div>

                      {/* Días de la semana: solo visibles si la semana no está colapsada */}
                      {!weekCollapsed && week.days.map((day, di) => {
                        // Clave única del día: combina la semana y la fecha para evitar colisiones
                        // si el mismo número de fecha aparece en dos semanas distintas.
                        const dayKey = week.key + day.date;
                        const dayCollapsed = collapsedDays[dayKey] !== false;
                        const { dow, day: dayNum, month: monthName } = dayParts(day.date);
                        return (
                          <div key={di} style={{ marginBottom: 10 }}>
                            {/* ── Encabezado de día ──────────────────────────────
                                Muestra el número del día en un cuadrado de acento,
                                el nombre del día y el mes. Al hacer clic colapsa/expande
                                los cursos de ese día. */}
                            <div onClick={() => toggle(setCollapsedDays, dayKey)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: accent + '15', borderRadius: 10, marginBottom: dayCollapsed ? 0 : 8, cursor: 'pointer', userSelect: 'none' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {/* Cuadrado con el número del día en gradiente de acento */}
                                <div style={{ width: 34, height: 34, borderRadius: 8, background: accentGradient(accent), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 14, fontWeight: 800, color: 'white', lineHeight: 1 }}>{dayNum}</span>
                                </div>
                                <div>
                                  <p style={{ fontSize: 12, fontWeight: 700, color: accent, margin: 0 }}>{dow}</p>
                                  <p style={{ fontSize: 10, color: accent + 'aa', margin: 0 }}>{monthName}</p>
                                </div>
                              </div>
                              <span style={{ fontSize: 12, color: accent }}>{dayCollapsed ? '▶' : '▼'}</span>
                            </div>

                            {/* Cursos del día: solo visibles si el día no está colapsado */}
                            {!dayCollapsed && day.courses.map((course, ci) => (
                              // Iteramos también por grupo de grado dentro del mismo curso.
                              course.byGrade.map((gradeGroup, gi) => {
                                // Clave única de la subsección de curso+grado dentro de un día.
                                const sectionKey = dayKey + course.name + gi;
                                const sectionCollapsed = collapsedCourses[sectionKey] !== false;
                                return (
                                  <div key={`${ci}-${gi}`} style={{ marginBottom: 6 }}>
                                    {/* ── Encabezado de curso/grado (condicional) ───────────────
                                        Se oculta con hideCourseLabel=true en la vista del padre
                                        donde se muestra un único curso en contexto.
                                        El gradiente usa el color del curso para diferenciación visual. */}
                                    {!hideCourseLabel && (
                                      <div onClick={() => toggle(setCollapsedCourses, sectionKey)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', marginBottom: sectionCollapsed ? 0 : 6, background: accentGradient(course.color), borderRadius: 8, cursor: 'pointer', userSelect: 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          {/* Badge del nombre del curso con fondo blanco para legibilidad */}
                                          <span style={{ fontSize: 10, fontWeight: 800, color: course.color || '#fff', background: 'rgba(255,255,255,0.92)', borderRadius: 4, padding: '1px 7px' }}>{course.name}</span>
                                          {/* Nombre del grado/sección en blanco sobre el gradiente */}
                                          <span style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>{gradeGroup.grade}</span>
                                        </div>
                                        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>{sectionCollapsed ? '▶' : '▼'}</span>
                                      </div>
                                    )}
                                    {/* ── Items de avance ────────────────────────────────────────
                                        Se muestran si el bloque de curso está expandido
                                        O si hideCourseLabel=true (nunca se colapsa en ese modo). */}
                                    {(hideCourseLabel || !sectionCollapsed) && gradeGroup.items.map((a, ai) => (
                                      <div key={ai} className="card" style={{ marginBottom: 6, borderLeft: `3px solid ${course.color || 'var(--primary)'}`, padding: '10px 12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                          <div style={{ flex: 1 }}>
                                            {/* Título del avance (puede no existir) */}
                                            {a.title && <p style={{ fontSize: 13, fontWeight: 700, marginBottom: a.content ? 4 : 0 }}>{a.title}</p>}
                                            {/* Contenido/descripción del avance */}
                                            {a.content && <p style={{ fontSize: 12, lineHeight: 1.5, wordBreak: 'break-word', marginBottom: 0, color: 'var(--text-secondary)' }}>{a.content}</p>}
                                            {/* Adjuntos del avance: fotos, PDFs, etc. */}
                                            <AvanceAdjuntos avance={a} />
                                          </div>
                                          {/* Botón "Editar" visible solo para docentes (cuando onEdit está definido) */}
                                          {onEdit && (
                                            <button onClick={() => onEdit(a.id)}
                                              style={{ flexShrink: 0, background: '#EFF6FF', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#2563EB', cursor: 'pointer', fontWeight: 600 }}>
                                              Editar
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
