import { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import AvanceAdjuntos from '../common/AvanceAdjuntos';

// ─────────────────────────────────────────────────────────────────────────────
// AdminComunicados — Módulo de gestión de comunicados del colegio
//
// Muestra tres columnas colapsables:
//   • Comunicados de Dirección (tipo "general")
//   • Por Grado (agrupados por nombre de grado)
//   • Por Curso (agrupados por nombre de curso con gradiente del color del curso)
//
// Permite crear, editar y eliminar comunicados con adjuntos (fotos o PDFs).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * courseGradient — Genera un gradiente CSS lineal monocromático a partir
 * del color hex de un curso. El extremo izquierdo es una versión más clara
 * (+35% hacia blanco) y el extremo derecho es más oscuro (×0.6).
 * Si el color no empieza con '#', devuelve el gradiente azul institucional
 * como fallback para no romper el diseño.
 * @param {string} color — Color hexadecimal del curso (ej. "#E74C3C")
 * @returns {string} Valor CSS de gradiente lineal
 */
const courseGradient = (color) => {
  if (!color.startsWith('#')) return 'linear-gradient(135deg, #1E3A5F, #2563EB)';
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  // Versión más clara: acerca cada canal a 255 en un 35%
  const light = v => Math.min(255, Math.round(v + (255 - v) * 0.35)).toString(16).padStart(2, '0');
  // Versión más oscura: reduce cada canal al 60%
  const dark  = v => Math.round(v * 0.6).toString(16).padStart(2, '0');
  return `linear-gradient(135deg, #${light(r)}${light(g)}${light(b)}, #${dark(r)}${dark(g)}${dark(b)})`;
};

/**
 * supportsWebP — Detecta en tiempo de ejecución si el navegador puede
 * codificar imágenes en WebP usando un canvas temporal.
 * Se evalúa una sola vez al cargar el módulo para no repetir la prueba.
 */
const supportsWebP = (() => {
  const c = document.createElement('canvas');
  return c.toDataURL('image/webp').startsWith('data:image/webp');
})();

/**
 * compressImageToBlob — Redimensiona y comprime una imagen antes de subirla.
 * Limita el lado más largo a 1200 px para reducir el tamaño en R2.
 * Prefiere WebP (85% de calidad) si el navegador lo soporta; si no, usa JPEG (92%).
 * Los PDFs no pasan por esta función; se manejan como Blob directo.
 * @param {File} file — Archivo de imagen original seleccionado por el usuario
 * @returns {Promise<Blob>} Blob comprimido listo para subir
 */
const compressImageToBlob = (file) => new Promise((resolve) => {
  const img = new Image();
  // createObjectURL evita leer el archivo completo en memoria como base64
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    // Libera la URL temporal en cuanto la imagen está cargada
    URL.revokeObjectURL(objectUrl);
    const maxSize = 1200;
    let { width, height } = img;
    // Escala proporcional para que ningún lado supere 1200 px
    if (width > maxSize || height > maxSize) {
      if (width > height) { height = Math.round((height / width) * maxSize); width = maxSize; }
      else { width = Math.round((width / height) * maxSize); height = maxSize; }
    }
    // Dibuja la imagen escalada en un canvas para poder exportarla como Blob
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    // Elige el formato óptimo según soporte del navegador
    if (supportsWebP) canvas.toBlob(resolve, 'image/webp', 0.85);
    else canvas.toBlob(resolve, 'image/jpeg', 0.92);
  };
  img.src = objectUrl;
});

