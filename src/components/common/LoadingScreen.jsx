export default function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: 24,
      background: 'var(--bg)',
    }}>
      <img src="/logo-emanuel.png" alt="Colegio Emanuel" style={{ width: 140, height: 140, objectFit: 'contain' }} />
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Cargando...</p>
    </div>
  );
}
