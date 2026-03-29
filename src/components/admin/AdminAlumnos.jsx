import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

// Componente principal de gestión de alumnos para el panel administrativo.
// Muestra dos vistas: lista de grados (VIEW 1) y lista de alumnos dentro de un grado (VIEW 2).
export default function AdminAlumnos() {
  // Lista completa de alumnos traída del servidor
  const [students, setStudents] = useState([]);

  // Lista de grados disponibles para el selector del formulario
  const [gradeLevels, setGradeLevels] = useState([]);

  // Controla el spinner de carga inicial
  const [loading, setLoading] = useState(true);

  // Grado seleccionado para entrar a la vista de alumnos (VIEW 2); null = vista de grados
  const [selectedGrade, setSelectedGrade] = useState(null);

  // Controla la visibilidad del modal de formulario de alumno
  const [showForm, setShowForm] = useState(false);

  // ID del alumno que se está editando; null significa creación de nuevo alumno
  const [editing, setEditing] = useState(null);

  // Valores actuales de los campos del formulario de alumno
  const [form, setForm] = useState({ first_name: '', last_name: '', dni: '', birth_date: '', grade_level_id: '', monthly_fee: '350', parent_phone: '' });

  // Indica si se está procesando el guardado para deshabilitar el botón
  const [saving, setSaving] = useState(false);

  // Mensaje de éxito o error que se muestra dentro del formulario
  const [message, setMessage] = useState('');

  // Archivo de foto seleccionado por el usuario (File object)
  const [photoFile, setPhotoFile] = useState(null);

  // URL de previsualización de la foto (data URL o URL de R2)
  const [photoPreview, setPhotoPreview] = useState(null);

  // true si el usuario eliminó la foto existente
  const [photoDeleted, setPhotoDeleted] = useState(false);

  // Ref al input[file] oculto
  const photoRef = useRef(null);

  // Alumno cuyo QR se quiere mostrar en el modal
  const [qrStudent, setQrStudent] = useState(null);

  // Data URL con la imagen PNG del código QR generado por la librería qrcode
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Carga alumnos y grados desde la API en paralelo.
  // Si silent=true evita activar el spinner (útil para refrescos en segundo plano).
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.get('/students'),
      api.get('/grade-levels'),
    ]).then(([s, gl]) => {
      setStudents(s);
      setGradeLevels(gl);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  };

  // Carga inicial de datos al montar el componente
  useEffect(load, []);

  // Refresco automático en segundo plano (sin spinner) para mantener datos actualizados
  useAutoRefresh(() => load(true));

  // Genera la imagen QR cada vez que cambia el alumno seleccionado para mostrar QR.
  // Usa la librería qrcode para convertir el codigo del alumno en una imagen PNG codificada en base64.
  useEffect(() => {
    if (qrStudent?.codigo) {
      QRCode.toDataURL(qrStudent.codigo, { width: 200, margin: 2 })
        .then(url => setQrDataUrl(url))
        .catch(console.error);
    } else {
      // Si el alumno no tiene código, limpia la imagen para evitar mostrar un QR anterior
      setQrDataUrl('');
    }
  }, [qrStudent]);

  // Agrupa los alumnos por grado usando un objeto indexado por grade_level_id.
  // Esto permite mostrar tarjetas de grado con contador de alumnos en VIEW 1.
  const gradeMap = {};
  students.forEach(s => {
    const key = s.grade_level_id;
    if (!gradeMap[key]) gradeMap[key] = { grade_level_id: key, grade_name: s.grade_name, section: s.section, students: [] };
    gradeMap[key].students.push(s);
  });

  // Convierte el mapa en array ordenado alfabéticamente por nombre de grado
  const grades = Object.values(gradeMap).sort((a, b) => a.grade_name.localeCompare(b.grade_name));

  // Restablece todos los campos del formulario y cierra el modal.
  // Se llama al cancelar, al cerrar el modal o después de guardar exitosamente.
  const resetForm = () => {
    setForm({ first_name: '', last_name: '', dni: '', birth_date: '', grade_level_id: '', monthly_fee: '350' });
    setEditing(null);
    setShowForm(false);
    setMessage('');
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoDeleted(false);
  };

  // Maneja la selección de una foto de perfil para el alumno.
  // Lee el archivo como Data URL para previsualizar antes de subir.
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    // FileReader lee el archivo localmente para mostrar la previsualización sin necesidad de subirlo aún
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  // Prepara el formulario para editar un alumno existente.
  // Trae el monto de mensualidad desde los pagos para prellenar el campo correctamente.
  const handleEdit = async (s) => {
    let monthly_fee = '350';
    try {
      // Se obtienen los pagos para encontrar el monto real de la mensualidad del alumno
      const payments = await api.get('/payments');
      // Prioriza el monto de una cuota pendiente; si no hay, usa cualquier cuota existente
      const unpaid = payments.find(p => p.student_id === s.id && !p.paid);
      const any = payments.find(p => p.student_id === s.id);
      if (unpaid) monthly_fee = String(unpaid.amount);
      else if (any) monthly_fee = String(any.amount);
    } catch { /* Si falla, se usa el valor por defecto 350 */ }

    setForm({
      first_name: s.first_name,
      last_name: s.last_name,
      dni: s.dni || '',
      // Recorta la parte de hora del ISO 8601 para que el input type="date" funcione correctamente
      birth_date: s.birth_date ? s.birth_date.split('T')[0] : '',
      grade_level_id: s.grade_level_id,
      monthly_fee,
      parent_phone: s.parent_phone || '',
    });
    setPhotoFile(null);
    setPhotoPreview(s.photo_url || null);
    setPhotoDeleted(false);
    setEditing(s.id);
    setShowForm(true);
  };

  // Envía el formulario para crear o actualizar un alumno.
  // Valida los campos, sube la foto si es nueva, y llama al endpoint correspondiente.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    // Validaciones del lado cliente para dar retroalimentación inmediata
    const trimmedFirst = form.first_name.trim();
    const trimmedLast = form.last_name.trim();
    if (!trimmedFirst || !trimmedLast) return setMessage('Error: Nombres y apellidos son obligatorios');
    if (form.dni && !/^\d{8}$/.test(form.dni)) return setMessage('Error: El DNI debe tener exactamente 8 dígitos');
    if (form.birth_date && new Date(form.birth_date) > new Date()) return setMessage('Error: La fecha de nacimiento no puede ser futura');

    setSaving(true);
    try {
      // Si hay un archivo nuevo se sube a R2; si no, se reutiliza la URL existente (o null)
      let photo_url = photoDeleted ? null : (photoFile ? null : (photoPreview || null));
      if (photoFile) {
        const fd = new FormData();
        fd.append('photo', photoFile);
        const result = await api.upload('/upload', fd);
        photo_url = result.url;
      }

      const data = { ...form, first_name: trimmedFirst, last_name: trimmedLast, grade_level_id: Number(form.grade_level_id), monthly_fee: Number(form.monthly_fee), photo_url };

      if (editing) {
        // Actualizar alumno existente
        await api.put(`/students/${editing}`, data);
        setMessage('Alumno actualizado');
        load();
        setTimeout(resetForm, 1000);
      } else {
        // Crear nuevo alumno; el servidor devuelve id, codigo, username y password
        const created = await api.post('/students', data);
        const gl = gradeLevels.find(g => g.id === Number(form.grade_level_id));
        const newStudent = {
          id: created.id,
          first_name: trimmedFirst,
          last_name: trimmedLast,
          codigo: created.codigo,
          grade_name: gl?.name || '',
          section: gl?.section || '',
          username: created.username,
          password: created.password,
        };
        load();
        resetForm();
        // Muestra el modal de QR automáticamente para que el admin pueda imprimir el código del nuevo alumno
        setQrStudent(newStudent);
      }
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Descarga la imagen QR del alumno como archivo PNG.
  // Crea un enlace temporal en el DOM, lo activa y lo elimina inmediatamente.
  const handleDownloadQr = () => {
    if (!qrDataUrl || !qrStudent) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR-${qrStudent.first_name}-${qrStudent.last_name}.png`;
    a.click();
  };

  // Genera un código único (codigo) para un alumno que aún no tiene QR asignado.
  // El servidor crea el código y lo devuelve; se actualiza el estado para mostrar el QR de inmediato.
  const handleGenerateCodigo = async () => {
    try {
      const { codigo } = await api.post(`/students/${qrStudent.id}/codigo`, {});
      // Actualiza el alumno en el modal con el nuevo código para disparar el useEffect de QR
      setQrStudent({ ...qrStudent, codigo });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  // Cierra el modal del QR y limpia el estado relacionado
  const closeQr = () => {
    setQrStudent(null);
    setQrDataUrl('');
  };

  // Activa o desactiva un alumno (active 1/0).
  // Útil para ocultar alumnos que ya no están sin borrarlos permanentemente.
  const handleToggleActive = async (s) => {
    try {
      await api.put(`/students/${s.id}`, { active: s.active ? 0 : 1 });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  // Elimina un alumno permanentemente previo confirm del usuario.
  // Esta acción es irreversible, por eso se muestra una alerta nativa de confirmación.
  const handleDelete = async (s) => {
    if (!confirm(`¿Eliminar a ${s.first_name} ${s.last_name}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/students/${s.id}`);
      load();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar: ' + err.message);
    }
  };

  // Genera las mensualidades de Marzo a Diciembre para todos los alumnos activos.
  // Es una operación masiva que solo se hace una vez al inicio del año escolar.
  const handleGeneratePayments = async () => {
    if (!confirm('¿Generar mensualidades (Marzo-Diciembre) para todos los alumnos activos?')) return;
    try {
      const res = await api.post('/students/generate-payments', {});
      alert(res.message);
      load();
    } catch (err) {
      alert('Error al generar mensualidades');
    }
  };

  // Pantalla de carga mientras se obtienen los datos iniciales de la API
  if (loading) return <div className="loading">Cargando...</div>;

  // Bloque de modales compartido entre las dos vistas (grades list y grade detail).
  // Se renderiza en ambas vistas para que los modales funcionen sin importar en qué vista esté el usuario.
  const modals = (
    <>
      {/* Modal de formulario: crea o edita un alumno */}
      {showForm && (
        <div className="modal-overlay" onClick={() => resetForm()}>
          {/* stopPropagation evita que el clic dentro del modal cierre el overlay */}
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{editing ? 'Editar Alumno' : 'Nuevo Alumno'}</h3>

            {/* Mensaje de retroalimentación con color según si es error o éxito */}
            {message && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{message}</div>}

            <form onSubmit={handleSubmit}>
              {/* Sección de foto de perfil */}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div onClick={() => photoRef.current?.click()}
                  style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg)', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
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
                      onClick={() => { setPhotoPreview(null); setPhotoFile(null); setPhotoDeleted(true); }}>
                      Eliminar foto
                    </button>
                  )}
                </div>
                <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
              </div>

              {/* Campos del formulario de alumno */}
              <div className="form-group">
                <label className="form-label">Nombres</label>
                <input className="form-input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Apellidos</label>
                <input className="form-input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">DNI</label>
                <input className="form-input" value={form.dni} onChange={e => setForm({ ...form, dni: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de nacimiento</label>
                <input type="date" className="form-input" value={form.birth_date} onChange={e => setForm({ ...form, birth_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Grado</label>
                <select className="form-select" value={form.grade_level_id} onChange={e => setForm({ ...form, grade_level_id: e.target.value })} required>
                  <option value="">Seleccionar...</option>
                  {gradeLevels.map(gl => (
                    <option key={gl.id} value={gl.id}>{gl.name}{gl.section ? ` "${gl.section}"` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                {/* Al editar, el monto actualiza también las cuotas pendientes en el servidor */}
                <label className="form-label">Mensualidad (S/){editing && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>(actualiza cuotas pendientes)</span>}</label>
                <input className="form-input" type="number" step="0.01" min="0" value={form.monthly_fee} onChange={e => setForm({ ...form, monthly_fee: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono del padre <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(WhatsApp)</span></label>
                <input className="form-input" type="tel" placeholder="Ej: 987654321" value={form.parent_phone} onChange={e => setForm({ ...form, parent_phone: e.target.value })} />
              </div>

              {/* Botones de acción: guardar deshabilita durante el guardado para evitar doble envío */}
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

      {/* Modal de código QR: muestra el QR del alumno y permite descargarlo o generarlo si falta */}
      {qrStudent && (
        <div className="modal-overlay" onClick={closeQr}>
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
                    : <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Generando QR...</div>
                  }
                </div>
                {/* Bloque de credenciales: solo visible cuando el servidor devuelve username (alumno recién creado) */}
                {qrStudent.username && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 12, marginBottom: 16, textAlign: 'left' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>Credenciales de acceso</p>
                    <p style={{ fontSize: 13, marginBottom: 4 }}>Usuario: <strong style={{ fontFamily: 'monospace' }}>{qrStudent.username}</strong></p>
                    <p style={{ fontSize: 13 }}>Contraseña: <strong style={{ fontFamily: 'monospace' }}>{qrStudent.password || qrStudent.dni || 'su DNI'}</strong></p>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleDownloadQr} disabled={!qrDataUrl}>
                    Descargar PNG
                  </button>
                  <button className="btn btn-secondary" onClick={closeQr}>Cerrar</button>
                </div>
              </>
            ) : (
              // Rama sin código: permite generar el código QR por primera vez
              <>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Este alumno no tiene código QR asignado.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleGenerateCodigo}>
                    Generar código
                  </button>
                  <button className="btn btn-secondary" onClick={closeQr}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );

  // ── VISTA 2: Lista de alumnos dentro del grado seleccionado ──
  // Se activa cuando el usuario hace clic en una tarjeta de grado en VIEW 1.
  if (selectedGrade) {
    // Filtra los alumnos que pertenecen al grado actualmente seleccionado
    const gradeStudents = gradeMap[selectedGrade.grade_level_id]?.students || [];
    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Flecha de retroceso: limpia el grado seleccionado para volver a VIEW 1 */}
              <div onClick={() => setSelectedGrade(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>←</div>
              <div>
                <h1>{selectedGrade.grade_name}</h1>
                <p>{selectedGrade.section ? `Sección "${selectedGrade.section}" · ` : ''}{gradeStudents.length} alumnos</p>
              </div>
            </div>
            {/* Botón nuevo alumno: pre-rellena el grado en el formulario para agilizar el alta */}
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
              onClick={() => { resetForm(); setForm(f => ({ ...f, grade_level_id: selectedGrade.grade_level_id })); setShowForm(true); }}>
              + Nuevo
            </button>
          </div>
        </div>

        <div className="content-area">
          {gradeStudents.length === 0 && <div className="empty-state"><p>Sin alumnos en este grado</p></div>}

          {/* Tarjeta de cada alumno con foto, datos y botones de acción */}
          {gradeStudents.map(s => (
            <div key={s.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                {/* Avatar: muestra foto de R2 si existe, o icono de usuario como fallback */}
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {s.photo_url
                    ? <img src={s.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Icon name="user" color="var(--success)" size={20} />
                  }
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{s.first_name} {s.last_name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {s.dni ? `DNI: ${s.dni}` : 'Sin DNI'}
                    {' · '}
                    {/* Teléfono en verde si existe, rojo si falta (indica que no puede recibir avisos) */}
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
                <button onClick={() => handleEdit(s)} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }}>
                  <Icon name="edit" size={14} />
                </button>
                {/* Activar/desactivar: el color del botón indica el estado actual */}
                <button onClick={e => { e.stopPropagation(); handleToggleActive(s); }}
                  className={`btn btn-sm ${s.active ? 'btn-danger' : 'btn-success'}`}
                  style={{ padding: '4px 8px', fontSize: 10 }}>
                  {s.active ? 'Desact.' : 'Activar'}
                </button>
                {/* Eliminar alumno permanentemente */}
                <button onClick={() => handleDelete(s)} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
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

  // ── VISTA 1: Lista de grados con contador de alumnos ──
  // Vista por defecto cuando no hay ningún grado seleccionado.
  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Alumnos</h1>
            <p>{students.length} alumnos registrados</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Botón para crear un nuevo alumno sin grado preseleccionado */}
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
              onClick={() => { resetForm(); setShowForm(true); }}>
              + Nuevo
            </button>
          </div>
        </div>
      </div>

      <div className="content-area">
        {/* Tarjeta de cada grado; al hacer clic navega a VIEW 2 para ver sus alumnos */}
        {grades.map(g => {
          // Busca la info completa del grado para obtener su color personalizado
          const gl = gradeLevels.find(x => x.id === g.grade_level_id);
          const color = gl?.color || '#10B981';
          return (
            <div key={g.grade_level_id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 8 }}
              onClick={() => setSelectedGrade(g)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                {/* Ícono/foto del grado con color de acento; 33 de opacidad = ~20% en hex */}
                <div style={{ width: 44, height: 44, borderRadius: 12, background: color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {gl?.photo_url
                    ? <img src={gl.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} />
                    : <Icon name="users" color={color} size={20} />}
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700 }}>{g.grade_name}{g.section ? ` "${g.section}"` : ''}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.students.length} alumnos</p>
                </div>
              </div>
              {/* Flecha de navegación (chevron derecho) */}
              <Icon name="back" color="var(--text-muted)" size={18} style={{ transform: 'rotate(180deg)' }} />
            </div>
          );
        })}
      </div>
      {modals}
    </div>
  );
}
