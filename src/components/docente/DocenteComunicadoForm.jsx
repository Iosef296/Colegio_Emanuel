// DocenteComunicadoForm.jsx
// Formulario para crear un nuevo comunicado, compartido por los roles "docente" y "auxiliar".
// El contenido del formulario cambia según el rol:
//   Docente  → puede elegir destinatario "Por curso" o "Alumnos específicos".
//   Auxiliar → puede elegir destinatario "General (todos)" o "Por grado".
// Soporta adjuntos múltiples (imágenes comprimidas o PDFs) con previsualización
// y colapso individual de cada archivo antes de publicar.

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Icon from '../common/Icon';

// Detecta si el navegador soporta la codificación WebP evaluando si un canvas
// puede exportar en ese formato. Se hace una sola vez al cargar el módulo (IIFE)
// para no repetir la detección en cada operación de compresión.
const supportsWebP = (() => {
  const c = document.createElement('canvas');
  return c.toDataURL('image/webp').startsWith('data:image/webp');
})();

// Comprime una imagen File a un Blob de tamaño reducido para ahorrar espacio en R2
// y reducir el tiempo de subida desde dispositivos móviles con conexión lenta.
// Si la imagen supera 1200px en cualquier dimensión, la escala proporcionalmente.
// Prefiere el formato WebP (calidad 0.85) si el navegador lo soporta;
// de lo contrario usa JPEG (calidad 0.92) para maximizar compatibilidad.
// Devuelve una Promise que resuelve con el Blob comprimido.
const compressImageToBlob = (file) => new Promise((resolve) => {
  const img = new Image();
  // objectUrl es una URL temporal en memoria del archivo local; se libera al cargar.
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    // Libera la URL de objeto tan pronto como la imagen está cargada para evitar memory leaks.
    URL.revokeObjectURL(objectUrl);
    const maxSize = 1200;
    let { width, height } = img;
    // Escala proporcional: reduce el lado más largo a maxSize conservando la relación de aspecto.
    if (width > maxSize || height > maxSize) {
      if (width > height) { height = Math.round((height / width) * maxSize); width = maxSize; }
      else { width = Math.round((width / height) * maxSize); height = maxSize; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    // Elige el formato de salida según el soporte del navegador.
    if (supportsWebP) canvas.toBlob(resolve, 'image/webp', 0.85);
    else canvas.toBlob(resolve, 'image/jpeg', 0.92);
  };
  img.src = objectUrl;
});

export default function DocenteComunicadoForm() {
  // Hook de React Router para redirigir al listado de comunicados tras publicar o cancelar.
  const navigate = useNavigate();

  // Obtiene el usuario autenticado para determinar el rol y las opciones disponibles.
  const { user } = useAuth();

  // Referencia al <input type="file"> oculto para adjuntar archivos.
  // Se activa programáticamente mediante un botón visible al usuario.
  const fileRef = useRef(null);

  // Banderas de rol para simplificar las condiciones en el JSX.
  const isDocente = user?.role === 'docente';
  const isAuxiliar = user?.role === 'auxiliar';

  // Ruta a la que se redirige al presionar "Volver" o tras publicar exitosamente.
  const backPath = isDocente ? '/docente/comunicados' : '/auxiliar/comunicados';

  // --- Estado del formulario ---

  // Lista de cursos asignados al docente (solo relevante para rol docente).
  const [courses, setCourses] = useState([]);

  // Lista de grados escolares disponibles (solo relevante para rol auxiliar).
  const [gradeLevels, setGradeLevels] = useState([]);

  // Lista completa de alumnos del colegio (usada para seleccionar destinatarios individuales).
  const [students, setStudents] = useState([]);

  // Objeto de datos del formulario:
  //   title          — título del comunicado (obligatorio)
  //   body           — mensaje/cuerpo (opcional)
  //   type           — tipo de destinatario: 'general'|'grado'|'curso'|'alumno'
  //   course_id      — ID del curso al que va dirigido (null si no aplica)
  //   grade_level_id — ID del grado al que va dirigido (null si no aplica)
  const [form, setForm] = useState({
    title: '', body: '',
    // El tipo inicial depende del rol: docente empieza en "curso", auxiliar en "general".
    type: isDocente ? 'curso' : 'general',
    course_id: '', grade_level_id: '',
  });

  // Set de IDs de alumnos seleccionados como destinatarios individuales.
  // Se usa Set para O(1) en las operaciones de agregar/quitar.
  const [selectedStudents, setSelectedStudents] = useState(new Set());

  // Texto de búsqueda para filtrar la lista de alumnos por nombre.
  const [searchStudent, setSearchStudent] = useState('');

  // Arreglo de archivos adjuntos preparados para subir.
  // Cada elemento: { blob, type ('image'|'pdf'), name, uploadName?, preview, collapsed }
  const [files, setFiles] = useState([]);

  // Indicador de publicación en curso para deshabilitar el botón y mostrar progreso.
  const [saving, setSaving] = useState(false);

  // Texto de progreso de subida (ej. "Subiendo archivo 2 de 3...").
  const [uploadProgress, setUploadProgress] = useState('');

  // Mensaje de error de validación o de servidor para mostrar al usuario.
  const [error, setError] = useState('');

  // Carga los datos iniciales según el rol del usuario al montar el componente.
  //   Docente  → necesita sus cursos asignados y la lista de alumnos (para tipo "alumno").
  //   Auxiliar → necesita los grados disponibles (para tipo "grado").
  // Las dependencias [isDocente, isAuxiliar] son constantes durante la sesión,
  // por lo que este efecto solo se ejecuta una vez al montar.
  useEffect(() => {
    if (isDocente) {
      api.get('/teacher-courses').then(setCourses).catch(console.error);
      api.get('/students').then(setStudents).catch(console.error);
    }
    if (isAuxiliar) {
      api.get('/grade-levels').then(setGradeLevels).catch(console.error);
    }
  }, [isDocente, isAuxiliar]);

  // Agrupa los alumnos por grado/sección para mostrarlos en secciones
  // cuando no hay texto de búsqueda activo. La clave es "gradeName "sección"".
  const studentsByGrade = students.reduce((acc, s) => {
    const key = s.grade_name + (s.section ? ` "${s.section}"` : '');
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  // Filtra los alumnos según el texto de búsqueda.
  // Si el campo de búsqueda está vacío, devuelve null para que el JSX
  // muestre la vista agrupada por grado (studentsByGrade) en su lugar.
  const filteredStudents = searchStudent.trim()
    ? students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchStudent.toLowerCase()))
    : null; // null indica "mostrar agrupado por grado"

  // Agrega o quita un alumno del set de seleccionados.
  // Si ya estaba seleccionado lo quita; si no, lo agrega.
  const toggleStudent = (id) => {
    setSelectedStudents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Maneja la selección de archivos desde el <input type="file">.
  // Procesa cada archivo seleccionado:
  //   - PDFs: se guardan directamente como blob sin compresión.
  //   - Imágenes: se comprimen mediante compressImageToBlob antes de agregar.
  // Genera URLs de previsualización locales (object URLs) para mostrar
  // miniaturas o previsualizaciones de PDF en el formulario.
  // Limpia el valor del input para permitir seleccionar el mismo archivo otra vez.
  const handleFiles = async (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;
    const added = await Promise.all(selected.map(async (file) => {
      if (file.type === 'application/pdf') {
        return { blob: file, type: 'pdf', name: file.name, preview: URL.createObjectURL(file), collapsed: false };
      } else {
        const blob = await compressImageToBlob(file);
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        return { blob, type: 'image', name: file.name, uploadName: `photo.${ext}`, preview: URL.createObjectURL(blob), collapsed: false };
      }
    }));
    setFiles(prev => [...prev, ...added]);
    fileRef.current.value = '';
  };

  // Alterna el estado de colapso de un archivo adjunto en la previsualización.
  // Permite al usuario ocultar/mostrar la previsualización de imágenes o PDFs
  // sin eliminarlos de la lista para ahorrar espacio visual en el formulario.
  const toggleCollapse = (i) => setFiles(prev => prev.map((f, j) => j === i ? { ...f, collapsed: !f.collapsed } : f));

  // Elimina un archivo de la lista de adjuntos por su índice.
  // El archivo aún no se ha subido a R2, por lo que solo se quita del estado local.
  const removeFile = (i) => setFiles(prev => prev.filter((_, j) => j !== i));

  // Maneja el envío del formulario al presionar "Publicar Comunicado".
  // Flujo:
  //   1. Valida que los campos requeridos estén completos (tipo alumno sin selección,
  //      tipo curso sin curso seleccionado).
  //   2. Sube los archivos adjuntos al endpoint /upload secuencialmente mostrando progreso.
  //   3. Llama a POST /communications con todos los datos del formulario.
  //   4. Redirige al listado de comunicados si la publicación fue exitosa.
  //   5. En caso de error muestra el mensaje y limpia el estado de progreso.
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validación: si el tipo es "alumno" se requiere al menos un alumno seleccionado.
    if (form.type === 'alumno' && selectedStudents.size === 0) {
      setError('Selecciona al menos un alumno');
      return;
    }
    // Validación: si el docente elige tipo "curso" debe seleccionar un curso.
    if (isDocente && form.type === 'curso' && !form.course_id) {
      setError('Selecciona un curso');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Sube los archivos adjuntos uno a uno para poder mostrar el progreso al usuario.
      const attachments = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadProgress(`Subiendo archivo ${i + 1} de ${files.length}...`);
        const formData = new FormData();
        // Para PDFs usa el nombre original; para imágenes el nombre normalizado con extensión.
        formData.append('photo', f.blob, f.type === 'pdf' ? f.name : f.uploadName);
        const { url } = await api.upload('/upload', formData);
        attachments.push(url);
      }
      setUploadProgress('');
      // Publica el comunicado con todos los datos recopilados.
      await api.post('/communications', {
        title: form.title,
        body: form.body,
        type: form.type,
        // Convierte los IDs a número si existen; null si no aplica.
        course_id: form.course_id ? Number(form.course_id) : null,
        grade_level_id: form.grade_level_id ? Number(form.grade_level_id) : null,
        // Solo envía student_ids para el tipo "alumno"; undefined omite el campo en el payload.
        student_ids: form.type === 'alumno' ? Array.from(selectedStudents) : undefined,
        // Solo envía attachments si hay al menos uno; undefined omite el campo.
        attachments: attachments.length ? attachments : undefined,
      });
      // Redirige al listado de comunicados tras publicar exitosamente.
      navigate(backPath);
    } catch (err) {
      setError(err.message);
      setUploadProgress('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Encabezado con botón de retorno y título de la pantalla */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div onClick={() => navigate(backPath)} style={{ cursor: 'pointer', opacity: 0.8 }}>← Volver</div>
          <h1>Nuevo Comunicado</h1>
        </div>
      </div>

      <div className="content-area">
        <form className="card" onSubmit={handleSubmit}>
          {/* Mensaje de error de validación o del servidor */}
          {error && <div style={{ marginBottom: 12, padding: 10, background: '#FEE2E2', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>{error}</div>}

          {/* Selector de tipo de destinatario para el docente.
              Opciones: "Por curso" (afecta a todos los alumnos del curso) o
              "Alumnos específicos" (selección individual dentro de un curso).
              Al cambiar, limpia el curso y grado previamente seleccionados. */}
          {isDocente && (
            <div className="form-group">
              <label className="form-label">Destinatarios</label>
              <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value, course_id: '', grade_level_id: '' })}>
                <option value="curso">Por curso</option>
                <option value="alumno">Alumnos específicos</option>
              </select>
            </div>
          )}

          {/* Selector de tipo de destinatario para el auxiliar.
              Opciones: "General (todos)" o "Por grado".
              Al cambiar, limpia el grado previamente seleccionado. */}
          {isAuxiliar && (
            <div className="form-group">
              <label className="form-label">Destinatarios</label>
              <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value, grade_level_id: '' })}>
                <option value="general">General (todos)</option>
                <option value="grado">Por grado</option>
              </select>
            </div>
          )}

          {/* Selector de grado para el auxiliar cuando elige tipo "grado".
              Solo se muestra cuando isAuxiliar && form.type === 'grado'. */}
          {isAuxiliar && form.type === 'grado' && (
            <div className="form-group">
              <label className="form-label">Grado</label>
              <select className="form-select" value={form.grade_level_id} onChange={e => setForm({ ...form, grade_level_id: e.target.value })} required>
                <option value="">Seleccionar...</option>
                {gradeLevels.map(gl => <option key={gl.id} value={gl.id}>{gl.name}{gl.section ? ` "${gl.section}"` : ''}</option>)}
              </select>
            </div>
          )}

          {/* Selector de curso para el docente.
              Al seleccionar un curso se actualiza también course_id y grade_level_id
              en el formulario (obtenidos del objeto del curso asignado) y se
              limpia la selección de alumnos, ya que cambiar de curso invalida la selección. */}
          {isDocente && (
            <div className="form-group">
              <label className="form-label">Curso</label>
              <select className="form-select" value={form.tc_id || ''} onChange={e => {
                const tc = courses.find(c => c.id === Number(e.target.value));
                setForm({ ...form, tc_id: e.target.value, course_id: tc?.course_id || '', grade_level_id: tc?.grade_level_id || '' });
                setSelectedStudents(new Set());
              }} required>
                <option value="">Seleccionar...</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.course_name} - {c.grade_name}{c.section ? ` "${c.section}"` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Panel de selección de alumnos individuales.
              Solo se muestra para el docente cuando el tipo es "alumno"
              y después de haber seleccionado un curso (para filtrar solo
              los alumnos del grado correspondiente al curso).
              Incluye buscador de alumnos y la lista de StudentRow con checkboxes. */}
          {isDocente && form.type === 'alumno' && (
            <div className="form-group">
              <label className="form-label">
                Alumnos {selectedStudents.size > 0 && <span style={{ color: 'var(--primary)', fontWeight: 700 }}>({selectedStudents.size} seleccionados)</span>}
              </label>
              {!form.grade_level_id ? (
                // Aviso cuando aún no se ha seleccionado un curso/grado.
                <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Selecciona un curso primero</p>
              ) : (() => {
                // Filtra los alumnos al grado del curso seleccionado.
                const gradeStudents = students.filter(s => s.grade_level_id === Number(form.grade_level_id));
                // Aplica el filtro de búsqueda por nombre si hay texto en el campo.
                const filtered = searchStudent.trim()
                  ? gradeStudents.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchStudent.toLowerCase()))
                  : gradeStudents;
                return (<>
                  {/* Campo de búsqueda de alumnos por nombre */}
                  <input
                    className="form-input"
                    placeholder="Buscar alumno..."
                    value={searchStudent}
                    onChange={e => setSearchStudent(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  {/* Lista scrollable de alumnos con checkboxes */}
                  <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 4 }}>
                    {filtered.length === 0
                      ? <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', margin: 0 }}>Sin resultados</p>
                      : filtered.map(s => (
                          <StudentRow key={s.id} s={s} checked={selectedStudents.has(s.id)} onToggle={toggleStudent} />
                        ))
                    }
                  </div>
                </>);
              })()}
              {/* Botón para limpiar toda la selección de alumnos de una vez */}
              {selectedStudents.size > 0 && (
                <button type="button" onClick={() => setSelectedStudents(new Set())}
                  style={{ marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', padding: 0 }}>
                  Limpiar selección
                </button>
              )}
            </div>
          )}

          {/* Campo de título del comunicado (obligatorio) */}
          <div className="form-group">
            <label className="form-label">Título</label>
            <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
          </div>

          {/* Campo de cuerpo/mensaje del comunicado (opcional) */}
          <div className="form-group">
            <label className="form-label">Mensaje</label>
            <textarea className="form-textarea" rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Opcional..." />
          </div>

          {/* Sección de adjuntos: permite agregar fotos o PDFs al comunicado.
              Cada archivo se previsualizea con opción de colapsar/expandir y de eliminar.
              Los archivos PDF se muestran en un <iframe>; las imágenes en un <img>. */}
          <div className="form-group">
            <label className="form-label">Adjuntos (fotos o PDFs, opcional)</label>
            {/* Input de archivo oculto; se activa programáticamente */}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleFiles} style={{ display: 'none' }} />

            {/* Lista de archivos adjuntos con previsualización colapsable */}
            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                {files.map((f, i) => (
                  <div key={i}>
                    {f.type === 'image' ? (
                      // Tarjeta de imagen: encabezado con nombre y botones colapsar/eliminar,
                      // y previsualización de la imagen si no está colapsada.
                      <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg)', cursor: 'pointer' }} onClick={() => toggleCollapse(i)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <Icon name="image" color="var(--text-muted)" size={16} />
                            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <span style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1 }}>{f.collapsed ? '▶' : '▼'}</span>
                            {/* stopPropagation evita que el click en el botón eliminar
                                también dispare el toggleCollapse del contenedor */}
                            <button type="button" onClick={e => { e.stopPropagation(); removeFile(i); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                              <Icon name="x" color="var(--text-muted)" size={14} />
                            </button>
                          </div>
                        </div>
                        {!f.collapsed && <img src={f.preview} alt="preview" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', display: 'block', background: '#f0f0f0' }} />}
                      </div>
                    ) : (
                      // Tarjeta de PDF: encabezado con nombre y botones colapsar/eliminar,
                      // y previsualización del PDF en un <iframe> si no está colapsado.
                      <div style={{ border: '1.5px solid var(--primary)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg)', cursor: 'pointer' }} onClick={() => toggleCollapse(i)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <Icon name="pdf" color="var(--primary)" size={16} />
                            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <span style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1 }}>{f.collapsed ? '▶' : '▼'}</span>
                            <button type="button" onClick={e => { e.stopPropagation(); removeFile(i); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                              <Icon name="x" color="var(--text-muted)" size={14} />
                            </button>
                          </div>
                        </div>
                        {!f.collapsed && <iframe src={f.preview} style={{ width: '100%', height: 320, border: 'none', display: 'block' }} title={f.name} />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Botón con borde punteado para abrir el selector de archivos.
                El texto cambia según si ya hay archivos agregados o no. */}
            <button type="button" onClick={() => fileRef.current.click()}
              style={{ width: '100%', padding: '10px', border: '2px dashed var(--border)', borderRadius: 10, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
              <Icon name="camera" color="var(--text-muted)" size={16} />
              {files.length > 0 ? 'Agregar más archivos' : 'Foto, imagen o PDF'}
            </button>
          </div>

          {/* Botón de envío del formulario.
              Muestra el progreso de subida de archivos mientras saving === true.
              Se deshabilita durante el proceso para evitar envíos dobles. */}
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
            {saving ? (uploadProgress || 'Publicando...') : 'Publicar Comunicado'}
          </button>
        </form>
      </div>
    </div>
  );
}

// --- Componente StudentRow ---
// Fila de alumno con checkbox para la selección de destinatarios individuales.
// Se usa dentro del panel de selección de alumnos de DocenteComunicadoForm.
// Resalta con fondo azul claro cuando el alumno está seleccionado.
// Props:
//   s        — objeto alumno { id, first_name, last_name }
//   checked  — true si el alumno está en el set de seleccionados
//   onToggle — función que recibe el id del alumno para agregar o quitar del set
function StudentRow({ s, checked, onToggle }) {
  return (
    // El <label> envuelve todo para que al hacer click en cualquier parte de la fila
    // (incluyendo el texto del nombre) se active el checkbox.
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer', borderRadius: 6, background: checked ? 'rgba(37,99,235,0.06)' : 'transparent' }}>
      <input type="checkbox" checked={checked} onChange={() => onToggle(s.id)}
        style={{ width: 15, height: 15, accentColor: 'var(--primary)', flexShrink: 0 }} />
      {/* Nombre en formato "Apellido, Nombre" para facilitar la búsqueda alfabética */}
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{s.last_name}, {s.first_name}</span>
    </label>
  );
}
