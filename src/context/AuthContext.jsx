import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';
import { usePushNotifications } from '../hooks/usePushNotifications';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // loading=true mientras se verifica el token al arrancar.
  // Así no se muestra ninguna página antes de confirmar la sesión.
  const [loading, setLoading] = useState(true);
  usePushNotifications(user);

  // Pedir permiso de notificaciones al abrir la app (antes del login).
  // Se hace aquí porque el bridge de Capacitor ya está listo cuando React monta.
  // Corre mientras loading=true, así el diálogo aparece antes de mostrar cualquier página.
  useEffect(() => {
    const isCapacitor = window.Capacitor?.isNativePlatform?.() === true;
    if (!isCapacitor) return;
    import('@capacitor/push-notifications').then(({ PushNotifications }) => {
      PushNotifications.requestPermissions().catch(() => {});
    });
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const saved = localStorage.getItem('user');
    if (token && saved) {
      // Verificar token con el servidor antes de mostrar la app.
      api.get('/auth/me')
        .then(data => {
          setUser(data);
          localStorage.setItem('user', JSON.stringify(data));
        })
        .catch(() => {
          // api client ya maneja el 401 (limpia token y redirige a /login)
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    // Sync auth state across tabs via storage events
    const handleStorage = (e) => {
      if (e.key === 'user') {
        setUser(e.newValue ? JSON.parse(e.newValue) : null);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const login = async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (changes) => {
    const updated = { ...user, ...changes };
    setUser(updated);
    localStorage.setItem('user', JSON.stringify(updated));
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
