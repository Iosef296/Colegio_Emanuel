import { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { api } from '../../api/client';
import Icon from '../common/Icon';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function DocenteAttendance() {
  const [students, setStudents] = useState([]);
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const scannedRef = useRef(new Set());
  const lastScanRef = useRef(0);
  const popstateHandlerRef = useRef(null);

  useEffect(() => {
    Promise.all([api.get('/students'), api.get('/attendance')])
      .then(([studs, att]) => {
        setStudents(studs);
        const existing = {};
        att.forEach(a => { if (a.date === date) existing[a.student_id] = a.status; });
        setRecords(existing);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const load = useCallback((silent = false) => {
    api.get('/attendance').then(att => {
      const existing = {};
      att.forEach(a => { if (a.date === date) existing[a.student_id] = a.status; });
      setRecords(existing);
    }).catch(console.error);
  }, [date]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load(true));

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
        student_id: Number(student_id), date, status,
      }));
      await api.post('/attendance/bulk', { records: bulk });
      setMessage('Asistencia guardada correctamente');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const detectorRef = useRef(null);

  const handleDetected = useCallback((rawValue) => {
    if (scannedRef.current.has(rawValue)) return;
    const student = students.find(s => s.codigo === rawValue);
    if (student) {
      scannedRef.current.add(rawValue);
      setRecords(prev => ({ ...prev, [student.id]: 'temprano' }));
      setScanMsg(`✓ ${student.first_name} ${student.last_name}`);
      setTimeout(() => setScanMsg(''), 2000);
    }
  }, [students]);

  // Native BarcodeDetector (fast) with jsQR fallback
  const scanFrame = useCallback(async (timestamp = 0) => {
    animRef.current = requestAnimationFrame(scanFrame);

    if (timestamp - lastScanRef.current < 50) return;
    lastScanRef.current = timestamp;

    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return;

    // Use native BarcodeDetector if available (hardware-accelerated, much faster)
    if (detectorRef.current) {
      try {
        const barcodes = await detectorRef.current.detect(video);
        if (barcodes.length > 0) handleDetected(barcodes[0].rawValue);
      } catch { /* ignore */ }
      return;
    }

    // jsQR fallback
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
    // Init native BarcodeDetector if supported
    if ('BarcodeDetector' in window) {
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
    } else {
      detectorRef.current = null;
    }
    setShowScanner(true);
    try {
      // Enumerate cameras and pick main back camera (avoid ultra-wide)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');
      const backCameras = cameras.filter(c =>
        !c.label.toLowerCase().includes('front') &&
        !c.label.toLowerCase().includes('frontal')
      );
      // Prefer camera labeled as "0" or avoid "ultra"/"wide"/"gran"
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
      setMessage('Error: No se pudo acceder a la cámara');
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

  const statusInfo = {
    temprano: { label: 'Temprano', color: 'var(--success)', bg: '#D1FAE5' },
    tarde: { label: 'Tarde', color: 'var(--warning)', bg: '#FEF3C7' },
    falta: { label: 'Falta', color: 'var(--danger)', bg: '#FEE2E2' },
    justificado: { label: 'Justificado', color: 'var(--primary)', bg: 'var(--primary-light)' },
  };

  // Detecta el nivel escolar a partir del nombre del grado.
  const getLevel = (gradeName = '') => {
    const n = gradeName.toLowerCase();
    if (n.includes('inicial')) return 'Inicial';
    if (n.includes('primaria')) return 'Primaria';
    if (n.includes('secundaria')) return 'Secundaria';
    return 'Otros';
  };

  const LEVEL_ORDER = ['Inicial', 'Primaria', 'Secundaria', 'Otros'];
  const LEVEL_COLOR = {
    Inicial:    { bg: '#FEF3C7', color: '#92400E', border: '#FCD34D' },
    Primaria:   { bg: '#DBEAFE', color: '#1E40AF', border: '#93C5FD' },
    Secundaria: { bg: '#D1FAE5', color: '#065F46', border: '#6EE7B7' },
    Otros:      { bg: '#EDE9FE', color: '#5B21B6', border: '#C4B5FD' },
  };

  // Agrupa los alumnos por nivel manteniendo el orden definido en LEVEL_ORDER.
  const grouped = LEVEL_ORDER.reduce((acc, lvl) => {
    const list = students.filter(s => getLevel(s.grade_name) === lvl);
    if (list.length > 0) acc.push({ level: lvl, students: list });
    return acc;
  }, []);

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Asistencia</h1>
            <p>Registro de asistencia diaria</p>
          </div>
          <button
            onClick={startScanner}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}
          >
            <Icon name="qr" color="white" size={18} />
            Escanear QR
          </button>
        </div>
      </div>
      <div className="content-area">
        <div className="card" style={{ marginBottom: 16 }}>
          <label className="form-label">Fecha</label>
          <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
          Toca en el estado para cambiar: Temprano → Tarde → Falta → Justificado
        </p>

        {message && (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: 13, fontWeight: 600 }}>
            {message}
          </div>
        )}

        {grouped.map(({ level, students: lvlStudents }) => {
          const lc = LEVEL_COLOR[level];
          return (
            <div key={level}>
              {/* Separador de nivel */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 6 }}>
                <div style={{ flex: 1, height: 1, background: lc.border }} />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: lc.color, background: lc.bg, border: `1px solid ${lc.border}`, padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                  {level.toUpperCase()} · {lvlStudents.length} alumno{lvlStudents.length !== 1 ? 's' : ''}
                </span>
                <div style={{ flex: 1, height: 1, background: lc.border }} />
              </div>

              {lvlStudents.map(s => {
                const status = records[s.id] || 'temprano';
                const info = statusInfo[status];
                return (
                  <div key={s.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
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
            </div>
          );
        })}

        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
          {saving ? 'Guardando...' : 'Guardar Asistencia'}
        </button>
      </div>

      {/* QR Scanner Modal */}
      {showScanner && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <p style={{ color: 'white', fontSize: 15, fontWeight: 700 }}>Escanear QR del alumno</p>

          <div style={{ position: 'relative', width: 280, height: 280, borderRadius: 16, overflow: 'hidden', border: '3px solid var(--primary)' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {/* Corner guides */}
            {['0 0', '0 auto auto 0', 'auto 0 0 auto', 'auto auto 0 0'].map((pos, i) => (
              <div key={i} style={{
                position: 'absolute',
                width: 28, height: 28,
                ...(i === 0 ? { top: 8, left: 8, borderTop: '3px solid #4ADE80', borderLeft: '3px solid #4ADE80' } :
                   i === 1 ? { top: 8, right: 8, borderTop: '3px solid #4ADE80', borderRight: '3px solid #4ADE80' } :
                   i === 2 ? { bottom: 8, left: 8, borderBottom: '3px solid #4ADE80', borderLeft: '3px solid #4ADE80' } :
                              { bottom: 8, right: 8, borderBottom: '3px solid #4ADE80', borderRight: '3px solid #4ADE80' })
              }} />
            ))}
          </div>

          {scanMsg && (
            <div style={{ background: '#D1FAE5', color: '#065F46', padding: '10px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700 }}>
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
