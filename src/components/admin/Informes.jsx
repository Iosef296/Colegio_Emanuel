import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import AvanceAdjuntos from '../common/AvanceAdjuntos';

// ─────────────────────────────────────────────────────────────────────────────
// Informes — Vista de informe integral por alumno para el administrador
//
// Presenta dos niveles:
//   1. Lista de alumnos agrupada por grado con buscador
//   2. Detalle del alumno seleccionado con tres secciones colapsables:
//        • Asistencia (calendario mensual)
//        • Notas (por curso, con promedio)
//        • Comunicados personales
// ─────────────────────────────────────────────────────────────────────────────

/**
 * formatDate — Convierte una cadena de fecha ISO a formato peruano dd/mm/aaaa.
 * Usada en las tarjetas de comunicados personales del detalle de alumno.
 * @param {string} d — Cadena de fecha ISO
 */
const formatDate = (d) => new Date(d).toLocaleDateString('es-PE');

// Etiquetas legibles para cada estado de asistencia
const STATUS_LABEL = { temprano: 'Temprano', tarde: 'Tarde', falta: 'Falta' };

// Colores de texto/borde por estado de asistencia para las celdas del calendario
const STATUS_COLOR = { temprano: '#16A34A', tarde: '#D97706', falta: '#DC2626' };

