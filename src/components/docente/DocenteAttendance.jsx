import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';

export default function DocenteAttendance() {
  const [students, setStudents] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/students'),
      api.get('/attendance'),
    ]).then(([studs, att]) => {
      setStudents(studs);
      const existing = {};
      att.forEach(a => {
        if (a.date === date) existing[a.student_id] = a.status;
      });
      setRecords(existing);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.get('/attendance').then(att => {
      const existing = {};
      att.forEach(a => {
        if (a.date === date) existing[a.student_id] = a.status;
      });
      setRecords(existing);
    }).catch(console.error);
  }, [date]);

  const toggleStatus = (studentId) => {
    const statuses = ['temprano', 'tarde', 'falta', 'justificado'];
    const current = records[studentId];
    const idx = statuses.indexOf(current);
    const next = statuses[(idx + 1) % statuses.length];
    setRecords(prev => ({ ...prev, [studentId]: next }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const bulk = Object.entries(records).map(([student_id, status]) => ({
        student_id: Number(student_id),
        date,
        status,
      }));
      await api.post('/attendance/bulk', { records: bulk });
      setMessage('Asistencia guardada correctamente');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const statusInfo = {
    temprano: { label: 'Temprano', color: 'var(--success)', bg: '#D1FAE5' },
    tarde: { label: 'Tarde', color: 'var(--warning)', bg: '#FEF3C7' },
    falta: { label: 'Falta', color: 'var(--danger)', bg: '#FEE2E2' },
    justificado: { label: 'Justificado', color: 'var(--primary)', bg: 'var(--primary-light)' },
  };

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Asistencia</h1>
        <p>Registro de asistencia diaria</p>
      </div>
      <div className="content-area">
        <div className="card" style={{ marginBottom: 16 }}>
          <label className="form-label">Fecha</label>
          <input
            type="date"
            className="form-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
          Toca en el estado para cambiar: Temprano → Tarde → Falta → Justificado
        </p>

        {message && (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13, fontWeight: 600 }}>
            {message}
          </div>
        )}

        {students.map(s => {
          const status = records[s.id] || 'temprano';
          const info = statusInfo[status];
          return (
            <div key={s.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="user" color="var(--text-muted)" size={18} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{s.first_name} {s.last_name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.grade_name}</p>
                </div>
              </div>
              <button
                onClick={() => toggleStatus(s.id)}
                style={{ padding: '6px 14px', borderRadius: 20, border: 'none', background: info.bg, color: info.color, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                {info.label}
              </button>
            </div>
          );
        })}

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
        >
          {saving ? 'Guardando...' : 'Guardar Asistencia'}
        </button>
      </div>
    </div>
  );
}
