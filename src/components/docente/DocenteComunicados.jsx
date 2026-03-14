// DocenteComunicados.jsx
// Pantalla de comunicados compartida por los roles "docente" y "auxiliar".
// Organiza los comunicados en secciones colapsables según su tipo y rol:
//
//   Docente  → Comunicados de Dirección | Por Curso (agrupado por grado) | (sin columna Por Alumno en este listado)
//   Auxiliar → Comunicados de Dirección | Por Grado | Por Curso
//
// Cada comunicado puede ser editado o eliminado por su autor (CommCard).
// La pantalla se actualiza automáticamente en segundo plano con useAutoRefresh.

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import AvanceAdjuntos from '../common/AvanceAdjuntos';
import Icon from '../common/Icon';

// Formatea una fecha ISO a formato legible en español peruano (ej. "10 mar. 2025").
const formatDate = (d) => new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

// Convierte un color hex (#RRGGBB) a una cadena rgba(r,g,b,alpha).
// Se usa para generar fondos semitransparentes del color del curso en los bordes
// y contadores de la vista de alumnos por curso.
const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// Genera un gradiente CSS lineal monocromático a partir de un color hex de curso.
// Produce una versión clara (+35% hacia blanco) y una oscura (×0.6) del mismo tono
// para usarse como fondo de los encabezados de sección de curso.
// Si el color no comienza con "#" (ej. variables CSS), devuelve el gradiente azul fijo.
const courseGradient = (color) => {
  if (!color.startsWith('#')) return 'linear-gradient(135deg, #1E3A5F, #2563EB)';
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  // Claro: mezcla el canal con blanco al 35%.
  const light = v => Math.min(255, Math.round(v + (255 - v) * 0.35)).toString(16).padStart(2, '0');
  // Oscuro: reduce el canal al 60%.
  const dark  = v => Math.round(v * 0.6).toString(16).padStart(2, '0');
  return `linear-gradient(135deg, #${light(r)}${light(g)}${light(b)}, #${dark(r)}${dark(g)}${dark(b)})`;
};

// Detecta si el navegador soporta la codificación WebP evaluando si un canvas
// puede exportar en ese formato. Se hace una sola vez al cargar el módulo
// (IIFE) para no repetir la detección en cada render o compresión.
const supportsWebP = (() => {
  const c = document.createElement('canvas');
  return c.toDataURL('image/webp').startsWith('data:image/webp');
})();