// Nombres de meses en español (índice 0 = Enero) — reutilizados en el calendario
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/**
 * sectionHeader — Componente de utilidad que genera el encabezado colapsable
 * de cada sección del detalle de alumno (Asistencia, Notas, Comunicados).
 * Muestra título, flecha indicadora de estado y un elemento extra opcional
 * (p.ej. contador de comunicados).
 * @param {string}      title    — Título de la sección
 * @param {boolean}     open     — Estado actual de apertura
 * @param {function}    onToggle — Callback para alternar el estado
 * @param {ReactNode}   extra    — Elemento adicional junto al título (opcional)
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// AttendanceCalendar — Subcomponente que renderiza el historial de asistencia
// de un alumno en forma de calendario mensual colapsable.
//
// Lógica de columnas:
//   - Por defecto muestra Lun–Vie (días lectivos normales)
//   - Solo agrega columna de Sábado/Domingo si hay registros en esos días,
//     para no desperdiciar espacio visual con columnas vacías
//
// Cada celda del día puede mostrar:
//   - Nada (día hábil sin registro): borde azul solo con el número
//   - Un turno (mañana o tarde): número + estado con color
//   - Dos turnos: número + dos filas de estado superpuestas
// ─────────────────────────────────────────────────────────────────────────────

function AttendanceCalendar({ attendance }) {
  // Estado de apertura de cada mes; clave = "aaaa-mm"
  const [openMonths, setOpenMonths] = useState({});

  /**
   * toggleMonth — Alterna la apertura del panel de un mes específico.
   * Usa actualización funcional para no depender del valor previo del estado.
   * @param {string} key — Clave del mes en formato "aaaa-mm"
   */
  const toggleMonth = (key) => setOpenMonths(s => ({ ...s, [key]: !s[key] }));

  // Solo se consideran registros de tipo "entrada" para el calendario.
  // Los registros de "salida" se manejan en otra vista y no se muestran aquí.
  const entradas = attendance.filter(a => !a.tipo || a.tipo === 'entrada');

  // ── Agrupación de registros por mes y día ────────────────────────────────

  // Estructura: { "aaaa-mm": { día: { turno: { status, time } } } }
  // Permite acceder rápidamente al estado de asistencia de cualquier día/turno
  const byMonth = {};
  entradas.forEach(a => {
    // Normaliza la fecha quitando la parte de tiempo para evitar problemas de zona horaria
    const ds = (a.date || '').split('T')[0];
    const [y, mo, d] = ds.split('-').map(Number);
    // Descarta registros con fecha inválida
    if (!y) return;
    const key = `${y}-${String(mo).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = {};
    if (!byMonth[key][d]) byMonth[key][d] = {};
    // Solo muestra la hora si el alumno asistió; en falta muestra el texto del estado
    const time = (a.status !== 'falta' && a.updated_at)
      ? new Date(a.updated_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
      : null;
    // Mapea el turno al día correspondiente; por defecto "mañana"
    byMonth[key][d][a.turno || 'mañana'] = { status: a.status, time };
  });

  return (
    <>
      {/* Itera los meses ordenados cronológicamente */}
      {Object.entries(byMonth).sort().map(([key, dayMap]) => {
        const [y, mo] = key.split('-').map(Number);
        const monthName = MONTH_NAMES[mo - 1];
        // Total de días del mes para generar todas las celdas
        const daysInMonth = new Date(y, mo, 0).getDate();

        // ── Construcción de semanas ────────────────────────────────────────
        // Agrupa los días del mes en arreglos de semana.
        // Una nueva semana comienza cada domingo (getDay() === 0).
        const weeks = [];
        let currentWeek = [];
        for (let d = 1; d <= daysInMonth; d++) {
          const dow = new Date(y, mo - 1, d).getDay();
          // Al encontrar un domingo (inicio de semana ISO), guarda la semana anterior
          if (dow === 0 && currentWeek.length > 0) { weeks.push([...currentWeek]); currentWeek = []; }
          currentWeek.push(d);
        }
        if (currentWeek.length > 0) weeks.push([...currentWeek]);

        // ── Determinación dinámica de columnas ────────────────────────────
        // Agrega columna de domingo/sábado solo si hay registros en esos días,
        // para no desperdiciar espacio con columnas invariablemente vacías
        const hasSun = Object.keys(dayMap).some(d => new Date(y, mo - 1, Number(d)).getDay() === 0);
        const hasSat = Object.keys(dayMap).some(d => new Date(y, mo - 1, Number(d)).getDay() === 6);
        // Índices de día de la semana que se mostrarán (domingo=0 … sábado=6)
        const dowList = [...(hasSun ? [0] : []), 1, 2, 3, 4, 5, ...(hasSat ? [6] : [])];
        // Encabezados de columna correspondientes
        const headers = [...(hasSun ? ['D'] : []), 'L', 'M', 'Mi', 'J', 'V', ...(hasSat ? ['S'] : [])];
        const colCount = dowList.length;

        // ── Conteos mensuales por estado ──────────────────────────────────
        // Se usan para las insignias del encabezado de cada mes
        const monthCounts = {};
        Object.values(dayMap).forEach(rec => {
          ['mañana', 'tarde'].forEach(t => { if (rec[t]) monthCounts[rec[t].status] = (monthCounts[rec[t].status] || 0) + 1; });
        });

        // Estado de apertura de este mes en particular
        const isOpen = openMonths[key] === true;
        return (
          <div key={key} style={{ marginBottom: 16 }}>
            {/* Cabecera del mes: nombre, insignias de conteo y flecha colapsable */}
            <div onClick={() => toggleMonth(key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: isOpen ? 10 : 0, cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{monthName}</p>
                {/* Insignia por cada estado presente en el mes (temprano, tarde, falta) */}
                {['temprano', 'tarde', 'falta'].filter(s => monthCounts[s]).map(s => (
                  <span key={s} style={{ fontSize: 11, color: STATUS_COLOR[s], background: STATUS_COLOR[s] + '18', borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>
                    {monthCounts[s]} {STATUS_LABEL[s].toLowerCase()}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
            </div>

            {/* Contenido del mes: encabezados de columna y celdas de días */}
            {isOpen && <>
              {/* Fila de encabezados de columna (L M Mi J V ...) */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: 6, marginBottom: 6, marginTop: 10 }}>
                {headers.map(h => (
                  <div key={h} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: 4 }}>{h}</div>
                ))}
              </div>

              {/* Celdas de días agrupadas por semana */}
              {weeks.map((weekDays, wi) => {
                // Mapea los índices de columna a los días reales de la semana,
                // dejando null en los huecos donde el mes no tiene ese día
                const wDays = dowList.map(dow => weekDays.find(d => new Date(y, mo - 1, d).getDay() === dow) || null);
                const wRecs = wDays.map(d => d ? dayMap[d] : null);
                // Número de semana dentro del mes basado en el primer día del arreglo
                const weekNum = Math.ceil(weekDays[0] / 7);
                return (
                  <div key={wi}>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '8px 0 4px', fontWeight: 600 }}>Semana {weekNum}</p>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', minHeight: 80 }}>
                      {wDays.map((d, i) => {
                        // Celda vacía para días que no pertenecen al mes (hueco del grid)
                        if (!d) return <div key={i} style={{ flex: 1 }} />;
                        const rec = wRecs[i];

                        // Día hábil sin registro de asistencia:
                        // solo muestra el número con borde azul (día lectivo no registrado)
                        if (!rec) {
                          return (
                            <div key={i} style={{ flex: 1, border: '2px solid #1D4ED8', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>{d}</span>
                            </div>
                          );
                        }

                        const man = rec['mañana'];
                        const tar = rec['tarde'];

                        // ── Doble turno: muestra mañana y tarde en filas separadas ──
                        if (man && tar) {
                          const mc = STATUS_COLOR[man.status] || '#2563EB';
                          const tc = STATUS_COLOR[tar.status] || '#2563EB';
                          return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                              {/* Número del día en la parte superior */}
                              <div style={{ border: '2px solid #1D4ED8', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>{d}</span>
                              </div>
                              {/* Fila de mañana con el color del estado correspondiente */}
                              <div style={{ flex: 1, background: mc + '25', borderLeft: `2px solid ${mc}`, borderRight: `2px solid ${mc}`, borderBottom: `2px solid ${mc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 0' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: mc, lineHeight: 1 }}>M: {man.time || STATUS_LABEL[man.status] || man.status}</span>
                              </div>
                              {/* Fila de tarde con el color del estado correspondiente */}
                              <div style={{ flex: 1, background: tc + '25', borderLeft: `2px solid ${tc}`, borderRight: `2px solid ${tc}`, borderBottom: `2px solid ${tc}`, borderRadius: '0 0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 0' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: tc, lineHeight: 1 }}>T: {tar.time || STATUS_LABEL[tar.status] || tar.status}</span>
                              </div>
                            </div>
                          );
                        }

                        // ── Turno único (solo mañana o solo tarde) ──
                        const single = man || tar;
                        const c = STATUS_COLOR[single.status] || '#2563EB';
                        // Prefijo para indicar si el registro es de mañana (M) o tarde (T)
                        const prefix = man ? 'M' : 'T';
                        // Muestra la hora de entrada o el texto del estado si fue falta
                        const lbl = single.time || STATUS_LABEL[single.status] || single.status;
                        return (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            {/* Número del día */}
                            <div style={{ border: '2px solid #1D4ED8', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>{d}</span>
                            </div>
                            {/* Estado del único turno registrado */}
                            <div style={{ flex: 1, background: c + '20', borderLeft: `2px solid ${c}`, borderRight: `2px solid ${c}`, borderBottom: `2px solid ${c}`, borderRadius: '0 0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: c, lineHeight: 1 }}>{prefix}: {lbl}</span>
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

// Duplicado de MONTH_NAMES para uso en StudentDetail (referencia local)
const MONTH_NAMES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ─────────────────────────────────────────────────────────────────────────────
// StudentDetail — Muestra el informe completo de un alumno individual.
//
// Tres secciones colapsables:
//   • Asistencia: delega a AttendanceCalendar
//   • Notas: grid de tarjetas por curso con promedio
//   • Comunicados personales: lista de comunicados tipo "alumno"
//
// Los datos (asistencia, notas, comunicados, pagos) se cargan en paralelo
// al montar el componente o cuando cambia el alumno seleccionado.
// ─────────────────────────────────────────────────────────────────────────────

function StudentDetail({ student }) {
  // ── Estado del detalle ────────────────────────────────────────────────────

  // Registros de asistencia del alumno; null mientras se cargan
  const [attendance, setAttendance] = useState(null);

  // Notas del alumno; null mientras se cargan
  const [grades, setGrades] = useState(null);

  // Comunicados personales del alumno; null mientras se cargan
  const [comms, setComms] = useState(null);

  // Pagos del alumno; null mientras se cargan
  const [payments, setPayments] = useState(null);

  // Estado de apertura de las tres secciones colapsables del detalle
  const [open, setOpen] = useState({ asistencia: false, notas: false, comunicados: false });

  // Mes y año actuales para determinar el estado de pago del período en curso
  const currentMonth = MONTH_NAMES_ES[new Date().getMonth()];
  const currentYear = new Date().getFullYear();

  /**
   * useEffect de carga de datos del alumno.
   * Se ejecuta al montar y cada vez que cambia el ID del alumno seleccionado.
   * Resetea todos los estados a null para mostrar "Cargando..." mientras
   * las nuevas peticiones se resuelven, evitando mostrar datos del alumno anterior.
   * Las cuatro peticiones se lanzan en paralelo para minimizar el tiempo de espera.
   */
  useEffect(() => {
    // Reseteo completo para evitar datos residuales del alumno anterior
    setAttendance(null); setGrades(null); setComms(null); setPayments(null);
    setOpen({ asistencia: false, notas: false, comunicados: false });
    setOpenCourses({});

    // Pago del alumno (para mostrar el badge de pago al día o pendiente)
    api.get(`/payments?student_id=${student.id}`).then(setPayments).catch(console.error);

    // Registros de asistencia del alumno para el calendario
    api.get(`/attendance?student_id=${student.id}`).then(setAttendance).catch(console.error);

    // Notas del alumno para el grid de cursos
    api.get(`/grades?student_id=${student.id}`).then(setGrades).catch(console.error);

    // Comunicados personales: se obtienen todos y se filtran en el cliente
    // porque el endpoint general no admite filtro por alumno desde este rol
    api.get('/communications').then(data => {
      const personal = data.filter(c => {
        if (c.type !== 'alumno') return false;
        // student_ids puede llegar como string JSON o como array
        const ids = c.student_ids
          ? (typeof c.student_ids === 'string' ? JSON.parse(c.student_ids) : c.student_ids)
          : [];
        // Compara como número y como string para cubrir posibles inconsistencias de tipo
        return ids.includes(student.id) || ids.map(Number).includes(student.id);
      });
      setComms(personal);
    }).catch(console.error);
  }, [student.id]);

  // ── Agrupación de notas por curso ─────────────────────────────────────────

  // Agrupa las evaluaciones en { curso: { color, evals[] } } para el grid.
  // Es null mientras grades aún no se ha cargado.
  const byCourse = grades
    ? grades.reduce((acc, g) => {
        const k = g.course_name;
        if (!acc[k]) acc[k] = { color: g.color, evals: [] };
        acc[k].evals.push(g);
        return acc;
      }, {})
    : null;

  /**
   * toggle — Alterna el estado de apertura de una sección del detalle.
   * @param {string} k — Clave de la sección ("asistencia", "notas", "comunicados")
   */
  const toggle = (k) => setOpen(s => ({ ...s, [k]: !s[k] }));

  // Estado de apertura de cada tarjeta de curso dentro de la sección de notas
  const [openCourses, setOpenCourses] = useState({});

  /**
   * toggleCourse — Alterna la expansión de la tarjeta de un curso específico.
   * @param {string} k — Nombre del curso usado como clave
   */
  const toggleCourse = (k) => setOpenCourses(s => ({ ...s, [k]: !s[k] }));

  // ── Estado de pago del mes en curso ──────────────────────────────────────

  // Determina si el alumno tiene al menos un pago confirmado en el mes/año actuales
  const paid = payments?.some(p => p.paid && p.month === currentMonth && p.year === currentYear);

  // Etiqueta a mostrar; null mientras los pagos no han cargado (evita parpadeo)
  const paymentLabel = payments === null ? null : paid ? 'Pagado' : 'Pendiente';

  // ── Render del detalle del alumno ─────────────────────────────────────────

  return (
    <div>
      {/* Badge de estado de pago del mes en curso — no se muestra mientras carga */}
      {paymentLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: paid ? '#D1FAE5' : '#FEE2E2', color: paid ? '#16A34A' : '#DC2626' }}>
            {currentMonth} {currentYear}: {paymentLabel}
          </span>
        </div>
      )}

      {/* ── Sección: Asistencia ── */}
      <div style={{ marginBottom: 16 }}>
        {sectionHeader('Asistencia', open.asistencia, () => toggle('asistencia'))}
        {open.asistencia && (
          attendance === null
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Cargando...</p>
            : attendance.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin registros</p>
            // Delega el renderizado del calendario al subcomponente especializado
            : <AttendanceCalendar attendance={attendance} />
        )}
      </div>

      {/* ── Sección: Notas ── */}
      <div style={{ marginBottom: 16 }}>
        {sectionHeader('Notas', open.notas, () => toggle('notas'))}
        {open.notas && (
          byCourse === null
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Cargando...</p>
            : Object.keys(byCourse).length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin notas</p>
            : (
              // Grid de tres columnas para las tarjetas de cursos
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, alignItems: 'start' }}>
                {Object.entries(byCourse).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([course, { color, evals }]) => {
                  // Promedio de todas las evaluaciones del curso
                  const avg = evals.length ? (evals.reduce((s, g) => s + Number(g.score), 0) / evals.length) : null;
                  // Verde si el promedio es aprobatorio (≥11), rojo si no
                  const avgColor = avg !== null ? (avg >= 11 ? '#16A34A' : '#DC2626') : 'var(--text-muted)';
                  const courseOpen = openCourses[course] === true;
                  return (
                    // Tarjeta de curso con borde del color del curso para identificación
                    <div key={course} style={{ border: `2px solid ${color || 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--bg)' }}>
                      {/* Cabecera de la tarjeta: nombre del curso, promedio y flecha */}
                      <div onClick={() => toggleCourse(course)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '8px 10px' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--primary)', margin: 0 }}>{course}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {/* Promedio del curso — visible solo si hay evaluaciones */}
                          {avg !== null && <span style={{ fontSize: 15, fontWeight: 800, color: avgColor }}>{avg.toFixed(1)}</span>}
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{courseOpen ? '▼' : '▶'}</span>
                        </div>
                      </div>
                      {/* Lista de evaluaciones individuales del curso */}
                      {courseOpen && (
                        <div style={{ borderTop: `1px solid ${color || 'var(--border)'}`, padding: '6px 10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {evals.map(g => (
                            <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{g.evaluation_name}</span>
                              {/* Nota: verde si aprueba (≥11), rojo si desaprueba */}
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

      {/* ── Sección: Comunicados personales ── */}
      <div style={{ marginBottom: 16 }}>
        {/* El contador de comunicados se pasa como "extra" al encabezado */}
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
                  // Tarjeta con borde izquierdo del color del curso si lo tiene
                  <div key={c.id} className="card" style={{ marginBottom: 8, borderLeft: accent ? `3px solid ${accent}` : undefined }}>
                    {/* Nombre del curso en el color del curso si aplica */}
                    {accent && c.course_name && <p style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 2 }}>{c.course_name}</p>}
                    <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, wordBreak: 'break-word' }}>{c.title}</p>
                    {/* Autor (con rol si es auxiliar o docente) y fecha */}
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: c.body ? 4 : 0 }}>{c.author_role === 'auxiliar' ? 'Auxiliar ' : c.author_role === 'docente' ? 'Docente ' : ''}{c.author_name} · {formatDate(c.created_at)}</p>
                    {c.body && <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, wordBreak: 'break-word' }}>{c.body}</p>}
                    {/* Adjuntos del comunicado (fotos o PDFs) */}
                    <AvanceAdjuntos avance={c} />
                  </div>
                );
              })
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Informes — Componente raíz del módulo de informes
//
// Presenta dos vistas:
//   1. Lista de todos los alumnos agrupados por grado con buscador
//   2. Detalle del alumno seleccionado (renderizado por StudentDetail)
// ─────────────────────────────────────────────────────────────────────────────

export default function Informes() {
  // ── Estado del listado ────────────────────────────────────────────────────

  // Lista completa de alumnos obtenida del servidor
  const [students, setStudents] = useState([]);

  // Indicador de carga inicial
  const [loading, setLoading] = useState(true);

  // Texto del campo de búsqueda para filtrar alumnos por nombre
  const [search, setSearch] = useState('');

  // Alumno seleccionado para ver su informe detallado; null en la vista de lista
  const [selected, setSelected] = useState(null);

  // Estado de apertura de cada tarjeta de grado en el grid principal
  const [openGrades, setOpenGrades] = useState({});

  /**
   * toggleGrade — Alterna la expansión de la tarjeta de un grado en el grid.
   * @param {string} k — Clave del grado (nombre + sección)
   */
  const toggleGrade = (k) => setOpenGrades(s => ({ ...s, [k]: !s[k] }));

  // ── Carga de datos ────────────────────────────────────────────────────────

  /**
   * load — Obtiene la lista de alumnos desde la API.
   * Envuelto en useCallback para evitar que se recree en cada render
   * y garantizar una referencia estable en el useEffect.
   */
  const load = useCallback(() => {
    api.get('/students').then(data => { setStudents(data); setLoading(false); }).catch(console.error);
  }, []);

  // Carga inicial al montar el componente
  useEffect(() => { load(); }, [load]);

  // ── Pantalla de carga ─────────────────────────────────────────────────────

  if (loading) return <div className="loading">Cargando...</div>;

  // ── Filtrado y agrupación de alumnos ──────────────────────────────────────

  // Filtra por nombre completo si hay texto en el buscador;
  // si no, devuelve todos los alumnos para el agrupado por grado
  const filtered = search.trim()
    ? students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()))
    : students;

  // Agrupa los alumnos filtrados en { "Grado X 'Sección'" → [alumnos] }
  // para renderizar las tarjetas colapsables por grado
  const byGrade = filtered.reduce((acc, s) => {
    const k = s.grade_name + (s.section ? ` "${s.section}"` : '');
    if (!acc[k]) acc[k] = [];
    acc[k].push(s);
    return acc;
  }, {});

  // ─────────────────────────────────────────────────────────────────────────
  // VISTA 2: Informe detallado de un alumno
  // Se activa al hacer clic en un alumno en la lista
  // ─────────────────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div>
        {/* Encabezado con flecha de regreso a la lista y nombre del alumno */}
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Limpia el alumno seleccionado para volver a la vista de lista */}
            <div onClick={() => setSelected(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>← Volver</div>
            <div>
              <h1>{selected.last_name}, {selected.first_name}</h1>
              <p>{selected.grade_name}{selected.section ? ` "${selected.section}"` : ''}</p>
            </div>
          </div>
        </div>
        <div className="content-area">
          {/* Delega el render del informe detallado al subcomponente StudentDetail */}
          <StudentDetail student={selected} />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VISTA 1: Lista de alumnos agrupados por grado
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <h1>Informes</h1>
        <p>Asistencia, notas y comunicados por alumno</p>
      </div>
      <div className="content-area">
        {/* Buscador para filtrar alumnos por nombre en tiempo real */}
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
          // Grid de tres columnas para las tarjetas de grado
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'start' }}>
            {Object.entries(byGrade)
              .sort((a, b) => {
                // Ordena por número extraído del nombre del grado (1°, 2°, …),
                // con localeCompare como desempate alfabético
                const n = s => parseInt(s[0].match(/\d+/) || 0);
                return n(a) - n(b) || a[0].localeCompare(b[0], 'es');
              })
              .map(([grade, gradeStudents]) => {
                const isOpen = openGrades[grade] === true;
                return (
                  // Tarjeta de grado con cabecera de gradiente azul institucional
                  <div key={grade} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Cabecera colapsable del grado con nombre, contador y flecha */}
                    <div onClick={() => toggleGrade(grade)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '10px 12px', background: 'linear-gradient(135deg, #1E3A5F, #2563EB)' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'white', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>{grade}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {/* Contador de alumnos del grado */}
                        <span style={{ fontSize: 11, color: 'white', background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '1px 7px', fontWeight: 600 }}>{gradeStudents.length}</span>
                        <span style={{ fontSize: 10, color: 'white' }}>{isOpen ? '▼' : '▶'}</span>
                      </div>
                    </div>
                    {/* Lista de alumnos del grado — visible solo cuando la tarjeta está abierta */}
                    {isOpen && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {gradeStudents.map(s => (
                          // Al hacer clic se abre el informe detallado del alumno (vista 2)
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
