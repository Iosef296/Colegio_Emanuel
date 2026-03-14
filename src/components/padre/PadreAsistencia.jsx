import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

// Meses lectivos del colegio (Marzo a Diciembre).
// Se usan para el selector de mes en la vista del padre.
const MONTHS = [
  { label: 'Marzo', num: 3 },
  { label: 'Abril', num: 4 },
  { label: 'Mayo', num: 5 },
  { label: 'Junio', num: 6 },
  { label: 'Julio', num: 7 },
  { label: 'Agosto', num: 8 },
  { label: 'Septiembre', num: 9 },
  { label: 'Octubre', num: 10 },
  { label: 'Noviembre', num: 11 },
  { label: 'Diciembre', num: 12 },
];

// Colores asociados a cada estado de asistencia para resaltar
// visualmente las celdas del calendario y las etiquetas de resumen.
const statusColor = {
  temprano: '#16A34A', // verde
  tarde:    '#D97706', // ámbar
  falta:    '#DC2626', // rojo
};

// Etiquetas legibles en español para cada estado de asistencia,
// usadas en las celdas cuando no hay hora registrada.
const statusLabel = {
  temprano: 'Temprano', tarde: 'Tarde', falta: 'Falta',
};

// Componente principal que muestra el calendario de asistencia
// del alumno hijo del padre autenticado.
export default function PadreAsistencia() {
  // Lista completa de registros de asistencia devueltos por la API.
  const [attendance, setAttendance] = useState([]);

  // Mes actualmente seleccionado en el selector (número 1-12).
  // Por defecto arranca en Marzo (mes 3), inicio del año escolar.
  const [selectedMonth, setSelectedMonth] = useState(3);

  // Bandera de carga para mostrar el spinner mientras se espera la API.
  const [loading, setLoading] = useState(true);

  // Función de carga de asistencia para el mes y año actuales.
  // Acepta el parámetro `silent`: si es true no muestra el spinner,
  // lo que permite refrescos automáticos en segundo plano sin parpadeo.
  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.get(`/attendance?month=${selectedMonth}&year=${new Date().getFullYear()}`)
      .then(data => { setAttendance(data); setLoading(false); }).catch(console.error);
  }, [selectedMonth]);

  // Dispara la carga cada vez que cambia el mes seleccionado.
  useEffect(() => { load(); }, [load]);

  // Refresco automático en segundo plano (polling o SSE),
  // llama a load en modo silencioso para no interrumpir la UI.
  useAutoRefresh(() => load(true));

  // Filtramos solo registros de tipo "entrada" (o sin tipo explícito),
  // descartando los registros de "salida" que se gestionan por separado.
  const entradas = attendance.filter(a => !a.tipo || a.tipo === 'entrada');

  // Agrupamos los registros por fecha y turno para renderizar el calendario.
  // Estructura resultante: { 'YYYY-MM-DD': { 'mañana': { status, time }, 'tarde': { status, time } } }
  const byDate = {};
  entradas.forEach(a => {
    // Normalizamos la fecha a 'YYYY-MM-DD' independientemente de si viene
    // como string ISO o como objeto Date.
    const dateStr = (typeof a.date === 'string' ? a.date : a.date.toISOString()).slice(0, 10);
    if (!byDate[dateStr]) byDate[dateStr] = {};

    // Extraemos la hora de registro solo si no es una falta;
    // la formateamos en zona horaria de Lima (Perú) en formato HH:MM.
    const time = (a.status !== 'falta' && a.updated_at)
      ? new Date(a.updated_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
      : null;

    // Asignamos el registro al turno correspondiente (mañana por defecto).
    byDate[dateStr][a.turno || 'mañana'] = { status: a.status, time };
  });

  // Contadores para el bloque de resumen (tarjetas de estadística).
  const temprano = entradas.filter(a => a.status === 'temprano').length;
  const tarde    = entradas.filter(a => a.status === 'tarde').length;
  const falta    = entradas.filter(a => a.status === 'falta').length;

  // Año en curso, se usa para construir las fechas del calendario.
  const year = new Date().getFullYear();

  // Total de días en el mes seleccionado (new Date(year, mes, 0) da el último día).
  const daysInMonth = new Date(year, selectedMonth, 0).getDate();

  // Función auxiliar para rellenar un número de un dígito con cero a la izquierda,
  // necesaria para construir strings de fecha con formato ISO 'YYYY-MM-DD'.
  const pad = n => String(n).padStart(2, '0');

  // Devuelve el string de fecha ISO para un número de día dado del mes seleccionado.
  const dateStr = d => `${year}-${pad(selectedMonth)}-${pad(d)}`;

  // Construimos las semanas del mes como arrays de números de día.
  // Cada semana es un array de días que pertenecen a esa semana ISO (Dom–Sáb).
  // Cuando encontramos un domingo (dow === 0) y ya hay días acumulados,
  // guardamos la semana anterior y comenzamos una nueva.
  const weeks = [];
  let currentWeek = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, selectedMonth - 1, d).getDay();
    if (dow === 0 && currentWeek.length > 0) { weeks.push([...currentWeek]); currentWeek = []; }
    currentWeek.push(d);
  }
  // Guardamos la última semana parcial si quedaron días sin cerrar.
  if (currentWeek.length > 0) weeks.push([...currentWeek]);

  // Determinamos si existen registros en domingo o sábado para ese mes.
  // Por defecto solo mostramos Lun–Vie; si hubo asistencia un fin de semana
  // se añade la columna correspondiente.
  const hasSun = Object.keys(byDate).some(d => new Date(d + 'T12:00:00').getDay() === 0);
  const hasSat = Object.keys(byDate).some(d => new Date(d + 'T12:00:00').getDay() === 6);

  // Lista de números de día de la semana (0=Dom…6=Sáb) a mostrar como columnas.
  const dowList = [...(hasSun ? [0] : []), 1, 2, 3, 4, 5, ...(hasSat ? [6] : [])];

  // Encabezados de columna visibles en el calendario.
  const headers = [...(hasSun ? ['D'] : []), 'L', 'M', 'Mi', 'J', 'V', ...(hasSat ? ['S'] : [])];

  // Cantidad de columnas del grid del calendario.
  const colCount = dowList.length;


  return (
    <div>
      <div className="page-header">
        <h1>Asistencia</h1>
        <p>Control de asistencia diaria</p>
      </div>
      <div className="content-area">
        {/* Selector de mes: botones horizontales con scroll para elegir el mes lectivo */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
          {MONTHS.map(m => (
            <button
              key={m.num}
              // Al cambiar el mes activamos el spinner y actualizamos el estado;
              // el efecto detectará el cambio de selectedMonth y llamará a load().
              onClick={() => { setLoading(true); setSelectedMonth(m.num); }}
              className={`btn btn-sm ${selectedMonth === m.num ? 'btn-primary' : 'btn-secondary'}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Tarjetas de resumen: muestran el total de "Temprano", "Tardanzas" y "Faltas"
            del mes seleccionado con colores diferenciados para lectura rápida. */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Temprano', count: temprano, color: 'var(--success)', bg: '#D1FAE5' },
            { label: 'Tardanzas', count: tarde,   color: 'var(--warning)', bg: '#FEF3C7' },
            { label: 'Faltas',    count: falta,   color: 'var(--danger)',  bg: '#FEE2E2' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, background: s.bg, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: s.color, marginBottom: 2 }}>{s.count}</p>
              <p style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Mientras carga mostramos un indicador; al terminar renderizamos el calendario */}
        {loading ? <div className="loading">Cargando...</div> : (
          <div className="card">
            {/* Encabezado de la tarjeta: nombre del mes y badgets con conteos por estado */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{MONTHS.find(m => m.num === selectedMonth)?.label}</h4>
              {/* Solo mostramos los badgets de estados que tienen al menos un registro */}
              {[
                { st: 'temprano', count: temprano, color: statusColor.temprano },
                { st: 'tarde',    count: tarde,    color: statusColor.tarde },
                { st: 'falta',    count: falta,    color: statusColor.falta },
              ].filter(s => s.count > 0).map(s => (
                <span key={s.st} style={{ fontSize: 11, color: s.color, background: s.color + '18', borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>
                  {s.count} {s.st}
                </span>
              ))}
            </div>

            {/* Fila de encabezados de columna (D, L, M, Mi, J, V, S) */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: 6, marginBottom: 6 }}>
              {headers.map(h => (
                <div key={h} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: 4 }}>
                  {h}
                </div>
              ))}
            </div>

            {/* Iteramos semana por semana para renderizar las filas del calendario */}
            {weeks.map((weekDays, wi) => {
              // Para cada posición del dowList buscamos el día de esa semana
              // que caiga en ese día de la semana (dow); si no existe, null.
              const wDays = dowList.map(dow => weekDays.find(d => new Date(year, selectedMonth - 1, d).getDay() === dow) || null);

              // Registros de asistencia correspondientes a cada celda de la semana.
              const wRecs = wDays.map(d => d ? byDate[dateStr(d)] : null);

              // Número de semana dentro del mes (1..5), calculado a partir del primer
              // día de la semana usando la fórmula Math.ceil(día / 7).
              const weekNum = Math.ceil(weekDays[0] / 7);

              return (
                <div key={wi}>
                  {/* Etiqueta de semana para separar visualmente cada fila */}
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '8px 0 4px', fontWeight: 600 }}>
                    Semana {weekNum}
                  </p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', minHeight: 80 }}>
                    {wDays.map((d, i) => {
                      // Celda vacía para días que no pertenecen a este mes en esa columna
                      if (!d) return <div key={i} style={{ flex: 1 }} />;

                      const rec = wRecs[i];
                      const man = rec?.['mañana']; // registro del turno mañana
                      const tar = rec?.['tarde'];  // registro del turno tarde

                      // Caso 1: No hay registro de asistencia para ese día.
                      // Se muestra el número del día enmarcado en azul sin relleno.
                      if (!man && !tar) {
                        return (
                          <div key={i} style={{ flex: 1, border: '2px solid #1D4ED8', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>{d}</span>
                          </div>
                        );
                      }

                      // Caso 2: Doble turno — hay registros tanto de mañana como de tarde.
                      // Se apilan verticalmente dentro de la misma celda, cada uno con
                      // el color de su estado correspondiente.
                      if (man && tar) {
                        const mc = statusColor[man.status], tc = statusColor[tar.status];
                        return (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            {/* Número del día en la parte superior */}
                            <div style={{ border: '2px solid #1D4ED8', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>{d}</span>
                            </div>
                            {/* Franja de turno mañana con hora o etiqueta de estado */}
                            <div style={{ flex: 1, background: mc + '25', borderLeft: `2px solid ${mc}`, borderRight: `2px solid ${mc}`, borderBottom: `2px solid ${mc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 0' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: mc, lineHeight: 1 }}>M: {man.time || statusLabel[man.status]}</span>
                            </div>
                            {/* Franja de turno tarde con hora o etiqueta de estado */}
                            <div style={{ flex: 1, background: tc + '25', borderLeft: `2px solid ${tc}`, borderRight: `2px solid ${tc}`, borderBottom: `2px solid ${tc}`, borderRadius: '0 0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 0' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: tc, lineHeight: 1 }}>T: {tar.time || statusLabel[tar.status]}</span>
                            </div>
                          </div>
                        );
                      }

                      // Caso 3: Un solo turno (mañana O tarde).
                      // Se muestra el día y debajo la franja de ese único turno.
                      const single = man || tar;
                      const c = statusColor[single.status];
                      const prefix = man ? 'M' : 'T'; // prefijo que indica el turno
                      const lbl = single.time || statusLabel[single.status];
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          {/* Número del día */}
                          <div style={{ border: '2px solid #1D4ED8', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>{d}</span>
                          </div>
                          {/* Franja del turno único con color y etiqueta del estado */}
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
          </div>
        )}
      </div>
    </div>
  );
}