// Comprime una imagen File a un Blob de tamaño reducido.
// Si la imagen supera 1200px en cualquier dimensión, la escala proporcionalmente.
// Prefiere el formato WebP (calidad 0.85) si el navegador lo soporta;
// de lo contrario usa JPEG (calidad 0.92) para maximizar compatibilidad.
// Devuelve una Promise que resuelve con el Blob comprimido.
const compressImageToBlob = (file) => new Promise((resolve) => {
  const img = new Image();
  // Crea una URL temporal en memoria para cargar el archivo sin necesidad de subirlo.
  const url = URL.createObjectURL(file);
  img.onload = () => {
    // Libera la URL de objeto tan pronto como la imagen está cargada en memoria.
    URL.revokeObjectURL(url);
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
  img.src = url;
});

// --- Componente CommCard ---
// Tarjeta reutilizable que muestra un comunicado individual.
// Soporta dos modos: visualización y edición inline.
// Props:
//   c         — objeto comunicado (id, title, body, type, course_color, attachments, etc.)
//   onRefresh — callback para recargar la lista padre tras editar o eliminar
//   editable  — sobreescribe la lógica de permisos (undefined = usa author_id vs. user.id)
//   hideAuthor — si true, oculta el nombre del autor y solo muestra la fecha
function CommCard({ c, onRefresh, editable, hideAuthor }) {
  // Obtiene el usuario autenticado para verificar si es el autor del comunicado.
  const { user } = useAuth();

  // Determina si el usuario puede editar este comunicado.
  // Si se pasa la prop `editable` explícitamente, se usa ese valor.
  // De lo contrario, solo puede editar si es el autor (author_id === user.id).
  const canEdit = editable !== undefined ? editable : c.author_id === user?.id;

  // Controla si la tarjeta está en modo de edición inline o en modo visualización.
  const [editing, setEditing] = useState(false);

  // Estado local del título mientras se edita.
  const [title, setTitle] = useState(c.title);

  // Estado local del cuerpo/mensaje mientras se edita.
  const [body, setBody] = useState(c.body || '');

  // URLs de adjuntos existentes que se conservarán al guardar.
  // Se parsea el campo attachments (puede llegar como string JSON o como arreglo).
  const existingInit = c.attachments ? (typeof c.attachments === 'string' ? JSON.parse(c.attachments) : c.attachments) : [];
  const [existingUrls, setExistingUrls] = useState(existingInit);

  // Nuevos archivos seleccionados por el usuario para adjuntar en esta edición.
  // Cada elemento es { blob, type, name, uploadName, preview }.
  const [newFiles, setNewFiles] = useState([]);

  // Indicador de guardado en curso para deshabilitar el botón y mostrar progreso.
  const [saving, setSaving] = useState(false);

  // Texto de progreso de subida de archivos (ej. "Subiendo 1/3...").
  const [uploadProgress, setUploadProgress] = useState('');

  // Referencia al <input type="file"> oculto, activado por el botón "Agregar foto o PDF".
  const fileRef = useRef(null);

  // Cancela la edición y restaura todos los campos al valor original del comunicado.
  // Se llama al presionar "Cancelar" o al cerrar el formulario de edición.
  const resetEdit = () => {
    setEditing(false);
    setTitle(c.title);
    setBody(c.body || '');
    setExistingUrls(existingInit);
    setNewFiles([]);
  };

  // Maneja la selección de archivos desde el <input type="file">.
  // Procesa cada archivo seleccionado:
  //   - PDFs: se guardan directamente como blob sin compresión.
  //   - Imágenes: se comprimen mediante compressImageToBlob antes de agregar.
  // Genera URLs de previsualización locales para mostrar miniaturas en el formulario.
  // Limpia el valor del input para permitir seleccionar el mismo archivo otra vez.
  const handleFiles = async (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;
    const added = await Promise.all(selected.map(async (file) => {
      if (file.type === 'application/pdf') {
        return { blob: file, type: 'pdf', name: file.name, preview: URL.createObjectURL(file) };
      }
      const blob = await compressImageToBlob(file);
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      return { blob, type: 'image', name: file.name, uploadName: `photo.${ext}`, preview: URL.createObjectURL(blob) };
    }));
    setNewFiles(prev => [...prev, ...added]);
    fileRef.current.value = '';
  };

  // Guarda los cambios del comunicado editado.
  // Flujo:
  //   1. Sube los nuevos archivos al endpoint /upload secuencialmente (para mostrar progreso).
  //   2. Combina las URLs existentes con las recién subidas.
  //   3. Llama a PUT /communications/:id con el título, cuerpo y lista completa de adjuntos.
  //   4. Cierra el modo edición y dispara onRefresh para que el padre recargue la lista.
  // Si ocurre cualquier error muestra una alerta y limpia el progreso.
  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const uploaded = [];
      for (let i = 0; i < newFiles.length; i++) {
        const f = newFiles[i];
        setUploadProgress(`Subiendo ${i + 1}/${newFiles.length}...`);
        const formData = new FormData();
        // Para PDFs se usa el nombre original; para imágenes el nombre normalizado con extensión.
        formData.append('photo', f.blob, f.type === 'pdf' ? f.name : f.uploadName);
        const { url } = await api.upload('/upload', formData);
        uploaded.push(url);
      }
      setUploadProgress('');
      // Combina adjuntos previos conservados con los nuevos subidos.
      const allAttachments = [...existingUrls, ...uploaded];
      await api.put(`/communications/${c.id}`, {
        title: title.trim(),
        body,
        attachments: allAttachments,
      });
      setEditing(false);
      onRefresh();
    } catch (err) { alert(err.message); setUploadProgress(''); }
    finally { setSaving(false); }
  };

  // Elimina el comunicado tras confirmación del usuario.
  // Llama a DELETE /communications/:id y luego dispara onRefresh para
  // que el componente padre quite la tarjeta de la lista.
  const remove = async () => {
    if (!window.confirm('¿Eliminar este comunicado?')) return;
    try {
      await api.delete(`/communications/${c.id}`);
      onRefresh();
    } catch (err) { alert(err.message); }
  };

  // --- Render en modo edición ---
  // Muestra un formulario inline con inputs de título, cuerpo, gestión de
  // adjuntos existentes, nuevos archivos y botones de guardar/cancelar.
  if (editing) {
    return (
      <div className="card" style={{ marginBottom: 8 }}>
        <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Título" style={{ marginBottom: 8, fontSize: 13 }} />
        <textarea className="form-textarea" rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="Mensaje (opcional)" style={{ marginBottom: 8, fontSize: 13 }} />

        {/* Lista de adjuntos existentes con botón "×" para eliminar cada uno.
            Al eliminar una URL se saca del arreglo existingUrls; no se borra
            del almacenamiento R2 hasta que el comunicado se guarde sin esa URL. */}
        {existingUrls.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {existingUrls.map((url, i) => {
              const isPdf = url.endsWith('.pdf');
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>
                  <Icon name={isPdf ? 'pdf' : 'image'} color={isPdf ? 'var(--primary)' : 'var(--text-muted)'} size={13} />
                  <span style={{ fontSize: 11, color: 'var(--text)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isPdf ? `PDF ${i + 1}` : `Imagen ${i + 1}`}
                  </span>
                  <button type="button" onClick={() => setExistingUrls(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                    <Icon name="x" color="var(--text-muted)" size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Lista de nuevos archivos pendientes de subir, con botón "×" para quitar cada uno.
            Estos archivos aún no se han subido a R2; solo existen en memoria local. */}
        {newFiles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {newFiles.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(37,99,235,0.06)', border: '1px solid var(--primary)', borderRadius: 6, padding: '3px 8px' }}>
                <Icon name={f.type === 'pdf' ? 'pdf' : 'image'} color="var(--primary)" size={13} />
                <span style={{ fontSize: 11, color: 'var(--text)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <button type="button" onClick={() => setNewFiles(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                  <Icon name="x" color="var(--primary)" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input de archivo oculto; se activa programáticamente al presionar el botón de adjuntar */}
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleFiles} style={{ display: 'none' }} />
        <button type="button" onClick={() => fileRef.current.click()}
          style={{ width: '100%', padding: '7px', border: '2px dashed var(--border)', borderRadius: 8, background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
          <Icon name="camera" color="var(--text-muted)" size={14} />
          {newFiles.length > 0 ? 'Agregar más' : 'Agregar foto o PDF'}
        </button>

        {/* Botones de acción del formulario de edición */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
            {saving ? (uploadProgress || 'Guardando...') : 'Guardar'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={resetEdit} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
        </div>
      </div>
    );
  }

  // Determina si se debe mostrar un borde izquierdo de acento con el color del curso.
  // Solo aplica a comunicados de tipo "curso" o "alumno" que tengan course_color definido.
  const accent = (c.type === 'curso' || c.type === 'alumno') && c.course_color ? c.course_color : null;

  // --- Render en modo visualización ---
  return (
    <div className="card" style={{ marginBottom: 8, borderLeft: accent ? `3px solid ${accent}` : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Título del comunicado */}
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, wordBreak: 'break-word' }}>{c.title}</p>
          {/* Meta: autor y fecha. Si hideAuthor es true, se muestra solo la fecha.
              El rol del autor se antepone al nombre (Auxiliar / Docente) o se omite para admin. */}
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: c.body ? 4 : 0 }}>
            {hideAuthor
              ? formatDate(c.created_at)
              : `${c.author_role === 'auxiliar' ? 'Auxiliar ' : c.author_role === 'docente' ? 'Docente ' : ''}${c.author_name} · ${formatDate(c.created_at)}`}
          </p>
          {/* Cuerpo del comunicado; se omite si está vacío */}
          {c.body && <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, wordBreak: 'break-word' }}>{c.body}</p>}
          {/* Adjuntos del comunicado (imágenes y PDFs) renderizados por AvanceAdjuntos */}
          <AvanceAdjuntos avance={c} />
        </div>
        {/* Botones de editar y eliminar; solo visibles para el autor del comunicado */}
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button onClick={() => setEditing(true)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#EFF6FF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="edit" color="#3B82F6" size={15} />
            </button>
            <button onClick={remove} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#FEE2E2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="trash" color="var(--danger)" size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Componente StudentInCourse ---
// Subsección colapsable que agrupa los comunicados de un alumno específico
// dentro de la vista de comunicados por alumno. Muestra el nombre del alumno
// y un contador de comunicados. Al expandir, lista los CommCard del alumno.
// Props:
//   name      — nombre completo del alumno
//   comms     — arreglo de comunicados dirigidos a este alumno
//   onRefresh — callback para recargar la lista padre
//   color     — color hex del curso (para el acento visual del borde y contador)
function StudentInCourse({ name, comms, onRefresh, color = 'var(--primary)' }) {
  // Controla si la subsección está expandida o colapsada.
  const [open, setOpen] = useState(false);

  // Color de fondo semi-transparente (12% opacidad) derivado del color del curso
  // para el borde izquierdo y el badge de conteo de comunicados.
  const rgb12 = color.startsWith('#') ? hexToRgba(color, 0.12) : 'rgba(37,99,235,0.12)';

  return (
    <div style={{ marginBottom: 6, paddingLeft: 8, borderLeft: `2px solid ${rgb12}` }}>
      {/* Encabezado de la subsección: nombre del alumno y contador.
          Al tocarlo alterna el estado de apertura. */}
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '5px 0', marginBottom: open ? 6 : 0, userSelect: 'none' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {/* Badge con el total de comunicados del alumno */}
          <span style={{ fontSize: 10, color, background: rgb12, borderRadius: 10, padding: '1px 6px' }}>{comms.length}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1 }}>{open ? '▼' : '▶'}</span>
        </div>
      </div>
      {/* Lista de comunicados del alumno; solo se renderiza cuando está expandida */}
      {open && comms.map(c => <CommCard key={c.id} c={c} onRefresh={onRefresh} />)}
    </div>
  );
}

// --- Componente GradeSubSection ---
// Subsección colapsable dentro de una columna de comunicados.
// Muestra un encabezado con gradiente azul institucional y lista
// los comunicados de un grado específico al expandirse.
// Props:
//   name      — nombre del grado (ej. "3° Primaria «A»")
//   comms     — arreglo de comunicados de ese grado
//   onRefresh — callback para recargar la lista padre
function GradeSubSection({ name, comms, onRefresh }) {
  // Controla si la subsección está expandida o colapsada.
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Encabezado con gradiente azul institucional fijo.
          El gradiente es consistente con el de los headers principales
          para mantener la jerarquía visual. */}
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '6px 12px', borderRadius: 8, background: 'linear-gradient(135deg, #1E3A5F, #2563EB)', marginBottom: open ? 6 : 0, userSelect: 'none' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {/* Badge blanco semitransparente con el conteo de comunicados del grado */}
          <span style={{ fontSize: 10, color: 'white', background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '1px 6px' }}>{comms.length}</span>
          <span style={{ fontSize: 12, color: 'white', lineHeight: 1 }}>{open ? '▼' : '▶'}</span>
        </div>
      </div>
      {/* Lista de comunicados del grado con hideAuthor=true porque el contexto
          (nombre del grado) ya está en el encabezado de la subsección. */}
      {open && comms.map(c => <CommCard key={c.id} c={c} onRefresh={onRefresh} hideAuthor />)}
    </div>
  );
}

// --- Componente CourseSubSection ---
// Subsección colapsable para un curso específico dentro de la columna "Por Curso".
// Soporta dos modos de contenido interior:
//   - byGrade: objeto { gradeName: [comms] } para mostrar sub-subsecciones por grado.
//   - comms:   arreglo plano de comunicados del curso (vista auxiliar).
// El encabezado usa el gradiente monocromático del color del curso.
// Props:
//   name      — nombre del curso
//   comms     — arreglo plano de comunicados (modo auxiliar)
//   byGrade   — objeto agrupado por grado (modo docente)
//   onRefresh — callback para recargar la lista padre
//   color     — color hex del curso para el gradiente del encabezado
function CourseSubSection({ name, comms, byGrade, onRefresh, color = 'var(--primary)' }) {
  // Controla si la subsección está expandida o colapsada.
  const [open, setOpen] = useState(false);

  // Calcula el total de comunicados de la subsección.
  // Si byGrade está presente, suma los comunicados de todos los grados.
  // Si no, usa la longitud del arreglo plano.
  const count = byGrade
    ? Object.values(byGrade).reduce((s, arr) => s + arr.length, 0)
    : (comms?.length || 0);

  return (
    <div style={{ marginBottom: 10 }}>
      {/* Encabezado con gradiente monocromático del color del curso.
          Proporciona identidad visual inmediata al curso sin necesidad de su nombre
          en el interior de las tarjetas. */}
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 14px', borderRadius: 10, background: courseGradient(color), marginBottom: open ? 8 : 0, userSelect: 'none' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Badge con el total de comunicados del curso */}
          <span style={{ fontSize: 11, color: 'white', background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '1px 7px' }}>{count}</span>
          <span style={{ fontSize: 13, color: 'white', lineHeight: 1 }}>{open ? '▼' : '▶'}</span>
        </div>
      </div>
      {/* Contenido interior: si byGrade existe, muestra subsecciones por grado ordenadas
          alfabéticamente; si no, lista los comunicados directamente. */}
      {open && byGrade
        ? Object.entries(byGrade).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([gname, items]) => (
            <GradeSubSection key={gname} name={gname} comms={items} onRefresh={onRefresh} />
          ))
        : comms?.map(c => <CommCard key={c.id} c={c} onRefresh={onRefresh} />)
      }
    </div>
  );
}

// Función auxiliar que renderiza el encabezado principal de una sección colapsable.
// Produce un div con gradiente azul institucional que actúa como botón de colapso.
// Es una función en lugar de un componente para poder usarla sin crear un árbol JSX
// anidado extra, lo que simplifica la lectura del JSX principal.
// Parámetros: title, count (número de comunicados), open (estado), onToggle (callback).
const sectionHeader = (title, count, open, onToggle) => (
  <div onClick={onToggle}
    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 14px', borderRadius: 10, background: 'linear-gradient(135deg, #1E3A5F, #2563EB)', marginBottom: open ? 12 : 0, userSelect: 'none' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{title}</span>
      {/* Solo muestra el badge de conteo si hay al menos un comunicado */}
      {count > 0 && <span style={{ fontSize: 11, color: 'white', background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '1px 8px' }}>{count}</span>}
    </div>
    <span style={{ fontSize: 12, color: 'white' }}>▶</span>
  </div>
);

// --- Componente principal DocenteComunicados ---
export default function DocenteComunicados() {
  // Lista completa de comunicados devueltos por el servidor para este usuario.
  const [comms, setComms] = useState([]);

  // Indicador de carga inicial.
  const [loading, setLoading] = useState(true);

  // Estado de apertura de cada sección principal (general, grado, curso, alumno).
  // Todas empiezan colapsadas para no abrumar la pantalla al cargar.
  const [openSections, setOpenSections] = useState({ general: false, grado: false, curso: false, alumno: false });

  // Hook de navegación para ir a la pantalla de nuevo comunicado.
  const navigate = useNavigate();

  // Datos del usuario autenticado (rol, id, etc.).
  const { user } = useAuth();

  // Ruta del formulario de nuevo comunicado según el rol del usuario.
  const newPath = user?.role === 'auxiliar' ? '/auxiliar/comunicados/nuevo' : '/docente/comunicados/nuevo';

  // Función de carga memorizada para evitar recreaciones innecesarias.
  // Obtiene todos los comunicados visibles para el usuario autenticado.
  const load = useCallback(() => {
    api.get('/communications').then(data => { setComms(data); setLoading(false); }).catch(console.error);
  }, []);

  // Carga los comunicados al montar el componente.
  useEffect(() => { load(); }, [load]);

  // Actualización automática en segundo plano para capturar nuevos comunicados
  // publicados por otros usuarios mientras esta pantalla está abierta.
  useAutoRefresh(load);

  // Muestra pantalla de carga mientras los datos no están disponibles.
  if (loading) return <div className="loading">Cargando...</div>;

  // --- Agrupaciones de comunicados por tipo ---

  // Comunicados generales de dirección (type === 'general').
  const generalComms = comms.filter(c => c.type === 'general');

  // Comunicados dirigidos a un grado específico (type === 'grado').
  const gradoComms = comms.filter(c => c.type === 'grado');

  // Comunicados dirigidos a un curso específico (type === 'curso').
  const cursoComms = comms.filter(c => c.type === 'curso');

  // Comunicados dirigidos a alumnos específicos (type === 'alumno').
  const alumnoComms = comms.filter(c => c.type === 'alumno');

  // Agrupa los comunicados de grado por nombre de grado para la vista del auxiliar.
  // Estructura: { "3° Primaria": [comm1, comm2] }
  const byGrade = {};
  gradoComms.forEach(c => {
    const k = c.grade_name || 'Sin grado';
    if (!byGrade[k]) byGrade[k] = [];
    byGrade[k].push(c);
  });

  // Agrupa los comunicados de curso en un objeto plano para la vista del auxiliar.
  // Estructura: { "Matemáticas": { items: [comm1], color: '#FF0000' } }
  const byCourse = {};
  cursoComms.forEach(c => {
    const k = c.course_name || 'Sin curso';
    if (!byCourse[k]) byCourse[k] = { items: [], color: c.course_color || 'var(--primary)' };
    byCourse[k].items.push(c);
  });

  // Agrupa los comunicados de curso por curso y luego por grado/sección para el docente.
  // Estructura: { "Matemáticas": { byGrade: { '3° A': [comm1] }, color: '#FF0000' } }
  // Esto permite al docente ver qué grados tienen comunicados dentro de cada curso suyo.
  const byCourseByGrade = {};
  cursoComms.forEach(c => {
    const k = c.course_name || 'Sin curso';
    if (!byCourseByGrade[k]) byCourseByGrade[k] = { byGrade: {}, color: c.course_color || 'var(--primary)' };
    // La clave de grado incluye la sección entre comillas si existe.
    const gk = c.grade_name ? (c.grade_name + (c.section ? ` "${c.section}"` : '')) : 'Sin grado';
    if (!byCourseByGrade[k].byGrade[gk]) byCourseByGrade[k].byGrade[gk] = [];
    byCourseByGrade[k].byGrade[gk].push(c);
  });

  // Agrupa los comunicados de alumno por nombre del alumno.
  // Si el campo students_list está vacío, se agrupa bajo "Sin alumno".
  // Un mismo comunicado puede aparecer bajo múltiples alumnos si fue dirigido a varios.
  const byStudent = {};
  alumnoComms.forEach(c => {
    const students = c.students_list
      ? (typeof c.students_list === 'string' ? JSON.parse(c.students_list) : c.students_list)
      : [];
    if (!students.length) {
      if (!byStudent['Sin alumno']) byStudent['Sin alumno'] = [];
      byStudent['Sin alumno'].push(c);
    } else {
      students.forEach(s => {
        if (!byStudent[s.name]) byStudent[s.name] = [];
        byStudent[s.name].push(c);
      });
    }
  });

  return (
    <div>
      {/* Encabezado de la pantalla con título y botón para crear un nuevo comunicado */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Comunicados</h1>
            <p>Mis comunicados</p>
          </div>
          <button
            className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
            onClick={() => navigate(newPath)}
          >
            + Nuevo
          </button>
        </div>
      </div>

      <div className="content-area">
        {/* Grilla de 2 columnas que organiza las secciones de comunicados.
            Algunas secciones ocupan todo el ancho (gridColumn: '1 / -1') según el rol. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

          {/* Sección "Comunicados de Dirección": siempre ocupa todo el ancho (2 columnas).
              Muestra los comunicados de tipo "general" publicados por la dirección del colegio.
              Tanto docentes como auxiliares ven esta sección. */}
          <div style={{ gridColumn: '1 / -1' }}>
            {sectionHeader('Comunicados de Dirección', generalComms.length, openSections.general, () => setOpenSections(s => ({ ...s, general: !s.general })))}
            {openSections.general && (
              generalComms.length === 0
                ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin comunicados</p>
                : generalComms.map(c => <CommCard key={c.id} c={c} onRefresh={load} />)
            )}
          </div>

          {/* Segunda sección: varía según el rol.
              - Auxiliar: "Por Grado" (ocupa 1 columna, comparte fila con "Por Curso").
              - Docente:  "Por Curso" agrupado por grado (ocupa las 2 columnas completas). */}
          <div style={{ gridColumn: user?.role === 'docente' ? '1 / -1' : undefined }}>
            {user?.role === 'auxiliar' ? (
              <>
                {/* Vista auxiliar: comunicados agrupados por grado escolar */}
                {sectionHeader('Por Grado', gradoComms.length, openSections.grado, () => setOpenSections(s => ({ ...s, grado: !s.grado })))}
                {openSections.grado && (
                  gradoComms.length === 0
                    ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin comunicados</p>
                    : Object.entries(byGrade).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([name, items]) => (
                        <CourseSubSection key={name} name={name} comms={items} onRefresh={load} />
                      ))
                )}
              </>
            ) : (
              <>
                {/* Vista docente: comunicados de curso agrupados por curso y luego por grado */}
                {sectionHeader('Por Curso', cursoComms.length, openSections.curso, () => setOpenSections(s => ({ ...s, curso: !s.curso })))}
                {openSections.curso && (
                  cursoComms.length === 0
                    ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin comunicados</p>
                    : Object.entries(byCourseByGrade).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([name, { byGrade, color }]) => (
                        <CourseSubSection key={name} name={name} byGrade={byGrade} color={color} onRefresh={load} />
                      ))
                )}
              </>
            )}
          </div>

          {/* Tercera columna: "Por Curso" en la vista del auxiliar.
              El auxiliar ve tanto "Por Grado" como "Por Curso" en la misma fila.
              Esta sección solo se renderiza para el rol auxiliar. */}
          {user?.role === 'auxiliar' && (
            <div>
              {sectionHeader('Por Curso', cursoComms.length, openSections.curso, () => setOpenSections(s => ({ ...s, curso: !s.curso })))}
              {openSections.curso && (
                cursoComms.length === 0
                  ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Sin comunicados</p>
                  : Object.entries(byCourse).sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([name, { items, color }]) => (
                      <CourseSubSection key={name} name={name} comms={items} color={color} onRefresh={load} />
                    ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
