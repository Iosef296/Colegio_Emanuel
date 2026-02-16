import { useState, useEffect } from 'react';
import { api } from '../../api/client';

export default function PadreComunicados() {
  const [comms, setComms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/communications').then(setComms).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Cargando...</div>;

  const formatDate = (d) => new Date(d).toLocaleDateString('es-PE');

  if (selected) {
    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div onClick={() => setSelected(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>← Volver</div>
            <h1>Comunicado</h1>
          </div>
        </div>
        <div className="content-area">
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 4 }}>
              <span className="badge badge-primary">{selected.course_name || 'General'}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(selected.created_at)}</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{selected.title}</h3>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14 }}>De: {selected.author_name}</p>
            <p style={{ fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word' }}>{selected.body}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Comunicados</h1>
        <p>Avisos y mensajes</p>
      </div>
      <div className="content-area">
        {comms.length === 0 ? (
          <div className="empty-state"><p>No hay comunicados</p></div>
        ) : comms.map(c => (
          <div key={c.id} className="card" style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => setSelected(c)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 4 }}>
              <span className="badge badge-primary">{c.course_name || 'General'}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatDate(c.created_at)}</span>
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{c.title}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>De: {c.author_name}</p>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
