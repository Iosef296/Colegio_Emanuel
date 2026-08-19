import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';

// ─────────────────────────────────────────────────────────────────────────────
// AdminWhatsapp — Panel de gestión de la conexión WhatsApp del colegio
//
// Permite conectar y desconectar el número de WhatsApp del colegio mediante
// la vinculación por código QR (WhatsApp Web). Cuando está conectado, el
// backend puede enviar notificaciones automáticas a los padres de familia.
//
// La vista sondea el estado de la conexión periódicamente:
//   - Cada 3 segundos si se está mostrando el QR (para detectar el escaneo)
//   - Cada 8 segundos en cualquier otro estado (mantenimiento liviano)
// ─────────────────────────────────────────────────────────────────────────────

// Mapa de metadatos visuales por cada estado posible de la conexión WhatsApp.
// Centralizado aquí para que el render sea declarativo y fácil de extender.
const STATUS_LABEL = {
  connected:    { text: 'Conectado',     color: '#10B981', bg: '#D1FAE5' },
  qr:           { text: 'Escanea el QR', color: '#F59E0B', bg: '#FEF3C7' },
  connecting:   { text: 'Conectando...', color: '#3B82F6', bg: '#DBEAFE' },
  disconnected: { text: 'Desconectado',  color: '#EF4444', bg: '#FEE2E2' },
};

