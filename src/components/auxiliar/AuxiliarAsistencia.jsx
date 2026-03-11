import { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { api } from '../../api/client';
import Icon from '../common/Icon';

const statusInfo = {
  temprano: { label: 'Temprano', color: 'var(--success)', bg: '#D1FAE5' },
  tarde:    { label: 'Tarde',    color: 'var(--warning)', bg: '#FEF3C7' },
  falta:    { label: 'Falta',   color: 'var(--danger)',  bg: '#FEE2E2' },
  salida:   { label: 'Salió',   color: 'var(--primary)', bg: '#DBEAFE' },
};

function makeLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function to12h(time24) {
  const [h, m] = time24.split(':').map(Number);
  const period = h < 12 ? 'a.m.' : 'p.m.';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function AuxiliarAsistencia() {
  const today = makeLocalDate(new Date());

  const [grades, setGrades] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedGrade, setSelectedGrade] = useState(null);

  // Date tabs
  const [dates, setDates] = useState([today]);
  const [activeDate, setActiveDate] = useState(today);
  const [newDateInput, setNewDateInput] = useState('');
  const [showAddDate, setShowAddDate] = useState(false);

  // Turno — auto-detectado, no editable
  const activeTurno = new Date().getHours() < 12 ? 'mañana' : 'tarde';

  // Tipo: entrada o salida
  const [activeTipo, setActiveTipo] = useState('entrada');

  // records keyed as `${date}__${turno}__${tipo}` → { [student_id]: status }
  const [records, setRecords] = useState({});

  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  const defaultTemprano = activeTurno === 'mañana' ? '07:30' : '13:00';
  const defaultTarde    = activeTurno === 'mañana' ? '08:00' : '13:30';
  const [tempranoHasta, setTempranoHasta] = useState(defaultTemprano);
  const [tardeHasta, setTardeHasta] = useState(defaultTarde);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const scannedRef = useRef(new Set());
  const lastScanRef = useRef(0);
  const detectorRef = useRef(null);
  const popstateHandlerRef = useRef(null);
  const tempranoRef = useRef(tempranoHasta);
  const activeDateRef = useRef(activeDate);
  const activeTurnoRef = useRef(activeTurno);
  const activeTipoRef = useRef(activeTipo);

  useEffect(() => { tempranoRef.current = tempranoHasta; }, [tempranoHasta]);
  useEffect(() => { activeDateRef.current = activeDate; }, [activeDate]);
  useEffect(() => { activeTurnoRef.current = activeTurno; }, [activeTurno]);
  useEffect(() => { activeTipoRef.current = activeTipo; }, [activeTipo]);

  useEffect(() => {
    api.get('/settings').then(s => {
      if (s[`att_temprano_${activeTurno}`]) setTempranoHasta(s[`att_temprano_${activeTurno}`]);
      if (s[`att_tarde_${activeTurno}`]) setTardeHasta(s[`att_tarde_${activeTurno}`]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([api.get('/grade-levels'), api.get('/students'), api.get('/attendance')])
      .then(([gls, studs, att]) => {
        setGrades(gls);
        setStudents(studs);
        if (gls.length) setSelectedGrade(gls[0].id);
        const existing = {};
        att.forEach(a => {
          const turno = a.turno || 'mañana';
          const tipo = a.tipo || 'entrada';
          const dateStr = (typeof a.date === 'string' ? a.date : a.date.toISOString()).slice(0, 10);
          const key = `${dateStr}__${turno}__${tipo}`;
          if (!existing[key]) existing[key] = {};
          existing[key][a.student_id] = a.status;
        });
        setRecords(existing);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);


  const recordKey = `${activeDate}__${activeTurno}__${activeTipo}`;
  const dayRecords = records[recordKey] || {};

  const toggleStatus = (studentId) => {
    const statuses = activeTipo === 'entrada' ? ['temprano', 'tarde', 'falta'] : ['salida', 'falta'];
    const current = dayRecords[studentId] ?? 'falta';
    const next = statuses[(statuses.indexOf(current) + 1) % statuses.length];
    const key = recordKey;
    setRecords(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [studentId]: next },
    }));
    api.post('/attendance', { student_id: studentId, date: activeDate, turno: activeTurno, tipo: activeTipo, status: next })
      .catch(err => {
        console.error(err);
        setRecords(prev => ({
          ...prev,
          [key]: { ...(prev[key] || {}), [studentId]: current },
        }));
      });
  };

  const handleDetected = useCallback((rawValue) => {
    if (scannedRef.current.has(rawValue)) return;
    const student = students.find(s => s.codigo === rawValue);
    if (!student) return;
    scannedRef.current.add(rawValue);
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const status = activeTipoRef.current === 'salida' ? 'salida' : (currentTime <= tempranoRef.current ? 'temprano' : 'tarde');
    const key = `${activeDateRef.current}__${activeTurnoRef.current}__${activeTipoRef.current}`;
    setRecords(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [student.id]: status },
    }));
    api.post('/attendance', {
      student_id: student.id,
      date: activeDateRef.current,
      turno: activeTurnoRef.current,
      tipo: activeTipoRef.current,
      status,
    }).catch(console.error);
    setScanMsg(`✓ ${student.first_name} ${student.last_name} — ${statusInfo[status].label}`);
    setTimeout(() => setScanMsg(''), 3000);
  }, [students]);

  const scanFrame = useCallback(async (timestamp = 0) => {
    animRef.current = requestAnimationFrame(scanFrame);
    if (timestamp - lastScanRef.current < 50) return;
    lastScanRef.current = timestamp;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    if (detectorRef.current) {
      try {
        const barcodes = await detectorRef.current.detect(video);
        if (barcodes.length > 0) handleDetected(barcodes[0].rawValue);
      } catch { }
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.min(1, 400 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code) handleDetected(code.data);
  }, [handleDetected]);

  const startScanner = async () => {
    scannedRef.current.clear();
    lastScanRef.current = 0;
    setScanMsg('');
    history.pushState({ scanner: true }, '');
    window.__scannerOpen = true;
    popstateHandlerRef.current = () => stopScanner(true);
    window.addEventListener('popstate', popstateHandlerRef.current);
    detectorRef.current = 'BarcodeDetector' in window
      ? new window.BarcodeDetector({ formats: ['qr_code'] })
      : null;
    setShowScanner(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');
      const backCameras = cameras.filter(c =>
        !c.label.toLowerCase().includes('front') && !c.label.toLowerCase().includes('frontal')
      );
      const mainCam = backCameras.find(c =>
        !c.label.toLowerCase().includes('ultra') &&
        !c.label.toLowerCase().includes('wide') &&
        !c.label.toLowerCase().includes('gran')
      ) || backCameras[0];
      const constraints = mainCam?.deviceId
        ? { video: { deviceId: { exact: mainCam.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          animRef.current = requestAnimationFrame(scanFrame);
        }
      }, 100);
    } catch {
      setShowScanner(false);
    }
  };

  const stopScanner = (fromPopstate = false) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    window.__scannerOpen = false;
    setShowScanner(false);
    if (popstateHandlerRef.current) {
      window.removeEventListener('popstate', popstateHandlerRef.current);
      popstateHandlerRef.current = null;
    }
    if (!fromPopstate) history.back();
  };

  const addDate = () => {
    const d = newDateInput;
    if (!d || dates.includes(d)) { setShowAddDate(false); return; }
    setDates(prev => [...prev, d].sort().reverse());
    setActiveDate(d);
    setNewDateInput('');
    setShowAddDate(false);
  };

  const removeDate = (d) => {
    if (dates.length === 1) return;
    setDates(prev => prev.filter(x => x !== d));
    if (activeDate === d) setActiveDate(dates.find(x => x !== d));
  };

  if (loading) return <div className="loading">Cargando...</div>;

  const gradeStudents = students.filter(s => s.grade_level_id === selectedGrade);

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Asistencia</h1>
            <p>Registro automático por QR</p>
          </div>
          <button onClick={startScanner} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}>
            <Icon name="qr" color="white" size={18} />
            Escanear
          </button>
        </div>
      </div>

      <div className="content-area">
        {/* Date tabs */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, alignItems: 'center' }}>
            {dates.map(d => (
              <div key={d} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={() => setActiveDate(d)}
                  style={{
                    padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                    background: activeDate === d ? 'var(--primary)' : 'var(--bg)',
                    color: activeDate === d ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  {d === today ? 'Hoy' : formatDateLabel(d)}
                </button>
                {dates.length > 1 && (
                  <button
                    onClick={() => removeDate(d)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {showAddDate ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                <input
                  type="date"
                  value={newDateInput}
                  onChange={e => setNewDateInput(e.target.value)}
                  className="form-input"
                  style={{ padding: '5px 8px', fontSize: 12, width: 140 }}
                />
                <button onClick={addDate} className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12 }}>OK</button>
                <button onClick={() => setShowAddDate(false)} className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }}>×</button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddDate(true)}
                style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 20, border: '2px dashed var(--border)', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}
              >
                + Día
              </button>
            )}
          </div>
        </div>

        {/* Tipo tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[['entrada', 'Entrada'], ['salida', 'Salida']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setActiveTipo(val)}
              style={{
                flex: 1, padding: '8px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
                background: activeTipo === val ? 'var(--primary)' : 'var(--bg)',
                color: activeTipo === val ? 'white' : 'var(--text-secondary)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Time config */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Temprano hasta ({to12h(tempranoHasta)})</label>
              <input
                type="time"
                className="form-input"
                value={tempranoHasta}
                onChange={e => { setTempranoHasta(e.target.value); api.put('/settings', { [`att_temprano_${activeTurno}`]: e.target.value }).catch(() => {}); }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Tarde hasta ({to12h(tardeHasta)})</label>
              <input
                type="time"
                className="form-input"
                value={tardeHasta}
                onChange={e => { setTardeHasta(e.target.value); api.put('/settings', { [`att_tarde_${activeTurno}`]: e.target.value }).catch(() => {}); }}
              />
            </div>
          </div>
        </div>

        {/* Grade tabs */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
          {grades.map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedGrade(g.id)}
              style={{
                flexShrink: 0, padding: '7px 16px', borderRadius: 20, border: 'none',
                cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                background: selectedGrade === g.id ? 'var(--primary)' : 'var(--bg)',
                color: selectedGrade === g.id ? 'white' : 'var(--text-secondary)',
              }}
            >
              {g.name}{g.section ? ` ${g.section}` : ''}
            </button>
          ))}
        </div>

        {/* Counters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(activeTipo === 'entrada' ? [
            { val: gradeStudents.filter(s => dayRecords[s.id] === 'temprano').length, label: 'Temprano', color: 'var(--success)', bg: '#D1FAE5' },
            { val: gradeStudents.filter(s => dayRecords[s.id] === 'tarde').length, label: 'Tardanzas', color: 'var(--warning)', bg: '#FEF3C7' },
            { val: gradeStudents.filter(s => !dayRecords[s.id] || dayRecords[s.id] === 'falta').length, label: 'Faltas', color: 'var(--danger)', bg: '#FEE2E2' },
            { val: gradeStudents.length, label: 'Total', color: 'var(--text)', bg: 'var(--bg)' },
          ] : [
            { val: gradeStudents.filter(s => dayRecords[s.id] === 'salida').length, label: 'Salieron', color: 'var(--primary)', bg: '#DBEAFE' },
            { val: gradeStudents.filter(s => !dayRecords[s.id] || dayRecords[s.id] === 'falta').length, label: 'Pendientes', color: 'var(--text-muted)', bg: 'var(--bg)' },
            { val: gradeStudents.length, label: 'Total', color: 'var(--text)', bg: 'var(--bg)' },
          ]).map((item, i) => (
            <div key={i} style={{ flex: 1, background: item.bg, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.val}</p>
              <p style={{ fontSize: 10, color: item.color, fontWeight: 600 }}>{item.label}</p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
          Toca el estado para cambiar manualmente
        </p>

        {gradeStudents.length === 0 ? (
          <div className="empty-state"><p>No hay alumnos en este grado</p></div>
        ) : (
          gradeStudents.map(s => {
            const status = dayRecords[s.id] ?? 'falta';
            const info = (activeTipo === 'salida' && status === 'falta')
              ? { label: 'Pendiente', color: 'var(--text-muted)', bg: 'var(--bg)' }
              : statusInfo[status];
            return (
              <div key={s.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="user" color="var(--text-muted)" size={18} />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{s.first_name} {s.last_name}</p>
                </div>
                <button
                  onClick={() => toggleStatus(s.id)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: 'none', background: info.bg, color: info.color, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                >
                  {info.label}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* QR Scanner Modal */}
      {showScanner && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <p style={{ color: 'white', fontSize: 15, fontWeight: 700 }}>Escanear QR del alumno</p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
            {activeDate === today ? 'Hoy' : formatDateLabel(activeDate)} · {activeTipo === 'entrada' ? `Entrada · Temprano hasta ${to12h(tempranoHasta)}` : 'Salida'}
          </p>
          <div style={{ position: 'relative', width: 280, height: 280, borderRadius: 16, overflow: 'hidden', border: '3px solid var(--primary)' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{
                position: 'absolute', width: 28, height: 28,
                ...(i === 0 ? { top: 8, left: 8, borderTop: '3px solid #4ADE80', borderLeft: '3px solid #4ADE80' } :
                   i === 1 ? { top: 8, right: 8, borderTop: '3px solid #4ADE80', borderRight: '3px solid #4ADE80' } :
                   i === 2 ? { bottom: 8, left: 8, borderBottom: '3px solid #4ADE80', borderLeft: '3px solid #4ADE80' } :
                              { bottom: 8, right: 8, borderBottom: '3px solid #4ADE80', borderRight: '3px solid #4ADE80' })
              }} />
            ))}
          </div>
          {scanMsg && (
            <div style={{ background: '#D1FAE5', color: '#065F46', padding: '10px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700 }}>
              {scanMsg}
            </div>
          )}
          <button onClick={stopScanner} className="btn btn-secondary" style={{ minWidth: 160 }}>
            Cerrar escáner
          </button>
        </div>
      )}
    </div>
  );
}
