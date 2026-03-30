// AuxiliarAsistencia.jsx
// Pantalla principal de registro de asistencia para el rol Auxiliar.
// Permite registrar la asistencia de alumnos y docentes mediante escaneo de QR
// o tocando manualmente el estado de cada alumno en la lista.
// Soporta múltiples fechas (pestañas), dos tipos de registro (entrada / salida)
// y dos turnos (mañana / tarde), detectados automáticamente según la hora actual.

import { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { api } from '../../api/client';
import Icon from '../common/Icon';

// Mapa de configuración visual por estado de asistencia.
// Cada estado tiene su etiqueta en español, color de texto y color de fondo
// para usarse en los botones y contadores de la lista.
const statusInfo = {
  temprano: { label: 'Temprano', color: 'var(--success)', bg: '#D1FAE5' },
  tarde:    { label: 'Tarde',    color: 'var(--warning)', bg: '#FEF3C7' },
  falta:    { label: 'Falta',   color: 'var(--danger)',  bg: '#FEE2E2' },
  salida:   { label: 'Salió',   color: 'var(--primary)', bg: '#DBEAFE' },
};

// Convierte un objeto Date en una cadena YYYY-MM-DD usando la zona local del
// dispositivo. Se evita toISOString() porque esa función devuelve UTC y podría
// arrojar la fecha del día anterior en zonas al oeste de UTC.
function makeLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Convierte una hora en formato de 24 horas ("HH:MM") al formato 12 horas
// con indicador a.m./p.m. usado en la interfaz peruana.
function to12h(time24) {
  const [h, m] = time24.split(':').map(Number);
  const period = h < 12 ? 'a.m.' : 'p.m.';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// Formatea una cadena de fecha "YYYY-MM-DD" como una etiqueta legible
// en español peruano (ej. "lun. 10 mar.") para las pestañas de fechas pasadas.
// Se parsea manualmente para evitar desfase de zona horaria con new Date(str).
function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function AuxiliarAsistencia() {
  // Fecha de hoy en formato local YYYY-MM-DD; se usa como fecha inicial activa
  // y para mostrar la etiqueta "Hoy" en la pestaña correspondiente.
  const today = makeLocalDate(new Date());

  // --- Estado principal ---

  // Lista de grados escolares obtenidos del servidor.
  const [grades, setGrades] = useState([]);

  // Lista completa de alumnos del colegio.
  const [students, setStudents] = useState([]);

  // Lista de usuarios con rol de docente/staff, usada para reconocer QR de docentes.
  const [teachers, setTeachers] = useState([]);

  // ID del grado actualmente seleccionado en las pestañas de grado.
  const [selectedGrade, setSelectedGrade] = useState(null);

  // --- Pestañas de fecha ---

  // Arreglo de fechas disponibles como pestañas (siempre incluye hoy por defecto).
  const [dates, setDates] = useState([today]);

  // Fecha activa (la pestaña seleccionada). Se usa para filtrar y guardar registros.
  const [activeDate, setActiveDate] = useState(today);

  // Valor del campo <input type="date"> cuando el usuario agrega una fecha nueva.
  const [newDateInput, setNewDateInput] = useState('');

  // Controla si se muestra el mini-formulario para agregar una nueva pestaña de fecha.
  const [showAddDate, setShowAddDate] = useState(false);

  // Turno detectado automáticamente según la hora actual del dispositivo.
  // Antes de las 12:00 → "mañana"; desde las 12:00 → "tarde".
  // No es editable por el usuario; cambia solo al recargar la página.
  const activeTurno = new Date().getHours() < 12 ? 'mañana' : 'tarde';

  // Tipo de registro activo: "entrada" (llegada) o "salida" (partida).
  const [activeTipo, setActiveTipo] = useState('entrada');

  // Almacén principal de registros de asistencia cargados desde el servidor y
  // actualizados localmente de forma optimista.
  // Estructura: { "YYYY-MM-DD__turno__tipo": { [student_id]: status } }
  // La clave compuesta garantiza separación entre turnos, tipos y fechas distintas.
  const [records, setRecords] = useState({});

  // Indicador de carga inicial mientras se obtienen los datos del servidor.
  const [loading, setLoading] = useState(true);

  // Controla la visibilidad del modal del escáner QR a pantalla completa.
  const [showScanner, setShowScanner] = useState(false);

  // Mensaje de retroalimentación que aparece brevemente tras escanear un QR
  // (ej. "✓ Juan Pérez — Temprano"). Se limpia automáticamente a los 3 segundos.
  const [scanMsg, setScanMsg] = useState('');

  // Horas de corte independientes por nivel. Cada nivel tiene su propio par
  // temprano/tarde que se persiste en settings con clave att_{field}_{turno}_{level}.
  const defT = activeTurno === 'mañana' ? '07:30' : '13:00';
  const defD = activeTurno === 'mañana' ? '08:00' : '13:30';
  const makeDefault = () => ({ temprano: defT, tarde: defD });
  const [levelSettings, setLevelSettings] = useState({
    docentes:   makeDefault(),
    inicial:    makeDefault(),
    primaria:   makeDefault(),
    secundaria: makeDefault(),
    otros:      makeDefault(),
  });

  // Controla qué niveles están expandidos en el selector de grados
  const [openLevels, setOpenLevels] = useState({});
  const toggleLevel = (lvl) => setOpenLevels(prev => ({ ...prev, [lvl]: !prev[lvl] }));

  // --- Referencias para el escáner QR ---

  // Referencia al elemento <video> que muestra el feed de la cámara.
  const videoRef = useRef(null);

  // Referencia al <canvas> oculto donde se dibuja cada frame para decodificar
  // el QR mediante la librería jsQR cuando BarcodeDetector no está disponible.
  const canvasRef = useRef(null);

  // Referencia al MediaStream activo de la cámara; se usa para detener las
  // pistas de video al cerrar el escáner.
  const streamRef = useRef(null);

  // ID de la animación requestAnimationFrame en curso; se guarda para poder
  // cancelarla al detener el escáner.
  const animRef = useRef(null);

  // Set de códigos QR ya procesados en la sesión actual del escáner.
  // Evita registrar el mismo código múltiples veces durante la misma apertura.
  const scannedRef = useRef(new Set());

  // Timestamp del último frame procesado; sirve para limitar la frecuencia de
  // análisis a un máximo de 20 veces por segundo (cada 50 ms).
  const lastScanRef = useRef(0);

  // Instancia del BarcodeDetector nativo del navegador (si está disponible).
  // Si no, se usa jsQR como fallback.
  const detectorRef = useRef(null);

  // Referencia a la función de limpieza del evento popstate, guardada para
  // poder removerla correctamente cuando el escáner se cierra.
  const popstateHandlerRef = useRef(null);

  // Referencias espejo para callbacks memorizados.
  const levelSettingsRef = useRef(levelSettings);
  const gradesRef        = useRef([]);
  const activeDateRef    = useRef(activeDate);
  const activeTurnoRef   = useRef(activeTurno);
  const activeTipoRef    = useRef(activeTipo);

  useEffect(() => { levelSettingsRef.current = levelSettings; }, [levelSettings]);
  useEffect(() => { activeDateRef.current = activeDate; }, [activeDate]);
  useEffect(() => { activeTurnoRef.current = activeTurno; }, [activeTurno]);
  useEffect(() => { activeTipoRef.current = activeTipo; }, [activeTipo]);

  // Detecta el nivel a partir del nombre del grado (igual que en la agrupación visual).
  const getLevel = (name = '') => {
    const n = name.toLowerCase();
    if (n.includes('inicial'))    return 'inicial';
    if (n.includes('primaria'))   return 'primaria';
    if (n.includes('secundaria')) return 'secundaria';
    return 'otros';
  };

  // Actualiza el horario de corte de un nivel y lo persiste en el servidor.
  const updateLevelSetting = (level, field, value) => {
    setLevelSettings(prev => ({ ...prev, [level]: { ...prev[level], [field]: value } }));
    api.put('/settings', { [`att_${field}_${activeTurno}_${level}`]: value }).catch(() => {});
  };

  // Carga configuración por nivel al montar. Fallback al valor global si el nivel-específico no existe.
  useEffect(() => {
    api.get('/settings').then(s => {
      setLevelSettings(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(lvl => {
          // Solo carga el valor propio del nivel, sin fallback global
          const t = s[`att_temprano_${activeTurno}_${lvl}`];
          const d = s[`att_tarde_${activeTurno}_${lvl}`];
          if (t) updated[lvl] = { ...updated[lvl], temprano: t };
          if (d) updated[lvl] = { ...updated[lvl], tarde: d };
        });
        return updated;
      });
    }).catch(() => {});
  }, []);

  // Registros de asistencia del personal (docentes y otros).
  // Misma estructura que `records` pero indexado por teacher_id.
  const [teacherRecords, setTeacherRecords] = useState({});

  // Carga inicial en paralelo de: grados, alumnos, registros de asistencia
  // existentes, personal docente y registros de asistencia del personal.
  useEffect(() => {
    Promise.all([
      api.get('/grade-levels'),
      api.get('/students'),
      api.get('/attendance'),
      api.get('/users/staff'),
      api.get('/teacher-attendance'),
    ]).then(([gls, studs, att, usrs, tAtt]) => {
        setGrades(gls);
        gradesRef.current = gls;
        setStudents(studs);
        setTeachers(usrs);
        // No auto-seleccionar: el usuario elige el grado o docentes manualmente.
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
        // Indexar registros de asistencia del personal
        const tExisting = {};
        tAtt.forEach(a => {
          const turno = a.turno || 'mañana';
          const tipo = a.tipo || 'entrada';
          const dateStr = (typeof a.date === 'string' ? a.date : a.date.toISOString()).slice(0, 10);
          const key = `${dateStr}__${turno}__${tipo}`;
          if (!tExisting[key]) tExisting[key] = {};
          tExisting[key][a.teacher_id] = a.status;
        });
        setTeacherRecords(tExisting);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);


  // Clave compuesta para el contexto actual (fecha activa + turno + tipo).
  // Se usa para leer y escribir en el objeto records de forma consistente.
  const recordKey = `${activeDate}__${activeTurno}__${activeTipo}`;

  // Registros del día/turno/tipo activos. Si no existe la clave, se usa un
  // objeto vacío para que la ausencia de registro se interprete como "falta".
  const dayRecords = records[recordKey] || {};

  // Rota el estado de asistencia de un alumno al tocarlo manualmente.
  // Para "entrada": temprano → tarde → falta → temprano (ciclo de 3).
  // Para "salida": salida → falta → salida (ciclo de 2).
  // Aplica el cambio de forma optimista en el estado local y luego lo persiste
  // en el servidor. Si el servidor falla, revierte al estado anterior.
  const toggleStatus = (studentId) => {
    const statuses = activeTipo === 'entrada' ? ['temprano', 'tarde', 'falta'] : ['salida', 'falta'];
    const current = dayRecords[studentId] ?? 'falta';
    const next = statuses[(statuses.indexOf(current) + 1) % statuses.length];
    const key = recordKey;
    // Actualización optimista: se refleja en pantalla antes de confirmar con el API.
    setRecords(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [studentId]: next },
    }));
    api.post('/attendance', { student_id: studentId, date: activeDate, turno: activeTurno, tipo: activeTipo, status: next })
      .catch(err => {
        // Reversión en caso de error: se restaura el estado previo del alumno.
        console.error(err);
        setRecords(prev => ({
          ...prev,
          [key]: { ...(prev[key] || {}), [studentId]: current },
        }));
      });
  };

  // Rota el estado de asistencia de un docente/personal al tocarlo manualmente.
  // Misma lógica de ciclo que toggleStatus pero persiste en /teacher-attendance.
  const toggleTeacherStatus = (teacherId) => {
    const statuses = activeTipo === 'entrada' ? ['temprano', 'tarde', 'falta'] : ['salida', 'falta'];
    const key = recordKey;
    const current = (teacherRecords[key] || {})[teacherId] ?? 'falta';
    const next = statuses[(statuses.indexOf(current) + 1) % statuses.length];
    setTeacherRecords(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [teacherId]: next } }));
    api.post('/teacher-attendance', { teacher_id: teacherId, date: activeDate, turno: activeTurno, tipo: activeTipo, status: next })
      .catch(err => {
        console.error(err);
        setTeacherRecords(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [teacherId]: current } }));
      });
  };

  // Callback ejecutado por el loop de animación cada vez que se detecta un QR.
  // Recibe el valor crudo del código escaneado y determina si corresponde a un
  // alumno (por su campo `codigo`) o a un docente (por su `username`).
  // Se memoriza con useCallback para no recrear scanFrame en cada render.
  const handleDetected = useCallback((rawValue) => {
    // Descarta QRs ya procesados en esta sesión del escáner para evitar duplicados.
    if (scannedRef.current.has(rawValue)) return;

    // Busca si el código pertenece a un alumno registrado.
    const student = students.find(s => s.codigo === rawValue);
    if (!student) {
      // Si no es un alumno, intenta reconocerlo como docente por su username.
      const teacher = teachers.find(t => t.username === rawValue);
      if (!teacher) return; // Código desconocido: se ignora.
      // Marca como procesado para evitar doble registro.
      scannedRef.current.add(rawValue);
      // Captura la hora actual y la clasifica según el límite de "temprano".
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const threshold = levelSettingsRef.current.docentes.temprano;
      const status = activeTipoRef.current === 'salida' ? 'salida' : (currentTime <= threshold ? 'temprano' : 'tarde');
      // Registra la asistencia del docente en el endpoint específico.
      api.post('/teacher-attendance', {
        teacher_id: teacher.id,
        date: activeDateRef.current,
        turno: activeTurnoRef.current,
        tipo: activeTipoRef.current,
        status,
      }).catch(console.error);
      // Muestra mensaje de confirmación temporal al auxiliar.
      setScanMsg(`✓ Docente: ${teacher.full_name} — ${status === 'temprano' ? 'Temprano' : 'Tardanza'}`);
      setTimeout(() => setScanMsg(''), 3000);
      return;
    }

    // Flujo para alumnos: marca como procesado y determina el estado.
    scannedRef.current.add(rawValue);
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    // Determina el umbral según el nivel del alumno
    const studentGrade = gradesRef.current.find(g => g.id === student.grade_level_id);
    const studentLevel = studentGrade
      ? (studentGrade.name.toLowerCase().includes('inicial') ? 'inicial'
        : studentGrade.name.toLowerCase().includes('primaria') ? 'primaria'
        : studentGrade.name.toLowerCase().includes('secundaria') ? 'secundaria'
        : 'otros')
      : 'primaria';
    const threshold = levelSettingsRef.current[studentLevel]?.temprano || levelSettingsRef.current.primaria.temprano;
    const status = activeTipoRef.current === 'salida' ? 'salida' : (currentTime <= threshold ? 'temprano' : 'tarde');
    const key = `${activeDateRef.current}__${activeTurnoRef.current}__${activeTipoRef.current}`;
    // Actualiza el estado local de forma inmediata para dar retroalimentación visual.
    setRecords(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [student.id]: status },
    }));
    // Persiste el registro en el servidor de forma asíncrona.
    api.post('/attendance', {
      student_id: student.id,
      date: activeDateRef.current,
      turno: activeTurnoRef.current,
      tipo: activeTipoRef.current,
      status,
    }).catch(console.error);
    // Muestra el nombre del alumno y su estado durante 3 segundos.
    setScanMsg(`✓ ${student.first_name} ${student.last_name} — ${statusInfo[status].label}`);
    setTimeout(() => setScanMsg(''), 3000);
  }, [students, teachers]);

  // Loop de animación que procesa cada frame del video en busca de un código QR.
  // Se ejecuta a través de requestAnimationFrame para sincronizarse con el refresco
  // de pantalla. Limita el análisis real a cada 50 ms para no saturar la CPU.
  // Si BarcodeDetector está disponible en el navegador lo usa (más rápido y eficiente);
  // de lo contrario, dibuja el frame en un canvas y usa la librería jsQR como fallback.
  const scanFrame = useCallback(async (timestamp = 0) => {
    // Registra el ID de animación para poder cancelarlo al cerrar el escáner.
    animRef.current = requestAnimationFrame(scanFrame);
    // Throttle: omite el análisis si no han pasado 50 ms desde el último frame procesado.
    if (timestamp - lastScanRef.current < 50) return;
    lastScanRef.current = timestamp;
    const video = videoRef.current;
    // Espera a que el video tenga datos suficientes para poder dibujarse.
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    // Rama BarcodeDetector (API nativa, disponible en Chrome/Edge modernos).
    if (detectorRef.current) {
      try {
        const barcodes = await detectorRef.current.detect(video);
        if (barcodes.length > 0) handleDetected(barcodes[0].rawValue);
      } catch { }
      return;
    }
    // Rama jsQR (fallback para navegadores sin BarcodeDetector).
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Escala la imagen al 100% o a 400px de ancho máximo para reducir cómputo.
    const scale = Math.min(1, 400 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // jsQR analiza los píxeles del canvas y devuelve el código si lo encuentra.
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code) handleDetected(code.data);
  }, [handleDetected]);

  // Inicia el escáner QR: limpia el estado previo, abre el modal, empuja un
  // estado en el historial del navegador (para que el botón Atrás lo cierre),
  // crea el BarcodeDetector si está disponible, solicita acceso a la cámara
  // priorizando la cámara trasera principal (no ultra-angular ni frontal)
  // y arranca el loop de animación.
  const startScanner = async () => {
    // Limpia el set de QRs procesados y el timestamp para la nueva sesión.
    scannedRef.current.clear();
    lastScanRef.current = 0;
    setScanMsg('');
    // Agrega una entrada al historial para que el botón Atrás del dispositivo
    // cierre el escáner en lugar de navegar fuera de la pantalla.
    history.pushState({ scanner: true }, '');
    window.__scannerOpen = true;
    popstateHandlerRef.current = () => stopScanner(true);
    window.addEventListener('popstate', popstateHandlerRef.current);
    // Intenta usar la API nativa de detección de códigos de barras.
    detectorRef.current = 'BarcodeDetector' in window
      ? new window.BarcodeDetector({ formats: ['qr_code'] })
      : null;
    setShowScanner(true);
    try {
      // Enumera las cámaras disponibles para seleccionar la trasera principal.
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');
      // Filtra las cámaras frontales por etiqueta.
      const backCameras = cameras.filter(c =>
        !c.label.toLowerCase().includes('front') && !c.label.toLowerCase().includes('frontal')
      );
      // De las traseras, prefiere la estándar excluyendo las ultra-angulares.
      const mainCam = backCameras.find(c =>
        !c.label.toLowerCase().includes('ultra') &&
        !c.label.toLowerCase().includes('wide') &&
        !c.label.toLowerCase().includes('gran')
      ) || backCameras[0];
      // Construye las restricciones de cámara preferidas.
      const constraints = mainCam?.deviceId
        ? { video: { deviceId: { exact: mainCam.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      // Pequeño retardo para asegurar que el elemento <video> esté montado en el DOM
      // antes de asignarle el stream y arrancar la reproducción.
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          animRef.current = requestAnimationFrame(scanFrame);
        }
      }, 100);
    } catch {
      // Si el usuario deniega el permiso de cámara o hay un error, cierra el modal.
      setShowScanner(false);
    }
  };

  // Detiene el escáner: cancela el loop de animación, detiene todas las pistas
  // de la cámara, oculta el modal y limpia el listener de popstate.
  // El parámetro `fromPopstate` indica si el cierre fue disparado por el botón
  // Atrás del navegador; en ese caso NO se llama history.back() para evitar
  // una navegación doble.
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
    // Solo retrocede en el historial si el cierre fue manual (no por popstate),
    // para no consumir dos entradas del historial.
    if (!fromPopstate) history.back();
  };

  // Agrega una nueva pestaña de fecha a partir del valor del input de fecha.
  // Si la fecha ya existe o el campo está vacío, simplemente cierra el formulario.
  // Las fechas se mantienen ordenadas de más reciente a más antigua.
  const addDate = () => {
    const d = newDateInput;
    if (!d || dates.includes(d)) { setShowAddDate(false); return; }
    setDates(prev => [...prev, d].sort().reverse());
    setActiveDate(d);
    setNewDateInput('');
    setShowAddDate(false);
  };

  // Elimina una pestaña de fecha.
  // No permite eliminar la última fecha disponible para garantizar que siempre
  // haya al menos una pestaña activa. Si la fecha eliminada era la activa,
  // selecciona automáticamente otra disponible.
  const removeDate = (d) => {
    if (dates.length === 1) return;
    setDates(prev => prev.filter(x => x !== d));
    if (activeDate === d) setActiveDate(dates.find(x => x !== d));
  };

  // Muestra pantalla de carga mientras se obtienen los datos iniciales del servidor.
  if (loading) return <div className="loading">Cargando...</div>;

  // Filtra los alumnos del grado actualmente seleccionado para mostrarlos en la lista.
  const gradeStudents = students.filter(s => s.grade_level_id === selectedGrade);

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Asistencia
              <span style={{
                background: activeTurno === 'mañana' ? '#FEF3C7' : '#EDE9FE',
                color: activeTurno === 'mañana' ? '#92400E' : '#5B21B6',
                fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: 0.5,
              }}>
                {activeTurno === 'mañana' ? 'MAÑANA' : 'TARDE'}
              </span>
            </h1>
            <p>Registro automático por QR</p>
          </div>
          <button onClick={startScanner} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12 }}>
            <Icon name="qr" color="white" size={20} />
            Escanear
          </button>
        </div>
      </div>

      <div className="content-area">

        {/* Date tabs */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, alignItems: 'center' }}>
            {dates.map(d => (
              <div key={d} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={() => setActiveDate(d)}
                  style={{
                    padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
                    background: activeDate === d ? 'var(--primary)' : 'white',
                    color: activeDate === d ? 'white' : 'var(--text-secondary)',
                    boxShadow: activeDate === d ? '0 2px 8px rgba(30,58,95,0.3)' : '0 1px 3px rgba(0,0,0,0.08)',
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
                <input type="date" value={newDateInput} onChange={e => setNewDateInput(e.target.value)} className="form-input" style={{ padding: '5px 8px', fontSize: 12, width: 140 }} />
                <button onClick={addDate} className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12 }}>OK</button>
                <button onClick={() => setShowAddDate(false)} className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }}>×</button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Entrada / Salida segmented control */}
        <div style={{
          display: 'flex', background: 'var(--bg)', borderRadius: 14, padding: 4,
          marginBottom: 16, gap: 2, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.07)',
        }}>
          {[
            { val: 'entrada', label: 'Entrada', activeColor: '#059669' },
            { val: 'salida',  label: 'Salida',  activeColor: '#D97706' },
          ].map(({ val, label, activeColor }) => (
            <button
              key={val}
              onClick={() => setActiveTipo(val)}
              style={{
                flex: 1, padding: '9px 8px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
                background: activeTipo === val ? activeColor : 'transparent',
                color: activeTipo === val ? 'white' : 'var(--text-muted)',
                boxShadow: activeTipo === val ? `0 2px 6px ${activeColor}55` : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Level accordion sections */}
        {(() => {
          const getLvl = (name = '') => {
            const n = name.toLowerCase();
            if (n.includes('inicial'))    return 'Inicial';
            if (n.includes('primaria'))   return 'Primaria';
            if (n.includes('secundaria')) return 'Secundaria';
            return 'Otros';
          };
          const LEVEL_ORDER = ['Inicial', 'Primaria', 'Secundaria', 'Otros'];
          const LEVEL_COLOR = {
            Inicial:    { color: '#92400E', bg: '#FFFBEB', border: '#FCD34D', accent: '#D97706' },
            Primaria:   { color: '#1E40AF', bg: '#EFF6FF', border: '#93C5FD', accent: '#2563EB' },
            Secundaria: { color: '#065F46', bg: '#F0FDF4', border: '#6EE7B7', accent: '#059669' },
            Otros:      { color: '#5B21B6', bg: '#F5F3FF', border: '#C4B5FD', accent: '#7C3AED' },
          };
          const grouped = LEVEL_ORDER
            .map(lvl => ({ lvl, list: grades.filter(g => getLvl(g.name) === lvl && students.some(s => s.grade_level_id === g.id)) }))
            .filter(({ list }) => list.length > 0);
          const docenteColor = { color: '#0F766E', bg: '#F0FDFA', border: '#5EEAD4', accent: '#0D9488' };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>

              {/* DOCENTES section */}
              {teachers.length > 0 && (() => {
                const lc = docenteColor;
                const isOpen = !!openLevels['docentes'];
                const dayTR = teacherRecords[recordKey] || {};
                const presentCount = teachers.filter(t => dayTR[t.id] && dayTR[t.id] !== 'falta').length;
                return (
                  <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${lc.border}`, background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                    <button
                      onClick={() => toggleLevel('docentes')}
                      style={{
                        width: '100%', border: 'none', padding: '12px 14px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                        background: isOpen ? lc.bg : 'white',
                        borderLeft: `4px solid ${lc.accent}`,
                        transition: 'background 0.15s',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: lc.color, flex: 1 }}>DOCENTES</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: lc.accent, background: lc.bg, padding: '2px 8px', borderRadius: 20, border: `1px solid ${lc.border}` }}>
                        {levelSettings.docentes.temprano} · {presentCount}/{teachers.length}
                      </span>
                      <span style={{ fontSize: 11, color: lc.color, fontWeight: 700, display: 'inline-block', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                    </button>
                    {isOpen && (() => {
                      const ds = levelSettings.docentes;
                      const counts = activeTipo === 'entrada' ? [
                        { val: teachers.filter(t => dayTR[t.id] === 'temprano').length, label: 'Temprano',  color: '#059669', bg: '#D1FAE5' },
                        { val: teachers.filter(t => dayTR[t.id] === 'tarde').length,    label: 'Tardanzas', color: '#D97706', bg: '#FEF3C7' },
                        { val: teachers.filter(t => !dayTR[t.id] || dayTR[t.id] === 'falta').length, label: 'Faltas', color: '#DC2626', bg: '#FEE2E2' },
                        { val: teachers.length, label: 'Total', color: 'var(--text)', bg: 'var(--bg)' },
                      ] : [
                        { val: teachers.filter(t => dayTR[t.id] === 'salida').length, label: 'Salieron',   color: '#2563EB', bg: '#DBEAFE' },
                        { val: teachers.filter(t => !dayTR[t.id] || dayTR[t.id] === 'falta').length, label: 'Pendientes', color: 'var(--text-muted)', bg: 'var(--bg)' },
                        { val: teachers.length, label: 'Total', color: 'var(--text)', bg: 'var(--bg)' },
                      ];
                      return (
                        <div style={{ padding: '12px 14px', borderTop: `1px solid ${lc.border}` }}>
                          <div style={{ background: lc.bg, borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 10, marginBottom: 12, border: `1px solid ${lc.border}` }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 10, fontWeight: 700, color: lc.color, display: 'block', marginBottom: 4 }}>Temprano hasta</label>
                              <input type="time" className="form-input" style={{ padding: '5px 8px', fontSize: 12 }} value={ds.temprano} onChange={e => updateLevelSetting('docentes', 'temprano', e.target.value)} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 10, fontWeight: 700, color: lc.color, display: 'block', marginBottom: 4 }}>Tarde hasta</label>
                              <input type="time" className="form-input" style={{ padding: '5px 8px', fontSize: 12 }} value={ds.tarde} onChange={e => updateLevelSetting('docentes', 'tarde', e.target.value)} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                            {counts.map((item, i) => (
                              <div key={i} style={{ flex: 1, background: item.bg, borderRadius: 10, padding: '10px 6px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <p style={{ fontSize: 22, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.val}</p>
                                <p style={{ fontSize: 10, color: item.color, fontWeight: 600, marginTop: 2 }}>{item.label}</p>
                              </div>
                            ))}
                          </div>
                          {teachers.map(t => {
                            const status = dayTR[t.id] ?? 'falta';
                            const info = (activeTipo === 'salida' && status === 'falta')
                              ? { label: 'Pendiente', color: 'var(--text-muted)', bg: 'var(--bg)' }
                              : statusInfo[status];
                            const initials = t.full_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
                            return (
                              <div key={t.id} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--bg)', borderRadius: 10, padding: '10px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                                  <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: lc.bg, border: `2px solid ${lc.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: lc.color }}>
                                    {initials}
                                  </div>
                                  <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.full_name}</p>
                                </div>
                                <button onClick={() => toggleTeacherStatus(t.id)} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', background: info.bg, color: info.color, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                                  {info.label}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* Grade level sections */}
              {grouped.map(({ lvl, list }) => {
                const lc = LEVEL_COLOR[lvl];
                const isOpen = !!openLevels[lvl];
                const hasSelected = list.some(g => g.id === selectedGrade);
                const levelStudentIds = students.filter(s => list.some(g => g.id === s.grade_level_id)).map(s => s.id);
                const presentCount = levelStudentIds.filter(id => {
                  const st = (records[recordKey] || {})[id];
                  return st && st !== 'falta';
                }).length;
                return (
                  <div key={lvl} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${lc.border}`, background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                    <button
                      onClick={() => toggleLevel(lvl)}
                      style={{
                        width: '100%', border: 'none', padding: '12px 14px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                        background: (isOpen || hasSelected) ? lc.bg : 'white',
                        borderLeft: `4px solid ${lc.accent}`,
                        transition: 'background 0.15s',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: lc.color, flex: 1 }}>
                        {lvl.toUpperCase()}
                        {hasSelected && !isOpen && (
                          <span style={{ marginLeft: 8, fontSize: 10, background: lc.accent, color: 'white', borderRadius: 20, padding: '1px 6px', fontWeight: 700 }}>activo</span>
                        )}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: lc.accent, background: lc.bg, padding: '2px 8px', borderRadius: 20, border: `1px solid ${lc.border}` }}>
                        {(levelSettings[lvl.toLowerCase()] || levelSettings.primaria).temprano} · {presentCount}/{levelStudentIds.length}
                      </span>
                      <span style={{ fontSize: 11, color: lc.color, fontWeight: 700, display: 'inline-block', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '10px 14px', borderTop: `1px solid ${lc.border}` }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {list.map(g => (
                            <button
                              key={g.id}
                              onClick={() => setSelectedGrade(selectedGrade === g.id ? null : g.id)}
                              style={{
                                padding: '7px 16px', borderRadius: 20, cursor: 'pointer',
                                fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
                                border: `2px solid ${selectedGrade === g.id ? 'transparent' : lc.border}`,
                                background: selectedGrade === g.id ? lc.accent : 'white',
                                color: selectedGrade === g.id ? 'white' : lc.color,
                                boxShadow: selectedGrade === g.id ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                              }}
                            >
                              {g.name}{g.section ? ` ${g.section}` : ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          );
        })()}

        {/* Student section: only shown when a grade is selected */}
        {selectedGrade !== null && <>

          {/* Per-level time settings */}
          {(() => {
            const selectedGradeObj = grades.find(g => g.id === selectedGrade);
            const level = getLevel(selectedGradeObj?.name || '');
            const ls = levelSettings[level] || levelSettings.primaria;
            const LC = {
              inicial:    { color: '#92400E', bg: '#FFFBEB', border: '#FCD34D' },
              primaria:   { color: '#1E40AF', bg: '#EFF6FF', border: '#93C5FD' },
              secundaria: { color: '#065F46', bg: '#F0FDF4', border: '#6EE7B7' },
              otros:      { color: '#5B21B6', bg: '#F5F3FF', border: '#C4B5FD' },
            };
            const lc = LC[level] || LC.primaria;
            return (
              <div style={{ background: lc.bg, borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 10, marginBottom: 12, border: `1px solid ${lc.border}` }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: lc.color, display: 'block', marginBottom: 4 }}>
                    Temprano — {level.charAt(0).toUpperCase() + level.slice(1)}
                  </label>
                  <input type="time" className="form-input" value={ls.temprano} onChange={e => updateLevelSetting(level, 'temprano', e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: lc.color, display: 'block', marginBottom: 4 }}>
                    Tarde hasta
                  </label>
                  <input type="time" className="form-input" value={ls.tarde} onChange={e => updateLevelSetting(level, 'tarde', e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} />
                </div>
              </div>
            );
          })()}

          {/* Counters */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(activeTipo === 'entrada' ? [
              { val: gradeStudents.filter(s => dayRecords[s.id] === 'temprano').length, label: 'Temprano', color: '#059669', bg: '#D1FAE5' },
              { val: gradeStudents.filter(s => dayRecords[s.id] === 'tarde').length, label: 'Tardanzas', color: '#D97706', bg: '#FEF3C7' },
              { val: gradeStudents.filter(s => !dayRecords[s.id] || dayRecords[s.id] === 'falta').length, label: 'Faltas', color: '#DC2626', bg: '#FEE2E2' },
              { val: gradeStudents.length, label: 'Total', color: 'var(--text)', bg: 'var(--bg)' },
            ] : [
              { val: gradeStudents.filter(s => dayRecords[s.id] === 'salida').length, label: 'Salieron', color: '#2563EB', bg: '#DBEAFE' },
              { val: gradeStudents.filter(s => !dayRecords[s.id] || dayRecords[s.id] === 'falta').length, label: 'Pendientes', color: 'var(--text-muted)', bg: 'var(--bg)' },
              { val: gradeStudents.length, label: 'Total', color: 'var(--text)', bg: 'var(--bg)' },
            ]).map((item, i) => (
              <div key={i} style={{ flex: 1, background: item.bg, borderRadius: 10, padding: '10px 6px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.val}</p>
                <p style={{ fontSize: 10, color: item.color, fontWeight: 600, marginTop: 2 }}>{item.label}</p>
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
              const initials = `${(s.first_name || '')[0] || ''}${(s.last_name || '')[0] || ''}`.toUpperCase();
              const avatarBg    = status === 'temprano' ? '#D1FAE5' : status === 'tarde' ? '#FEF3C7' : status === 'salida' ? '#DBEAFE' : '#F3F4F6';
              const avatarColor = status === 'temprano' ? '#059669' : status === 'tarde' ? '#D97706' : status === 'salida' ? '#2563EB' : '#9CA3AF';
              return (
                <div key={s.id} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'white', borderRadius: 12, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: avatarColor, transition: 'all 0.2s' }}>
                      {initials}
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.first_name} {s.last_name}</p>
                  </div>
                  <button onClick={() => toggleStatus(s.id)} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', background: info.bg, color: info.color, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                    {info.label}
                  </button>
                </div>
              );
            })
          )}
        </>}

      </div>

      {/* QR Scanner modal */}
      {showScanner && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <p style={{ color: 'white', fontSize: 15, fontWeight: 700 }}>Escanear QR del alumno o docente</p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
            {activeDate === today ? 'Hoy' : formatDateLabel(activeDate)} · {activeTipo === 'entrada' ? 'Entrada' : 'Salida'}
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
