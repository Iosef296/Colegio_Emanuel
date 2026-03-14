import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

// Comprime una imagen antes de subirla al servidor.
// Escala la imagen al máximo de 800px en su lado más largo y la convierte a JPEG al 88%.
// Devuelve una Promise<Blob> para poder hacer await en el handler.
const compressImage = (file) => new Promise((resolve) => {
  const img = new Image();
  // Crea una URL temporal en memoria para cargar el archivo sin leerlo con FileReader
  const url = URL.createObjectURL(file);
  img.onload = () => {
    // Libera la URL temporal de memoria una vez que la imagen ya fue cargada
    URL.revokeObjectURL(url);
    const max = 800;
    let { width, height } = img;
    // Escala proporcional: solo redimensiona si algún lado supera el máximo
    if (width > max || height > max) {
      if (width > height) { height = Math.round((height / width) * max); width = max; }
      else { width = Math.round((width / height) * max); height = max; }
    }
    // Dibuja la imagen en un canvas con las nuevas dimensiones y exporta a Blob JPEG
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    canvas.toBlob(resolve, 'image/jpeg', 0.88);
  };
  img.src = url;
});

// Componente principal de gestión de grados para el panel administrativo.
// Implementa dos vistas:
//   VIEW 1 → lista de grados con buscador de alumnos cruzado
//   VIEW 2 → detalle de un grado con su lista de alumnos
export default function AdminGrados() {
  // Lista de grados registrados en la base de datos
  const [grades, setGrades] = useState([]);

  // Lista completa de alumnos (todos los grados) para el buscador de VIEW 1
  const [students, setStudents] = useState([]);

  // Controla el spinner de carga inicial
  const [loading, setLoading] = useState(true);

  // Grado seleccionado para entrar a VIEW 2; null = VIEW 1
  const [selectedGrade, setSelectedGrade] = useState(null);

  // Notas/calificaciones del grado seleccionado (cargadas al entrar a VIEW 2)
  const [gradeGrades, setGradeGrades] = useState([]);

  // Asignaciones de cursos para el grado seleccionado
  const [gradeCourses, setGradeCourses] = useState([]);

  // Pagos de todos los alumnos del grado para verificar mensualidad del mes actual
  const [payments, setPayments] = useState([]);

  // Indica que se están cargando las notas/pagos al seleccionar un grado
  const [gradeGradesLoading, setGradeGradesLoading] = useState(false);

  // Objeto indexado por student_id que controla qué alumnos tienen el panel expandido
  const [expandedStudents, setExpandedStudents] = useState({});

  // ── Estado del formulario de grado ──

  // Controla la visibilidad del modal de crear/editar grado
  const [showForm, setShowForm] = useState(false);

  // ID del grado que se está editando; null = modo creación
  const [editing, setEditing] = useState(null);

  // Valores de los campos del formulario de grado: nombre, sección y color
  const [form, setForm] = useState({ name: '', section: '', color: '#7C3AED' });

  // Indica si se está guardando el grado para deshabilitar el botón
  const [saving, setSaving] = useState(false);

  // Mensaje de retroalimentación dentro del formulario de grado
  const [message, setMessage] = useState('');

  // Grado que espera confirmación de eliminación (null = modal cerrado)
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Texto de búsqueda para el buscador de alumnos cruzado en VIEW 1
  const [search, setSearch] = useState('');

  // URL de previsualización de la foto del grado
  const [photoPreview, setPhotoPreview] = useState(null);

  // Blob comprimido de la foto del grado listo para subir a R2
  const [photoBlob, setPhotoBlob] = useState(null);

  // Ref al input de archivo oculto del formulario de grado para abrirlo programáticamente
  const photoRef = useRef(null);

  // ── Estado del panel de tutor ──

  // Lista de docentes y auxiliares disponibles para asignar como tutores
  const [teachers, setTeachers] = useState([]);

  // Controla la visibilidad del modal de asignación de tutor
  const [showTutorModal, setShowTutorModal] = useState(false);

  // Indica si se está procesando la asignación del tutor
  const [savingTutor, setSavingTutor] = useState(false);

  // ── Estado del formulario de alumno dentro del grado ──

  // Controla la visibilidad del modal de crear/editar alumno
  const [showStudentForm, setShowStudentForm] = useState(false);

  // ID del alumno que se está editando; null = modo creación
  const [editingStudent, setEditingStudent] = useState(null);

  // Valores de los campos del formulario de alumno
  const [studentForm, setStudentForm] = useState({ first_name: '', last_name: '', dni: '', birth_date: '', monthly_fee: '350', parent_phone: '' });

  // Indica si se está procesando el guardado del alumno
  const [studentSaving, setStudentSaving] = useState(false);

  // Mensaje de retroalimentación dentro del formulario de alumno
  const [studentMessage, setStudentMessage] = useState('');

  // Archivo de foto seleccionado para el alumno (File object)
  const [studentPhotoFile, setStudentPhotoFile] = useState(null);

  // URL de previsualización de la foto del alumno
  const [studentPhotoPreview, setStudentPhotoPreview] = useState(null);

  // Ref al input de archivo oculto del formulario de alumno
  const studentPhotoRef = useRef(null);

  // Alumno cuyo QR se quiere mostrar en el modal
  const [qrStudent, setQrStudent] = useState(null);

  // Data URL con la imagen PNG del QR generado por la librería qrcode
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Carga grados, alumnos y usuarios en paralelo desde la API.
  // Si silent=true omite el spinner para refrescos en segundo plano.
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([api.get('/grade-levels'), api.get('/students'), api.get('/users')])
      .then(([gl, s, u]) => {
        setGrades(gl);
        setStudents(s);
        // Solo docentes y auxiliares pueden ser tutores de un grado
        setTeachers(u.filter(x => x.role === 'docente' || x.role === 'auxiliar'));
        setLoading(false);
      })
      .catch(err => { console.error(err); setLoading(false); });
  };

  // Carga inicial de datos al montar el componente
  useEffect(load, []);

  // Refresco automático silencioso para mantener los datos actualizados
  useAutoRefresh(() => load(true));

  // Genera la imagen QR cada vez que cambia el alumno seleccionado para el modal de QR.
  // Convierte el código del alumno en una imagen PNG base64 usando la librería qrcode.
  useEffect(() => {
    if (qrStudent?.codigo) {
      QRCode.toDataURL(qrStudent.codigo, { width: 200, margin: 2 })
        .then(url => setQrDataUrl(url))
        .catch(console.error);
    } else {
      // Si el alumno no tiene código, limpia la imagen para evitar mostrar un QR obsoleto
      setQrDataUrl('');
    }
  }, [qrStudent]);

  // Mantiene el objeto selectedGrade sincronizado con los datos más recientes del servidor.
  // Cuando se recarga la lista de grados, actualiza el grado seleccionado con los nuevos datos
  // (p.ej. foto actualizada, nombre cambiado) sin navegar de vuelta a VIEW 1.
  useEffect(() => {
    if (selectedGrade) {
      const updated = grades.find(g => g.id === selectedGrade.id);
      if (updated) setSelectedGrade(prev => ({ ...prev, ...updated }));
    }
  }, [grades]);

  // Nombres de todos los meses en español y derivados del mes/año actuales
  // para identificar si un alumno ha pagado la mensualidad del mes en curso.
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const currentMonth = MONTHS[new Date().getMonth()];
  const currentYear = new Date().getFullYear();

  // Selecciona un grado para entrar a VIEW 2 y carga sus datos adicionales (notas, pagos, cursos).
  // También reinicia la expansión de alumnos para empezar desde un estado limpio.
  const handleSelectGrade = (g) => {
    setSelectedGrade(g);
    setExpandedStudents({});
    setGradeGradesLoading(true);
    Promise.all([
      api.get(`/grades?grade_level_id=${g.id}`),  // calificaciones del grado
      api.get('/payments'),                         // pagos (para indicador de mensualidad)
      api.get('/teacher-courses'),                  // asignaciones de cursos para filtrar por grado
    ]).then(([gr, py, tc]) => {
      setGradeGrades(gr);
      setPayments(py);
      // Filtra solo las asignaciones que corresponden al grado seleccionado
      setGradeCourses(tc.filter(c => c.grade_level_id === g.id));
    })
      .catch(console.error)
      .finally(() => setGradeGradesLoading(false));
  };

  // Alterna la expansión del panel de detalle de un alumno en VIEW 2.
  // Usa el patrón de actualización funcional para leer el estado más reciente.
  const toggleStudent = (id) => setExpandedStudents(prev => ({ ...prev, [id]: !prev[id] }));

  // Verifica si un alumno tiene pagada la mensualidad del mes y año actuales.
  // Se usa para mostrar un indicador visual en la tarjeta del alumno.
  const hasPaidCurrentMonth = (studentId) =>
    payments.some(p => p.student_id === studentId && p.paid && p.month === currentMonth && p.year === currentYear);

  // ── Handlers del formulario de grado ──

  // Restablece los campos del formulario de grado y cierra el modal.
  const resetForm = () => {
    setForm({ name: '', section: '', color: '#7C3AED' });
    setEditing(null);
    setShowForm(false);
    setMessage('');
    setPhotoPreview(null);
    setPhotoBlob(null);
  };

  // Prepara el formulario con los datos del grado a editar.
  // Carga la foto existente como previsualización.
  const handleEdit = (g) => {
    setForm({ name: g.name, section: g.section || '', color: g.color || '#7C3AED' });
    setEditing(g.id);
    setShowForm(true);
    setPhotoPreview(g.photo_url || null);
    setPhotoBlob(null);
  };

  // Maneja la selección de una foto para el grado.
  // Comprime la imagen antes de guardarla en el estado para reducir el tamaño de subida.
  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // compressImage redimensiona y convierte a JPEG para reducir el peso del archivo
    const blob = await compressImage(file);
    setPhotoBlob(blob);
    // Crea una URL temporal de previsualización a partir del Blob comprimido
    setPhotoPreview(URL.createObjectURL(blob));
  };

  // Envía el formulario para crear o actualizar un grado.
  // Si hay una foto nueva la sube a R2 primero y usa la URL resultante.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      // Para edición, conserva la foto existente del grado si no se seleccionó una nueva
      let photo_url = editing ? (grades.find(g => g.id === editing)?.photo_url || null) : null;
      if (photoBlob) {
        // Sube la foto comprimida a R2 a través del endpoint /upload
        const fd = new FormData();
        fd.append('photo', photoBlob, 'photo.jpg');
        const { url } = await api.upload('/upload', fd);
        photo_url = url;
      }
      const payload = { ...form, photo_url };
      if (editing) {
        await api.put(`/grade-levels/${editing}`, payload);
        setMessage('Grado actualizado');
        // Si el grado editado es el que está actualmente seleccionado en VIEW 2, lo actualiza en vivo
        if (selectedGrade?.id === editing) setSelectedGrade(g => ({ ...g, ...payload }));
      } else {
        await api.post('/grade-levels', payload);
        setMessage('Grado creado');
      }
      load();
      // Cierra el modal después de 1 segundo para que el usuario lea el mensaje de éxito
      setTimeout(resetForm, 1000);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Elimina un grado permanentemente.
  // Se llama desde el modal de confirmación (confirmDelete) para evitar eliminaciones accidentales.
  const handleDeleteGrade = async (g) => {
    try {
      await api.delete(`/grade-levels/${g.id}`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Cuenta cuántos alumnos tiene un grado dado su ID.
  // Se usa en las tarjetas de VIEW 1 para mostrar el contador.
  const countStudents = (gradeId) => students.filter(s => s.grade_level_id === gradeId).length;

  // Asigna un docente/auxiliar como tutor del grado seleccionado.
  // Si teacherId es null, quita el tutor actual.
  const handleAssignTutor = async (teacherId) => {
    setSavingTutor(true);
    try {
      await api.put(`/grade-levels/${selectedGrade.id}`, { tutor_id: teacherId });
      // Actualiza el estado local con el nombre y foto del nuevo tutor para evitar un reload completo
      const updated = { ...selectedGrade, tutor_id: teacherId, tutor_name: teachers.find(t => t.id === teacherId)?.full_name || null, tutor_photo: teachers.find(t => t.id === teacherId)?.photo_url || null };
      setSelectedGrade(updated);
      // Refleja el cambio también en la lista de grados de VIEW 1
      setGrades(prev => prev.map(g => g.id === selectedGrade.id ? { ...g, ...updated } : g));
      setShowTutorModal(false);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSavingTutor(false);
    }
  };

  // ── Handlers del formulario de alumno ──

  // Restablece el formulario de alumno y cierra el modal.
  const resetStudentForm = () => {
    setStudentForm({ first_name: '', last_name: '', dni: '', birth_date: '', monthly_fee: '350', parent_phone: '' });
    setEditingStudent(null);
    setShowStudentForm(false);
    setStudentMessage('');
    setStudentPhotoFile(null);
    setStudentPhotoPreview(null);
  };

  // Prepara el formulario de alumno para editar un alumno existente.
  // Trae el monto de mensualidad real desde los pagos registrados.
  const handleStudentEdit = async (s) => {
    let monthly_fee = '350';
    try {
      // Consulta los pagos del alumno para conocer su mensualidad real
      const pmnts = await api.get('/payments');
      const unpaid = pmnts.find(p => p.student_id === s.id && !p.paid);
      const any = pmnts.find(p => p.student_id === s.id);
      // Prioriza cuota pendiente; si no hay pendiente usa cualquier cuota registrada
      if (unpaid) monthly_fee = String(unpaid.amount);
      else if (any) monthly_fee = String(any.amount);
    } catch { /* Si falla la consulta, se usa 350 como valor por defecto */ }

    setStudentForm({
      first_name: s.first_name,
      last_name: s.last_name,
      dni: s.dni || '',
      // Recorta la hora del ISO 8601 para que el input type="date" acepte el valor
      birth_date: s.birth_date ? s.birth_date.split('T')[0] : '',
      monthly_fee,
      parent_phone: s.parent_phone || '',
    });
    setStudentPhotoFile(null);
    // Carga la foto existente del alumno como previsualización inicial
    setStudentPhotoPreview(s.photo_url || null);
    setEditingStudent(s.id);
    setShowStudentForm(true);
  };

  // Maneja la selección de una foto para el alumno.
  // Lee el archivo como Data URL para previsualización inmediata antes de subir.
  const handleStudentPhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStudentPhotoFile(file);
    // FileReader convierte el archivo a base64 para mostrar la previsualización localmente
    const reader = new FileReader();
    reader.onload = (ev) => setStudentPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  // Envía el formulario para crear o actualizar un alumno dentro del grado seleccionado.
  // Valida los campos obligatorios, sube la foto si es nueva y llama al endpoint correspondiente.
  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    setStudentMessage('');
    const trimmedFirst = studentForm.first_name.trim();
    const trimmedLast = studentForm.last_name.trim();

    // Validaciones del lado cliente para retroalimentación inmediata
    if (!trimmedFirst || !trimmedLast) return setStudentMessage('Error: Nombres y apellidos son obligatorios');
    if (studentForm.dni && !/^\d{8}$/.test(studentForm.dni)) return setStudentMessage('Error: El DNI debe tener exactamente 8 dígitos');

    setStudentSaving(true);
    try {
      // Sube la foto nueva si fue seleccionada; si no, reutiliza la URL existente
      let photo_url = studentPhotoFile ? null : (studentPhotoPreview || null);
      if (studentPhotoFile) {
        const fd = new FormData();
        fd.append('photo', studentPhotoFile);
        const result = await api.upload('/upload', fd);
        photo_url = result.url;
      }

      // Construye el payload con el grade_level_id del grado actualmente seleccionado
      const data = { ...studentForm, first_name: trimmedFirst, last_name: trimmedLast, grade_level_id: selectedGrade.id, monthly_fee: Number(studentForm.monthly_fee), photo_url };

      if (editingStudent) {
        // Actualizar alumno existente
        await api.put(`/students/${editingStudent}`, data);
        setStudentMessage('Alumno actualizado');
        load();
        setTimeout(resetStudentForm, 1000);
      } else {
        // Crear nuevo alumno; el servidor devuelve id, codigo, username y password
        const created = await api.post('/students', data);
        load();
        resetStudentForm();
        // Muestra el modal de QR automáticamente para el nuevo alumno
        setQrStudent({ ...data, id: created.id, codigo: created.codigo, grade_name: selectedGrade.name, section: selectedGrade.section, username: created.username, password: created.password });
      }
    } catch (err) {
      setStudentMessage('Error: ' + err.message);
    } finally {
      setStudentSaving(false);
    }
  };

  // Activa o desactiva un alumno (campo active 1/0).
  // Permite ocultar temporalmente alumnos sin borrarlos definitivamente.
  const handleStudentToggleActive = async (s) => {
    try {
      await api.put(`/students/${s.id}`, { active: s.active ? 0 : 1 });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  // Elimina un alumno permanentemente previo confirm del usuario.
  const handleStudentDelete = async (s) => {
    if (!confirm(`¿Eliminar a ${s.first_name} ${s.last_name}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/students/${s.id}`);
      load();
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  // Descarga la imagen QR del alumno como archivo PNG.
  // Crea un enlace temporal, lo activa y lo destruye sin modificar el DOM permanentemente.
  const handleDownloadQr = () => {
    if (!qrDataUrl || !qrStudent) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR-${qrStudent.first_name}-${qrStudent.last_name}.png`;
    a.click();
  };

  // Genera un código único para un alumno que aún no tiene QR asignado.
  // El servidor crea el código y lo devuelve; se actualiza el estado local para mostrar el QR.
  const handleGenerateCodigo = async () => {
    try {
      const { codigo } = await api.post(`/students/${qrStudent.id}/codigo`, {});
      // Actualizar qrStudent con el nuevo código dispara el useEffect que genera la imagen QR
      setQrStudent({ ...qrStudent, codigo });
      load();
    } catch (err) { console.error(err); }
  };

  // Pantalla de carga mientras se obtienen los datos iniciales de la API
  if (loading) return <div className="loading">Cargando...</div>;

  // Bloque de modales compartido entre las dos vistas.
  // Se define aquí (tras el guard de loading) para poder usarlo tanto en VIEW 1 como en VIEW 2.
  const modals = (
    <>
      {/* Modal de código QR del alumno */}
      {qrStudent && (
        // Clic en overlay limpia el estado y cierra el modal
        <div className="modal-overlay" onClick={() => { setQrStudent(null); setQrDataUrl(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>QR - {qrStudent.first_name} {qrStudent.last_name}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
              {qrStudent.grade_name}{qrStudent.section ? ` "${qrStudent.section}"` : ''}
            </p>

            {/* Rama con código: muestra imagen QR, credenciales y botón de descarga */}
            {qrStudent.codigo ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Código: {qrStudent.codigo}</p>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  {qrDataUrl
                    ? <img src={qrDataUrl} alt="QR Code" style={{ width: 200, height: 200 }} />
                    : <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Generando QR...</div>}
                </div>
                {/* Credenciales visibles solo cuando el servidor las devuelve (alumno recién creado) */}
                {qrStudent.username && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>Credenciales de acceso</p>
                    <p style={{ fontSize: 13, marginBottom: 4 }}>Usuario: <strong style={{ fontFamily: 'monospace' }}>{qrStudent.username}</strong></p>
                    <p style={{ fontSize: 13 }}>Contraseña: <strong style={{ fontFamily: 'monospace' }}>{qrStudent.password || qrStudent.dni || 'su DNI'}</strong></p>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleDownloadQr} disabled={!qrDataUrl}>Descargar PNG</button>
                  <button className="btn btn-secondary" onClick={() => { setQrStudent(null); setQrDataUrl(''); }}>Cerrar</button>
                </div>
              </>
            ) : (
              // Rama sin código: permite generar el código por primera vez
              <>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Este alumno no tiene código QR asignado.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleGenerateCodigo}>Generar código</button>
                  <button className="btn btn-secondary" onClick={() => { setQrStudent(null); setQrDataUrl(''); }}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de formulario de alumno (crear/editar) */}
      {showStudentForm && (
        <div className="modal-overlay" onClick={() => resetStudentForm()}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{editingStudent ? 'Editar Alumno' : 'Nuevo Alumno'}</h3>

            {/* Alerta de retroalimentación dentro del formulario */}
            {studentMessage && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: studentMessage.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: studentMessage.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{studentMessage}</div>}

            <form onSubmit={handleStudentSubmit}>
              {/* Selector de foto de alumno: clic en círculo activa el input oculto */}
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <label htmlFor="student-photo-input-g" style={{ cursor: 'pointer' }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', border: `2px dashed ${studentPhotoPreview ? 'var(--primary)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', overflow: 'hidden', background: '#F9FAFB' }}>
                    {studentPhotoPreview
                      ? <img src={studentPhotoPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Icon name="camera" color="var(--text-muted)" size={28} />}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Toca para tomar o escoger foto</p>
                </label>
                {/* Input oculto; el sufijo "-g" evita conflicto de IDs con AdminAlumnos si ambos están en el DOM */}
                <input id="student-photo-input-g" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleStudentPhotoChange} />
              </div>

              {/* Campos del formulario de alumno */}
              <div className="form-group">
                <label className="form-label">Nombres</label>
                <input className="form-input" value={studentForm.first_name} onChange={e => setStudentForm({ ...studentForm, first_name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Apellidos</label>
                <input className="form-input" value={studentForm.last_name} onChange={e => setStudentForm({ ...studentForm, last_name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">DNI</label>
                <input className="form-input" value={studentForm.dni} onChange={e => setStudentForm({ ...studentForm, dni: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de nacimiento</label>
                <input type="date" className="form-input" value={studentForm.birth_date} onChange={e => setStudentForm({ ...studentForm, birth_date: e.target.value })} />
              </div>
              <div className="form-group">
                {/* Nota: al editar, el monto actualiza también las cuotas pendientes en el servidor */}
                <label className="form-label">Mensualidad (S/){editingStudent && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>(actualiza cuotas pendientes)</span>}</label>
                <input className="form-input" type="number" step="0.01" min="0" value={studentForm.monthly_fee} onChange={e => setStudentForm({ ...studentForm, monthly_fee: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono del padre <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(WhatsApp)</span></label>
                <input className="form-input" type="tel" placeholder="Ej: 987654321" value={studentForm.parent_phone} onChange={e => setStudentForm({ ...studentForm, parent_phone: e.target.value })} />
              </div>

              {/* Botones de guardar y cancelar */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={studentSaving} style={{ flex: 1, justifyContent: 'center' }}>
                  {studentSaving ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetStudentForm}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de asignación de tutor al grado seleccionado */}
      {showTutorModal && (
        <div className="modal-overlay" onClick={() => setShowTutorModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Asignar tutor</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{selectedGrade?.name}{selectedGrade?.section ? ` "${selectedGrade.section}"` : ''}</p>

            {/* Botón para quitar el tutor actual solo visible si ya hay uno asignado */}
            {selectedGrade?.tutor_id && (
              <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8, fontSize: 13 }}
                onClick={() => handleAssignTutor(null)} disabled={savingTutor}>
                Quitar tutor actual
              </button>
            )}

            {/* Lista de docentes/auxiliares disponibles para asignar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {teachers.map(t => (
                // Clic en la tarjeta del docente lo asigna como tutor
                <div key={t.id} onClick={() => handleAssignTutor(t.id)}
                  className="card"
                  // Resalta con fondo azul al docente que ya es tutor del grado
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', background: selectedGrade?.tutor_id === t.id ? '#EFF6FF' : undefined, border: selectedGrade?.tutor_id === t.id ? '2px solid #3B82F6' : undefined }}>
                  {/* Avatar del docente */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {t.photo_url ? <img src={t.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="user" size={18} color="var(--text-muted)" />}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{t.full_name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.role === 'auxiliar' ? 'Auxiliar' : 'Docente'}</p>
                  </div>
                  {/* Indicador visual de tutor actual */}
                  {selectedGrade?.tutor_id === t.id && <span style={{ marginLeft: 'auto', color: '#3B82F6', fontSize: 12, fontWeight: 700 }}>✓ Actual</span>}
                </div>
              ))}
              {teachers.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>No hay docentes registrados</p>}
            </div>
            <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => setShowTutorModal(false)}>Cerrar</button>
          </div>
        </div>
      )}

      {/* Modal de formulario de grado (crear/editar) */}
      {showForm && (
        <div className="modal-overlay" onClick={() => resetForm()}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{editing ? 'Editar Grado' : 'Nuevo Grado'}</h3>

            {/* Alerta de retroalimentación */}
            {message && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{message}</div>}

            <form onSubmit={handleSubmit}>
              {/* Selector de foto del grado: clic en el cuadrado abre el input oculto a través del ref */}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div onClick={() => photoRef.current?.click()} style={{ width: 80, height: 80, borderRadius: 16, overflow: 'hidden', background: form.color + '20', border: `2px dashed ${form.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  {photoPreview
                    ? <img src={photoPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Icon name="users" color={form.color} size={32} />}
                </div>
                <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => photoRef.current?.click()}>
                  {photoPreview ? 'Cambiar foto' : 'Subir foto'}
                </button>
                {/* Input oculto referenciado mediante ref para mayor control que el enfoque label/id */}
                <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
              </div>

              <div className="form-group">
                <label className="form-label">Nombre del grado</label>
                <input className="form-input" placeholder="Ej: 1° Primaria" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Sección <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(opcional)</span></label>
                <input className="form-input" placeholder="Ej: A" value={form.section} onChange={e => setForm({ ...form, section: e.target.value })} />
              </div>

              {/* Selector de color del grado con valor hex visible */}
              <div className="form-group">
                <label className="form-label">Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                    style={{ width: 44, height: 36, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{form.color}</span>
                </div>
              </div>

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

      {/* Modal de confirmación de eliminación de grado.
          Se usa un modal personalizado en lugar de window.confirm para mayor control visual. */}
      {confirmDelete && (
        // Clic en overlay cancela sin eliminar
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            {/* Ícono de papelera en círculo rojo para reforzar la acción destructiva */}
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Icon name="trash" color="var(--danger)" size={22} />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>¿Eliminar grado?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              {confirmDelete.name}{confirmDelete.section ? ` "${confirmDelete.section}"` : ''}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
              {/* Botón de eliminar pasa el objeto completo del grado a handleDeleteGrade */}
              <button onClick={() => handleDeleteGrade(confirmDelete)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--danger)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ── VISTA 2: Detalle del grado seleccionado con lista de alumnos ──
  // Se activa cuando el usuario hace clic en un grado en VIEW 1.
  if (selectedGrade) {
    // Filtra y ordena los alumnos del grado por apellido (orden alfabético)
    const gradeStudents = students
      .filter(s => s.grade_level_id === selectedGrade.id)
      .sort((a, b) => a.last_name.localeCompare(b.last_name));

    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Flecha de retroceso: limpia el grado seleccionado y vuelve a VIEW 1 */}
              <div onClick={() => setSelectedGrade(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>←</div>
              <div>
                <h1>{selectedGrade.name}{selectedGrade.section ? ` "${selectedGrade.section}"` : ''}</h1>
                {/* Subtítulo con conteo de alumnos y nombre del tutor si existe */}
                <p>{gradeStudents.length} alumnos{selectedGrade.tutor_name ? ` · Tutor: ${selectedGrade.tutor_name}` : ''}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Botón para abrir el modal de asignación de tutor */}
              <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', fontSize: 12 }}
                onClick={() => setShowTutorModal(true)}>
                Asignar tutor
              </button>
              {/* Botón para crear nuevo alumno en este grado */}
              <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
                onClick={() => { resetStudentForm(); setShowStudentForm(true); }}>
                + Nuevo
              </button>
            </div>
          </div>
        </div>

        <div className="content-area">
          {gradeStudents.length === 0 && <div className="empty-state"><p>Sin alumnos en este grado</p></div>}

          {/* Tarjeta de cada alumno con foto, datos y botones de acción */}
          {gradeStudents.map(s => (
            <div key={s.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                {/* Avatar del alumno con el color del grado como fondo; 22 hex = ~13% de opacidad */}
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: (selectedGrade.color || '#7C3AED') + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {s.photo_url
                    ? <img src={s.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Icon name="user" color={selectedGrade.color || '#7C3AED'} size={20} />}
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{s.first_name} {s.last_name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {s.dni ? `DNI: ${s.dni}` : 'Sin DNI'}
                    {' · '}
                    {/* Teléfono en verde si registrado, rojo si falta */}
                    {s.parent_phone
                      ? <span style={{ color: '#10B981' }}>📱 {s.parent_phone}</span>
                      : <span style={{ color: '#EF4444' }}>Sin teléfono</span>}
                  </p>
                </div>
              </div>

              {/* Botones de acción por alumno */}
              <div style={{ display: 'flex', gap: 6 }}>
                {/* Ver/generar QR del alumno */}
                <button onClick={() => setQrStudent(s)} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }} title="Ver QR">
                  <Icon name="qr" size={14} />
                </button>
                {/* Editar datos del alumno */}
                <button onClick={() => handleStudentEdit(s)} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }}>
                  <Icon name="edit" size={14} />
                </button>
                {/* Activar/desactivar alumno */}
                <button onClick={e => { e.stopPropagation(); handleStudentToggleActive(s); }}
                  className={`btn btn-sm ${s.active ? 'btn-danger' : 'btn-success'}`}
                  style={{ padding: '4px 8px', fontSize: 10 }}>
                  {s.active ? 'Desact.' : 'Activar'}
                </button>
                {/* Eliminar alumno permanentemente */}
                <button onClick={() => handleStudentDelete(s)} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {modals}
      </div>
    );
  }

  // ── VISTA 1: Lista de grados con buscador cruzado de alumnos ──
  // Vista por defecto cuando no hay ningún grado seleccionado.
  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Grados</h1>
            <p>{grades.length} grados registrados</p>
          </div>
          {/* Botón para abrir el modal de nuevo grado */}
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
            onClick={() => { resetForm(); setShowForm(true); }}>
            + Nuevo
          </button>
        </div>
      </div>

      <div className="content-area">
        {/* Campo de búsqueda global de alumnos: filtra en todos los grados */}
        <input
          className="form-input"
          placeholder="Buscar alumno..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        {/* Bloque de resultados de búsqueda: visible solo cuando hay texto en el buscador */}
        {search.trim() ? (
          (() => {
            // Filtra alumnos cuyo nombre completo contenga el texto de búsqueda (case-insensitive)
            const filtered = students.filter(s =>
              `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())
            );
            if (!filtered.length) return <div className="empty-state"><p>Sin resultados</p></div>;

            return filtered.map(s => {
              // Busca el grado del alumno para mostrar su nombre y color en la tarjeta
              const g = grades.find(g => g.id === s.grade_level_id);
              return (
                <div key={s.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: (g?.color || '#7C3AED') + '22', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {s.photo_url
                        ? <img src={s.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <Icon name="user" color={g?.color || '#7C3AED'} size={20} />}
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700 }}>{s.first_name} {s.last_name}</p>
                      {/* Muestra el grado al que pertenece el alumno para contexto */}
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g?.name}{g?.section ? ` "${g.section}"` : ''}</p>
                    </div>
                  </div>

                  {/* Botones de acción del resultado de búsqueda */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setQrStudent(s)} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }} title="Ver QR">
                      <Icon name="qr" size={14} />
                    </button>
                    {/* Al editar desde el buscador, selecciona el grado para que el formulario funcione */}
                    <button onClick={() => { setSelectedGrade(g); handleStudentEdit(s); }} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }}>
                      <Icon name="edit" size={14} />
                    </button>
                    <button onClick={() => handleStudentToggleActive(s)}
                      className={`btn btn-sm ${s.active ? 'btn-danger' : 'btn-success'}`}
                      style={{ padding: '4px 8px', fontSize: 10 }}>
                      {s.active ? 'Desact.' : 'Activar'}
                    </button>
                    <button onClick={() => handleStudentDelete(s)} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              );
            });
          })()
        ) : null}

        {/* Lista de grados: visible solo cuando el buscador está vacío */}
        {!search.trim() && grades.map(g => {
          const total = countStudents(g.id);
          return (
            // Clic en la tarjeta del grado llama a handleSelectGrade para cargar los datos y entrar a VIEW 2
            <div key={g.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer' }}
              onClick={() => handleSelectGrade(g)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                {/* Imagen o ícono del grado con overflow hidden para foto circular */}
                <div style={{ width: 44, height: 44, borderRadius: 12, background: (g.color || '#7C3AED') + '20', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {g.photo_url
                    ? <img src={g.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Icon name="users" color={g.color || '#7C3AED'} size={20} />}
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700 }}>{g.name}{g.section ? ` "${g.section}"` : ''}</p>
                  {/* Nombre del tutor en el color del grado si existe */}
                  {g.tutor_name && <p style={{ fontSize: 11, color: g.color || '#7C3AED', fontWeight: 600 }}>Tutor: {g.tutor_name}</p>}
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total} alumno{total !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* Botones de editar y eliminar; stopPropagation evita disparar el clic de navegación */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={e => { e.stopPropagation(); handleEdit(g); }} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }}>
                  <Icon name="edit" size={14} />
                </button>
                {/* Eliminar abre el modal de confirmación en lugar de window.confirm */}
                <button onClick={e => { e.stopPropagation(); setConfirmDelete(g); }} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {modals}
    </div>
  );
}
