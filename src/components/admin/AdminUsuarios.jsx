// ============================================================
// AdminUsuarios.jsx
// Panel de administración del personal del colegio.
// Permite listar, crear, editar, activar/desactivar y eliminar
// usuarios (docentes, auxiliares, directores, secretarias).
// También muestra asignaciones de cursos y el historial de
// asistencia de cada docente en un calendario visual.
// ============================================================

import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { useAuth } from '../../context/AuthContext';

// ── Utilidad de fecha ─────────────────────────────────────────
// Convierte un objeto Date a cadena "YYYY-MM-DD" en hora local
// (sin usar toISOString, que devolvería UTC y podría cambiar el día).
function makeLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Constantes de UI para asistencia de docentes ──────────────
// Nombres de meses en español para el encabezado del calendario.
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Color de cada estado de asistencia del docente.
// 'presente' se trata igual que 'temprano' para normalizar valores legacy.
const TCH_COLOR = { temprano: '#16A34A', presente: '#16A34A', tarde: '#D97706', falta: '#DC2626' };

// Etiqueta legible de cada estado para mostrarlo en las celdas del calendario.
const TCH_LABEL = { temprano: 'Temprano', presente: 'Temprano', tarde: 'Tarde', falta: 'Falta' };

// ── Componente: TeacherAttendanceCalendar ─────────────────────
// Muestra el historial de asistencia de un docente agrupado por mes.
// Cada mes se puede expandir/contraer. El mes actual se abre por defecto.
// Soporta doble turno (mañana + tarde) dentro de la misma celda de día.
function TeacherAttendanceCalendar({ records }) {
  // Fecha de hoy para determinar qué mes abrir por defecto.
  const now = new Date();
  // Clave del mes actual con formato "YYYY-MM".
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Estado: qué meses están abiertos/cerrados en el acordeón.
  // Si la clave del mes no está en este objeto, se usa `true` solo si es el mes actual.
  const [openMonths, setOpenMonths] = useState({});

  // ── Agrupar registros por mes y día ───────────────────────
  // Construye: byMonth[key][día][turno] = { status, time }
  const byMonth = {};
  records.forEach(r => {
    // Normalizar la fecha: si es string la usamos directo; si es Date la convertimos a ISO.
    const ds = (typeof r.date === 'string' ? r.date : new Date(r.date).toISOString()).slice(0, 10);
    const [y, mo, d] = ds.split('-').map(Number);
    // Ignorar registros con fecha inválida.
    if (!y) return;
    const key = `${y}-${String(mo).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = {};
    if (!byMonth[key][d]) byMonth[key][d] = {};
    // Formatear la hora del registro en zona horaria de Lima (es-PE).
    const time = r.created_at
      ? new Date(r.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
      : null;
    // Agrupar por turno; si no hay turno definido se asume 'mañana'.
    byMonth[key][d][r.turno || 'mañana'] = { status: r.status, time };
  });

  // Si no hay registros para mostrar, renderizar estado vacío.
  if (!Object.keys(byMonth).length) return <div className="empty-state"><p>Sin registros de asistencia</p></div>;

  return (
    <>
      {/* Iterar meses en orden descendente (más reciente primero) */}
      {Object.entries(byMonth).sort().reverse().map(([key, dayMap]) => {
        const [y, mo] = key.split('-').map(Number);

        // ── Calcular semanas del mes ───────────────────────
        // Total de días del mes (día 0 del mes siguiente = último día del mes actual).
        const daysInMonth = new Date(y, mo, 0).getDate();
        const weeks = [];
        let week = [];
        for (let d = 1; d <= daysInMonth; d++) {
          const dow = new Date(y, mo - 1, d).getDay(); // 0=Domingo
          // Al encontrar un domingo (inicio de semana) cerramos la semana anterior.
          if (dow === 0 && week.length > 0) { weeks.push([...week]); week = []; }
          week.push(d);
        }
        // Agregar la última semana si quedaron días sin cerrar.
        if (week.length > 0) weeks.push([...week]);

        // ── Determinar columnas visibles (solo mostrar sábado/domingo si hay registros) ──
        const hasSat = Object.keys(dayMap).some(d => new Date(y, mo - 1, Number(d)).getDay() === 6);
        const hasSun = Object.keys(dayMap).some(d => new Date(y, mo - 1, Number(d)).getDay() === 0);
        // dowList = orden de columnas del calendario de esa semana.
        const dowList = [...(hasSun ? [0] : []), 1, 2, 3, 4, 5, ...(hasSat ? [6] : [])];
        // Encabezados de columnas en español abreviado.
        const headers = [...(hasSun ? ['D'] : []), 'L', 'M', 'Mi', 'J', 'V', ...(hasSat ? ['S'] : [])];

        // ── Conteo de estados para el badge del encabezado del mes ──
        // Suma cuántos turnos terminaron en cada estado, normalizando 'presente' a 'temprano'.
        const counts = {};
        Object.values(dayMap).forEach(rec => {
          ['mañana', 'tarde'].forEach(t => {
            if (rec[t]) {
              const s = rec[t].status === 'presente' ? 'temprano' : rec[t].status;
              counts[s] = (counts[s] || 0) + 1;
            }
          });
        });

        // ── Estado abierto/cerrado del acordeón ───────────────
        // El mes actual se abre por defecto; los demás solo si el usuario los abrió manualmente.
        const isOpen = key in openMonths ? openMonths[key] : key === curKey;

        return (
          <div key={key} style={{ marginBottom: 16 }}>
            {/* Encabezado del mes: nombre + badges de conteo + chevron de acordeón */}
            <div
              onClick={() => setOpenMonths(s => ({ ...s, [key]: !isOpen }))}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 8, flexWrap: 'wrap', marginBottom: isOpen ? 8 : 0,
                cursor: 'pointer', userSelect: 'none',
                borderBottom: '1px solid var(--border)', paddingBottom: 6
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{MONTH_NAMES[mo - 1]}</p>
                {/* Badges de conteo: solo se muestran estados que tengan al menos 1 ocurrencia */}
                {['temprano','tarde','falta'].filter(s => counts[s]).map(s => (
                  <span key={s} style={{ fontSize: 11, color: TCH_COLOR[s], background: TCH_COLOR[s] + '18', borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>
                    {counts[s]} {TCH_LABEL[s].toLowerCase()}
                  </span>
                ))}
              </div>
              {/* Indicador visual de acordeón abierto/cerrado */}
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
            </div>

            {/* Contenido del mes: grilla de días solo cuando está abierto */}
            {isOpen && (
              <>
                {/* Fila de encabezados de días de la semana */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dowList.length}, 1fr)`, gap: 4, marginBottom: 4 }}>
                  {headers.map(h => (
                    <div key={h} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>{h}</div>
                  ))}
                </div>

                {/* Iterar semanas del mes */}
                {weeks.map((weekDays, wi) => {
                  // Mapear cada columna (día de semana) al número de día del mes, o null si no existe.
                  const wDays = dowList.map(dow => weekDays.find(d => new Date(y, mo - 1, d).getDay() === dow) || null);
                  // Obtener el registro de asistencia de cada día (puede ser undefined si no hay).
                  const wRecs = wDays.map(d => d ? dayMap[d] : null);

                  return (
                    <div key={wi}>
                      {/* Etiqueta de número de semana dentro del mes */}
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '6px 0 3px', fontWeight: 600 }}>
                        Semana {Math.ceil(weekDays[0] / 7)}
                      </p>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'stretch', minHeight: 72 }}>
                        {wDays.map((d, i) => {
                          // Celda vacía: día no pertenece a esta semana (relleno de grilla).
                          if (!d) return <div key={i} style={{ flex: 1 }} />;

                          const rec = wRecs[i];

                          // Día sin registro de asistencia: solo mostrar número con borde azul.
                          if (!rec) return (
                            <div key={i} style={{ flex: 1, border: '2px solid #1D4ED8', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>{d}</span>
                            </div>
                          );

                          // Registros de turno mañana y tarde para este día.
                          const man = rec['mañana'];
                          const tar = rec['tarde'];

                          // Encabezado de la celda de día (número azul con borde superior redondeado).
                          const dayHeader = (
                            <div style={{ border: '2px solid #1D4ED8', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px 0' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>{d}</span>
                            </div>
                          );

                          // ── Función interna: celda de un turno individual ──
                          // Renderiza una franja coloreada según el estado del turno.
                          // `prefix` = 'M' (mañana) o 'T' (tarde).
                          // `isLast` = true cuando es la última celda (aplica border-radius inferior).
                          const turnoCell = (entry, prefix, isLast) => {
                            const c = TCH_COLOR[entry.status] || '#2563EB';
                            const lbl = TCH_LABEL[entry.status] || entry.status;
                            return (
                              <div style={{
                                flex: 1, background: c + '20',
                                borderLeft: `2px solid ${c}`, borderRight: `2px solid ${c}`, borderBottom: `2px solid ${c}`,
                                ...(isLast ? { borderRadius: '0 0 10px 10px' } : {}),
                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px 2px'
                              }}>
                                {/* Mostrar hora si está disponible, o la etiqueta del estado */}
                                <span style={{ fontSize: 10, fontWeight: 700, color: c, lineHeight: 1 }}>{prefix}: {entry.time || lbl}</span>
                              </div>
                            );
                          };

                          // ── Día con doble turno (mañana + tarde) ──────────
                          if (man && tar) return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                              {dayHeader}
                              {turnoCell(man, 'M', false)}
                              {turnoCell(tar, 'T', true)}
                            </div>
                          );

                          // ── Día con un solo turno (mañana o tarde) ────────
                          const single = man || tar;
                          const c = TCH_COLOR[single.status] || '#2563EB';
                          return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                              {dayHeader}
                              <div style={{
                                flex: 1, background: c + '20',
                                borderLeft: `2px solid ${c}`, borderRight: `2px solid ${c}`, borderBottom: `2px solid ${c}`,
                                borderRadius: '0 0 10px 10px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px 2px'
                              }}>
                                {/* Prefijo 'M' si es mañana, 'T' si es tarde */}
                                <span style={{ fontSize: 10, fontWeight: 700, color: c, lineHeight: 1 }}>
                                  {man ? 'M' : 'T'}: {single.time || TCH_LABEL[single.status] || single.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Utilidad: compressImage ───────────────────────────────────
// Reduce el tamaño de una imagen antes de subirla al servidor.
// Escala la imagen al máximo de 800px en el lado más largo y
// la recodifica como JPEG con calidad 0.88, devolviendo un Blob.
// Esto evita subir imágenes de alta resolución innecesariamente.
const compressImage = (file) => new Promise((resolve) => {
  const img = new Image();
  // Crear URL temporal en memoria para cargar el archivo.
  const url = URL.createObjectURL(file);
  img.onload = () => {
    // Liberar la URL temporal tan pronto como la imagen esté cargada.
    URL.revokeObjectURL(url);
    const max = 800;
    let { width, height } = img;
    // Escalar proporcionalemente solo si supera el límite máximo.
    if (width > max || height > max) {
      if (width > height) {
        height = Math.round((height / width) * max); width = max;
      } else {
        width = Math.round((width / height) * max); height = max;
      }
    }
    // Dibujar en canvas con las dimensiones reducidas.
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    // Exportar el canvas como Blob JPEG (calidad 0.88 = buen balance tamaño/calidad).
    canvas.toBlob(resolve, 'image/jpeg', 0.88);
  };
  img.src = url;
});

// ── Componente principal: AdminUsuarios ───────────────────────
// Gestión del personal del colegio desde la vista de administrador.
// Tiene dos vistas:
//   VIEW 1 — Lista de todo el personal con acciones rápidas.
//   VIEW 2 — Detalle de un usuario: asistencia y cursos asignados.
export default function AdminUsuarios() {
  // Usuario actualmente autenticado (para evitar que el admin se desactive a sí mismo).
  const { user: currentUser, updateUser } = useAuth();

  // ── Estado: datos principales ─────────────────────────────
  const [users, setUsers] = useState([]);           // Lista de usuarios del personal.
  const [assignments, setAssignments] = useState([]); // Asignaciones docente↔curso↔grado.
  const [courses, setCourses] = useState([]);        // Catálogo de cursos disponibles.
  const [gradeLevels, setGradeLevels] = useState([]); // Catálogo de grados/secciones.
  const [loading, setLoading] = useState(true);      // Carga inicial de datos.

  // ── Estado: navegación entre vistas ──────────────────────
  // Al seleccionar un usuario en la lista, se cambia a la vista de detalle.
  const [selectedTeacher, setSelectedTeacher] = useState(null);

  // ── Estado: modal de creación/edición de usuario ─────────
  const [showForm, setShowForm] = useState(false);  // Visibilidad del modal de formulario.
  const [editing, setEditing] = useState(null);     // Usuario que se está editando (null = creación).
  // Formulario para crear un usuario nuevo (campos separados de nombre/apellido).
  const [form, setForm] = useState({ first_name: '', last_name: '', dni: '', email: '', phone: '', role: 'docente' });
  // Formulario para editar un usuario existente (nombre completo en un solo campo).
  const [editForm, setEditForm] = useState({ full_name: '', password: '', dni: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);      // Indicador de guardado en curso.
  const [message, setMessage] = useState('');       // Mensaje de éxito o error del formulario.

  // ── Estado: credenciales mostradas tras crear usuario ────
  // Al crear un usuario el backend devuelve username+password generados.
  // Se guardan aquí para mostrarlos en un modal con QR descargable.
  const [credentials, setCredentials] = useState(null);

  // ── Estado: foto de perfil ────────────────────────────────
  const [photoPreview, setPhotoPreview] = useState(null); // URL de preview (local o remota).
  const [photoBlob, setPhotoBlob] = useState(null);       // Blob comprimido listo para subir.
  const [photoDeleted, setPhotoDeleted] = useState(false); // true si el usuario eliminó la foto.
  const photoRef = useRef(null);                          // Ref al input[type=file] oculto.

  // ── Estado: QR de usuario existente (modal de visualización) ──
  const [qrDataUrl, setQrDataUrl] = useState('');  // Data URL del QR de credenciales nuevas.
  const [qrUser, setQrUser] = useState(null);       // Usuario al que se muestra su QR.
  const [qrUserUrl, setQrUserUrl] = useState('');   // Data URL del QR del usuario seleccionado.

  // ── Estado: modal de nueva asignación de curso ──────────
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignForm, setAssignForm] = useState({ course_id: '', grade_level_id: '' });
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignMessage, setAssignMessage] = useState('');

  // ── Estado: asistencia del docente seleccionado ──────────
  const [teacherAttendance, setTeacherAttendance] = useState([]); // Registros de asistencia.
  const [attLoading, setAttLoading] = useState(false);             // Carga de asistencia en curso.

  // ── Función: load ─────────────────────────────────────────
  // Carga en paralelo usuarios, asignaciones, cursos y grados desde el API.
  // Con `silent=true` no muestra el spinner global (para recargas en segundo plano).
  // Ordena los usuarios por rol: director → secretaria → auxiliar → docente.
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.get('/users'),
      api.get('/teacher-courses'),
      api.get('/courses'),
      api.get('/grade-levels'),
    ]).then(([u, a, c, gl]) => {
      // Definir el orden de visualización de roles.
      const roleOrder = { director: 0, secretaria: 1, auxiliar: 2, docente: 3 };
      // Filtrar solo roles del personal del colegio y ordenar.
      setUsers(u.filter(x => ['docente', 'auxiliar', 'director', 'secretaria'].includes(x.role))
        .sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9)));
      setAssignments(a);
      setCourses(c);
      setGradeLevels(gl);
      setLoading(false);
    }).catch(err => { console.error(err); setLoading(false); });
  };

  // Carga inicial al montar el componente.
  useEffect(load, []);

  // Recarga automática en segundo plano (sin spinner) cuando el hook lo dispare.
  useAutoRefresh(() => load(true));

  // ── Efecto: generar QR del usuario seleccionado (modal de visualización) ──
  // Se ejecuta cada vez que cambia `qrUser`. Genera un código QR con el username
  // para que el docente pueda escanear su QR y acceder al sistema.
  useEffect(() => {
    if (qrUser?.username) {
      QRCode.toDataURL(qrUser.username, { width: 200, margin: 2 })
        .then(url => setQrUserUrl(url))
        .catch(console.error);
    }
  }, [qrUser]);

  // ── Efecto: generar QR de credenciales recién creadas ────
  // Después de crear un usuario nuevo, el backend devuelve `credentials`.
  // Este efecto genera el QR con el username para mostrarlo en el modal de confirmación.
  useEffect(() => {
    if (credentials?.username) {
      QRCode.toDataURL(credentials.username, { width: 200, margin: 2 })
        .then(url => setQrDataUrl(url))
        .catch(console.error);
    }
  }, [credentials]);

  // ── Efecto: sincronizar selectedTeacher tras recargar datos ──
  // Cuando `users` se actualiza (tras un `load`), actualizamos el objeto
  // `selectedTeacher` con los datos frescos para reflejar cambios (nombre, foto, etc.).
  useEffect(() => {
    if (selectedTeacher) {
      const updated = users.find(u => u.id === selectedTeacher.id);
      if (updated) setSelectedTeacher(updated);
    }
  }, [users]);

  // ── Efecto: cargar asistencia al cambiar de docente seleccionado ──
  // Cada vez que se abre la vista de detalle de un docente, se piden sus
  // registros de asistencia al endpoint /teacher-attendance.
  // Se limpia la lista anterior para evitar mostrar datos del docente previo.
  useEffect(() => {
    if (!selectedTeacher) {
      // Si se deselecciona el docente, limpiar los registros de asistencia.
      setTeacherAttendance([]);
      return;
    }
    setAttLoading(true);
    setTeacherAttendance([]); // Limpiar registros previos antes de cargar los nuevos.
    api.get(`/teacher-attendance?teacher_id=${selectedTeacher.id}`)
      .then(data => setTeacherAttendance(data))
      .catch(console.error)
      .finally(() => setAttLoading(false));
  }, [selectedTeacher?.id]); // Solo reejecutar si cambia el ID del docente.

  // ── Handler: resetForm ────────────────────────────────────
  // Restaura todos los estados del formulario a sus valores iniciales
  // y cierra el modal. Se usa al cancelar o tras guardar exitosamente.
  const resetForm = () => {
    setForm({ first_name: '', last_name: '', dni: '', email: '', phone: '', role: 'docente' });
    setEditing(null);
    setShowForm(false);
    setMessage('');
    setPhotoPreview(null);
    setPhotoBlob(null);
    setPhotoDeleted(false);
  };

  // ── Handler: handleEdit ───────────────────────────────────
  // Prepopula el formulario de edición con los datos del usuario `u`
  // y abre el modal en modo edición.
  const handleEdit = (u) => {
    setEditForm({ full_name: u.full_name, password: '', dni: u.dni || '', email: u.email || '', phone: u.phone || '', role: u.role });
    setEditing(u);       // Guardar referencia al usuario editado.
    setShowForm(true);
    setPhotoPreview(u.photo_url || null); // Mostrar foto actual si tiene.
    setPhotoBlob(null);
    setPhotoDeleted(false);
  };

  // ── Handler: handlePhotoChange ────────────────────────────
  // Se dispara cuando el usuario elige una imagen desde el input[file].
  // Comprime la imagen y genera una URL de preview local para mostrarla.
  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Comprimir antes de guardar para ahorrar ancho de banda y espacio en R2.
    const blob = await compressImage(file);
    setPhotoBlob(blob);
    // Crear URL de objeto local para mostrar el preview inmediatamente.
    setPhotoPreview(URL.createObjectURL(blob));
  };

  // ── Handler: handleSubmit ─────────────────────────────────
  // Maneja el envío del formulario de creación o edición de usuario.
  // Flujo:
  //   1. Si hay un blob de foto nuevo, subirlo al servidor (R2) y obtener su URL.
  //   2a. Si es edición: PATCH al usuario existente con los datos actualizados.
  //   2b. Si es creación: POST para crear el usuario y guardar las credenciales devueltas.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      // Mantener la foto existente por defecto; sobreescribir si hay un blob nuevo.
      let photo_url = photoDeleted ? null : (editing?.photo_url || null);
      if (photoBlob) {
        // Subir la foto comprimida al endpoint /upload (que la guarda en R2).
        const fd = new FormData();
        fd.append('photo', photoBlob, 'photo.jpg');
        const { url } = await api.upload('/upload', fd);
        photo_url = url; // URL pública de R2 para guardar en la base de datos.
      }

      if (editing) {
        // ── Modo edición: actualizar usuario existente ──────
        const data = { ...editForm, photo_url };
        // No enviar el campo password si está vacío (no cambiar contraseña).
        if (!data.password) delete data.password;
        await api.put(`/users/${editing.id}`, data);
        // Si el usuario editado es el mismo que está logueado, actualizar el contexto al instante
        if (String(editing.id) === String(currentUser?.id)) {
          updateUser({ full_name: data.full_name, photo_url });
        }
        setMessage('Usuario actualizado');
        load(); // Recargar lista para reflejar los cambios.
        setTimeout(resetForm, 1000); // Cerrar el modal tras 1 segundo.
      } else {
        // ── Modo creación: crear usuario nuevo ──────────────
        const created = await api.post('/users', { ...form, role: form.role, photo_url });
        load();
        resetForm();
        // Guardar las credenciales generadas por el backend para mostrarlas en el modal de confirmación.
        setCredentials({ username: created.username, password: created.password, full_name: created.full_name, role: form.role });
      }
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Handler: handleToggleActive ───────────────────────────
  // Activa o desactiva un usuario (campo `active` en la BD).
  // Un usuario desactivado no puede iniciar sesión.
  // Se niega el valor actual para alternar el estado.
  const handleToggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { active: u.active ? 0 : 1 });
      load(); // Recargar para actualizar el botón de estado.
    } catch (err) {
      console.error(err);
    }
  };

  // ── Handler: handleDeleteUser ─────────────────────────────
  // Elimina permanentemente un usuario de la base de datos tras confirmación.
  // Esta acción es irreversible, por eso se muestra un diálogo de confirmación.
  const handleDeleteUser = async (u) => {
    if (!confirm(`¿Eliminar a ${u.full_name}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  // ── Handler: handleDownloadQr ─────────────────────────────
  // Descarga el QR de credenciales recién creadas como archivo PNG.
  // Se crea un <a> invisible en el DOM y se simula un click para iniciar la descarga.
  const handleDownloadQr = () => {
    if (!qrDataUrl || !credentials) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR-${credentials.full_name}.png`;
    a.click();
  };

  // ── Handler: handleCreateAssignment ──────────────────────
  // Crea una nueva asignación docente↔curso↔grado.
  // El campo `period_id` está fijo en 1 (período académico actual).
  // Tras guardar, cierra el modal automáticamente después de 800ms.
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    setAssignSaving(true);
    setAssignMessage('');
    try {
      await api.post('/teacher-courses', {
        teacher_id: selectedTeacher.id,
        course_id: Number(assignForm.course_id),
        grade_level_id: Number(assignForm.grade_level_id),
        period_id: 1, // Período fijo: siempre el período académico activo.
      });
      setAssignMessage('Asignación creada');
      setAssignForm({ course_id: '', grade_level_id: '' }); // Limpiar formulario.
      load();
      setTimeout(() => { setShowAssignForm(false); setAssignMessage(''); }, 800);
    } catch (err) {
      setAssignMessage('Error: ' + err.message);
    } finally {
      setAssignSaving(false);
    }
  };

  // ── Handler: handleDeleteAssignment ──────────────────────
  // Elimina una asignación docente↔curso tras confirmación del usuario.
  const handleDeleteAssignment = async (id) => {
    if (!confirm('¿Eliminar esta asignación? Se borrarán también las notas y avances del curso.')) return;
    try {
      await api.delete(`/teacher-courses/${id}`);
      load();
    } catch (err) {
      console.error(err);
      alert('No se pudo eliminar la asignación.');
    }
  };

  // ── Handler: handleDeleteAttendance ──────────────────────
  // Elimina un registro de asistencia del docente por su ID.
  // Actualiza la lista local optimistamente (sin recargar del servidor)
  // para dar una respuesta visual inmediata al administrador.
  const handleDeleteAttendance = async (id) => {
    try {
      await api.delete(`/teacher-attendance/${id}`);
      // Filtrar el registro eliminado del estado local sin recargar todo.
      setTeacherAttendance(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // ── Render: estado de carga inicial ──────────────────────
  if (loading) return <div className="loading">Cargando...</div>;

  // ── Datos derivados: asignaciones del docente seleccionado ──
  // Filtra las asignaciones globales para mostrar solo las del docente actual.
  const teacherAssignments = selectedTeacher
    ? assignments.filter(a => a.teacher_id === selectedTeacher.id)
    : [];

  // ── Bloque: modales compartidos ───────────────────────────
  // Todos los modales se definen aquí y se renderizan al final de ambas vistas
  // (lista y detalle) para que estén disponibles en cualquier contexto.
  const modals = (
    <>
      {/* Modal: QR de un usuario existente (accesible desde la lista) */}
      {qrUser && (
        <div className="modal-overlay" onClick={() => { setQrUser(null); setQrUserUrl(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>QR - {qrUser.full_name}</h3>
            {/* Etiqueta de rol del usuario */}
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
              {qrUser.role === 'auxiliar' ? 'Auxiliar' : qrUser.role === 'director' ? 'Director' : 'Docente'}
            </p>
            {/* Imagen del QR (o spinner mientras se genera) */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              {qrUserUrl
                ? <img src={qrUserUrl} alt="QR Code" style={{ width: 200, height: 200 }} />
                : <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Generando QR...</div>}
            </div>
            {/* Sección de credenciales con fondo verde claro */}
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>Credenciales de acceso</p>
              <p style={{ fontSize: 13, marginBottom: 4 }}>Usuario: <strong style={{ fontFamily: 'monospace' }}>{qrUser.username}</strong></p>
              {/* La contraseña es el DNI para docentes/auxiliares; para director/secretaria es personalizada */}
              <p style={{ fontSize: 13 }}>Contraseña: <strong style={{ fontFamily: 'monospace' }}>{qrUser.dni ? qrUser.dni : (qrUser.role === 'director' || qrUser.role === 'secretaria') ? 'personalizada' : 'su DNI'}</strong></p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Descargar PNG del QR directamente desde el data URL */}
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => {
                const a = document.createElement('a'); a.href = qrUserUrl; a.download = `QR-${qrUser.full_name}.png`; a.click();
              }} disabled={!qrUserUrl}>Descargar PNG</button>
              <button className="btn btn-secondary" onClick={() => { setQrUser(null); setQrUserUrl(''); }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: formulario de creación o edición de usuario */}
      {showForm && (
        <div className="modal-overlay" onClick={() => resetForm()}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            {/* Título dinámico según el modo y el rol */}
            <h3>{editing ? 'Editar Usuario' : (form.role === 'auxiliar' ? 'Nuevo Auxiliar' : 'Nuevo Profesor')}</h3>

            {/* Mensaje de éxito (verde) o error (rojo) */}
            {message && (
              <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Sección de foto de perfil: círculo clickeable que abre el input[file] oculto */}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div
                  onClick={() => photoRef.current?.click()}
                  style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg)', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  {/* Mostrar preview si hay imagen, o el ícono de usuario por defecto */}
                  {photoPreview
                    ? <img src={photoPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Icon name="user" color="var(--text-muted)" size={32} />}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => photoRef.current?.click()}>
                    {photoPreview ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                  {photoPreview && (
                    <button type="button" className="btn" style={{ fontSize: 12, padding: '4px 12px', background: '#FEE2E2', color: '#DC2626', border: 'none' }}
                      onClick={() => { setPhotoPreview(null); setPhotoBlob(null); setPhotoDeleted(true); }}>
                      Eliminar foto
                    </button>
                  )}
                </div>
                {/* Input file oculto; se activa mediante el ref */}
                <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
              </div>

              {/* Campos del formulario: distintos según modo edición o creación */}
              {editing ? (
                // ── Modo edición: campos de editForm ───────
                <>
                  <div className="form-group">
                    <label className="form-label">Nombre completo</label>
                    <input className="form-input" value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} required />
                  </div>
                  {/* El username no es editable; se muestra desactivado para referencia */}
                  <div className="form-group">
                    <label className="form-label">Usuario</label>
                    <input className="form-input" value={editing.username} disabled style={{ opacity: 0.6 }} />
                  </div>
                  {/* Dejar vacío el campo password para no modificarla */}
                  <div className="form-group">
                    <label className="form-label">Nueva contraseña (dejar vacío para no cambiar)</label>
                    <input className="form-input" type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">DNI</label>
                    <input className="form-input" value={editForm.dni} onChange={e => setEditForm({ ...editForm, dni: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                  </div>
                  {/* El rol del director no se puede cambiar desde aquí para evitar pérdidas de acceso */}
                  {editing?.role !== 'director' && (
                    <div className="form-group">
                      <label className="form-label">Rol</label>
                      <select className="form-select" value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                        <option value="docente">Docente</option>
                        <option value="auxiliar">Auxiliar</option>
                      </select>
                    </div>
                  )}
                </>
              ) : (
                // ── Modo creación: campos de form (nombres separados) ──
                <>
                  <div className="form-group">
                    <label className="form-label">Nombres</label>
                    <input className="form-input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apellidos</label>
                    <input className="form-input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} required />
                  </div>
                  {/* El DNI se usará como contraseña inicial para el docente/auxiliar */}
                  <div className="form-group">
                    <label className="form-label">DNI <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(se usará como contraseña)</span></label>
                    <input className="form-input" value={form.dni} onChange={e => setForm({ ...form, dni: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Rol</label>
                    <select className="form-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                      <option value="docente">Docente</option>
                      <option value="auxiliar">Auxiliar</option>
                    </select>
                  </div>
                </>
              )}

              {/* Botones de acción del formulario */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: confirmación con credenciales y QR tras crear usuario exitosamente */}
      {credentials && (
        <div className="modal-overlay" onClick={() => setCredentials(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{credentials.role === 'auxiliar' ? 'Auxiliar creado' : 'Profesor creado'}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{credentials.full_name}</p>
            {/* QR del username recién generado para facilitar el primer acceso */}
            {qrDataUrl && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <img src={qrDataUrl} alt="QR Code" style={{ width: 200, height: 200 }} />
              </div>
            )}
            {/* Credenciales en texto plano para entregarlas al docente */}
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>Credenciales de acceso</p>
              <p style={{ fontSize: 13, marginBottom: 4 }}>Usuario: <strong style={{ fontFamily: 'monospace' }}>{credentials.username}</strong></p>
              <p style={{ fontSize: 13 }}>Contraseña: <strong style={{ fontFamily: 'monospace' }}>{credentials.password}</strong></p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Descargar el QR generado como PNG */}
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleDownloadQr} disabled={!qrDataUrl}>
                Descargar QR
              </button>
              <button className="btn btn-secondary" onClick={() => setCredentials(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: formulario para asignar un curso a un docente */}
      {showAssignForm && (
        <div className="modal-overlay" onClick={() => { setShowAssignForm(false); setAssignMessage(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Nueva Asignación</h3>
            {/* Nombre del docente que recibirá la asignación */}
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{selectedTeacher?.full_name}</p>
            {/* Mensaje de resultado de la operación */}
            {assignMessage && (
              <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: assignMessage.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: assignMessage.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>
                {assignMessage}
              </div>
            )}
            <form onSubmit={handleCreateAssignment}>
              {/* Selector de curso */}
              <div className="form-group">
                <label className="form-label">Curso</label>
                <select className="form-select" value={assignForm.course_id} onChange={e => setAssignForm({ ...assignForm, course_id: e.target.value })} required>
                  <option value="">Seleccionar...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {/* Selector de grado/sección */}
              <div className="form-group">
                <label className="form-label">Grado</label>
                <select className="form-select" value={assignForm.grade_level_id} onChange={e => setAssignForm({ ...assignForm, grade_level_id: e.target.value })} required>
                  <option value="">Seleccionar...</option>
                  {gradeLevels.map(gl => <option key={gl.id} value={gl.id}>{gl.name}{gl.section ? ` "${gl.section}"` : ''}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={assignSaving} style={{ flex: 1, justifyContent: 'center' }}>
                  {assignSaving ? 'Guardando...' : 'Asignar'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignForm(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );

  // ══════════════════════════════════════════════════════════
  // VIEW 2: Detalle del docente — asistencia y cursos asignados
  // Se muestra cuando el admin hace click sobre un usuario de la lista.
  // ══════════════════════════════════════════════════════════
  if (selectedTeacher) {
    return (
      <div>
        {/* Encabezado con botón de retroceso y acciones contextuales */}
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Flecha de retroceso para volver a la lista */}
              <div onClick={() => setSelectedTeacher(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>←</div>
              <div>
                <h1>{selectedTeacher.full_name}</h1>
                <p>@{selectedTeacher.username}</p>
              </div>
            </div>
            {/* Botón para asignar curso: solo visible para rol docente */}
            <div style={{ display: 'flex', gap: 8 }}>
              {selectedTeacher.role === 'docente' && (
                <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
                  onClick={() => setShowAssignForm(true)}>
                  + Asignar
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="content-area">
          {/* Sección: calendario de asistencia del docente seleccionado */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Asistencia ({teacherAttendance.length})
            </p>
            {/* Mostrar spinner mientras se cargan los registros */}
            {attLoading
              ? <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>Cargando...</p>
              : <TeacherAttendanceCalendar records={teacherAttendance} />
            }
          </div>

          {/* Sección inferior: varía según el rol del usuario seleccionado */}
          {selectedTeacher.role === 'director' ? (
            // El director tiene acceso completo, no tiene asignaciones de cursos.
            <div className="empty-state"><p>El director tiene acceso completo al panel de administración.</p></div>
          ) : selectedTeacher.role === 'secretaria' ? (
            // La secretaria también tiene acceso completo; sin asignaciones de cursos.
            <div className="empty-state"><p>La secretaria tiene acceso completo al panel de administración.</p></div>
          ) : selectedTeacher.role === 'auxiliar' ? (
            // El auxiliar solo accede a Asistencia y Comunicados; sin cursos asignados.
            <div className="empty-state"><p>El auxiliar tiene acceso a Asistencia y Comunicados.</p></div>
          ) : (
            // ── Sección de cursos asignados al docente ─────
            <>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Cursos asignados ({teacherAssignments.length})
              </p>
              {/* Estado vacío si el docente no tiene asignaciones */}
              {teacherAssignments.length === 0 && (
                <div className="empty-state"><p>Sin asignaciones. Usa "+ Asignar" para agregar.</p></div>
              )}
              {/* Tarjeta por cada asignación: muestra curso, grado y botón de eliminar */}
              {teacherAssignments.map(a => (
                <div key={a.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    {/* Ícono del curso con el color definido en el catálogo */}
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: (a.color || '#3B82F6') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="book" color={a.color || '#3B82F6'} size={18} />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700 }}>{a.course_name}</p>
                      {/* Grado y sección entre comillas si existe */}
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.grade_name}{a.section ? ` "${a.section}"` : ''}</p>
                    </div>
                  </div>
                  {/* Botón para eliminar esta asignación */}
                  <button onClick={() => handleDeleteAssignment(a.id)} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
                    <Icon name="trash" color="white" size={14} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
        {modals}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW 1: Lista de todo el personal con acciones rápidas
  // Vista por defecto al ingresar a AdminUsuarios.
  // ══════════════════════════════════════════════════════════
  return (
    <div>
      {/* Encabezado con resumen de conteos por rol y botón de creación */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Personal</h1>
            {/* Resumen dinámico: "X docentes · Y auxiliares · Z director · ..." */}
            <p>
              {users.filter(u => u.role === 'docente').length} docentes
              {' · '}
              {users.filter(u => u.role === 'auxiliar').length} auxiliares
              {users.some(u => u.role === 'director') ? ` · ${users.filter(u => u.role === 'director').length} director` : ''}
              {users.some(u => u.role === 'secretaria') ? ` · ${users.filter(u => u.role === 'secretaria').length} secretaria` : ''}
            </p>
          </div>
          {/* Abrir modal de creación limpiando el formulario primero */}
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
            onClick={() => { resetForm(); setShowForm(true); }}>
            + Nuevo
          </button>
        </div>
      </div>

      <div className="content-area">
        {/* Tarjeta de usuario por cada miembro del personal */}
        {users.map(u => {
          // Número de cursos asignados a este docente (para mostrarlo como badge).
          const count = assignments.filter(a => a.teacher_id === u.id).length;
          return (
            <div
              key={u.id}
              className="card"
              style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }}
              onClick={() => setSelectedTeacher(u)} // Navegar al detalle del usuario.
            >
              {/* Sección izquierda: avatar + nombre + rol + datos de contacto */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                {/* Avatar circular: foto si existe, ícono de usuario si no */}
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {u.photo_url
                    ? <img src={u.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Icon name="user" color="var(--text-muted)" size={20} />}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{u.full_name}</p>
                    {/* Badge de rol con color distinto por cada rol */}
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                      background: u.role === 'auxiliar' ? '#FEF3C7' : u.role === 'director' ? '#F3E8FF' : u.role === 'secretaria' ? '#FCE7F3' : '#EFF6FF',
                      color: u.role === 'auxiliar' ? '#92400E' : u.role === 'director' ? '#7C3AED' : u.role === 'secretaria' ? '#9D174D' : '#1D4ED8'
                    }}>
                      {u.role === 'auxiliar' ? 'Auxiliar' : u.role === 'director' ? 'Director' : u.role === 'secretaria' ? 'Secretaria' : 'Docente'}
                    </span>
                  </div>
                  {/* DNI o username según disponibilidad, más teléfono con indicador de color */}
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {u.dni ? `DNI: ${u.dni}` : '@' + u.username}
                    {' · '}
                    {u.phone
                      ? <span style={{ color: '#10B981' }}>📱 {u.phone}</span>
                      : <span style={{ color: '#EF4444' }}>Sin teléfono</span>}
                  </p>
                </div>
              </div>

              {/* Sección derecha: botones de acción rápida */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Ver QR de credenciales del usuario */}
                <button onClick={e => { e.stopPropagation(); setQrUser(u); }} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }}>
                  <Icon name="qr" size={14} />
                </button>
                {/* Abrir formulario de edición con los datos del usuario */}
                <button onClick={e => { e.stopPropagation(); handleEdit(u); }} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }}>
                  <Icon name="edit" size={14} />
                </button>
                {/* Acciones de activar/desactivar y eliminar: ocultas para el propio admin */}
                {u.id !== currentUser?.id && <>
                  {/* Alternar estado activo/inactivo */}
                  <button
                    onClick={e => { e.stopPropagation(); handleToggleActive(u); }}
                    className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-success'}`}
                    style={{ padding: '4px 8px', fontSize: 10 }}>
                    {u.active ? 'Desact.' : 'Activar'}
                  </button>
                  {/* Eliminar usuario permanentemente */}
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteUser(u); }}
                    className="btn btn-sm btn-danger"
                    style={{ padding: '4px 8px' }}>
                    <Icon name="trash" size={14} color="white" />
                  </button>
                </>}
              </div>
            </div>
          );
        })}
      </div>
      {modals}
    </div>
  );
}
