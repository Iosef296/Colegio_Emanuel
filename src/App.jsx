// ============================================================
// Componente raíz de la aplicación React (App.jsx).
//
// Responsabilidades:
//  — Declarar todas las rutas de la SPA usando React Router v7.
//  — Proteger las rutas con el componente ProtectedRoute según el rol del usuario.
//  — Redirigir al usuario a la sección correcta según su rol al entrar a "/".
//  — Envolver cada vista protegida con el Layout (barra lateral + header).
// ============================================================

import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoadingScreen from './components/common/LoadingScreen'; // Contexto global con el usuario autenticado
import Login from './components/common/Login';
import Layout from './components/common/Layout';
import ProtectedRoute from './components/common/ProtectedRoute'; // HOC que bloquea rutas sin autenticación

// ---------------------------------------------------------------------------
// Importación de vistas del rol Padre
// ---------------------------------------------------------------------------
import PadreDashboard from './components/padre/PadreDashboard';
import PadreCursos from './components/padre/PadreCursos';
import PadreCursoDetalle from './components/padre/PadreCursoDetalle';
import PadreNotas from './components/padre/PadreNotas';
import PadreAsistencia from './components/padre/PadreAsistencia';
import PadreMensualidades from './components/padre/PadreMensualidades';
import PadreComunicados from './components/padre/PadreComunicados';
import PadreAvances from './components/padre/PadreAvances';

// ---------------------------------------------------------------------------
// Importación de vistas del rol Docente
// ---------------------------------------------------------------------------
import DocenteDashboard from './components/docente/DocenteDashboard';
import DocenteCursos from './components/docente/DocenteCursos';
import DocenteGradeEntry from './components/docente/DocenteGradeEntry';
import DocenteAttendance from './components/docente/DocenteAttendance';
import DocenteComunicados from './components/docente/DocenteComunicados';
import DocenteComunicadoForm from './components/docente/DocenteComunicadoForm';
import DocenteAvances from './components/docente/DocenteAvances';
import DocenteAvanceForm from './components/docente/DocenteAvanceForm';
import DocenteAvanceEdit from './components/docente/DocenteAvanceEdit';

// ---------------------------------------------------------------------------
// Importación de vistas del rol Auxiliar
// ---------------------------------------------------------------------------
import AuxiliarDashboard from './components/auxiliar/AuxiliarDashboard';
import AuxiliarAsistencia from './components/auxiliar/AuxiliarAsistencia';

// ---------------------------------------------------------------------------
// Importación de vistas del rol Admin (director, secretaria, admin)
// ---------------------------------------------------------------------------
import AdminDashboard from './components/admin/AdminDashboard';
import AdminUsuarios from './components/admin/AdminUsuarios';
import AdminCursos from './components/admin/AdminCursos';
import AdminAsignaciones from './components/admin/AdminAsignaciones';
import AdminGrados from './components/admin/AdminGrados';
import AdminPagos from './components/admin/AdminPagos';
import AdminComunicados from './components/admin/AdminComunicados';
import Informes from './components/admin/Informes';
import AdminWhatsapp from './components/admin/AdminWhatsapp';
import AdminHorarios from './components/admin/AdminHorarios';

/**
 * RoleRedirect — componente de redirección inteligente según el rol del usuario.
 *
 * Se usa como elemento de la ruta "/" y como fallback de cualquier ruta no encontrada.
 * Reglas:
 *  — Sin usuario autenticado → /login (la sesión no existe o expiró)
 *  — director o secretaria → /admin (tienen la interfaz de administrador)
 *  — cualquier otro rol (padre, docente, auxiliar) → /<rol> (su sección propia)
 *
 * `replace` evita que la redirección quede en el historial del navegador,
 * impidiendo que el usuario vuelva a "/" con el botón "atrás".
 */
function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  // director y secretaria comparten la interfaz de administración
  if (user.role === 'director' || user.role === 'secretaria') return <Navigate to="/admin" replace />;
  // Para padre, docente y auxiliar la ruta base es su propio prefijo de rol
  return <Navigate to={`/${user.role}`} replace />;
}

// NotifRedirect — destino al tocar una notificación push.
// Lee ?tab= y redirige a la sección de comunicados del rol correspondiente.
function NotifRedirect() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  if (!user) return <Navigate to="/login" replace />;
  const tabParam = tab ? `?tab=${tab}` : '';
  if (user.role === 'padre') return <Navigate to={`/padre/comunicados${tabParam}`} replace />;
  if (user.role === 'docente') return <Navigate to="/docente/comunicados" replace />;
  if (user.role === 'auxiliar') return <Navigate to="/auxiliar/comunicados" replace />;
  return <Navigate to="/admin/comunicados" replace />;
}

