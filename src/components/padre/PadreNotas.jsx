import { useState, useEffect } from 'react';
import { api } from '../../api/client';

export default function PadreNotas() {
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/grades').then(setGrades).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Cargando...</div>;

  // Group grades by course
  const byCourse = {};
  grades.forEach(g => {
    if (!byCourse[g.course_name]) byCourse[g.course_name] = { color: g.color, grades: {} };
    byCourse[g.course_name].grades[g.evaluation_name] = g.score;
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

  return (
    <div>
      <div className="page-header">
        <h1>Notas</h1>
        <p>Calificaciones del periodo</p>
      </div>
      <div className="content-area">
        {/* Promedio General */}
        <div style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)', borderRadius: 18, padding: 20, marginBottom: 16, color: 'white', textAlign: 'center' }}>
          <p style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Promedio General</p>
          <p style={{ fontSize: 40, fontWeight: 800 }}>{promedioGeneral}</p>
        </div>

        {/* Table */}
        <div className="table-container">
          <div className="table-header" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
            {['Curso', 'N1', 'N2', 'N3', 'Prom'].map(h => (
              <span key={h} style={{ textAlign: h === 'Curso' ? 'left' : 'center' }}>{h}</span>
            ))}
          </div>
          {rows.map((n, i) => (
            <div key={i} className="table-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{n.name}</span>
              {[n.n1, n.n2, n.n3].map((v, j) => (
                <span key={j} style={{ textAlign: 'center', fontWeight: 700, color: scoreColor(v) }}>{v ?? '-'}</span>
              ))}
              <span style={{ textAlign: 'center', fontWeight: 800, color: 'var(--primary)' }}>{n.prom}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