export default function AdminComunicados() {
  // ── Estado principal ──────────────────────────────────────────────────────

  // Lista completa de comunicados traída de la API
  const [comunicados, setComunicados] = useState([]);

  // Grados disponibles para el selector del formulario de creación
  const [gradeLevels, setGradeLevels] = useState([]);

  // Cursos disponibles para el selector del formulario de creación
  const [courses, setCourses] = useState([]);

  // Indicador de carga inicial de datos
  const [loading, setLoading] = useState(true);

  // Comunicado que se está editando actualmente; null cuando el modal está cerrado
  // Contiene { id, title, body } para edición en el modal
  const [editando, setEditando] = useState(null);

  // URLs de adjuntos ya subidos al comunicado que se está editando;
  // permite quitar adjuntos existentes antes de guardar
  const [editExistingUrls, setEditExistingUrls] = useState([]);

  // Nuevos archivos seleccionados para adjuntar al comunicado en edición,
  // aún no subidos al servidor
  const [editNewFiles, setEditNewFiles] = useState([]);

  // Texto de progreso durante la subida de adjuntos en el modal de edición
  // (ej. "Subiendo 1/3...")
  const [editUploadProgress, setEditUploadProgress] = useState('');

  // Referencia al input file oculto del modal de edición para abrirlo programáticamente
  const editFileRef = useRef(null);

  // Indica si se está guardando el comunicado editado (bloquea el botón Guardar)
  const [saving, setSaving] = useState(false);

  // Comunicado pendiente de eliminar; cuando tiene valor muestra el modal de confirmación
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Controla la visibilidad del modal de creación de nuevo comunicado
  const [showCreate, setShowCreate] = useState(false);

  // Valores del formulario de creación
  const [createForm, setCreateForm] = useState({ title: '', body: '', type: 'general', grade_level_id: '', course_id: '' });

  // Archivos pendientes de subir junto con el nuevo comunicado
  const [createFiles, setCreateFiles] = useState([]);

  // Indica si el nuevo comunicado se está enviando al servidor
  const [creating, setCreating] = useState(false);

  // Texto de progreso durante la subida de adjuntos en el modal de creación
  const [createUploadProgress, setCreateUploadProgress] = useState('');

  // Mensaje de error mostrado dentro del modal de creación
  const [createError, setCreateError] = useState('');

  // Referencia al input file oculto del modal de creación
  const createFileRef = useRef(null);

  // Estado colapsable de las tres secciones principales (general, grado, curso, alumno)
  // false = cerrado; true = abierto
  const [openSections, setOpenSections] = useState({ general: false, grado: false, curso: false, alumno: false });

  // Estado colapsable individual de cada subgrupo de curso (clave: "curso-{nombre}")
  const [openCourseGroups, setOpenCourseGroups] = useState({});

  // Estado colapsable individual de cada subgrupo de grado (clave: "grado-{nombre}")
  const [openGradeGroups, setOpenGradeGroups] = useState({});

  // ── Carga de datos ────────────────────────────────────────────────────────

  /**
   * load — Obtiene la lista de comunicados desde la API.
   * @param {boolean} silent — Si es true no activa el spinner de carga;
   *   se usa en recargas automáticas para no interrumpir la UI.
   * @returns {Promise} Resuelve cuando los comunicados están en el estado.
   */
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    return api.get('/communications').then(data => { setComunicados(data); setLoading(false); }).catch(console.error);
  };

  // Carga inicial: comunicados, grados y cursos en paralelo
  // Los grados y cursos solo se necesitan en el formulario de creación,
  // pero se traen al montar para que el selector responda al instante
  useEffect(() => {
    Promise.all([load(), api.get('/grade-levels'), api.get('/courses')])
      .then(([, gl, c]) => { setGradeLevels(gl); setCourses(c); })
      .catch(console.error);
  }, []);

  // Recarga silenciosa periódica configurada por el hook useAutoRefresh
  useAutoRefresh(() => load(true));

  // ── Manejadores de adjuntos ───────────────────────────────────────────────

  /**
   * handleEditFiles — Procesa los archivos seleccionados en el modal de edición.
   * Los PDFs se guardan tal cual como Blob; las imágenes pasan por compressImageToBlob.
   * El input se resetea al final para permitir seleccionar el mismo archivo otra vez.
   * @param {Event} e — Evento change del input file
   */
  const handleEditFiles = async (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;
    const added = await Promise.all(selected.map(async (file) => {
      if (file.type === 'application/pdf') {
        // PDFs: se guardan directamente sin modificar; se genera una URL de previsualización
        return { blob: file, type: 'pdf', name: file.name, preview: URL.createObjectURL(file) };
      }
      // Imágenes: se comprimen y se convierte el nombre de extensión según el formato final
      const blob = await compressImageToBlob(file);
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      return { blob, type: 'image', name: file.name, uploadName: `photo.${ext}`, preview: URL.createObjectURL(blob) };
    }));
    // Agrega los nuevos archivos a los ya seleccionados (acumulativo)
    setEditNewFiles(prev => [...prev, ...added]);
    // Resetea el input para que el change vuelva a dispararse si se selecciona el mismo archivo
    editFileRef.current.value = '';
  };

  /**
   * handleSave — Guarda los cambios del comunicado que se está editando.
   * Primero sube los archivos nuevos a R2 uno por uno, mostrando el progreso,
   * luego envía el PUT con el título, cuerpo y la lista unificada de URLs
   * (adjuntos existentes que no se quitaron + URLs de los recién subidos).
   */
  const handleSave = async () => {
    setSaving(true);
    try {
      const uploaded = [];
      // Sube los nuevos archivos secuencialmente para actualizar el progreso en la UI
      for (let i = 0; i < editNewFiles.length; i++) {
        const f = editNewFiles[i];
        setEditUploadProgress(`Subiendo ${i + 1}/${editNewFiles.length}...`);
        const formData = new FormData();
        // El nombre del archivo en FormData determina la extensión final en R2
        formData.append('photo', f.blob, f.type === 'pdf' ? f.name : f.uploadName);
        const { url } = await api.upload('/upload', formData);
        uploaded.push(url);
      }
      setEditUploadProgress('');
      // Actualiza el comunicado con la combinación de adjuntos existentes + nuevos
      await api.put(`/communications/${editando.id}`, {
        title: editando.title,
        body: editando.body,
        attachments: [...editExistingUrls, ...uploaded],
      });
      // Cierra el modal y limpia los archivos temporales
      setEditando(null);
      setEditNewFiles([]);
      load();
    } catch (err) {
      alert(err.message);
      setEditUploadProgress('');
    } finally {
      setSaving(false);
    }
  };

  /**
   * handleDelete — Elimina definitivamente un comunicado tras confirmación.
   * Actualiza el estado local de forma optimista quitando el comunicado
   * del array sin esperar una recarga completa, para una respuesta más rápida.
   * @param {number} id — ID del comunicado a eliminar
   */
  const handleDelete = async (id) => {
    try {
      await api.delete(`/communications/${id}`);
      setConfirmDelete(null);
      // Elimina el comunicado del estado local sin hacer un nuevo GET
      setComunicados(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  /**
   * handleCreateFiles — Procesa los archivos seleccionados en el modal de creación.
   * Misma lógica que handleEditFiles: PDFs sin modificar, imágenes comprimidas.
   * @param {Event} e — Evento change del input file
   */
  const handleCreateFiles = async (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;
    const added = await Promise.all(selected.map(async (file) => {
      if (file.type === 'application/pdf') {
        return { blob: file, type: 'pdf', name: file.name, preview: URL.createObjectURL(file) };
      } else {
        const blob = await compressImageToBlob(file);
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        return { blob, type: 'image', name: file.name, uploadName: `photo.${ext}`, preview: URL.createObjectURL(blob) };
      }
    }));
    // Acumula los archivos nuevos junto a los ya seleccionados
    setCreateFiles(prev => [...prev, ...added]);
    // Resetea el input para permitir re-selección del mismo archivo
    createFileRef.current.value = '';
  };

  /**
   * handleCreate — Crea un nuevo comunicado con los datos del formulario.
   * Sube los adjuntos a R2 uno a uno antes de enviar el POST,
   * luego cierra el modal y recarga la lista de comunicados.
   * @param {Event} e — Evento submit del formulario
   */
  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const attachments = [];
      // Subida secuencial de adjuntos con progreso visible en el botón
      for (let i = 0; i < createFiles.length; i++) {
        const f = createFiles[i];
        setCreateUploadProgress(`Subiendo archivo ${i + 1} de ${createFiles.length}...`);
        const formData = new FormData();
        formData.append('photo', f.blob, f.type === 'pdf' ? f.name : f.uploadName);
        const { url } = await api.upload('/upload', formData);
        attachments.push(url);
      }
      setCreateUploadProgress('');
      await api.post('/communications', {
        title: createForm.title,
        body: createForm.body,
        type: createForm.type,
        // Convierte a número o null según si el tipo requiere grado o curso
        grade_level_id: createForm.grade_level_id ? Number(createForm.grade_level_id) : null,
        course_id: createForm.course_id ? Number(createForm.course_id) : null,
        // Solo incluye attachments si hay al menos uno
        attachments: attachments.length ? attachments : undefined,
      });
      // Cierra el modal y devuelve el formulario a su estado inicial
      setShowCreate(false);
      setCreateForm({ title: '', body: '', type: 'general', grade_level_id: '', course_id: '' });
      setCreateFiles([]);
      load();
    } catch (err) {
      setCreateError(err.message);
      setCreateUploadProgress('');
    } finally {
      setCreating(false);
    }
  };

  // ── Utilidades de formato ─────────────────────────────────────────────────

  /**
   * formatDate — Formatea una fecha ISO a formato peruano legible (dd/mm/aaaa).
   * Se usa en las tarjetas para mostrar la fecha de publicación.
   * @param {string} d — Cadena de fecha ISO
   */
  const formatDate = (d) => new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

  // Mapas de etiqueta y color por tipo de comunicado para las insignias
  const typeLabel = { general: 'General', curso: 'Curso', grado: 'Grado', tarea: 'Tarea' };
  const typeColor = { general: '#3B82F6', curso: '#8B5CF6', grado: '#10B981', tarea: '#F59E0B' };
  const typeBg   = { general: '#EFF6FF', curso: '#EDE9FE', grado: '#D1FAE5', tarea: '#FEF3C7' };

  // ── Clasificación de comunicados por tipo ─────────────────────────────────

  // Comunicados de Dirección: visibles para todos
  const generalComms = comunicados.filter(c => c.type === 'general');

  // Comunicados por grado
  const gradoComms = comunicados.filter(c => c.type === 'grado');

  // Comunicados por curso
  const cursoComms = comunicados.filter(c => c.type === 'curso');

  // Comunicados personales por alumno (incluye tipo 'tarea')
  const alumnoComms = comunicados.filter(c => c.type === 'alumno' || c.type === 'tarea');

  // ── Agrupación de comunicados de grado ───────────────────────────────────

  // Agrupa los comunicados de grado en un mapa { gradeName → [comunicados] }
  // para renderizarlos en subgrupos colapsables dentro de la columna "Por Grado"
  const byGrade = {};
  gradoComms.forEach(c => {
    const k = c.grade_name || 'Sin grado';
    if (!byGrade[k]) byGrade[k] = [];
    byGrade[k].push(c);
  });

  // ── Agrupación de comunicados de curso ────────────────────────────────────

  /**
   * groupByCourse — Agrupa un array de comunicados por nombre de curso.
   * Devuelve un array de objetos { name, items, color } para renderizar
   * cada subgrupo con el gradiente del color del curso.
   * @param {Array} comms — Array de comunicados de tipo "curso"
   * @returns {Array} Grupos ordenados con nombre, lista y color del curso
   */
  const groupByCourse = (comms) => {
    const map = {};
    comms.forEach(c => {
      const k = c.course_name || 'Sin curso';
      if (!map[k]) map[k] = { items: [], color: c.course_color || 'var(--primary)' };
      map[k].items.push(c);
    });
    return Object.entries(map).map(([name, v]) => ({ name, items: v.items, color: v.color }));
  };

  /**
   * groupByStudent — Agrupa comunicados personales por nombre de alumno.
   * Cada comunicado puede estar asociado a varios alumnos (students_list),
   * por lo que un mismo comunicado puede aparecer en más de un grupo.
   * Devuelve un array de entradas [nombre, [comunicados]] ordenado alfabéticamente.
   * @param {Array} comms — Array de comunicados de tipo "alumno" o "tarea"
   * @returns {Array} Entradas [nombre, [comunicados]] ordenadas por nombre
   */
  const groupByStudent = (comms) => {
    const map = {};
    comms.forEach(c => {
      // students_list puede llegar como string JSON o como array dependiendo del backend
      const students = c.students_list
        ? (typeof c.students_list === 'string' ? JSON.parse(c.students_list) : c.students_list)
        : [];
      if (!students.length) {
        // Si no tiene alumnos asociados, lo agrupa bajo "Sin alumno"
        if (!map['Sin alumno']) map['Sin alumno'] = [];
        map['Sin alumno'].push(c);
      } else {
        // Replica el comunicado en el grupo de cada alumno asociado
        students.forEach(s => {
          if (!map[s.name]) map[s.name] = [];
          map[s.name].push(c);
        });
      }
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  };

  // ── Renderizado de tarjetas ───────────────────────────────────────────────

  /**
   * renderCard — Genera el JSX de una tarjeta de comunicado.
   * Opciones disponibles:
   *   - hideBadge: oculta la insignia de tipo cuando el contexto ya lo indica
   *   - accentBorder: añade un borde izquierdo del color del curso para identificación visual
   * Los botones de editar y eliminar están siempre presentes y abren los modales correspondientes.
   * @param {object} c    — Objeto de comunicado
   * @param {object} opts — Opciones de presentación { hideBadge, accentBorder }
   */
  const renderCard = (c, opts = {}) => {
    const accent = c.course_color || null;
    return (
    <div key={c.id} className="card" style={{ marginBottom: 10, borderLeft: opts.accentBorder && accent ? `3px solid ${accent}` : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Insignia de tipo (General / Grado / Curso / Tarea) — se omite con hideBadge */}
          {!opts.hideBadge && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: typeBg[c.type] || '#EFF6FF', color: typeColor[c.type] || '#3B82F6' }}>
                {typeLabel[c.type] || c.type}
              </span>
            </div>
          )}
          {/* Título del comunicado */}
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{c.title}</p>
          {/* Autor (con rol si es auxiliar o docente) y fecha de publicación */}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: c.grade_name ? 2 : 4 }}>{c.author_role === 'auxiliar' ? 'Auxiliar ' : c.author_role === 'docente' ? 'Docente ' : ''}{c.author_name} · {formatDate(c.created_at)}</p>
          {/* Nombre del grado si el comunicado es de tipo grado */}
          {c.grade_name && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>🏫 {c.grade_name}{c.section ? ` "${c.section}"` : ''}</p>}
          {/* Cuerpo del comunicado */}
          {c.body && <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.body}</p>}
          {/* Adjuntos (fotos o PDFs) renderizados por el componente compartido */}
          <AvanceAdjuntos avance={c} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {/* Botón editar — abre el modal de edición con los datos actuales del comunicado */}
          <button onClick={() => {
              // Parsea los adjuntos existentes (pueden llegar como string JSON o array)
              const urls = c.attachments ? (typeof c.attachments === 'string' ? JSON.parse(c.attachments) : c.attachments) : [];
              setEditExistingUrls(urls);
              setEditNewFiles([]);
              setEditando({ id: c.id, title: c.title, body: c.body });
            }}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#EFF6FF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="edit" color="#3B82F6" size={15} />
          </button>
          {/* Botón eliminar — muestra el modal de confirmación antes de borrar */}
          <button onClick={() => setConfirmDelete(c)}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#FEE2E2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="trash" color="var(--danger)" size={15} />
          </button>
        </div>
      </div>
    </div>
  );};

  // ── Pantalla de carga ─────────────────────────────────────────────────────

  if (loading) return <div className="loading">Cargando...</div>;

  // ── Render principal ──────────────────────────────────────────────────────

  return (
    <div>
      {/* Encabezado de página con botón para abrir el modal de creación */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Comunicados</h1>
            <p>Gestionar todos los comunicados y avisos</p>
          </div>
          {/* Abre el modal de creación de nuevo comunicado */}
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
            onClick={() => setShowCreate(true)}>
            + Nuevo
          </button>
        </div>
      </div>

      <div className="content-area">
        {/* Grid de dos columnas para las tres secciones colapsables */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

          {/* ── Sección: Comunicados de Dirección (ocupa todo el ancho) ── */}
          <div style={{ gridColumn: '1 / -1' }}>
            {/* Cabecera colapsable — alterna openSections.general al hacer clic */}
            <div onClick={() => setOpenSections(s => ({ ...s, general: !s.general }))}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 14px', borderRadius: 10, background: 'linear-gradient(135deg, #1E3A5F, #2563EB)', marginBottom: openSections.general ? 12 : 0, userSelect: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>Comunicados de Dirección</span>
                {/* Contador de comunicados — visible solo cuando hay al menos uno */}
                {generalComms.length > 0 && <span style={{ fontSize: 11, color: 'white', background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '1px 8px' }}>{generalComms.length}</span>}
              </div>
              <span style={{ fontSize: 12, color: 'white' }}>▶</span>
            </div>
            {/* Contenido de la sección: lista de comunicados o mensaje vacío */}
            {openSections.general && (
              generalComms.length === 0
                ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin comunicados</p>
                : generalComms.map(c => renderCard(c, { hideBadge: true }))
            )}
          </div>

          {/* ── Sección: Por Grado ── */}
          <div>
            {/* Cabecera colapsable principal de la sección grado */}
            <div onClick={() => setOpenSections(s => ({ ...s, grado: !s.grado }))}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 14px', borderRadius: 10, background: 'linear-gradient(135deg, #1E3A5F, #2563EB)', marginBottom: openSections.grado ? 12 : 0, userSelect: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>Por Grado</span>
                {gradoComms.length > 0 && <span style={{ fontSize: 11, color: 'white', background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '1px 8px' }}>{gradoComms.length}</span>}
              </div>
              <span style={{ fontSize: 12, color: 'white' }}>▶</span>
            </div>
            {/* Subgrupos por nombre de grado, cada uno colapsable de forma independiente */}
            {openSections.grado && (
              gradoComms.length === 0
                ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin comunicados</p>
                : Object.entries(byGrade).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([gradeName, items]) => {
                    const key = `grado-${gradeName}`;
                    // Estado colapsable individual de este subgrupo de grado
                    const open = openGradeGroups[key] === true;
                    return (
                      <div key={key} style={{ marginBottom: 10 }}>
                        {/* Cabecera del subgrupo con el nombre del grado y contador */}
                        <div onClick={() => setOpenGradeGroups(g => ({ ...g, [key]: !open }))}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 14px', borderRadius: 10, background: 'linear-gradient(135deg, #1E3A5F, #2563EB)', marginBottom: open ? 8 : 0, userSelect: 'none' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{gradeName}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: 'white', background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '1px 7px' }}>{items.length}</span>
                            <span style={{ fontSize: 13, color: 'white', lineHeight: 1 }}>{open ? '▼' : '▶'}</span>
                          </div>
                        </div>
                        {/* Lista de comunicados del subgrupo, ocultando el badge de tipo */}
                        {open && items.map(c => renderCard(c, { hideBadge: true }))}
                      </div>
                    );
                  })
            )}
          </div>

          {/* ── Sección: Por Curso ── */}
          <div>
            {/* Cabecera colapsable principal de la sección curso */}
            <div onClick={() => setOpenSections(s => ({ ...s, curso: !s.curso }))}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 14px', borderRadius: 10, background: 'linear-gradient(135deg, #1E3A5F, #2563EB)', marginBottom: openSections.curso ? 12 : 0, userSelect: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>Por Curso</span>
                {cursoComms.length > 0 && <span style={{ fontSize: 11, color: 'white', background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '1px 8px' }}>{cursoComms.length}</span>}
              </div>
              <span style={{ fontSize: 12, color: 'white' }}>▶</span>
            </div>
            {/* Subgrupos por nombre de curso, cada uno con gradiente del color del curso */}
            {openSections.curso && (
              cursoComms.length === 0
                ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin comunicados</p>
                : groupByCourse(cursoComms).map(({ name: courseName, items, color }) => {
                    const key = `curso-${courseName}`;
                    // Estado colapsable individual de este subgrupo de curso
                    const open = openCourseGroups[key] === true;
                    return (
                      <div key={key} style={{ marginBottom: 10 }}>
                        {/* Cabecera del subgrupo con gradiente monocromático del color del curso */}
                        <div onClick={() => setOpenCourseGroups(g => ({ ...g, [key]: !open }))}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 14px', borderRadius: 10, background: courseGradient(color), marginBottom: open ? 8 : 0, userSelect: 'none' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{courseName}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: 'white', background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '1px 7px' }}>{items.length}</span>
                            <span style={{ fontSize: 13, color: 'white', lineHeight: 1 }}>{open ? '▼' : '▶'}</span>
                          </div>
                        </div>
                        {/* Tarjetas con borde izquierdo del color del curso para identificación visual */}
                        {open && items.map(c => renderCard(c, { hideBadge: true, accentBorder: true }))}
                      </div>
                    );
                  })
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: Crear nuevo comunicado ── */}
      {showCreate && (
        // Clic en el overlay cierra el modal sin guardar
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          {/* stopPropagation evita que el clic dentro del modal lo cierre */}
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Nuevo Comunicado</h3>
            {/* Mensaje de error de la API */}
            {createError && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: '#FEE2E2', color: 'var(--danger)', fontSize: 13 }}>{createError}</div>}
            <form onSubmit={handleCreate}>
              {/* Selector de tipo — al cambiar resetea los campos de grado y curso */}
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-select" value={createForm.type} onChange={e => setCreateForm({ ...createForm, type: e.target.value, grade_level_id: '', course_id: '' })}>
                  <option value="general">General (todos)</option>
                  <option value="grado">Por grado</option>
                </select>
              </div>
              {/* Campo de grado — visible solo cuando el tipo es "grado" */}
              {createForm.type === 'grado' && (
                <div className="form-group">
                  <label className="form-label">Grado</label>
                  <select className="form-select" value={createForm.grade_level_id} onChange={e => setCreateForm({ ...createForm, grade_level_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {gradeLevels.map(gl => <option key={gl.id} value={gl.id}>{gl.name}{gl.section ? ` "${gl.section}"` : ''}</option>)}
                  </select>
                </div>
              )}
              {/* Campo de curso — visible solo cuando el tipo es "curso" */}
              {createForm.type === 'curso' && (
                <div className="form-group">
                  <label className="form-label">Curso</label>
                  <select className="form-select" value={createForm.course_id} onChange={e => setCreateForm({ ...createForm, course_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {/* Título del comunicado */}
              <div className="form-group">
                <label className="form-label">Título</label>
                <input className="form-input" value={createForm.title} onChange={e => setCreateForm({ ...createForm, title: e.target.value })} required />
              </div>
              {/* Cuerpo del comunicado — opcional */}
              <div className="form-group">
                <label className="form-label">Mensaje (opcional)</label>
                <textarea className="form-textarea" rows={4} value={createForm.body} onChange={e => setCreateForm({ ...createForm, body: e.target.value })} placeholder="Opcional..." />
              </div>
              {/* Adjuntos — input oculto activado por el botón de área punteada */}
              <div className="form-group">
                <label className="form-label">Adjuntos (fotos o PDFs, opcional)</label>
                {/* Input file oculto; se activa mediante createFileRef.current.click() */}
                <input ref={createFileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleCreateFiles} style={{ display: 'none' }} />
                {/* Lista de archivos seleccionados con botón para quitar cada uno */}
                {createFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {createFiles.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 12 }}>
                        <Icon name={f.type === 'pdf' ? 'pdf' : 'image'} color="var(--text-muted)" size={13} />
                        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        {/* Quita el archivo de la lista sin afectar los demás */}
                        <button type="button" onClick={() => setCreateFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                          <Icon name="x" color="var(--text-muted)" size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Área punteada que activa el selector de archivos */}
                <button type="button" onClick={() => createFileRef.current.click()}
                  style={{ width: '100%', padding: '8px', border: '2px dashed var(--border)', borderRadius: 8, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
                  <Icon name="camera" color="var(--text-muted)" size={14} />
                  {createFiles.length > 0 ? 'Agregar más' : 'Foto, imagen o PDF'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Botón publicar — muestra el progreso de subida o "Publicando..." */}
                <button type="submit" className="btn btn-primary" disabled={creating} style={{ flex: 1, justifyContent: 'center' }}>
                  {creating ? (createUploadProgress || 'Publicando...') : 'Publicar'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Editar comunicado existente ── */}
      {editando && (
        // Clic en el overlay cierra el modal sin guardar
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setEditando(null)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Editar comunicado</h3>
            {/* Campo de título editable */}
            <div className="form-group">
              <label className="form-label">Título</label>
              <input className="form-input" value={editando.title} onChange={e => setEditando(p => ({ ...p, title: e.target.value }))} />
            </div>
            {/* Campo de cuerpo editable */}
            <div className="form-group">
              <label className="form-label">Contenido</label>
              <textarea className="form-textarea" rows={4} value={editando.body} onChange={e => setEditando(p => ({ ...p, body: e.target.value }))} />
            </div>

            {/* Lista de adjuntos ya existentes — se pueden quitar antes de guardar */}
            {editExistingUrls.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {editExistingUrls.map((url, i) => {
                  const isPdf = url.endsWith('.pdf');
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>
                      <Icon name={isPdf ? 'pdf' : 'image'} color={isPdf ? 'var(--primary)' : 'var(--text-muted)'} size={13} />
                      <span style={{ fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isPdf ? `PDF ${i + 1}` : `Imagen ${i + 1}`}</span>
                      {/* Quita esta URL de la lista de adjuntos existentes */}
                      <button type="button" onClick={() => setEditExistingUrls(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                        <Icon name="x" color="var(--text-muted)" size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Lista de archivos nuevos aún no subidos, con borde azul para distinguirlos */}
            {editNewFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {editNewFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(37,99,235,0.06)', border: '1px solid var(--primary)', borderRadius: 6, padding: '3px 8px' }}>
                    <Icon name={f.type === 'pdf' ? 'pdf' : 'image'} color="var(--primary)" size={13} />
                    <span style={{ fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    {/* Quita este archivo nuevo de la lista pendiente */}
                    <button type="button" onClick={() => setEditNewFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                      <Icon name="x" color="var(--primary)" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input file oculto para agregar archivos en el modal de edición */}
            <input ref={editFileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleEditFiles} style={{ display: 'none' }} />
            {/* Área punteada para abrir el selector de archivos en edición */}
            <button type="button" onClick={() => editFileRef.current.click()}
              style={{ width: '100%', padding: '7px', border: '2px dashed var(--border)', borderRadius: 8, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
              <Icon name="camera" color="var(--text-muted)" size={14} />
              {editNewFiles.length > 0 ? 'Agregar más' : 'Agregar foto o PDF'}
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditando(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
              {/* Botón guardar — muestra el progreso de subida mientras se procesan los adjuntos */}
              <button onClick={handleSave} className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                {saving ? (editUploadProgress || 'Guardando...') : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmación de eliminación ── */}
      {confirmDelete && (
        // Clic en el overlay cancela la eliminación
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setConfirmDelete(null)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            {/* Ícono visual de advertencia para acción destructiva */}
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Icon name="trash" color="var(--danger)" size={22} />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>¿Eliminar comunicado?</h3>
            {/* Muestra el título del comunicado que se va a eliminar para confirmar */}
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>"{confirmDelete.title}"</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
              {/* Botón rojo de confirmación — ejecuta la eliminación definitiva */}
              <button onClick={() => handleDelete(confirmDelete.id)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--danger)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
