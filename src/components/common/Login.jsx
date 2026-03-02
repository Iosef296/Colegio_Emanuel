import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
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

        <form className="login-form" onSubmit={handleSubmit}>
          <h3>Iniciar Sesión</h3>

          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label className="form-label">Usuario</label>
            <input
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="usuario"
              required
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
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
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
        </form>
      </div>
    </div>
  );
}
