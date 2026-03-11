import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function AdminPagos() {
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGrade, setSelectedGrade] = useState(null); // { grade_level_id, grade_name, section }
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ student_id: '', month: '', year: String(new Date().getFullYear()), amount: '350' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([api.get('/payments'), api.get('/students')])
      .then(([p, s]) => { setPayments(p); setStudents(s); setLoading(false); })
      .catch(console.error);
  };

  useEffect(load, []);
  useAutoRefresh(() => load(true));

  const handleTogglePaid = async (p) => {
    setTogglingId(p.id);
    try {
      await api.put(`/payments/${p.id}`, {
        paid: !p.paid,
        paid_date: p.paid ? null : new Date().toISOString().split('T')[0],
      });
      load();
    } catch (err) { console.error(err); }
    finally { setTogglingId(null); }
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
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('es-PE') : null;

  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const currentMonth = MONTHS[new Date().getMonth()];
  const currentYear = new Date().getFullYear();

  // Build grade groups from students
  const gradeMap = {};
  students.forEach(s => {
    const key = s.grade_level_id;
    if (!gradeMap[key]) gradeMap[key] = { grade_level_id: key, grade_name: s.grade_name, section: s.section, students: [] };
    gradeMap[key].students.push(s);
  });
  const grades = Object.values(gradeMap).sort((a, b) => a.grade_name.localeCompare(b.grade_name));

  // Pending per grade
  const pendingByGrade = (gradeId) => {
    const ids = (gradeMap[gradeId]?.students || []).map(s => s.id);
    return payments.filter(p => !p.paid && ids.includes(p.student_id)).reduce((s, p) => s + Number(p.amount), 0);
  };

  // Pending per student
  const pendingByStudent = (studentId) =>
    payments.filter(p => !p.paid && p.student_id === studentId).reduce((s, p) => s + Number(p.amount), 0);

  // Payments of selected student
  const studentPayments = selectedStudent
    ? payments.filter(p => p.student_id === selectedStudent.id)
    : [];

  if (loading) return <div className="loading">Cargando...</div>;

  // ── VIEW 3: Student payments ──
  if (selectedStudent) {
    const pending = pendingByStudent(selectedStudent.id);
    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div onClick={() => setSelectedStudent(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>←</div>
            <div>
              <h1>{selectedStudent.first_name} {selectedStudent.last_name}</h1>
              <p>{selectedGrade.grade_name} "{selectedGrade.section}"</p>
            </div>
          </div>
        </div>
        <div className="content-area">
          <div style={{ background: pending > 0 ? 'linear-gradient(135deg,#EF4444,#DC2626)' : 'linear-gradient(135deg,#10B981,#059669)', borderRadius: 16, padding: 18, marginBottom: 16, color: 'white' }}>
            <p style={{ fontSize: 11, opacity: 0.85, marginBottom: 2 }}>Deuda pendiente</p>
            <p style={{ fontSize: 26, fontWeight: 800 }}>S/ {pending.toFixed(2)}</p>
          </div>

          {studentPayments.length === 0 && <div className="empty-state"><p>Sin pagos registrados</p></div>}

          {studentPayments.map(p => (
            <div key={p.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: p.paid ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.paid ? <Icon name="check" color="var(--success)" size={18} /> : <Icon name="clock" color="var(--danger)" size={18} />}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700 }}>{p.month} {p.year}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.paid ? `Pagado: ${formatDate(p.paid_date)}` : 'Pendiente'}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: p.paid ? 'var(--success)' : 'var(--danger)' }}>S/ {Number(p.amount).toFixed(0)}</p>
                <button onClick={() => handleTogglePaid(p)} disabled={togglingId === p.id}
                  className={`btn btn-sm ${p.paid ? 'btn-secondary' : 'btn-success'}`}
                  style={{ fontSize: 10, padding: '4px 10px' }}>
                  {togglingId === p.id ? '...' : p.paid ? 'Anular' : 'Pagar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── VIEW 2: Students in grade ──
  if (selectedGrade) {
    const gradeStudents = gradeMap[selectedGrade.grade_level_id]?.students || [];
    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div onClick={() => setSelectedGrade(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>←</div>
              <div>
                <h1>{selectedGrade.grade_name}</h1>
                <p>Sección "{selectedGrade.section}"</p>
              </div>
            </div>
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }} onClick={() => setShowForm(true)}>
              + Pago
            </button>
          </div>
        </div>
        <div className="content-area">
          {gradeStudents.map(s => {
            const paidThisMonth = payments.some(p => p.student_id === s.id && p.paid && p.month === currentMonth && p.year === currentYear);
            return (
              <div key={s.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 8 }}
                onClick={() => setSelectedStudent(s)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: paidThisMonth ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="user" color={paidThisMonth ? 'var(--success)' : 'var(--danger)'} size={18} />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700 }}>{s.first_name} {s.last_name}</p>
                    <span style={{ fontSize: 11, fontWeight: 600, background: paidThisMonth ? '#D1FAE5' : '#FEE2E2', color: paidThisMonth ? '#16A34A' : '#DC2626', borderRadius: 6, padding: '2px 7px' }}>
                      {currentMonth} {currentYear}: {paidThisMonth ? 'Pagado' : 'Pendiente'}
                    </span>
                  </div>
                </div>
                <Icon name="back" color="var(--text-muted)" size={18} style={{ transform: 'rotate(180deg)' }} />
              </div>
            );
          })}
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
                    {gradeStudents.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Mes</label>
                  <select className="form-select" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {['Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map(m => (
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
                  <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Guardando...' : 'Crear'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── VIEW 1: Grades list ──
  return (
    <div>
      <div className="page-header">
        <h1>Pagos</h1>
        <p>Gestión de mensualidades</p>
      </div>
      <div className="content-area">
        {/* Summary per student */}

        {grades.map(g => {
          const total = (gradeMap[g.grade_level_id]?.students || []).length;
          const deudores = (gradeMap[g.grade_level_id]?.students || []).filter(s =>
            !payments.some(p => p.student_id === s.id && p.paid && p.month === currentMonth && p.year === currentYear)
          ).length;
          return (
            <div key={g.grade_level_id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 8 }}
              onClick={() => setSelectedGrade(g)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: deudores > 0 ? '#FEE2E2' : '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="users" color={deudores > 0 ? 'var(--danger)' : 'var(--success)'} size={20} />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700 }}>{g.grade_name} "{g.section}"</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {total} alumnos · {deudores > 0 ? `${deudores} con deuda` : 'todos al día'}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Icon name="back" color="var(--text-muted)" size={18} style={{ transform: 'rotate(180deg)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