export default function AdminWhatsapp() {
  // ── Estado ────────────────────────────────────────────────────────────────

  // Estado actual de la conexión WhatsApp; uno de los keys de STATUS_LABEL
  const [status, setStatus] = useState('disconnected');

  // URL de imagen del código QR generado por el servidor (data URL o URL externa).
  // Es null cuando no hay QR disponible (ya conectado o aún no iniciado).
  const [qr, setQr] = useState(null);

  // Indica si se está procesando una acción de conectar o desconectar
  // para deshabilitar los botones y evitar solicitudes duplicadas
  const [loading, setLoading] = useState(false);

  // Indica si se está generando/descargando el reporte de diagnóstico
  const [reportLoading, setReportLoading] = useState(false);

  // ── Carga de estado ───────────────────────────────────────────────────────

  /**
   * load — Consulta el estado actual de la conexión WhatsApp al backend.
   * Envuelto en useCallback para que su referencia sea estable y no
   * recree el intervalo del useEffect en cada render.
   * Si el servidor no responde simplemente no cambia el estado (catch vacío),
   * evitando un error visible al usuario por problemas temporales de red.
   */
  const load = useCallback(async () => {
    try {
      const data = await api.get('/whatsapp/status');
      setStatus(data.status);
      // El QR puede estar ausente si ya hay sesión activa o el proceso no inició
      setQr(data.qr || null);
    } catch {}
  }, []);

  /**
   * useEffect de sondeo periódico.
   * - Llama a load() inmediatamente al montar o cuando cambia el status.
   * - Establece un intervalo de 3 s si se muestra QR (para reaccionar rápido
   *   cuando el administrador escanea el código), o de 8 s en otros estados.
   * - Limpia el intervalo anterior al desmontar o cuando status cambia,
   *   garantizando que solo exista un único intervalo activo a la vez.
   */
  useEffect(() => {
    load();
    const interval = setInterval(load, status === 'qr' ? 3000 : 8000);
    return () => clearInterval(interval);
  }, [load, status]);

  // ── Manejadores de acciones ───────────────────────────────────────────────

  /**
   * connect — Envía la orden de iniciar la sesión WhatsApp al backend.
   * Tras recibir la respuesta del POST, recarga el estado para obtener
   * el QR generado o el nuevo status de conexión.
   */
  const connect = async () => {
    setLoading(true);
    try { await api.post('/whatsapp/connect'); await load(); }
    finally { setLoading(false); }
  };

  /**
   * disconnect — Solicita confirmación nativa del navegador antes de
   * cerrar la sesión WhatsApp, ya que el administrador tendrá que
   * volver a escanear el QR para reconectarse.
   * Si el usuario confirma, envía el POST de desconexión y recarga el estado.
   */
  const disconnect = async () => {
    if (!confirm('¿Desconectar WhatsApp? Tendrás que escanear el QR de nuevo.')) return;
    setLoading(true);
    try { await api.post('/whatsapp/disconnect'); await load(); }
    finally { setLoading(false); }
  };

  /**
   * downloadReport — descarga el reporte de diagnóstico (envíos, intervalos
   * reales entre mensajes, desconexiones con código) como archivo .json,
   * para poder estudiar el patrón que llevó a un baneo/desconexión.
   */
  const downloadReport = async () => {
    setReportLoading(true);
    try {
      const data = await api.get('/whatsapp/report');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatsapp-reporte-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('No se pudo generar el reporte: ' + err.message);
    } finally {
      setReportLoading(false);
    }
  };

  // ── Metadatos visuales del estado actual ──────────────────────────────────

  // Resuelve el objeto de presentación del estado actual.
  // El fallback a 'disconnected' cubre cualquier valor inesperado del servidor.
  const st = STATUS_LABEL[status] || STATUS_LABEL.disconnected;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Encabezado de página */}
      <div className="page-header">
        <h1>WhatsApp</h1>
        <p>Notificaciones automáticas a padres de familia</p>
      </div>

      <div className="content-area">
        {/* ── Tarjeta de estado de conexión ── */}
        <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Indicador circular de color según el estado actual */}
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: st.color }} />
            <div>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Estado de conexión</p>
              {/* Insignia con texto y color del estado actual */}
              <span style={{ fontSize: 12, fontWeight: 600, color: st.color, background: st.bg, padding: '2px 10px', borderRadius: 20 }}>{st.text}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Botón Conectar — visible cuando no está conectado.
                Se deshabilita si está conectando para evitar solicitudes duplicadas. */}
            {status !== 'connected' && (
              <button className="btn btn-primary" onClick={connect} disabled={loading || status === 'connecting'} style={{ fontSize: 13 }}>
                {loading ? 'Conectando...' : 'Conectar'}
              </button>
            )}
            {/* Botón Desconectar — visible solo cuando la sesión está activa */}
            {status === 'connected' && (
              <button className="btn btn-secondary" onClick={disconnect} disabled={loading} style={{ fontSize: 13 }}>
                Desconectar
              </button>
            )}
          </div>
        </div>

        {/* ── Tarjeta del código QR ──
            Solo se muestra cuando el backend ha generado un QR pendiente de escanear.
            Se actualiza automáticamente vía el sondeo de 3 segundos hasta que
            el administrador escanee o el QR expire. */}
        {qr && (
          <div className="card" style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Escanea con WhatsApp del colegio</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo
            </p>
            {/* Imagen del QR generada por el servidor (data URL o URL pública) */}
            <img src={qr} alt="QR WhatsApp" style={{ width: 220, height: 220, borderRadius: 12, border: '1px solid var(--border)' }} />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>El QR se actualiza automáticamente</p>
            {/* Botón de reporte de diagnóstico — descarga un .json con el historial
                de envíos (intervalos reales) y desconexiones para estudiar baneos. */}
            <button
              className="btn btn-secondary"
              onClick={downloadReport}
              disabled={reportLoading}
              style={{ fontSize: 13, marginTop: 16 }}
            >
              {reportLoading ? 'Generando reporte...' : 'Reporte'}
            </button>
          </div>
        )}

        {/* ── Aviso informativo cuando está desconectado y sin QR ──
            Recuerda que las notificaciones push siguen funcionando,
            minimizando la urgencia de reconectar de inmediato. */}
        {status === 'disconnected' && !qr && (
          <div className="card" style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
            <p style={{ fontWeight: 700, color: '#C2410C', marginBottom: 4 }}>WhatsApp desconectado</p>
            <p style={{ fontSize: 13, color: '#9A3412', marginBottom: 12 }}>Las notificaciones push siguen funcionando. Conecta WhatsApp para activar los mensajes adicionales.</p>
            <button
              className="btn btn-secondary"
              onClick={downloadReport}
              disabled={reportLoading}
              style={{ fontSize: 13 }}
            >
              {reportLoading ? 'Generando reporte...' : 'Reporte'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
