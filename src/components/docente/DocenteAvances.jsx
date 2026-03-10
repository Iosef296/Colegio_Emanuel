import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import AvancesLista from '../common/AvancesLista';

export default function DocenteAvances() {
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get('/daily-progress').then(data => { setProgress(data); setLoading(false); }).catch(console.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load());

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Avances Diarios</h1>
            <p>Progreso de clases</p>
          </div>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }} onClick={() => navigate('/docente/avances/nuevo')}>
            + Nuevo
          </button>
        </div>
      </div>
      <div className="content-area">
        <AvancesLista avances={progress} onEdit={id => navigate(`/docente/avances/${id}/editar`)} />
      </div>
    </div>
  );
}
