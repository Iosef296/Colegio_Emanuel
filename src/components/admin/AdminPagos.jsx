import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';

export default function AdminPagos() {
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ student_id: '', month: '', year: '2026', amount: '350' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    Promise.all([
      api.get('/payments'),
      api.get('/students'),
    ]).then(([p, s]) => {
      setPayments(p);
      setStudents(s);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleTogglePaid = async (p) => {
    try {
      await api.put(`/payments/${p.id}`, {
        paid: p.paid ? 0 : 1,
        paid_date: p.paid ? null : new Date().toISOString().split('T')[0],
      });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/payments', {
        student_id: Number(form.student_id),
        month: form.month,
        year: Number(form.year),
        amount: Number(form.amount),
      });
      setMessage('Pago creado');
      load();
      setTimeout(() => { setShowForm(false); setMessage(''); }, 1000);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('es-PE') : null;

  const totalPending = payments.filter(p => !p.paid).reduce((s, p) => s + Number(p.amount), 0);

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Pagos</h1>
            <p>Gestión de mensualidades</p>
          </div>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }} onClick={() => setShowForm(true)}>
            + Nuevo
          </button>
        </div>
      </div>
      <div className="content-area">
        {/* Summary */}
        <div style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', borderRadius: 18, padding: 20, marginBottom: 16, color: 'white' }}>
          <p style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Total pendiente de cobro</p>
          <p style={{ fontSize: 28, fontWeight: 800 }}>S/ {totalPending.toFixed(2)}</p>
          <p style={{ fontSize: 11, opacity: 0.7 }}>{payments.filter(p => !p.paid).length} pagos pendientes</p>
        </div>

        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3>Nuevo Pago</h3>
              {message && <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13 }}>{message}</div>}
              <form onSubmit={handleCreate}>
                <div className="form-group">
                  <label className="form-label">Alumno</label>
                  <select className="form-select" value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Mes</label>
                  <select className="form-select" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {['Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Año</label>
                  <input className="form-input" type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Monto (S/)</label>
                  <input className="form-input" type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                    {saving ? 'Guardando...' : 'Crear'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Payment list */}
        {payments.map(p => (
          <div key={p.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: p.paid ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {p.paid ? <Icon name="check" color="var(--success)" size={20} /> : <Icon name="clock" color="var(--danger)" size={20} />}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{p.first_name} {p.last_name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {p.month} {p.year} {p.paid ? `· Pagado: ${formatDate(p.paid_date)}` : '· Pendiente'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: p.paid ? 'var(--success)' : 'var(--danger)' }}>S/ {Number(p.amount).toFixed(0)}</p>
              </div>
              <button
                onClick={() => handleTogglePaid(p)}
                className={`btn btn-sm ${p.paid ? 'btn-secondary' : 'btn-success'}`}
                style={{ fontSize: 10, padding: '4px 10px' }}
              >
                {p.paid ? 'Anular' : 'Pagar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
