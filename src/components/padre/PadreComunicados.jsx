import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import AvanceAdjuntos from '../common/AvanceAdjuntos';

// ─── Utilidades de formato de fecha ───────────────────────────────────────────

// Formatea una fecha ISO a cadena localizada en español (Perú).
// Ej: '2024-05-15' → '15/05/2024'
const formatDate = (d) => new Date(d).toLocaleDateString('es-PE');

// Normaliza una fecha (Date u objeto) a string 'YYYY-MM-DD'
// para operaciones de comparación y agrupación.
const toDateStr = (d) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);

// Formatea una fecha con día de semana abreviado, número de día y mes corto.
// Se añade 'T12:00:00' para evitar el desfase de zona horaria que
// adelantaría el día al interpretar fechas con offset negativo.
// Ej: '2024-05-15' → 'mié., 15 may.'
const formatDateShort = (d) =>
  new Date(toDateStr(d) + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });

// ─── Constantes de estado de asistencia ───────────────────────────────────────

// Colores por estado para el borde izquierdo de las tarjetas de asistencia.
const statusColor = { temprano: '#16A34A', tarde: '#D97706', falta: '#DC2626', justificado: '#2563EB' };

// Etiquetas legibles para cada estado de asistencia.
const statusLabel = { temprano: 'Temprano', tarde: 'Tardanza', falta: 'Falta', justificado: 'Justificado' };

// ─── Utilidad de color ─────────────────────────────────────────────────────────

// Convierte un color hexadecimal (#RRGGBB) a formato rgba con opacidad `alpha`.
// Sirve para aplicar fondos semitransparentes del color del curso
// en el header de CourseSubSection sin depender de opacity CSS.
const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// ─── Componente CommCard ───────────────────────────────────────────────────────

