import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import AvancesLista from '../common/AvancesLista';

export default function PadreAvances() {
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.get('/daily-progress').then(data => { setProgress(data); setLoading(false); }).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load());

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Avances</h1>
        <p>Progreso diario de clases</p>
      </div>
      <div className="content-area">
        <AvancesLista avances={progress} />
      </div>
    </div>
  );
}
