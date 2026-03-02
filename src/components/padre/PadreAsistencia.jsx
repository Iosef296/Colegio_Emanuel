import { useState, useEffect } from 'react';
import { api } from '../../api/client';

const MONTHS = [
  { label: 'Marzo', num: 3 },
  { label: 'Abril', num: 4 },
  { label: 'Mayo', num: 5 },
  { label: 'Junio', num: 6 },
  { label: 'Julio', num: 7 },
  { label: 'Agosto', num: 8 },
  { label: 'Septiembre', num: 9 },
  { label: 'Octubre', num: 10 },
  { label: 'Noviembre', num: 11 },
  { label: 'Diciembre', num: 12 },
];

export default function PadreAsistencia() {
  const [attendance, setAttendance] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(3);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/attendance?month=${selectedMonth}&year=${new Date().getFullYear()}`)
      .then(setAttendance)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  const statusColor = { temprano: 'var(--success)', tarde: 'var(--warning)', falta: 'var(--danger)', justificado: 'var(--primary)' };
  const statusLabel = { temprano: 'T', tarde: 'Td', falta: 'F', justificado: 'J' };

  // Build calendar data from attendance records
  const byDay = {};
  attendance.forEach(a => {
    const d = new Date(a.date);
    byDay[d.getDate()] = a.status;
  });

  const temprano = attendance.filter(a => a.status === 'temprano').length;
  const tarde = attendance.filter(a => a.status === 'tarde').length;
  const falta = attendance.filter(a => a.status === 'falta').length;

  // Generate weeks for the month
  const year = new Date().getFullYear();
  const daysInMonth = new Date(year, selectedMonth, 0).getDate();
  const weeks = [];
  let week = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, selectedMonth - 1, d).getDay();
    if (dow >= 1 && dow <= 5) { // Mon-Fri
      week.push(d);
      if (dow === 5 || d === daysInMonth) {
        weeks.push(week);
        week = [];
      }
    }
  }
  if (week.length > 0) weeks.push(week);

  return (
    <div>
      <div className="page-header">
        <h1>Asistencia</h1>
        <p>Control de asistencia diaria</p>
      </div>
      <div className="content-area">
        {/* Month selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
          {MONTHS.map(m => (
            <button
              key={m.num}
              onClick={() => { setLoading(true); setSelectedMonth(m.num); }}
              className={`btn btn-sm ${selectedMonth === m.num ? 'btn-primary' : 'btn-secondary'}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Summary */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Temprano', count: temprano, color: 'var(--success)', bg: '#D1FAE5' },
            { label: 'Tarde', count: tarde, color: 'var(--warning)', bg: '#FEF3C7' },
            { label: 'Falta', count: falta, color: 'var(--danger)', bg: '#FEE2E2' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, minWidth: 80, background: s.bg, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: s.color, marginBottom: 2 }}>{s.count}</p>
              <p style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {loading ? <div className="loading">Cargando...</div> : (
          <div className="card">
            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
              {MONTHS.find(m => m.num === selectedMonth)?.label}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 6 }}>
              {['L', 'M', 'Mi', 'J', 'V'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: 4 }}>{d}</div>
              ))}
            </div>
            {weeks.map((w, wi) => (
              <div key={wi}>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '8px 0 4px', fontWeight: 600 }}>Semana {wi + 1}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map(dow => {
                    const day = w.find(d => new Date(year, selectedMonth - 1, d).getDay() === dow);
                    if (!day) return <div key={dow} />;
                    const status = byDay[day];
                    return (
                      <div key={dow} style={{ textAlign: 'center', padding: '8px 0', borderRadius: 10, background: status ? statusColor[status] + '20' : 'var(--bg)', border: status ? `2px solid ${statusColor[status]}` : '1px solid var(--border)' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: status ? statusColor[status] : 'var(--text-muted)' }}>{day}</p>
                        {status && <p style={{ fontSize: 8, fontWeight: 700, color: statusColor[status], marginTop: 1 }}>{statusLabel[status]}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
