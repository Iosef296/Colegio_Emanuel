import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

export default function DocenteComunicados() {
  const [comms, setComms] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/communications').then(setComms).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Cargando...</div>;

  const formatDate = (d) => new Date(d).toLocaleDateString('es-PE');

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Comunicados</h1>
            <p>Mis comunicados</p>
          </div>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }} onClick={() => navigate('/docente/comunicados/nuevo')}>
            + Nuevo
          </button>
        </div>
      </div>
      <div className="content-area">
        {comms.length === 0 ? (
          <div className="empty-state"><p>No hay comunicados</p></div>
        ) : comms.map(c => (
          <div key={c.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 4 }}>
              <span className="badge badge-primary">{c.course_name || 'General'}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatDate(c.created_at)}</span>
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{c.title}</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
