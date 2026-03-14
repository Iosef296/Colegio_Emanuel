// Componente Icon — biblioteca centralizada de iconos SVG inline.
//
// Por qué SVG inline en lugar de una librería externa:
//   - Cero dependencias adicionales (Heroicons, Lucide, etc.).
//   - Control total del tamaño, color y trazo directamente por props.
//   - Sin peticiones de red extra para cargar fuentes de iconos.
//   - Fácil de extender con iconos personalizados (ej. WhatsApp).
//
// Props:
//   name  — clave del icono a renderizar (string). Si no existe, devuelve null.
//   size  — ancho y alto en píxeles (number). Por defecto 20.
//   color — color del trazo SVG (string CSS). Por defecto 'var(--text-secondary)'.
export default function Icon({ name, size = 20, color = 'var(--text-secondary)' }) {
  // Estilo base compartido por todos los SVGs: dimensiones fijas y centrado flex.
  // display: inline-flex permite alinear el icono con texto adyacente.
  const s = { width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

  // Mapa de nombre → elemento SVG.
  // Todos los iconos usan fill="none" + stroke para un estilo de línea uniforme,
  // excepto WhatsApp (fill sólido) y los cuadrados rellenos del icono QR.
  const icons = {
    // Icono de casa/inicio: trazo de una casa con rectángulo inferior para la puerta.
    home: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>,

    // Icono de libro: representa la sección de Notas/Cursos.
    book: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,

    // Icono de portapapeles: representa Grados y listas de alumnos.
    clipboard: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,

    // Icono de símbolo de dólar: representa Mensualidades y Pagos.
    dollar: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,

    // Icono de calendario: representa Asistencia.
    calendar: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,

    // Icono de campana: representa Comunicados y Avisos.
    bell: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,

    // Icono de estrella: representa Notas/Calificaciones en el rol padre.
    star: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,

    // Icono de flecha hacia atrás (chevron izquierdo): botón de navegación.
    back: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>,

    // Icono de usuario individual: avatar por defecto y campo de usuario.
    user: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,

    // Icono de grupo de usuarios: representa la sección de Profesores/Usuarios.
    users: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,

    // Icono de marca de verificación (check): confirmación de acciones.
    check: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg>,

    // Icono de X/cerrar: cancelación o cierre de modales.
    x: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,

    // Icono de reloj: indicador de hora y tiempos.
    clock: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>,

    // Icono de gráfico de barras: representa la sección de Avances (progreso académico).
    chart: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,

    // Icono de salida/logout: cierre de sesión en sidebar y nav móvil.
    logout: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,

    // Icono de más/agregar (+): botón de creación de nuevos registros.
    plus: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,

    // Icono de lápiz/editar: botón de edición de registros existentes.
    edit: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,

    // Icono de papelera: botón de eliminación de registros.
    trash: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,

    // Icono de engranaje/configuración: ajustes del sistema.
    settings: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,

    // Icono de menú hamburguesa (tres líneas): apertura de menús en móvil.
    menu: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,

    // Icono de código QR: escáner de QR en la vista de asistencia del auxiliar.
    // Usa fill para los cuadrados rellenos interiores del patrón QR.
    qr: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="2" y="2" width="8" height="8"/><rect x="14" y="2" width="8" height="8"/><rect x="2" y="14" width="8" height="8"/><rect x="4" y="4" width="4" height="4" fill={color} stroke="none"/><rect x="16" y="4" width="4" height="4" fill={color} stroke="none"/><rect x="4" y="16" width="4" height="4" fill={color} stroke="none"/><rect x="14" y="14" width="3" height="3" fill={color} stroke="none"/><rect x="19" y="14" width="3" height="3" fill={color} stroke="none"/><rect x="14" y="19" width="3" height="3" fill={color} stroke="none"/><rect x="19" y="19" width="3" height="3" fill={color} stroke="none"/></svg>,

    // Icono de ojo: representa la sección de Informes (visualización de datos).
    eye: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,

    // Icono de WhatsApp (logo oficial, fill sólido).
    // Se usa en la sección de envío de recordatorios de pago por WhatsApp.
    whatsapp: <svg style={s} viewBox="0 0 24 24" fill={color}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,

    // Icono de candado: protección de rutas o contenido restringido (pago requerido).
    lock: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,

    // Icono de descarga: exportación de archivos (recibos PDF de mensualidades).
    download: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,

    // Icono de cámara: captura de fotos en avances del docente.
    camera: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,

    // Icono de imagen/foto: previsualización de adjuntos fotográficos en avances.
    image: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>,

    // Icono de documento PDF: adjunto de tipo PDF en avances o recibos.
    pdf: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>,
  };

  // Devuelve el SVG correspondiente, o null si el nombre no existe en el mapa.
  // Retornar null es seguro en React y no renderiza nada.
  return icons[name] || null;
}
