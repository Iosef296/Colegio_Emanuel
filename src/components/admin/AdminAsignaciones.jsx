import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

// Componente de gestión de asignaciones docente-curso-grado.
// Permite al administrador ver, crear y eliminar las asignaciones que vinculan
// a un docente con un curso específico dentro de un grado determinado.
export default function AdminAsignaciones() {
  // Lista de asignaciones existentes (docente + curso + grado)
  const [assignments, setAssignments] = useState([]);

  // Lista de usuarios filtrada solo a rol 'docente' para el selector del formulario
  const [teachers, setTeachers] = useState([]);

  // Lista de todos los cursos disponibles para asignar
  const [courses, setCourses] = useState([]);

  // Lista de todos los grados disponibles para asignar
  const [gradeLevels, setGradeLevels] = useState([]);

  // Controla el spinner de carga durante la primera obtención de datos
  const [loading, setLoading] = useState(true);

  // Controla la visibilidad del modal con el formulario de nueva asignación
  const [showForm, setShowForm] = useState(false);

  // Valores actuales de los tres selectores del formulario de asignación
  const [form, setForm] = useState({ teacher_id: '', course_id: '', grade_level_id: '' });

  // Indica si se está procesando el guardado para deshabilitar el botón y evitar doble envío
  const [saving, setSaving] = useState(false);

  // Mensaje de éxito o error que se muestra dentro del formulario
  const [message, setMessage] = useState('');

  // Carga en paralelo asignaciones, usuarios, cursos y grados desde la API.
  // Si silent=true omite el spinner de carga para refrescos en segundo plano.
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.get('/teacher-courses'),  // asignaciones actuales
      api.get('/users'),            // todos los usuarios (se filtrará por rol)
      api.get('/courses'),          // catálogo de cursos
      api.get('/grade-levels'),     // catálogo de grados
    ]).then(([a, u, c, gl]) => {
      setAssignments(a);
      // Solo los usuarios con rol 'docente' pueden ser asignados como profesores
      setTeachers(u.filter(x => x.role === 'docente'));
      setCourses(c);
      setGradeLevels(gl);
      setLoading(false);
    }).catch(console.error);
  };

  // Carga inicial de datos al montar el componente
  useEffect(load, []);

  // Refresco automático silencioso para mantener la lista actualizada mientras la app está abierta
  useAutoRefresh(() => load(true));

  // Envía el formulario para crear una nueva asignación.
  // Convierte los IDs de string (valor de <select>) a número antes de enviar al servidor.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/teacher-courses', {
        teacher_id: Number(form.teacher_id),
        course_id: Number(form.course_id),
        grade_level_id: Number(form.grade_level_id),
        // period_id fijo en 1 porque el sistema maneja un único período escolar activo
        period_id: 1,
      });
      setMessage('Asignación creada');
      load();
      // Cierra el formulario automáticamente después de un segundo para que el usuario vea el mensaje
      setTimeout(() => { setShowForm(false); setMessage(''); }, 1000);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Elimina una asignación existente previo confirm del usuario.
  // La eliminación es inmediata y permanente en la base de datos.
  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta asignación?')) return;
    try {
      await api.delete(`/teacher-courses/${id}`);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  // Pantalla de carga mientras se obtienen los datos iniciales de la API
  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      {/* Cabecera de la página con título y botón para abrir el modal de nueva asignación */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Asignaciones</h1>
            <p>Docente - Curso - Grado</p>
          </div>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }} onClick={() => setShowForm(true)}>
            + Nueva
          </button>
        </div>
      </div>

      <div className="content-area">
        {/* Modal del formulario de nueva asignación.
            El clic en el overlay cierra el modal sin guardar. */}
        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            {/* stopPropagation evita que el clic dentro del contenido cierre el overlay */}
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3>Nueva Asignación</h3>

              {/* Alerta de retroalimentación con color según resultado */}
              {message && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{message}</div>}

              <form onSubmit={handleSubmit}>
                {/* Selector de docente: lista solo usuarios con rol 'docente' */}
                <div className="form-group">
                  <label className="form-label">Docente</label>
                  <select className="form-select" value={form.teacher_id} onChange={e => setForm({ ...form, teacher_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                </div>

                {/* Selector de curso del catálogo completo */}
                <div className="form-group">
                  <label className="form-label">Curso</label>
                  <select className="form-select" value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {/* Selector de grado; muestra sección entre comillas si existe */}
                <div className="form-group">
                  <label className="form-label">Grado</label>
                  <select className="form-select" value={form.grade_level_id} onChange={e => setForm({ ...form, grade_level_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {gradeLevels.map(gl => <option key={gl.id} value={gl.id}>{gl.name}{gl.section ? ` "${gl.section}"` : ''}</option>)}
                  </select>
                </div>

                {/* Botones de acción: Crear y Cancelar */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                    {saving ? 'Guardando...' : 'Crear'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Lista de asignaciones existentes.
            Cada tarjeta muestra el curso con su color, el nombre del docente y el grado. */}
        {assignments.map(a => (
          <div key={a.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              {/* Ícono de libro con el color del curso; 20 de opacidad = ~12% en hex */}
              <div style={{ width: 40, height: 40, borderRadius: 12, background: a.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="book" color={a.color} size={20} />
              </div>
              <div>
                {/* Nombre del curso en negrita */}
                <p style={{ fontSize: 14, fontWeight: 600 }}>{a.course_name}</p>
                {/* Docente y grado como subtítulo separados por punto medio */}
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.teacher_name} · {a.grade_name}{a.section ? ` "${a.section}"` : ''}</p>
              </div>
            </div>
            {/* Botón para eliminar la asignación */}
            <button onClick={() => handleDelete(a.id)} className="btn btn-sm btn-danger" style={{ padding: '4px 8px' }}>
              <Icon name="trash" color="white" size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
