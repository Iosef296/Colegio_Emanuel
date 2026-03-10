import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

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

const statusColor = {
  temprano:    '#16A34A',
  tarde:       '#D97706',
  falta:       '#DC2626',
  justificado: '#2563EB',
};
const statusLabel = {
  temprano: 'Temprano', tarde: 'Tarde', falta: 'Falta', justificado: 'Justificado',
};

export default function PadreAsistencia() {
  const [attendance, setAttendance] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(3);
  const [loading, setLoading] = useState(true);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.get(`/attendance?month=${selectedMonth}&year=${new Date().getFullYear()}`)
      .then(data => { setAttendance(data); setLoading(false); }).catch(console.error);
  }, [selectedMonth]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load(true));

  // Group records: dateStr → { mañana: status, tarde: status }
  const byDate = {};
  attendance.forEach(a => {
    const dateStr = (typeof a.date === 'string' ? a.date : a.date.toISOString()).slice(0, 10);
    if (!byDate[dateStr]) byDate[dateStr] = {};
    byDate[dateStr][a.turno || 'mañana'] = a.status;
  });

  const temprano = attendance.filter(a => a.status === 'temprano').length;
  const tarde    = attendance.filter(a => a.status === 'tarde').length;
  const falta    = attendance.filter(a => a.status === 'falta').length;

  const year = new Date().getFullYear();
  const daysInMonth = new Date(year, selectedMonth, 0).getDate();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = d => `${year}-${pad(selectedMonth)}-${pad(d)}`;

  // Build weeks (Mon–Fri days), then attach Saturday/Sunday if they have records
  const weeks = [];
  let weekdays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, selectedMonth - 1, d).getDay(); // 0=Sun,6=Sat
    if (dow >= 1 && dow <= 5) {
      weekdays.push(d);
      if (dow === 5 || d === daysInMonth) {
        weeks.push({ days: [...weekdays], sat: null });
        weekdays = [];
      }
    }
  }
  if (weekdays.length > 0) weeks.push({ days: [...weekdays], sat: null });

  weeks.forEach(week => {
    const lastDay = Math.max(...week.days);
    const satDay = lastDay + 1;
    const sunDay = lastDay + 2;
    if (satDay <= daysInMonth && new Date(year, selectedMonth - 1, satDay).getDay() === 6) {
      if (byDate[dateStr(satDay)]) week.sat = satDay;
    }
    if (sunDay <= daysInMonth && new Date(year, selectedMonth - 1, sunDay).getDay() === 0) {
      if (byDate[dateStr(sunDay)]) week.sun = sunDay;
    }
  });

  const hasSat   = weeks.some(w => w.sat);
  const hasSun   = weeks.some(w => w.sun);
  const colCount = 5 + (hasSat ? 1 : 0) + (hasSun ? 1 : 0);
  const headers  = ['L', 'M', 'Mi', 'J', 'V', ...(hasSat ? ['S'] : []), ...(hasSun ? ['D'] : [])];
  const dowList  = [1, 2, 3, 4, 5, ...(hasSat ? [6] : []), ...(hasSun ? [0] : [])];

  const hasTardeAny = Object.values(byDate).some(r => r['tarde']);

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
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Temprano', count: temprano, color: 'var(--success)', bg: '#D1FAE5' },
            { label: 'Tardanzas', count: tarde,   color: 'var(--warning)', bg: '#FEF3C7' },
            { label: 'Faltas',    count: falta,   color: 'var(--danger)',  bg: '#FEE2E2' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, background: s.bg, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: s.color, marginBottom: 2 }}>{s.count}</p>
              <p style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {loading ? <div className="loading">Cargando...</div> : (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{MONTHS.find(m => m.num === selectedMonth)?.label}</h4>
              {[
                { st: 'temprano', count: temprano, color: statusColor.temprano },
                { st: 'tarde',    count: tarde,    color: statusColor.tarde },
                { st: 'falta',    count: falta,    color: statusColor.falta },
              ].filter(s => s.count > 0).map(s => (
                <span key={s.st} style={{ fontSize: 11, color: s.color, background: s.color + '18', borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>
                  {s.count} {s.st}
                </span>
              ))}
            </div>

            {hasTardeAny && (
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
                La barra inferior en cada día indica el turno tarde (T:)
              </p>
            )}

            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: 6, marginBottom: 6 }}>
              {headers.map(h => (
                <div key={h} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: 4 }}>
                  {h}
                </div>
              ))}
            </div>

            {weeks.map((week, wi) => {
              const wDays = dowList.map(dow => {
                if (dow === 6) return week.sat || null;
                if (dow === 0) return week.sun || null;
                return week.days.find(d => new Date(year, selectedMonth - 1, d).getDay() === dow) || null;
              });
              const wRecs = wDays.map(d => d ? byDate[dateStr(d)] : null);
              const wHasTarde = wRecs.some(r => r?.['tarde']);

              return (
                <div key={wi}>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '8px 0 4px', fontWeight: 600 }}>
                    Semana {wi + 1}
                  </p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                    {wDays.map((d, i) => {
                      if (!d) return <div key={i} style={{ flex: 1 }} />;
                      const rec = wRecs[i];
                      const numBox = (
                        <div style={{ border: '2px solid #1D4ED8', borderRadius: rec ? '10px 10px 0 0' : 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>{d}</span>
                        </div>
                      );
                      if (!rec) return <div key={i} style={{ flex: 1 }}>{numBox}</div>;
                      const man = rec['mañana'];
                      const tar = rec['tarde'];
                      if (man && tar) {
                        const mc = statusColor[man];
                        const tc = statusColor[tar];
                        return (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            {numBox}
                            <div style={{ background: mc + '25', borderLeft: `2px solid ${mc}`, borderRight: `2px solid ${mc}`, borderBottom: `2px solid ${mc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                              <span style={{ fontSize: 7, fontWeight: 700, color: mc, lineHeight: 1 }}>{`M: ${statusLabel[man]}`}</span>
                            </div>
                            <div style={{ background: tc + '25', borderLeft: `2px solid ${tc}`, borderRight: `2px solid ${tc}`, borderBottom: `2px solid ${tc}`, borderRadius: '0 0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                              <span style={{ fontSize: 7, fontWeight: 700, color: tc, lineHeight: 1 }}>{`T: ${statusLabel[tar]}`}</span>
                            </div>
                          </div>
                        );
                      }
                      const c = man ? statusColor[man] : statusColor[tar];
                      const label = man ? statusLabel[man] : statusLabel[tar];
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          {numBox}
                          <div style={{ flex: wHasTarde ? 1 : undefined, padding: wHasTarde ? undefined : '4px 0', background: c + '25', border: `2px solid ${c}`, borderTop: 'none', borderRadius: '0 0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 7, fontWeight: 700, color: c, lineHeight: 1 }}>{label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
