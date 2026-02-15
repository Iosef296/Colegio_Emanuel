import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';

export default function PadreMensualidades() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/payments').then(setPayments).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Cargando...</div>;

  const total = payments.reduce((s, m) => s + (m.paid ? 0 : Number(m.amount)), 0);
  const pendingCount = payments.filter(m => !m.paid).length;

  const formatDate = (d) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString('es-PE');
  };

  return (
    <div>
      <div className="page-header">
        <h1>Mensualidades</h1>
        <p>Estado de pagos mensuales</p>
      </div>
      <div className="content-area">
        {/* Balance card */}
        <div style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', borderRadius: 18, padding: 20, marginBottom: 16, color: 'white' }}>
          <p style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Saldo pendiente</p>
          <p style={{ fontSize: 32, fontWeight: 800, marginBottom: 4 }}>S/ {total.toFixed(2)}</p>
          <p style={{ fontSize: 11, opacity: 0.7 }}>{pendingCount} meses pendientes</p>
        </div>

        {/* Payment list */}
        {payments.map((m, i) => (
          <div key={i} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: m.paid ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {m.paid ? <Icon name="check" color="var(--success)" size={20} /> : <Icon name="clock" color="var(--danger)" size={20} />}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700 }}>{m.month}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.paid ? `Pagado: ${formatDate(m.paid_date)}` : 'Pendiente'}</p>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: m.paid ? 'var(--success)' : 'var(--danger)' }}>S/ {Number(m.amount).toFixed(0)}</p>
              <p style={{ fontSize: 10, fontWeight: 600, color: m.paid ? 'var(--success)' : 'var(--danger)' }}>{m.paid ? 'PAGADO' : 'PENDIENTE'}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
