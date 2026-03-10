import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { jsPDF } from 'jspdf';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

function downloadReceipt(payment) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const w = doc.internal.pageSize.getWidth();

  // Header bar
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, w, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('COLEGIO EMANUEL', w / 2, 12, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('RECIBO DE PAGO', w / 2, 21, { align: 'center' });

  // Body
  doc.setTextColor(30, 30, 30);
  let y = 40;

  const line = (label, value, bold = false) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(label, 14, y);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(String(value), 60, y);
    y += 9;
  };

  const fullName = `${payment.first_name || ''} ${payment.last_name || ''}`.trim() || 'Estudiante';
  line('Estudiante:', fullName);
  line('Mes:', payment.month);
  line('Año:', String(payment.year));
  line('Monto:', `S/ ${Number(payment.amount).toFixed(2)}`, true);
  line('Fecha de pago:', payment.paid_date ? new Date(payment.paid_date).toLocaleDateString('es-PE') : '-');
  line('Estado:', 'PAGADO ✓', true);

  // Divider
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, w - 14, y);
  y += 8;

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text('Este documento es un comprobante de pago válido emitido por el Colegio Emanuel.', w / 2, y, { align: 'center', maxWidth: w - 28 });

  doc.save(`recibo-${payment.month}-${payment.year}.pdf`);
}

export default function PadreMensualidades() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((silent = false) => {
    api.get('/payments').then(data => { setPayments(data); setLoading(false); }).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load(true));

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
          <p style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>S/ {total.toFixed(2)}</p>
          <p style={{ fontSize: 11, opacity: 0.7 }}>{pendingCount} meses pendientes</p>
        </div>

        {/* Payment list */}
        {payments.map((m, i) => (
          <div key={i} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: m.paid ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {m.paid ? <Icon name="check" color="var(--success)" size={20} /> : <Icon name="clock" color="var(--danger)" size={20} />}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700 }}>{m.month}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.paid ? `Pagado: ${formatDate(m.paid_date)}` : 'Pendiente'}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: m.paid ? 'var(--success)' : 'var(--danger)' }}>S/ {Number(m.amount).toFixed(0)}</p>
                <p style={{ fontSize: 10, fontWeight: 600, color: m.paid ? 'var(--success)' : 'var(--danger)' }}>{m.paid ? 'PAGADO' : 'PENDIENTE'}</p>
              </div>
              {m.paid && (
                <button
                  onClick={() => downloadReceipt(m)}
                  title="Descargar recibo"
                  style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: '#EFF6FF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="download" color="#3B82F6" size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
