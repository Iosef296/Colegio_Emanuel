import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../common/Icon';

export default function AuxiliarDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div>
      <div className="page-header" style={{ paddingBottom: 50, borderRadius: '0 0 30px 30px' }}>
        <p style={{ opacity: 0.7, fontSize: 13 }}>Panel Auxiliar</p>
        <h1>{user.full_name}</h1>
      </div>
      <div className="content-area" style={{ marginTop: -20 }}>
        <div className="grid-2">
          {[
            { icon: 'calendar', label: 'Asistencia', desc: 'Registrar asistencia', to: '/auxiliar/asistencia', color: '#3B82F6', bg: '#EFF6FF' },
            { icon: 'bell', label: 'Comunicados', desc: 'Ver y publicar avisos', to: '/auxiliar/comunicados', color: '#F59E0B', bg: '#FEF3C7' },
          ].map((item, i) => (
            <div key={i} onClick={() => navigate(item.to)} className="card" style={{ cursor: 'pointer' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon name={item.icon} color={item.color} size={22} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{item.label}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
