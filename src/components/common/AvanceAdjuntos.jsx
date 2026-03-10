import { useState } from 'react';
import Icon from './Icon';

const isPdf = (url) => url.toLowerCase().endsWith('.pdf');

// Normalize legacy photo_url (string) or new attachments (JSON array string) into a URL array
export function getAdjuntos(avance) {
  if (avance.attachments) {
    try { return JSON.parse(avance.attachments); } catch { return []; }
  }
  return avance.photo_url ? [avance.photo_url] : [];
}

export default function AvanceAdjuntos({ avance }) {
  const [lightbox, setLightbox] = useState(null);
  const adjuntos = getAdjuntos(avance);
  if (!adjuntos.length) return null;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {adjuntos.map((url, i) => (
          isPdf(url) ? (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8, textDecoration: 'none', color: 'var(--primary)', fontSize: 13 }}>
              <Icon name="pdf" color="var(--primary)" size={16} />
              <span style={{ flex: 1 }}>Documento PDF</span>
              <Icon name="download" color="var(--primary)" size={14} />
            </a>
          ) : (
            <img key={i} src={url} alt="Adjunto" onClick={() => setLightbox(url)}
              style={{ width: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 8, cursor: 'pointer', background: '#f0f0f0' }} />
          )
        ))}
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <img src={lightbox} alt="Foto" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}
