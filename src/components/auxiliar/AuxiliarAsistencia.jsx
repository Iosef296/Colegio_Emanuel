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

  // Horas límite configurables para clasificar la asistencia como "Temprano".
  // Se inicializan con valores predeterminados según el turno y se persisten
  // en la tabla de settings del servidor.
  const defaultTemprano = activeTurno === 'mañana' ? '07:30' : '13:00';
  const defaultTarde    = activeTurno === 'mañana' ? '08:00' : '13:30';
  const [tempranoHasta, setTempranoHasta] = useState(defaultTemprano);

  // Hora límite para clasificar como "Tarde" (se guarda en settings pero
  // actualmente solo se usa para mostrar referencia visual al auxiliar).
  const [tardeHasta, setTardeHasta] = useState(defaultTarde);

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

  // Referencias "espejo" de los estados volátiles usados dentro del callback
  // de animación. Como scanFrame y handleDetected se memorizan con useCallback,
  // necesitan leer el valor más reciente sin recrearse en cada render.
  const tempranoRef = useRef(tempranoHasta);
  const activeDateRef = useRef(activeDate);
  const activeTurnoRef = useRef(activeTurno);
  const activeTipoRef = useRef(activeTipo);

  // Mantiene sincronizadas las referencias de valores volátiles con el estado
  // actual. Esto permite que el loop de animación siempre use el valor vigente
  // sin necesidad de recrear los callbacks en cada render.
  useEffect(() => { tempranoRef.current = tempranoHasta; }, [tempranoHasta]);
  useEffect(() => { activeDateRef.current = activeDate; }, [activeDate]);
  useEffect(() => { activeTurnoRef.current = activeTurno; }, [activeTurno]);
  useEffect(() => { activeTipoRef.current = activeTipo; }, [activeTipo]);

  // Carga la configuración de horarios guardada en el servidor al montar el
  // componente. Las claves en settings tienen la forma "att_temprano_mañana",
  // "att_tarde_tarde", etc. Si existen, sobreescriben los valores predeterminados
  // para que el auxiliar vea sus ajustes previos al abrir la pantalla.
  useEffect(() => {
    api.get('/settings').then(s => {
      if (s[`att_temprano_${activeTurno}`]) setTempranoHasta(s[`att_temprano_${activeTurno}`]);
      if (s[`att_tarde_${activeTurno}`]) setTardeHasta(s[`att_tarde_${activeTurno}`]);
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
        setStudents(studs);
        setTeachers(usrs);
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
      const status = currentTime <= tempranoRef.current ? 'temprano' : 'tarde';
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
    // Para salida el estado es siempre "salida"; para entrada se clasifica
    // según si la hora actual supera o no el límite de "temprano".
    const status = activeTipoRef.current === 'salida' ? 'salida' : (currentTime <= tempranoRef.current ? 'temprano' : 'tarde');
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
      {/* Encabezado de página con título y botón para abrir el escáner QR */}
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
        {/* Pestañas de fecha: permite al auxiliar cambiar entre días registrados.
            Incluye botón "×" para eliminar fechas y la opción de agregar una nueva. */}
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
                {/* Botón de eliminación de pestaña; solo visible si hay más de una fecha */}
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
            {/* Formulario inline para agregar una fecha pasada o futura */}
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
            ) : null}
          </div>
        </div>

        {/* Pestañas Entrada / Salida: definen el tipo de registro activo.
            Cada tipo usa un conjunto de estados diferente (temprano/tarde/falta vs. salida/falta). */}
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

        {/* Configuración de horarios de corte.
            "Temprano hasta" es el límite que determina si un alumno llegó temprano.
            Cualquier hora posterior a ese límite (y antes del cierre) se clasifica como "Tarde".
            Los valores se persisten inmediatamente en el servidor al cambiarlos. */}
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

        {/* Pestañas de grado agrupadas por nivel (Inicial / Primaria / Secundaria / Otros).
            Cada nivel muestra una etiqueta separadora y sus grados como pestañas. */}
        {(() => {
          const getLevel = (name = '') => {
            const n = name.toLowerCase();
            if (n.includes('inicial'))    return 'Inicial';
            if (n.includes('primaria'))   return 'Primaria';
            if (n.includes('secundaria')) return 'Secundaria';
            return 'Otros';
          };
          const LEVEL_ORDER = ['Inicial', 'Primaria', 'Secundaria', 'Otros'];
          const LEVEL_COLOR = {
            Inicial:    { color: '#92400E', bg: '#FEF3C7', border: '#FCD34D' },
            Primaria:   { color: '#1E40AF', bg: '#DBEAFE', border: '#93C5FD' },
            Secundaria: { color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' },
            Otros:      { color: '#5B21B6', bg: '#EDE9FE', border: '#C4B5FD' },
          };
          const grouped = LEVEL_ORDER
            .map(lvl => ({ lvl, list: grades.filter(g => getLevel(g.name) === lvl) }))
            .filter(({ list }) => list.length > 0);

          return (
            <div style={{ marginBottom: 12 }}>
              {grouped.map(({ lvl, list }) => {
                const lc = LEVEL_COLOR[lvl];
                const isOpen = !!openLevels[lvl];
                const hasSelected = list.some(g => g.id === selectedGrade);
                return (
                  <div key={lvl} style={{ marginBottom: 6 }}>
                    {/* Header clickeable del nivel */}
                    <button
                      onClick={() => toggleLevel(lvl)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: isOpen ? 6 : 0 }}
                    >
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: lc.color, background: lc.bg, border: `1px solid ${lc.border}`, padding: '2px 10px', borderRadius: 20 }}>
                        {lvl.toUpperCase()}
                        {hasSelected && !isOpen && <span style={{ marginLeft: 5 }}>·</span>}
                      </span>
                      <span style={{ fontSize: 11, color: lc.color, fontWeight: 700, lineHeight: 1 }}>
                        {isOpen ? '▲' : '▼'}
                      </span>
                    </button>
                    {/* Pestañas de grados — solo visibles si está abierto */}
                    {isOpen && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {list.map(g => (
                          <button
                            key={g.id}
                            onClick={() => setSelectedGrade(g.id)}
                            style={{
                              padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${selectedGrade === g.id ? 'transparent' : lc.border}`,
                              cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                              background: selectedGrade === g.id ? 'var(--primary)' : 'white',
                              color: selectedGrade === g.id ? 'white' : lc.color,
                            }}
                          >
                            {g.name}{g.section ? ` ${g.section}` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Contadores de resumen del grado seleccionado para el contexto actual.
            En modo "entrada" muestra: Temprano / Tardanzas / Faltas / Total.
            En modo "salida" muestra: Salieron / Pendientes / Total. */}
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

        {/* Instrucción contextual para que el auxiliar sepa que puede cambiar el
            estado tocando la pastilla de cada alumno. */}
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
          Toca el estado para cambiar manualmente
        </p>

        {/* Lista de alumnos del grado seleccionado.
            Cada fila muestra el nombre y un botón con el estado actual.
            Al tocar el botón se rota el estado mediante toggleStatus(). */}
        {gradeStudents.length === 0 ? (
          <div className="empty-state"><p>No hay alumnos en este grado</p></div>
        ) : (
          gradeStudents.map(s => {
            const status = dayRecords[s.id] ?? 'falta';
            // En modo salida, si el estado es "falta" se muestra "Pendiente" en lugar
            // de "Falta" para distinguir semánticamente entre ausencia y aún no salió.
            const info = (activeTipo === 'salida' && status === 'falta')
              ? { label: 'Pendiente', color: 'var(--text-muted)', bg: 'var(--bg)' }
              : statusInfo[status];
            return (
              <div key={s.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  {/* Avatar genérico con icono de usuario */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="user" color="var(--text-muted)" size={18} />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{s.first_name} {s.last_name}</p>
                </div>
                {/* Botón de estado: al tocarlo llama a toggleStatus para rotar al siguiente estado */}
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

        {/* Secciones de personal: Docentes y Otros.
            Solo aparecen cuando hay personas en cada categoría.
            Usan el mismo recordKey que los alumnos (fecha + turno + tipo). */}
        {(() => {
          const docentes = teachers.filter(t => t.role === 'docente');
          const otros    = teachers.filter(t => t.role !== 'docente');
          const dayTR    = teacherRecords[recordKey] || {};
          const STAFF_SECTIONS = [
            { skey: 'docentes', label: 'Docentes', list: docentes, color: '#1E40AF', bg: '#DBEAFE', border: '#93C5FD' },
            { skey: 'otros',    label: 'Otros',    list: otros,    color: '#5B21B6', bg: '#EDE9FE', border: '#C4B5FD' },
          ].filter(s => s.list.length > 0);

          if (STAFF_SECTIONS.length === 0) return null;
          return STAFF_SECTIONS.map(({ skey, label, list, color, bg, border }) => {
            const lvKey = `staff_${skey}`;
            const isOpen = !!openLevels[lvKey];
            return (
              <div key={skey} style={{ marginTop: 16 }}>
                <button
                  onClick={() => toggleLevel(lvKey)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: isOpen ? 8 : 0 }}
                >
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color, background: bg, border: `1px solid ${border}`, padding: '2px 10px', borderRadius: 20 }}>
                    {label.toUpperCase()} · {list.length}
                  </span>
                  <span style={{ fontSize: 11, color, fontWeight: 700, lineHeight: 1 }}>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && list.map(t => {
                  const status = dayTR[t.id] ?? 'falta';
                  const info = (activeTipo === 'salida' && status === 'falta')
                    ? { label: 'Pendiente', color: 'var(--text-muted)', bg: 'var(--bg)' }
                    : statusInfo[status];
                  return (
                    <div key={t.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name="user" color="var(--text-muted)" size={18} />
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{t.full_name}</p>
                      </div>
                      <button
                        onClick={() => toggleTeacherStatus(t.id)}
                        style={{ padding: '6px 14px', borderRadius: 20, border: 'none', background: info.bg, color: info.color, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                      >
                        {info.label}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          });
        })()}
      </div>

      {/* Modal del escáner QR: ocupa toda la pantalla con fondo oscuro.
          Muestra el feed de la cámara en un recuadro con marcas de esquina
          y el mensaje de retroalimentación del último QR procesado. */}
      {showScanner && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <p style={{ color: 'white', fontSize: 15, fontWeight: 700 }}>Escanear QR del alumno o docente</p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
            {activeDate === today ? 'Hoy' : formatDateLabel(activeDate)} · {activeTipo === 'entrada' ? `Entrada · Temprano hasta ${to12h(tempranoHasta)}` : 'Salida'}
          </p>
          {/* Contenedor del video con decoraciones de esquina (estilo visor de QR) */}
          <div style={{ position: 'relative', width: 280, height: 280, borderRadius: 16, overflow: 'hidden', border: '3px solid var(--primary)' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
            {/* Canvas oculto usado por jsQR para analizar los frames cuando
                BarcodeDetector no está disponible en el navegador */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {/* Marcas de esquina decorativas que guían al usuario a centrar el QR */}
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
          {/* Mensaje de confirmación temporal tras escanear un QR válido */}
          {scanMsg && (
            <div style={{ background: '#D1FAE5', color: '#065F46', padding: '10px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700 }}>
              {scanMsg}
            </div>
          )}
          {/* Botón para cerrar el escáner manualmente */}
          <button onClick={stopScanner} className="btn btn-secondary" style={{ minWidth: 160 }}>
            Cerrar escáner
          </button>
        </div>
      )}
    </div>
  );
}
