import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';
import { usePushNotifications } from '../hooks/usePushNotifications';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  // loading is always false — user is trusted from localStorage immediately.
  // If token is expired, API calls will return 401 and client.js handles the redirect.
  const loading = false;
  usePushNotifications(user);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && user) {
      // Background refresh — update user data without blocking rendering
      api.get('/auth/me')
        .then(data => {
          setUser(data);
          localStorage.setItem('user', JSON.stringify(data));
        })
        .catch(() => {
          // api client already handles 401 (clears token + redirects to /login)
          // Don't clear on network/server errors — that would log out on bad wifi
        });
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

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
