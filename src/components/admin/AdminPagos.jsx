import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

// ─────────────────────────────────────────────────────────────────────────────
// AdminPagos — Módulo de gestión de mensualidades
// Presenta tres vistas en cascada:
//   1. Lista de grados (vista principal)
//   2. Alumnos dentro de un grado seleccionado
//   3. Historial de pagos de un alumno individual
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminPagos() {
  // ── Estado principal ──────────────────────────────────────────────────────

  // Lista completa de pagos traída del servidor
  const [payments, setPayments] = useState([]);

  // Lista completa de alumnos traída del servidor
  const [students, setStudents] = useState([]);

  // Indicador de carga inicial (muestra el spinner mientras se cargan los datos)
  const [loading, setLoading] = useState(true);

  // Grado actualmente seleccionado en la vista 2; contiene { grade_level_id, grade_name, section }
  const [selectedGrade, setSelectedGrade] = useState(null);

  // Alumno actualmente seleccionado en la vista 3
  const [selectedStudent, setSelectedStudent] = useState(null);

  // ID del pago cuyo estado se está alternando ahora mismo (para deshabilitar su botón)
  const [togglingId, setTogglingId] = useState(null);

  // Texto del buscador global de alumnos en la vista 1
  const [search, setSearch] = useState('');

  // Controla la visibilidad del modal para crear un pago nuevo
  const [showForm, setShowForm] = useState(false);

  // Valores del formulario de creación: alumno, mes, año y monto
  const [form, setForm] = useState({ student_id: '', month: '', year: String(new Date().getFullYear()), amount: '350' });

  // Indica si el formulario está enviándose al servidor (bloquea el botón Crear)
  const [saving, setSaving] = useState(false);

  // Mensaje de éxito o error mostrado dentro del modal de creación
  const [message, setMessage] = useState('');

  // ── Carga de datos ────────────────────────────────────────────────────────

  /**
   * load — Obtiene pagos y alumnos en paralelo desde la API.
   * @param {boolean} silent — Si es true omite el spinner de carga;
   *   útil para recargas automáticas en segundo plano sin parpadear la UI.
   */
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([api.get('/payments'), api.get('/students')])
      .then(([p, s]) => { setPayments(p); setStudents(s); setLoading(false); })
      .catch(console.error);
  };

  // Carga inicial al montar el componente
  useEffect(load, []);

  // Recarga silenciosa periódica para mantener los datos sincronizados
  // sin interrumpir la interacción del usuario
  useAutoRefresh(() => load(true));

  // ── Manejadores de eventos ────────────────────────────────────────────────

  /**
   * handleTogglePaid — Alterna el estado de un pago entre pagado y pendiente.
   * Cuando se marca como pagado registra la fecha de hoy; cuando se desmarca
   * limpia la fecha para reflejar que volvió a estar pendiente.
   * @param {object} p — Objeto de pago con { id, paid, ... }
   */
  const handleTogglePaid = async (p) => {
    // Marca este pago como "en proceso" para deshabilitar su botón
    setTogglingId(p.id);
    try {
      await api.put(`/payments/${p.id}`, {
        paid: !p.paid,
        // Si se paga hoy, guarda la fecha actual; si se anula, borra la fecha
        paid_date: p.paid ? null : new Date().toISOString().split('T')[0],
      });
      // Recarga los datos para reflejar el cambio en la UI
      load();
    } catch (err) { console.error(err); }
    finally { setTogglingId(null); }
  };

  /**
   * handleCreate — Envía el formulario de nuevo pago al servidor.
   * Cierra el modal automáticamente al cabo de 1 segundo si tiene éxito,
   * para dar tiempo a ver el mensaje de confirmación.
   * @param {Event} e — Evento submit del formulario
   */
  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/payments', {
        student_id: Number(form.student_id),
        month: form.month,
        year: Number(form.year),
        amount: Number(form.amount),
      });
      setMessage('Pago creado');
      load();
      // Cierre diferido para que el usuario vea la confirmación
      setTimeout(() => { setShowForm(false); setMessage(''); }, 1000);
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  // ── Utilidades ────────────────────────────────────────────────────────────

  /**
   * formatDate — Convierte una cadena de fecha ISO en formato peruano dd/mm/aaaa.
   * Devuelve null si no hay fecha, evitando mostrar "Invalid Date".
   * @param {string|null} d — Cadena de fecha
   */
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('es-PE') : null;

  // Nombres de meses en español para los selectores y comparaciones
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Mes y año actuales para determinar si el pago del mes en curso está al día
  const currentMonth = MONTHS[new Date().getMonth()];
  const currentYear = new Date().getFullYear();

  // ── Agrupación de alumnos por grado ──────────────────────────────────────

  // Construye un mapa { grade_level_id → { grade_level_id, grade_name, section, students[] } }
  // para organizar la vista de grados sin recorrer el array completo en cada render
  const gradeMap = {};
  students.forEach(s => {
    const key = s.grade_level_id;
    if (!gradeMap[key]) gradeMap[key] = { grade_level_id: key, grade_name: s.grade_name, section: s.section, students: [] };
    gradeMap[key].students.push(s);
  });

  // Array de grados ordenados alfabéticamente para la vista 1
  const grades = Object.values(gradeMap).sort((a, b) => a.grade_name.localeCompare(b.grade_name));

  // ── Cálculos de deuda ─────────────────────────────────────────────────────

  /**
   * pendingByGrade — Suma el monto total de pagos pendientes de todos los
   * alumnos de un grado. Se usa para mostrar el resumen en la tarjeta de grado.
   * @param {number} gradeId — ID del grado
   * @returns {number} Suma de montos pendientes en soles
   */
  const pendingByGrade = (gradeId) => {
    const ids = (gradeMap[gradeId]?.students || []).map(s => s.id);
    return payments.filter(p => !p.paid && ids.includes(p.student_id)).reduce((s, p) => s + Number(p.amount), 0);
  };

  /**
   * pendingByStudent — Suma el monto total de pagos pendientes de un alumno.
   * Se usa para el banner de deuda en la vista de detalle del alumno.
   * @param {number} studentId — ID del alumno
   * @returns {number} Suma de montos pendientes en soles
   */
  const pendingByStudent = (studentId) =>
    payments.filter(p => !p.paid && p.student_id === studentId).reduce((s, p) => s + Number(p.amount), 0);

  // Pagos del alumno seleccionado, filtrados desde el estado global
  // para evitar una petición extra al servidor
  const studentPayments = selectedStudent
    ? payments.filter(p => p.student_id === selectedStudent.id)
    : [];

  // ── Pantalla de carga ─────────────────────────────────────────────────────

  // Muestra un indicador de carga mientras se obtienen los datos por primera vez
  if (loading) return <div className="loading">Cargando...</div>;

  // ─────────────────────────────────────────────────────────────────────────
  // VISTA 3: Historial de pagos de un alumno individual
  // Se activa al seleccionar un alumno en la vista 2
  // ─────────────────────────────────────────────────────────────────────────
  if (selectedStudent) {
    // Deuda acumulada del alumno seleccionado
    const pending = pendingByStudent(selectedStudent.id);
    return (
      <div>
        {/* Encabezado con flecha de regreso a la vista 2 */}
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Flecha que limpia el alumno seleccionado y regresa a la lista de alumnos */}
            <div onClick={() => setSelectedStudent(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>←</div>
            <div>
              <h1>{selectedStudent.first_name} {selectedStudent.last_name}</h1>
              <p>{selectedGrade.grade_name}{selectedGrade.section ? ` "${selectedGrade.section}"` : ''}</p>
            </div>
          </div>
        </div>
        <div className="content-area">
          {/* Banner de deuda: rojo si hay deuda pendiente, verde si está al día */}
          <div style={{ background: pending > 0 ? 'linear-gradient(135deg,#EF4444,#DC2626)' : 'linear-gradient(135deg,#10B981,#059669)', borderRadius: 16, padding: 18, marginBottom: 16, color: 'white' }}>
            <p style={{ fontSize: 11, opacity: 0.85, marginBottom: 2 }}>Deuda pendiente</p>
            <p style={{ fontSize: 26, fontWeight: 800 }}>S/ {pending.toFixed(2)}</p>
          </div>

          {/* Mensaje vacío si el alumno no tiene ningún pago registrado */}
          {studentPayments.length === 0 && <div className="empty-state"><p>Sin pagos registrados</p></div>}

          {/* Tarjeta por cada pago del alumno con botón para cambiar el estado */}
          {studentPayments.map(p => (
            <div key={p.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                {/* Ícono verde para pagado, rojo para pendiente */}
                <div style={{ width: 38, height: 38, borderRadius: 10, background: p.paid ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.paid ? <Icon name="check" color="var(--success)" size={18} /> : <Icon name="clock" color="var(--danger)" size={18} />}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700 }}>{p.month} {p.year}</p>
                  {/* Muestra la fecha de pago si ya está pagado, o "Pendiente" si no */}
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.paid ? `Pagado: ${formatDate(p.paid_date)}` : 'Pendiente'}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: p.paid ? 'var(--success)' : 'var(--danger)' }}>S/ {Number(p.amount).toFixed(0)}</p>
                {/* Botón Pagar / Anular — deshabilitado mientras se procesa la solicitud */}
                <button onClick={() => handleTogglePaid(p)} disabled={togglingId === p.id}
                  className={`btn btn-sm ${p.paid ? 'btn-secondary' : 'btn-success'}`}
                  style={{ fontSize: 10, padding: '4px 10px' }}>
                  {togglingId === p.id ? '...' : p.paid ? 'Anular' : 'Pagar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VISTA 2: Lista de alumnos dentro del grado seleccionado
  // Se activa al hacer clic en un grado en la vista 1
  // ─────────────────────────────────────────────────────────────────────────
  if (selectedGrade) {
    // Alumnos que pertenecen al grado actualmente seleccionado
    const gradeStudents = gradeMap[selectedGrade.grade_level_id]?.students || [];
    return (
      <div>
        {/* Encabezado con flecha de regreso a la lista de grados y botón para nuevo pago */}
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Flecha que limpia el grado seleccionado y regresa a la vista 1 */}
              <div onClick={() => setSelectedGrade(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>←</div>
              <div>
                <h1>{selectedGrade.grade_name}</h1>
                <p>{selectedGrade.section ? `Sección "${selectedGrade.section}"` : ''}</p>
              </div>
            </div>
            {/* Abre el modal de creación de pago */}
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }} onClick={() => setShowForm(true)}>
              + Pago
            </button>
          </div>
        </div>
        <div className="content-area">
          {/* Tarjeta por cada alumno del grado mostrando si pagó el mes actual */}
          {gradeStudents.map(s => {
            // Determina si el alumno tiene un pago marcado como pagado en el mes y año actuales
            const paidThisMonth = payments.some(p => p.student_id === s.id && p.paid && p.month === currentMonth && p.year === currentYear);
            return (
              // Al hacer clic en la tarjeta se abre la vista 3 con los detalles del alumno
              <div key={s.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 8 }}
                onClick={() => setSelectedStudent(s)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  {/* Avatar circular: verde si pagó el mes en curso, rojo si no */}
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: paidThisMonth ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="user" color={paidThisMonth ? 'var(--success)' : 'var(--danger)'} size={18} />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700 }}>{s.first_name} {s.last_name}</p>
                    {/* Etiqueta de estado para el mes actual */}
                    <span style={{ fontSize: 11, fontWeight: 600, background: paidThisMonth ? '#D1FAE5' : '#FEE2E2', color: paidThisMonth ? '#16A34A' : '#DC2626', borderRadius: 6, padding: '2px 7px' }}>
                      {currentMonth} {currentYear}: {paidThisMonth ? 'Pagado' : 'Pendiente'}
                    </span>
                  </div>
                </div>
                <Icon name="back" color="var(--text-muted)" size={18} style={{ transform: 'rotate(180deg)' }} />
              </div>
            );
          })}
        </div>

        {/* Modal de creación de pago — visible solo cuando showForm es true */}
        {showForm && (
          // Clic en el overlay cierra el modal sin guardar
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            {/* stopPropagation evita que el clic dentro del modal lo cierre */}
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3>Nuevo Pago</h3>
              {/* Mensaje de éxito (verde) o error (rojo) tras el intento de guardado */}
              {message && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{message}</div>}
              <form onSubmit={handleCreate}>
                {/* Selector de alumno — se filtra a los del grado actual */}
                <div className="form-group">
                  <label className="form-label">Alumno</label>
                  <select className="form-select" value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {gradeStudents.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                  </select>
                </div>
                {/* Selector de mes — solo meses lectivos (Marzo–Diciembre) */}
                <div className="form-group">
                  <label className="form-label">Mes</label>
                  <select className="form-select" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {['Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                {/* Campo de año — pre-relleno con el año en curso */}
                <div className="form-group">
                  <label className="form-label">Año</label>
                  <input className="form-input" type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} required />
                </div>
                {/* Campo de monto en soles — valor por defecto 350 */}
                <div className="form-group">
                  <label className="form-label">Monto (S/)</label>
                  <input className="form-input" type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {/* Botón Crear deshabilitado mientras se está guardando */}
                  <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Guardando...' : 'Crear'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VISTA 1: Lista de grados (pantalla principal)
  // Se muestra cuando no hay ningún grado ni alumno seleccionado
  // ─────────────────────────────────────────────────────────────────────────

  // Si hay texto en el buscador, filtra alumnos por nombre completo (case-insensitive)
  // Devuelve null cuando la búsqueda está vacía para mostrar los grados en su lugar
  const searchedStudents = search.trim()
    ? students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()))
    : null;

  return (
    <div>
      <div className="page-header">
        <h1>Pagos</h1>
        <p>Gestión de mensualidades</p>
      </div>
      <div className="content-area">
        {/* Campo de búsqueda global — activa la lista plana de alumnos cuando tiene texto */}
        <input
          className="form-input"
          placeholder="Buscar alumno..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        {/*
          Si hay búsqueda activa: muestra lista plana de alumnos que coinciden.
          Si no hay búsqueda: muestra las tarjetas de grado con resumen de deuda.
        */}
        {searchedStudents ? (
          searchedStudents.length === 0
            ? <div className="empty-state"><p>Sin resultados</p></div>
            : searchedStudents.map(s => {
                // Verifica si el alumno pagó el mes en curso
                const paidThisMonth = payments.some(p => p.student_id === s.id && p.paid && p.month === currentMonth && p.year === currentYear);
                const grade = gradeMap[s.grade_level_id];
                return (
                  // Al hacer clic establece tanto el grado como el alumno para abrir la vista 3
                  <div key={s.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 8 }}
                    onClick={() => { setSelectedGrade(grade); setSelectedStudent(s); }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      {/* Avatar con color según estado de pago del mes actual */}
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: paidThisMonth ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="user" color={paidThisMonth ? 'var(--success)' : 'var(--danger)'} size={18} />
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700 }}>{s.first_name} {s.last_name}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {grade?.grade_name}{grade?.section ? ` "${grade.section}"` : ''} ·{' '}
                          <span style={{ color: paidThisMonth ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                            {currentMonth}: {paidThisMonth ? 'Pagado' : 'Pendiente'}
                          </span>
                        </p>
                      </div>
                    </div>
                    <Icon name="back" color="var(--text-muted)" size={18} style={{ transform: 'rotate(180deg)' }} />
                  </div>
                );
              })
        ) : grades.map(g => {
          // Total de alumnos en el grado
          const total = (gradeMap[g.grade_level_id]?.students || []).length;
          // Cantidad de alumnos sin pago del mes en curso
          const deudores = (gradeMap[g.grade_level_id]?.students || []).filter(s =>
            !payments.some(p => p.student_id === s.id && p.paid && p.month === currentMonth && p.year === currentYear)
          ).length;
          return (
            // Al hacer clic en un grado se abre la vista 2 con sus alumnos
            <div key={g.grade_level_id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 8 }}
              onClick={() => setSelectedGrade(g)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                {/* Ícono del grado: rojo si hay deudores, verde si todos están al día */}
                <div style={{ width: 44, height: 44, borderRadius: 12, background: deudores > 0 ? '#FEE2E2' : '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="users" color={deudores > 0 ? 'var(--danger)' : 'var(--success)'} size={20} />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700 }}>{g.grade_name}{g.section ? ` "${g.section}"` : ''}</p>
                  {/* Resumen textual: total de alumnos y cuántos tienen deuda */}
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {total} alumnos · {deudores > 0 ? `${deudores} con deuda` : 'todos al día'}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Icon name="back" color="var(--text-muted)" size={18} style={{ transform: 'rotate(180deg)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