// Tarjeta compacta que representa un comunicado individual.
// Muestra título, autor, fecha y las dos primeras líneas del cuerpo.
// Si el comunicado pertenece a un curso o alumno, muestra el nombre
// del curso con su color de acento como borde izquierdo y etiqueta superior.
function CommCard({ c, onClick }) {
  // Determinamos si debe aplicarse el color de acento del curso.
  // Solo aplica cuando el tipo es 'curso' o 'alumno' y hay color definido.
  const accent = (c.type === 'curso' || c.type === 'alumno') && c.course_color ? c.course_color : null;
  return (
    <div className="card" style={{ marginBottom: 8, cursor: 'pointer', borderLeft: accent ? `3px solid ${accent}` : undefined }} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Nombre del curso en el color del acento, solo si aplica */}
          {accent && c.course_name && <p style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 2 }}>{c.course_name}</p>}
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, wordBreak: 'break-word' }}>{c.title}</p>
          {/* Autor con prefijo de rol y fecha de creación */}
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: c.body ? 4 : 0 }}>{c.author_role === 'auxiliar' ? 'Auxiliar ' : c.author_role === 'docente' ? 'Docente ' : ''}{c.author_name} · {formatDate(c.created_at)}</p>
          {/* Vista previa del cuerpo: máximo 2 líneas con elipsis */}
          {c.body && <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{c.body}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Componente AttCard ────────────────────────────────────────────────────────

// Tarjeta de un registro de asistencia individual.
// Muestra la fecha corta, turno, hora del registro y si el alumno
// ya salió del colegio ese día (usando el set de claves de salida).
function AttCard({ a, hasSalida }) {
  // Color del borde izquierdo según el estado (temprano/tarde/falta/etc.)
  const c = statusColor[a.status] || '#64748B';
  const label = statusLabel[a.status] || a.status;
  const turnoLabel = `Turno: ${a.turno === 'tarde' ? 'Tarde' : 'Mañana'}`;

  // Hora de registro formateada en zona Lima, formato 24h.
  // Si no hay updated_at (falta sin registro de hora), quedará vacío.
  const timeStr = a.updated_at
    ? new Date(a.updated_at).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  return (
    <div className="card" style={{ marginBottom: 8, borderLeft: `3px solid ${c}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{formatDateShort(a.date)}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{turnoLabel}{timeStr ? ` · ${timeStr}` : ''}</p>
          {/* Nombre del alumno si el padre tiene varios hijos */}
          {a.first_name && <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{a.first_name} {a.last_name}</p>}
          {/* Indica si el alumno ya salió (registro de salida confirmado) o aún está en el colegio */}
          <p style={{ fontSize: 11, marginTop: 3, fontWeight: 600, color: hasSalida ? '#16A34A' : '#D97706' }}>
            {hasSalida ? 'Ya salio' : 'Aun en el colegio'}
          </p>
        </div>
        {/* Badge del estado de la asistencia (Temprano/Tardanza/Falta) */}
        <span style={{ fontSize: 12, fontWeight: 700, color: c, background: c + '18', borderRadius: 10, padding: '3px 10px' }}>{label}</span>
      </div>
    </div>
  );
}

// ─── Componente CourseSubSection ───────────────────────────────────────────────

// Subsección desplegable que agrupa los comunicados de un curso concreto.
// El encabezado muestra el nombre del curso con su color y un contador de items.
// Al hacer clic alterna la visibilidad (acordeón).
function CourseSubSection({ name, comms, onSelect, color = 'var(--primary)' }) {
  // Estado local de apertura/cierre de la subsección (inicia cerrada).
  const [open, setOpen] = useState(false);

  // Fondo semitransparente para el contador de comunicados,
  // derivado del color del curso para mantener coherencia visual.
  const rgb12 = color.startsWith('#') ? hexToRgba(color, 0.12) : 'rgba(37,99,235,0.12)';
  return (
    <div style={{ marginBottom: 10, paddingLeft: 8, borderLeft: `3px solid ${color}` }}>
      {/* Encabezado clickeable: nombre del curso + contador + flecha */}
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '6px 0', marginBottom: open ? 8 : 0, userSelect: 'none' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color, background: rgb12, borderRadius: 10, padding: '1px 7px' }}>{comms.length}</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1 }}>{open ? '▼' : '▶'}</span>
        </div>
      </div>
      {/* Lista de comunicados: solo se renderiza cuando la subsección está abierta */}
      {open && comms.map(c => <CommCard key={c.id} c={c} onClick={() => onSelect(c)} />)}
    </div>
  );
}

// ─── Componente SectionHeader ──────────────────────────────────────────────────

// Encabezado de sección principal con contador y flecha de acordeón.
// Usado para "Comunicados de Curso" y "Asistencia esta semana" en el tab Avisos.
function SectionHeader({ title, count, open, onToggle }) {
  return (
    <div onClick={onToggle}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 0', borderBottom: '2px solid var(--border)', marginBottom: open ? 12 : 0, userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
        {/* Contador de items dentro de la sección */}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 20, padding: '1px 8px' }}>{count}</span>
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{open ? '▼' : '▶'}</span>
    </div>
  );
}

// ─── Componente principal PadreComunicados ─────────────────────────────────────

// Vista de comunicados para el rol "padre".
// Tiene dos tabs:
//   - "Comunicados": mensajes de Dirección (general/grado).
//   - "Avisos": comunicados de curso/alumno + resumen de asistencia de la semana.
export default function PadreComunicados() {
  // Tab activo: 'comunicados' (mensajes de Dirección) o 'avisos' (cursos + asistencia).
  const [tab, setTab] = useState('comunicados');

  // Lista de todos los comunicados devueltos por la API para este padre.
  const [comms, setComms] = useState([]);

  // Lista de registros de asistencia del mes actual (y del anterior si es inicio de mes).
  const [attendance, setAttendance] = useState([]);

  // Comunicado seleccionado para ver en detalle; null = lista, objeto = detalle.
  const [selected, setSelected] = useState(null);

  // Bandera de carga inicial.
  const [loading, setLoading] = useState(true);

  // Estado de apertura de las secciones del tab "Avisos" (acordeones).
  // Ambas inician abiertas para facilitar la lectura inmediata.
  const [openSections, setOpenSections] = useState({ curso: true, asistencia: true });

  // ── Cálculo de fechas para la carga de asistencia ──────────────────────────

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // mes actual (1–12)

  // Si estamos en los primeros 7 días del mes también pedimos el mes anterior,
  // para que el padre vea los registros recientes aunque sean de otro mes.
  const isEarlyMonth = now.getDate() <= 7;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;

  // ── Carga de datos ─────────────────────────────────────────────────────────

  // Función de carga paralela de comunicados y asistencia.
  // Se ejecuta en paralelo con Promise.all para minimizar latencia.
  // Las dependencias están vacías para que solo se cree una vez;
  // los valores month/year/prevMonth/etc. son estáticos al montar.
  const load = useCallback(() => {
    // Si estamos a principio de mes, cargamos también el mes anterior;
    // de lo contrario resolvemos vacío para no hacer una petición innecesaria.
    const attPrev = isEarlyMonth
      ? api.get(`/attendance?month=${prevMonth}&year=${prevYear}`)
      : Promise.resolve([]);
    Promise.all([
      api.get('/communications'),
      api.get(`/attendance?month=${month}&year=${year}`),
      attPrev,
    ]).then(([c, a, ap]) => {
      setComms(c);
      // Combinamos los registros del mes actual y del anterior en un solo array.
      setAttendance([...a, ...ap]);
      setLoading(false);
    }).catch(console.error);
  }, []);

  // Dispara la carga al montar el componente.
  useEffect(() => { load(); }, [load]);

  // Refresco automático en segundo plano (polling/SSE) para mantener
  // los datos actualizados sin que el padre tenga que recargar la página.
  useAutoRefresh(load);

  // Mientras carga mostramos un indicador global.
  if (loading) return <div className="loading">Cargando...</div>;

  // ── Cálculo de ventanas temporales para filtros ────────────────────────────

  // Ventana de 30 días para comunicados de curso/alumno (avisos recientes).
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Ventana de 7 días para registros de asistencia reciente en tab "Avisos".
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  // ── Filtros derivados ──────────────────────────────────────────────────────

  // Comunicados de Dirección: tipo 'general' (a todos) o 'grado' (a un grado).
  const direccionComms = comms.filter(c => c.type === 'general' || c.type === 'grado');

  // Comunicados de curso/alumno de los últimos 30 días para el tab "Avisos".
  const cursoComms = comms.filter(c =>
    (c.type === 'curso' || c.type === 'alumno') && new Date(c.created_at) >= thirtyDaysAgo
  );

  // Conjunto de claves únicas de registros de SALIDA confirmada en los últimos 7 días.
  // Se usa para determinar si el alumno ya salió del colegio en cada tarjeta de asistencia.
  // Clave: '{student_id}-{fecha}-{turno}'
  const salidaKeys = new Set(
    attendance
      .filter(a => a.tipo === 'salida' && a.status === 'salida' && toDateStr(a.date) >= sevenDaysAgoStr)
      .map(a => `${a.student_id}-${toDateStr(a.date)}-${a.turno}`)
  );

  // Registros de ENTRADA de los últimos 7 días ordenados del más reciente al más antiguo.
  // Excluimos los registros de tipo 'salida' que no representan una entrada al colegio.
  const recentAttendance = attendance
    .filter(a => toDateStr(a.date) >= sevenDaysAgoStr && a.tipo !== 'salida')
    .sort((a, b) => toDateStr(b.date).localeCompare(toDateStr(a.date)));

  // ── Agrupación de comunicados de curso por nombre de curso ─────────────────

  // Construimos un mapa { nombreCurso: { items: [], color: '#...' } }
  // para renderizar las subsecciones de CourseSubSection en el tab "Avisos".
  const byCourse = {};
  cursoComms.forEach(c => {
    const k = c.course_name || c.grade_name || 'Sin curso';
    if (!byCourse[k]) byCourse[k] = { items: [], color: c.course_color || 'var(--primary)' };
    byCourse[k].items.push(c);
  });

  // ── Vista de detalle de un comunicado ──────────────────────────────────────

  // Cuando el padre toca una tarjeta, `selected` se establece con ese comunicado
  // y se muestra la vista de detalle en lugar de la lista.
  if (selected) {
    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Botón de volver: resetea el comunicado seleccionado y vuelve a la lista */}
            <div onClick={() => setSelected(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>← Volver</div>
            <h1>Comunicado</h1>
          </div>
        </div>
        <div className="content-area">
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 4 }}>
              {/* Badge con nombre de curso, grado o 'General' según el tipo */}
              <span className="badge badge-primary">{selected.course_name || selected.grade_name || 'General'}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(selected.created_at)}</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, wordBreak: 'break-word' }}>{selected.title}</h3>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14 }}>De: {selected.author_role === 'auxiliar' ? 'Auxiliar ' : selected.author_role === 'docente' ? 'Docente ' : ''}{selected.author_name}</p>
            <p style={{ fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word' }}>{selected.body}</p>
            {/* Adjuntos del comunicado (fotos, PDFs, etc.) */}
            <AvanceAdjuntos avance={selected} />
          </div>
        </div>
      </div>
    );
  }

  // ── Vista de lista principal ───────────────────────────────────────────────

  return (
    <div>
      <div className="page-header">
        <h1>Comunicados</h1>
        <p>Avisos y mensajes</p>
      </div>

      {/* Tabs: "Comunicados" (Dirección) y "Avisos" (curso + asistencia).
          Cada tab muestra un contador de items para orientar al padre
          sobre cuántas novedades hay en cada sección. */}
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
            {/* Badge numérico del tab: visible solo si hay items */}
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
        {/* Tab "Comunicados": muestra los mensajes de Dirección (general + grado) */}
        {tab === 'comunicados' && (
          direccionComms.length === 0
            ? <div className="empty-state"><p>No hay comunicados de Dirección</p></div>
            : direccionComms.map(c => <CommCard key={c.id} c={c} onClick={() => setSelected(c)} />)
        )}

        {/* Tab "Avisos": muestra comunicados de curso y registros de asistencia recientes */}
        {tab === 'avisos' && (
          cursoComms.length === 0 && recentAttendance.length === 0
            ? <div className="empty-state"><p>No hay avisos recientes</p></div>
            : <>
                {/* Sección de comunicados de curso: agrupados por nombre de curso */}
                {cursoComms.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <SectionHeader
                      title="Comunicados de Curso"
                      count={cursoComms.length}
                      open={openSections.curso}
                      // Alterna la visibilidad de la sección manteniendo el estado del resto.
                      onToggle={() => setOpenSections(s => ({ ...s, curso: !s.curso }))}
                    />
                    {openSections.curso && Object.entries(byCourse)
                      .sort((a, b) => a[0].localeCompare(b[0], 'es')) // orden alfabético en español
                      .map(([name, { items, color }]) => (
                        <CourseSubSection key={name} name={name} comms={items} color={color} onSelect={setSelected} />
                      ))}
                  </div>
                )}
                {/* Sección de asistencia reciente: registros de los últimos 7 días */}
                {recentAttendance.length > 0 && (
                  <div>
                    <SectionHeader
                      title="Asistencia esta semana"
                      count={recentAttendance.length}
                      open={openSections.asistencia}
                      // Alterna la visibilidad de la sección de asistencia.
                      onToggle={() => setOpenSections(s => ({ ...s, asistencia: !s.asistencia }))}
                    />
                    {openSections.asistencia && recentAttendance.map(a => (
                      // La clave compuesta evita duplicados cuando el mismo alumno
                      // tiene registros de mañana y tarde el mismo día.
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
