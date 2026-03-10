import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  // Already logged in (e.g. duplicate tab) → go straight to dashboard
  if (user) return <Navigate to={`/${user.role}`} replace />;

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username, password);
      navigate(`/${user.role}`);
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/logo.png" alt="Colegio Emanuel" style={{ width: 160, marginBottom: 8 }} />

        <div className="login-form">
          <h3>Iniciar Sesión</h3>

          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label className="form-label">Usuario</label>
            <input
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="usuario"
              autoComplete="username"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={handleSubmit}
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>

          {import.meta.env.DEV && (
            <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '0 8px' }}>
              <p><strong>Cuentas de prueba:</strong></p>
              <p>admin / admin123</p>
              <p>garcia.maria / admin123</p>
              <p>quispe.pedro / admin123</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
