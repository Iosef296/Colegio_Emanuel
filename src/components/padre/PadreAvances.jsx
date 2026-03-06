import { useState, useEffect } from 'react';
import { api } from '../../api/client';

export default function PadreAvances() {
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    api.get('/daily-progress').then(setProgress).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Cargando...</div>;

  const formatDate = (d) => new Date(d).toLocaleDateString('es-PE');

  return (
    <div>
      <div className="page-header">
        <h1>Avances</h1>
        <p>Progreso diario de clases</p>
      </div>
      <div className="content-area">
        {progress.length === 0 ? (
          <div className="empty-state"><p>No hay avances registrados</p></div>
        ) : progress.map((a, i) => (
          <div key={i} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
              <span className="badge badge-primary">{a.course_name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(a.date)}</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word', marginBottom: a.photo_url ? 10 : 0 }}>{a.content}</p>
            {a.photo_url && (
              <img
                src={a.photo_url}
                alt="Foto de clase"
                onClick={() => setLightbox(a.photo_url)}
                style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
        >
          <img src={lightbox} alt="Foto" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
