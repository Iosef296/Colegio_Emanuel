import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import AvancesLista from '../common/AvancesLista';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function AdminCursos() {
  const [grades, setGrades] = useState([]);
  const [allProgress, setAllProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.get('/grade-levels'),
      api.get('/daily-progress'),
    ]).then(([gl, dp]) => {
      setGrades(gl);
      setAllProgress(dp);
      setLoading(false);
    }).catch(console.error);
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load(true));

  if (loading) return <div className="loading">Cargando...</div>;

  const numSort = (a, b) => {
    const n = s => parseInt((s.name || s.grade_name || '').match(/\d+/) || 0);
    return n(a) - n(b) || (a.name || '').localeCompare(b.name || '', 'es');
  };

  if (selected) {
    const avances = allProgress.filter(p => p.grade_level_id === selected.id);
    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div onClick={() => setSelected(null)} style={{ cursor: 'pointer', opacity: 0.8 }}>← Volver</div>
            <div>
              <h1>{selected.name}{selected.section ? ` "${selected.section}"` : ''}</h1>
              <p>{avances.length} avance{avances.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
        <div className="content-area">
          <AvancesLista avances={avances} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Avances por Grado</h1>
        <p>Vista de avances registrados por los docentes</p>
      </div>
      <div className="content-area">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'start' }}>
          {[...grades].sort(numSort).map(g => {
            const count = allProgress.filter(p => p.grade_level_id === g.id).length;
            return (
              <div key={g.id} className="card" style={{ cursor: 'pointer', padding: '14px 14px 12px' }}
                onClick={() => setSelected(g)}>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                  {g.name}{g.section ? ` "${g.section}"` : ''}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {count} avance{count !== 1 ? 's' : ''}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
