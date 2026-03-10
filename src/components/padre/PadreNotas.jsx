import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function PadreNotas() {
  const [grades, setGrades] = useState([]);
  const [mesActualPagado, setMesActualPagado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPayModal, setShowPayModal] = useState(false);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([api.get('/grades'), api.get('/dashboard/padre')]).then(([g, d]) => {
      setGrades(g);
      setMesActualPagado(d?.stats?.mesActualPagado ?? false);
      setLoading(false);
    }).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load(true));

  if (loading) return <div className="loading">Cargando...</div>;

  // Group grades by course
  const byCourse = {};
  grades.forEach(g => {
    if (!byCourse[g.course_name]) byCourse[g.course_name] = { color: g.color, grades: {} };
    byCourse[g.course_name].grades[g.evaluation_name] = Number(g.score);
  });

  const rows = Object.entries(byCourse).map(([name, data]) => {
    const g = data.grades;
    const scores = ['N1', 'N2', 'N3'].map(n => g[n]);
    const valid = scores.filter(s => s != null);
    const prom = valid.length ? (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1) : '-';
    return { name, n1: g.N1, n2: g.N2, n3: g.N3, prom };
  });

  const allScores = rows.filter(r => r.prom !== '-').map(r => parseFloat(r.prom));
  const promedioGeneral = allScores.length ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1) : '-';

  const scoreColor = (v) => {
    if (v == null) return 'var(--text-muted)';
    return v >= 15 ? 'var(--success)' : v >= 11 ? 'var(--warning)' : 'var(--danger)';
  };

  const handleEyeClick = () => {
    if (!mesActualPagado) setShowPayModal(true);
  };

  const EyeCell = ({ value, color }) => (
    <span
      style={{ textAlign: 'center', cursor: mesActualPagado ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={handleEyeClick}
    >
      {mesActualPagado
        ? <span style={{ fontWeight: 700, color }}>{value ?? '-'}</span>
        : <Icon name="eye" color="var(--text-muted)" size={14} />
      }
    </span>
  );

  return (
    <div>
      <div className="page-header">
        <h1>Notas</h1>
        <p>Calificaciones del periodo</p>
      </div>
      <div className="content-area">
        {/* Promedio General */}
        <div
          style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)', borderRadius: 18, padding: 20, marginBottom: 16, color: 'white', textAlign: 'center', cursor: mesActualPagado ? 'default' : 'pointer' }}
          onClick={handleEyeClick}
        >
          <p style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Promedio General</p>
          {mesActualPagado
            ? <p style={{ fontSize: 36, fontWeight: 800 }}>{promedioGeneral}</p>
            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Icon name="eye" color="white" size={24} />
              </div>
          }
        </div>

        {/* Table */}
        <div className="table-scroll">
        <div className="table-container">
          <div className="table-header" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
            {['Curso', 'N1', 'N2', 'N3', 'Prom'].map(h => (
              <span key={h} style={{ textAlign: h === 'Curso' ? 'left' : 'center' }}>{h}</span>
            ))}
          </div>
          {rows.map((n, i) => (
            <div key={i} className="table-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{n.name}</span>
              <EyeCell value={n.n1} color={scoreColor(n.n1)} />
              <EyeCell value={n.n2} color={scoreColor(n.n2)} />
              <EyeCell value={n.n3} color={scoreColor(n.n3)} />
              <EyeCell value={n.prom} color="var(--primary)" />
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* Payment required modal */}
      {showPayModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={() => setShowPayModal(false)}
        >
          <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: 300, width: '100%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="lock" color="var(--danger)" size={24} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Mensualidad pendiente</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
              Aún no se ha pagado la mensualidad del mes actual. Por favor realiza el pago para ver las notas.
            </p>
            <button onClick={() => setShowPayModal(false)} className="btn btn-secondary" style={{ width: '100%' }}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
