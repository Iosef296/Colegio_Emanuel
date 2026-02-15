import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './components/common/Login';
import Layout from './components/common/Layout';
import ProtectedRoute from './components/common/ProtectedRoute';

// Padre
import PadreDashboard from './components/padre/PadreDashboard';
import PadreCursos from './components/padre/PadreCursos';
import PadreCursoDetalle from './components/padre/PadreCursoDetalle';
import PadreNotas from './components/padre/PadreNotas';
import PadreAsistencia from './components/padre/PadreAsistencia';
import PadreMensualidades from './components/padre/PadreMensualidades';
import PadreComunicados from './components/padre/PadreComunicados';
import PadreAvances from './components/padre/PadreAvances';

// Docente
import DocenteDashboard from './components/docente/DocenteDashboard';
import DocenteCursos from './components/docente/DocenteCursos';
import DocenteGradeEntry from './components/docente/DocenteGradeEntry';
import DocenteAttendance from './components/docente/DocenteAttendance';
import DocenteComunicados from './components/docente/DocenteComunicados';
import DocenteComunicadoForm from './components/docente/DocenteComunicadoForm';
import DocenteAvances from './components/docente/DocenteAvances';
import DocenteAvanceForm from './components/docente/DocenteAvanceForm';

// Admin
import AdminDashboard from './components/admin/AdminDashboard';
import AdminUsuarios from './components/admin/AdminUsuarios';
import AdminAlumnos from './components/admin/AdminAlumnos';
import AdminCursos from './components/admin/AdminCursos';
import AdminAsignaciones from './components/admin/AdminAsignaciones';
import AdminPagos from './components/admin/AdminPagos';

function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/${user.role}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RoleRedirect />} />

      {/* Padre routes */}
      <Route path="/padre" element={<ProtectedRoute roles={['padre']}><Layout><PadreDashboard /></Layout></ProtectedRoute>} />
      <Route path="/padre/cursos" element={<ProtectedRoute roles={['padre']}><Layout><PadreCursos /></Layout></ProtectedRoute>} />
      <Route path="/padre/cursos/:id" element={<ProtectedRoute roles={['padre']}><Layout><PadreCursoDetalle /></Layout></ProtectedRoute>} />
      <Route path="/padre/notas" element={<ProtectedRoute roles={['padre']}><Layout><PadreNotas /></Layout></ProtectedRoute>} />
      <Route path="/padre/asistencia" element={<ProtectedRoute roles={['padre']}><Layout><PadreAsistencia /></Layout></ProtectedRoute>} />
      <Route path="/padre/mensualidades" element={<ProtectedRoute roles={['padre']}><Layout><PadreMensualidades /></Layout></ProtectedRoute>} />
      <Route path="/padre/comunicados" element={<ProtectedRoute roles={['padre']}><Layout><PadreComunicados /></Layout></ProtectedRoute>} />
      <Route path="/padre/avances" element={<ProtectedRoute roles={['padre']}><Layout><PadreAvances /></Layout></ProtectedRoute>} />

      {/* Docente routes */}
      <Route path="/docente" element={<ProtectedRoute roles={['docente']}><Layout><DocenteDashboard /></Layout></ProtectedRoute>} />
      <Route path="/docente/cursos" element={<ProtectedRoute roles={['docente']}><Layout><DocenteCursos /></Layout></ProtectedRoute>} />
      <Route path="/docente/cursos/:id" element={<ProtectedRoute roles={['docente']}><Layout><DocenteGradeEntry /></Layout></ProtectedRoute>} />
      <Route path="/docente/asistencia" element={<ProtectedRoute roles={['docente']}><Layout><DocenteAttendance /></Layout></ProtectedRoute>} />
      <Route path="/docente/comunicados" element={<ProtectedRoute roles={['docente']}><Layout><DocenteComunicados /></Layout></ProtectedRoute>} />
      <Route path="/docente/comunicados/nuevo" element={<ProtectedRoute roles={['docente']}><Layout><DocenteComunicadoForm /></Layout></ProtectedRoute>} />
      <Route path="/docente/avances" element={<ProtectedRoute roles={['docente']}><Layout><DocenteAvances /></Layout></ProtectedRoute>} />
      <Route path="/docente/avances/nuevo" element={<ProtectedRoute roles={['docente']}><Layout><DocenteAvanceForm /></Layout></ProtectedRoute>} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Layout><AdminDashboard /></Layout></ProtectedRoute>} />
      <Route path="/admin/usuarios" element={<ProtectedRoute roles={['admin']}><Layout><AdminUsuarios /></Layout></ProtectedRoute>} />
      <Route path="/admin/alumnos" element={<ProtectedRoute roles={['admin']}><Layout><AdminAlumnos /></Layout></ProtectedRoute>} />
      <Route path="/admin/cursos" element={<ProtectedRoute roles={['admin']}><Layout><AdminCursos /></Layout></ProtectedRoute>} />
      <Route path="/admin/asignaciones" element={<ProtectedRoute roles={['admin']}><Layout><AdminAsignaciones /></Layout></ProtectedRoute>} />
      <Route path="/admin/pagos" element={<ProtectedRoute roles={['admin']}><Layout><AdminPagos /></Layout></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<RoleRedirect />} />
    </Routes>
  );
}
