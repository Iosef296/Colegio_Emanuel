import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import AvancesLista from '../common/AvancesLista';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

// Componente de gestión de cursos para el panel administrativo.
// Implementa tres vistas en cascada:
//   VIEW 1 → lista de todos los cursos
//   VIEW 2 → grados con avances dentro del curso seleccionado
//   VIEW 3 → avances del curso en un grado específico
export default function AdminCursos() {
  // Lista de cursos registrados en el sistema
  const [courses, setCourses] = useState([]);

  // Todos los avances/progresos diarios de todos los cursos y grados
  const [allProgress, setAllProgress] = useState([]);

  // Controla el spinner de carga inicial
  const [loading, setLoading] = useState(true);

  // Curso seleccionado para entrar a VIEW 2; null = VIEW 1
  const [selectedCourse, setSelectedCourse] = useState(null);

  // Grado seleccionado dentro del curso para entrar a VIEW 3; null = VIEW 2
  const [selectedGrade, setSelectedGrade] = useState(null);

  // ── Estado del formulario de curso ──

  // Controla la visibilidad del modal de formulario (crear/editar curso)
  const [showForm, setShowForm] = useState(false);

  // ID del curso en edición; null = modo creación
  const [editing, setEditing] = useState(null);

  // Valores de los campos del formulario: nombre y color del curso
  const [form, setForm] = useState({ name: '', color: '#3B82F6' });

  // Indica si se está guardando para deshabilitar el botón y evitar doble envío
  const [saving, setSaving] = useState(false);

  // Mensaje de retroalimentación (éxito o error) dentro del formulario
  const [message, setMessage] = useState('');

  // Carga cursos y avances en paralelo desde la API.
  // Se envuelve en useCallback para que useAutoRefresh y useEffect puedan usarla
  // como referencia estable sin provocar re-renders infinitos.
  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([api.get('/courses'), api.get('/daily-progress')])
      .then(([c, p]) => {
        setCourses(c);
        setAllProgress(p);
        setLoading(false);
      })
      .catch(err => { console.error(err); setLoading(false); });
  }, []);

  // Carga inicial de datos al montar el componente
  useEffect(() => { load(); }, [load]);

  // Refresco automático silencioso para mantener los avances actualizados
  useAutoRefresh(() => load(true));

  // Restablece todos los campos del formulario y cierra el modal.
  // Se llama al cancelar o después de guardar exitosamente.
  const resetForm = () => {
    setForm({ name: '', color: '#3B82F6' });
    setEditing(null);
    setShowForm(false);
    setMessage('');
  };

  // Prepara el formulario para editar un curso existente.
  // Prelellena nombre y color del curso seleccionado.
  const handleEdit = (c) => {
    setForm({ name: c.name, color: c.color || '#3B82F6' });
    setEditing(c.id);
    setShowForm(true);
  };

  // Envía el formulario para crear o actualizar un curso.
  // Valida que el nombre no esté vacío antes de hacer la petición.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setMessage('Error: El nombre es obligatorio');
    setSaving(true);
    setMessage('');
    try {
      if (editing) {
        // Actualiza el curso existente con PUT
        await api.put(`/courses/${editing}`, form);
        setMessage('Curso actualizado');
      } else {
        // Crea un nuevo curso con POST
        await api.post('/courses', form);
        setMessage('Curso creado');
      }
      load();
      // Cierra el modal después de 900ms para que el usuario lea el mensaje de éxito
      setTimeout(resetForm, 900);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Elimina un curso permanentemente previo confirm del usuario.
  // Si el curso tiene datos asociados el servidor puede rechazar la eliminación.
  const handleDelete = async (c) => {
    if (!confirm(`¿Eliminar el curso "${c.name}"?`)) return;
    try {
      await api.delete(`/courses/${c.id}`);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  // Pantalla de carga mientras se obtienen los datos iniciales
  if (loading) return <div className="loading">Cargando...</div>;

  // Función de ordenamiento numérico-alfabético para nombres de grado.
  // Extrae el primer número del nombre (p.ej. "1" de "1° Primaria") y los compara numéricamente;
  // si son iguales, cae en comparación lexicográfica en español como desempate.
  const numSort = (a, b) => {
    const n = s => parseInt((s || '').match(/\d+/) || 0);
    return n(a) - n(b) || a.localeCompare(b, 'es');
  };

  // Modal compartido de formulario de curso (crear/editar).
  // Se evalúa como expresión para poder reutilizarlo en las tres vistas sin duplicar JSX.
  const modal = showForm && (
    // El clic en el overlay llama a resetForm para cerrar sin guardar
    <div className="modal-overlay" onClick={resetForm}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3>{editing ? 'Editar Curso' : 'Nuevo Curso'}</h3>

        {/* Alerta de retroalimentación: rojo si hay error, verde si es éxito */}
        {message && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{message}</div>}

        <form onSubmit={handleSubmit}>
          {/* Campo de nombre del curso */}
          <div className="form-group">
            <label className="form-label">Nombre del curso</label>
            <input className="form-input" placeholder="Ej: Matemáticas" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>

          {/* Selector de color: input nativo type="color" + código hex visible para referencia */}
          <div className="form-group">
            <label className="form-label">Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                style={{ width: 44, height: 36, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{form.color}</span>
            </div>
          </div>

          {/* Botones de guardar y cancelar */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );

  // ── VISTA 3: Avances de un curso en un grado específico ──
  // Activa cuando el usuario ha seleccionado curso Y grado.
  if (selectedCourse && selectedGrade) {
    // Filtra los avances que coinciden exactamente con el curso y grado seleccionados
    const avances = allProgress.filter(p =>
      p.course_id === selectedCourse.course_id && p.grade_level_id === selectedGrade.grade_level_id
    );
    // Nombre completo del grado con sección entre comillas si existe
    const gradeName = selectedGrade.grade_name + (selectedGrade.section ? ` "${selectedGrade.section}"` : '');
    return (
      <div>
        {/* Cabecera con gradiente azul estándar del sistema */}
        <div className="page-header" style={{ background: 'linear-gradient(135deg, #1E3A5F, #2563EB)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Retroceso a VIEW 2: limpia el grado seleccionado */}
            <div onClick={() => setSelectedGrade(null)} style={{ cursor: 'pointer', opacity: 0.8, color: 'white' }}>←</div>
            <div>
              <h1 style={{ color: 'white' }}>{gradeName}</h1>
              {/* Subtítulo con el nombre del curso para contexto */}
              <p style={{ color: 'rgba(255,255,255,0.8)' }}>{selectedCourse.course_name}</p>
            </div>
          </div>
        </div>
        <div className="content-area">
          {/* Lista de avances; hideCourseLabel oculta la etiqueta del curso porque ya está en el header */}
          <AvancesLista avances={avances} hideCourseLabel accentColor={selectedCourse.color} />
        </div>
        {modal}
      </div>
    );
  }

  // ── VISTA 2: Grados con avances dentro del curso seleccionado ──
  // Activa cuando solo hay curso seleccionado (no grado).
  if (selectedCourse) {
    // Filtra solo los avances del curso seleccionado
    const courseProgress = allProgress.filter(p => p.course_id === selectedCourse.course_id);

    // Agrupa los avances por grado para construir la lista de tarjetas
    const gradeMap = {};
    courseProgress.forEach(p => {
      const k = p.grade_level_id;
      if (!gradeMap[k]) gradeMap[k] = { grade_level_id: k, grade_name: p.grade_name || '—', section: p.section, count: 0 };
      // Acumula el contador de avances por grado
      gradeMap[k].count++;
    });

    // Ordena los grados numericamente (1° antes de 2°, etc.)
    const gradeList = Object.values(gradeMap).sort((a, b) => numSort(a.grade_name, b.grade_name));
    const color = selectedCourse.color;

    return (
      <div>
        {/* Cabecera con gradiente azul estándar del sistema */}
        <div className="page-header" style={{ background: 'linear-gradient(135deg, #1E3A5F, #2563EB)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Retroceso a VIEW 1: limpia el curso seleccionado */}
            <div onClick={() => setSelectedCourse(null)} style={{ cursor: 'pointer', opacity: 0.8, color: 'white' }}>←</div>
            <div>
              <h1 style={{ color: 'white' }}>{selectedCourse.course_name}</h1>
              <p style={{ color: 'rgba(255,255,255,0.8)' }}>{gradeList.length} grado{gradeList.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        <div className="content-area">
          {gradeList.length === 0 && <div className="empty-state"><p>Sin avances registrados</p></div>}

          {/* Tarjeta de cada grado con el acento del color del curso a la izquierda */}
          {gradeList.map(g => {
            const gradeName = g.grade_name + (g.section ? ` "${g.section}"` : '');
            return (
              // Clic navega a VIEW 3 con el grado seleccionado
              <div key={g.grade_level_id} className="card" style={{ marginBottom: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderLeft: `4px solid ${color}` }}
                onClick={() => setSelectedGrade(g)}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{gradeName}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.count} avance{g.count !== 1 ? 's' : ''}</p>
                </div>
                {/* Chevron derecho indicador de navegación */}
                <span style={{ fontSize: 18, color: 'var(--text-muted)' }}>›</span>
              </div>
            );
          })}
        </div>
        {modal}
      </div>
    );
  }

  // ── VISTA 1: Lista de cursos con contador de avances ──
  // Vista por defecto cuando no hay curso ni grado seleccionados.

  // Precalcula cuántos avances totales tiene cada curso para mostrarlo en la tarjeta.
  // Se usa un objeto indexado por course_id para acceso O(1).
  const progressByCourse = {};
  allProgress.forEach(p => {
    progressByCourse[p.course_id] = (progressByCourse[p.course_id] || 0) + 1;
  });

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Cursos</h1>
            <p>{courses.length} cursos registrados</p>
          </div>
          {/* Botón para abrir el modal de nuevo curso */}
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }}
            onClick={() => { resetForm(); setShowForm(true); }}>
            + Nuevo
          </button>
        </div>
      </div>

      <div className="content-area">
        {courses.length === 0 && <div className="empty-state"><p>Sin cursos registrados</p></div>}

        {/* Tarjeta de cada curso con borde izquierdo del color del curso */}
        {courses.map(c => (
          // Clic en la tarjeta (excepto en los botones) navega a VIEW 2
          <div key={c.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', borderLeft: `4px solid ${c.color || '#3B82F6'}` }}
            onClick={() => setSelectedCourse({ course_id: c.id, course_name: c.name, color: c.color || '#3B82F6' })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              {/* Ícono de libro con fondo semitransparente del color del curso */}
              <div style={{ width: 40, height: 40, borderRadius: 10, background: (c.color || '#3B82F6') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="book" color={c.color || '#3B82F6'} size={18} />
              </div>
              <div>
                {/* Nombre del curso en el color del curso */}
                <p style={{ fontSize: 15, fontWeight: 700, color: c.color || '#3B82F6' }}>{c.name}</p>
                {/* Contador de avances totales del curso */}
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{progressByCourse[c.id] || 0} avance{(progressByCourse[c.id] || 0) !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* Botones de editar y eliminar; stopPropagation evita activar el clic de navegación */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={e => { e.stopPropagation(); handleEdit(c); }} className="btn btn-sm btn-secondary" style={{ padding: '4px 8px' }}>
                <Icon name="edit" size={14} />
              </button>
              <button onClick={e => { e.stopPropagation(); handleDelete(c); }} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {modal}
    </div>
  );
}
