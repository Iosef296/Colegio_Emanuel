// DocenteCursos.jsx
// Pantalla que lista todos los cursos asignados al docente autenticado.
// Actúa como punto de entrada para acceder a la gestión de notas de cada curso.
// Al tocar una tarjeta de curso, navega a la pantalla detallada de ese curso
// (DocenteCursoDetalle) donde el docente puede ingresar y editar calificaciones.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function DocenteCursos() {
  // Lista de cursos asignados al docente, con nombre, grado, sección y color.
  const [courses, setCourses] = useState([]);

  // Indicador de carga inicial; mientras sea true se muestra el spinner de pantalla.
  const [loading, setLoading] = useState(true);

  // Hook de React Router para navegar a la pantalla de detalle de cada curso.
  const navigate = useNavigate();

  // Función de carga memorizada con useCallback para mantener una referencia
  // estable entre renders. Esto evita que los efectos que la usan se re-ejecuten
  // innecesariamente y es necesario para que useAutoRefresh funcione correctamente.
  // El parámetro `silent` está disponible para futuras actualizaciones silenciosas
  // (sin mostrar el spinner), aunque actualmente no altera el comportamiento visible.
  const load = useCallback((silent = false) => {
    api.get('/teacher-courses').then(data => { setCourses(data); setLoading(false); }).catch(console.error);
  }, []);

  // Carga la lista de cursos al montar el componente por primera vez.
  useEffect(() => { load(); }, [load]);

  // Configura actualizaciones automáticas en segundo plano para que si un
  // administrador agrega o elimina un curso asignado, el docente lo vea
  // sin necesidad de recargar la página manualmente.
  useAutoRefresh(() => load(true));

  // Muestra la pantalla de carga mientras se espera la respuesta del servidor.
  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      {/* Encabezado de la pantalla */}
      <div className="page-header">
        <h1>Mis Cursos</h1>
        <p>Cursos asignados</p>
      </div>

      <div className="content-area">
        {/* Grilla de 2 columnas con una tarjeta por cada curso asignado.
            Cada tarjeta muestra el ícono del libro con el color del curso,
            el nombre del curso y el grado/sección al que corresponde.
            Al tocarla navega al detalle del curso para gestionar notas. */}
        <div className="grid-2">
          {courses.map(c => (
            <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/docente/cursos/${c.id}`)}>
              {/* Contenedor del ícono con fondo semi-transparente del color del curso.
                  El color proviene de la configuración del curso en la BD. */}
              <div style={{ width: 48, height: 48, borderRadius: 14, background: c.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon name="book" color={c.color} size={24} />
              </div>
              {/* Nombre del curso (course_name) en negrita */}
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{c.course_name}</p>
              {/* Grado y sección en texto secundario; la sección se muestra entre comillas
                  si existe, para distinguir grupos del mismo grado (ej. 3° "A"). */}
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.grade_name}{c.section ? ` "${c.section}"` : ''}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