/**
 * App — componente raíz que declara el árbol de rutas de la SPA.
 *
 * Estructura de rutas:
 *  /login               → Pantalla de inicio de sesión (pública)
 *  /                    → RoleRedirect (redirige según rol)
 *  /padre/*             → Vistas del padre de familia (protegidas: rol 'padre')
 *  /docente/*           → Vistas del docente (protegidas: rol 'docente')
 *  /auxiliar/*          → Vistas del auxiliar (protegidas: rol 'auxiliar')
 *  /admin/*             → Vistas de administración (protegidas: roles admin/director/secretaria)
 *  *                    → RoleRedirect (cualquier URL no reconocida)
 *
 * Cada ruta protegida sigue el mismo patrón:
 *   <ProtectedRoute roles={[...]}>
 *     <Layout>
 *       <ComponenteDeVista />
 *     </Layout>
 *   </ProtectedRoute>
 *
 * ProtectedRoute verifica que el usuario tenga el rol correcto;
 * si no, redirige a /login.
 * Layout provee la barra lateral, el header y el área de contenido.
 */
export default function App() {
  return (
    <Routes>
      {/* Página de login — pública, sin Layout ni ProtectedRoute */}
      <Route path="/login" element={<Login />} />

      {/* Raíz — redirige automáticamente según el rol del usuario */}
      <Route path="/" element={<RoleRedirect />} />

      {/* ------------------------------------------------------------------ */}
      {/* RUTAS DEL PADRE DE FAMILIA                                          */}
      {/* ------------------------------------------------------------------ */}

      {/* Dashboard principal del padre con resumen general */}
      <Route path="/padre" element={<ProtectedRoute roles={['padre']}><Layout><PadreDashboard /></Layout></ProtectedRoute>} />
      {/* Lista de cursos en los que está matriculado el alumno */}
      <Route path="/padre/cursos" element={<ProtectedRoute roles={['padre']}><Layout><PadreCursos /></Layout></ProtectedRoute>} />
      {/* Detalle de un curso específico: notas, avances, docente */}
      <Route path="/padre/cursos/:id" element={<ProtectedRoute roles={['padre']}><Layout><PadreCursoDetalle /></Layout></ProtectedRoute>} />
      {/* /padre/notas redirige a /padre/cursos — las notas están integradas en el detalle del curso */}
      <Route path="/padre/notas" element={<Navigate to="/padre/cursos" replace />} />
      {/* Calendario de asistencia del alumno */}
      <Route path="/padre/asistencia" element={<ProtectedRoute roles={['padre']}><Layout><PadreAsistencia /></Layout></ProtectedRoute>} />
      {/* Estado de pagos de mensualidades con opción de descargar comprobante PDF */}
      <Route path="/padre/mensualidades" element={<ProtectedRoute roles={['padre']}><Layout><PadreMensualidades /></Layout></ProtectedRoute>} />
      {/* Comunicados y avisos enviados al grado o al alumno */}
      <Route path="/padre/comunicados" element={<ProtectedRoute roles={['padre']}><Layout><PadreComunicados /></Layout></ProtectedRoute>} />
      {/* Avances diarios publicados por los docentes del alumno */}
      <Route path="/padre/avances" element={<ProtectedRoute roles={['padre']}><Layout><PadreAvances /></Layout></ProtectedRoute>} />

      {/* ------------------------------------------------------------------ */}
      {/* RUTAS DEL DOCENTE                                                   */}
      {/* ------------------------------------------------------------------ */}

      {/* Dashboard del docente con resumen de sus cursos y actividad reciente */}
      <Route path="/docente" element={<ProtectedRoute roles={['docente']}><Layout><DocenteDashboard /></Layout></ProtectedRoute>} />
      {/* Lista de cursos asignados al docente */}
      <Route path="/docente/cursos" element={<ProtectedRoute roles={['docente']}><Layout><DocenteCursos /></Layout></ProtectedRoute>} />
      {/* Ingreso de calificaciones para un curso específico (por id de teacher_course) */}
      <Route path="/docente/cursos/:id" element={<ProtectedRoute roles={['docente']}><Layout><DocenteGradeEntry /></Layout></ProtectedRoute>} />
      {/* Registro de asistencia de los alumnos (con escáner QR integrado) */}
      <Route path="/docente/asistencia" element={<ProtectedRoute roles={['docente']}><Layout><DocenteAttendance /></Layout></ProtectedRoute>} />
      {/* Lista de comunicados enviados y recibidos por el docente */}
      <Route path="/docente/comunicados" element={<ProtectedRoute roles={['docente']}><Layout><DocenteComunicados /></Layout></ProtectedRoute>} />
      {/* Formulario para redactar un nuevo comunicado */}
      <Route path="/docente/comunicados/nuevo" element={<ProtectedRoute roles={['docente']}><Layout><DocenteComunicadoForm /></Layout></ProtectedRoute>} />
      {/* Lista de avances diarios publicados por el docente */}
      <Route path="/docente/avances" element={<ProtectedRoute roles={['docente']}><Layout><DocenteAvances /></Layout></ProtectedRoute>} />
      {/* Formulario para crear un nuevo avance (con opción de subir foto a R2) */}
      <Route path="/docente/avances/nuevo" element={<ProtectedRoute roles={['docente']}><Layout><DocenteAvanceForm /></Layout></ProtectedRoute>} />
      {/* Formulario de edición de un avance existente */}
      <Route path="/docente/avances/:id/editar" element={<ProtectedRoute roles={['docente']}><Layout><DocenteAvanceEdit /></Layout></ProtectedRoute>} />
      {/* Informes de asistencia y rendimiento para el docente */}
      <Route path="/docente/informes" element={<ProtectedRoute roles={['docente']}><Layout><Informes /></Layout></ProtectedRoute>} />

      {/* ------------------------------------------------------------------ */}
      {/* RUTAS DEL AUXILIAR                                                  */}
      {/* ------------------------------------------------------------------ */}

      {/* Dashboard del auxiliar */}
      <Route path="/auxiliar" element={<ProtectedRoute roles={['auxiliar']}><Layout><AuxiliarDashboard /></Layout></ProtectedRoute>} />
      {/* Registro de asistencia masiva (el auxiliar controla entrada/salida de todos los alumnos) */}
      <Route path="/auxiliar/asistencia" element={<ProtectedRoute roles={['auxiliar']}><Layout><AuxiliarAsistencia /></Layout></ProtectedRoute>} />
      {/* El auxiliar usa el mismo componente de comunicados que el docente */}
      <Route path="/auxiliar/comunicados" element={<ProtectedRoute roles={['auxiliar']}><Layout><DocenteComunicados /></Layout></ProtectedRoute>} />
      {/* El auxiliar usa el mismo formulario de comunicados que el docente */}
      <Route path="/auxiliar/comunicados/nuevo" element={<ProtectedRoute roles={['auxiliar']}><Layout><DocenteComunicadoForm /></Layout></ProtectedRoute>} />
      {/* Informes de asistencia accesibles para el auxiliar */}
      <Route path="/auxiliar/informes" element={<ProtectedRoute roles={['auxiliar']}><Layout><Informes /></Layout></ProtectedRoute>} />

      {/* ------------------------------------------------------------------ */}
      {/* RUTAS DE ADMINISTRACIÓN (admin, director, secretaria)               */}
      {/* ------------------------------------------------------------------ */}

      {/* Dashboard administrativo con KPIs generales del colegio */}
      <Route path="/admin" element={<ProtectedRoute roles={['admin', 'director', 'secretaria']}><Layout><AdminDashboard /></Layout></ProtectedRoute>} />
      {/* Gestión de usuarios: docentes, padres, auxiliares, admin */}
      <Route path="/admin/usuarios" element={<ProtectedRoute roles={['admin', 'director', 'secretaria']}><Layout><AdminUsuarios /></Layout></ProtectedRoute>} />
      {/* Gestión de grados y secciones con asignación de tutor y color */}
      <Route path="/admin/grados" element={<ProtectedRoute roles={['admin', 'director', 'secretaria']}><Layout><AdminGrados /></Layout></ProtectedRoute>} />
      {/* Gestión del padrón de alumnos */}
      {/* Gestión de cursos del plan de estudios */}
      <Route path="/admin/cursos" element={<ProtectedRoute roles={['admin', 'director', 'secretaria']}><Layout><AdminCursos /></Layout></ProtectedRoute>} />
      {/* Asignación de docentes a cursos y grados */}
      <Route path="/admin/asignaciones" element={<ProtectedRoute roles={['admin', 'director', 'secretaria']}><Layout><AdminAsignaciones /></Layout></ProtectedRoute>} />
      {/* Control de pagos de mensualidades de todos los alumnos */}
      <Route path="/admin/pagos" element={<ProtectedRoute roles={['admin', 'director', 'secretaria']}><Layout><AdminPagos /></Layout></ProtectedRoute>} />
      {/* Gestión de comunicados de dirección, por grado y por curso */}
      <Route path="/admin/comunicados" element={<ProtectedRoute roles={['admin', 'director', 'secretaria']}><Layout><AdminComunicados /></Layout></ProtectedRoute>} />
      {/* Informes y reportes de asistencia e historial del colegio */}
      <Route path="/admin/informes" element={<ProtectedRoute roles={['admin', 'director', 'secretaria']}><Layout><Informes /></Layout></ProtectedRoute>} />
      {/* Vista de asistencia general para el administrador (reutiliza el componente del auxiliar) */}
      <Route path="/admin/asistencia" element={<ProtectedRoute roles={['admin', 'director', 'secretaria']}><Layout><AuxiliarAsistencia /></Layout></ProtectedRoute>} />
      {/* Panel de estado y configuración de la integración con WhatsApp */}
      <Route path="/admin/whatsapp" element={<ProtectedRoute roles={['admin', 'director', 'secretaria']}><Layout><AdminWhatsapp /></Layout></ProtectedRoute>} />
      <Route path="/admin/horarios" element={<ProtectedRoute roles={['admin', 'director', 'secretaria']}><Layout><AdminHorarios /></Layout></ProtectedRoute>} />

      {/* ------------------------------------------------------------------ */}
      {/* FALLBACK — cualquier ruta no definida redirige según el rol         */}
      {/* ------------------------------------------------------------------ */}
      <Route path="/notif" element={<NotifRedirect />} />
      <Route path="*" element={<RoleRedirect />} />
    </Routes>
  );
}
