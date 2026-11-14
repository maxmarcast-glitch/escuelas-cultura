// Utilidades de interfaz compartidas por todas las secciones.

import { MES_INICIO, MES_FIN } from './config.js';

export const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const MESES_CORTOS = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const MESES_CICLO = Array.from({ length: MES_FIN - MES_INICIO + 1 }, (_, i) => MES_INICIO + i);
export const DIAS = [
  ['lunes', 'Lun'], ['martes', 'Mar'], ['miercoles', 'Mié'], ['jueves', 'Jue'],
  ['viernes', 'Vie'], ['sabado', 'Sáb'], ['domingo', 'Dom'],
];

// Escapa texto antes de meterlo en HTML (evita que un nombre con "<" rompa la página)
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const fmtPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
export const pesos = n => fmtPesos.format(Number(n) || 0);

export function fecha(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
export const hoyISO = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD en hora local
export const hora = t => (t ? String(t).slice(0, 5) : '');

export function diasTexto(dias = []) {
  return DIAS.filter(([k]) => dias.includes(k)).map(([, c]) => c).join(', ') || 'Sin días';
}

export function iniciales(nombre, apellido) {
  return ((nombre?.[0] || '') + (apellido?.[0] || '')).toUpperCase();
}

export const icon = name => `<span class="material-symbols-rounded" aria-hidden="true">${name}</span>`;

export function cargando(cont) {
  cont.innerHTML = '<div class="loading"><div class="spinner" role="status" aria-label="Cargando"></div></div>';
}

export function vacio(iconName, texto) {
  return `<div class="empty">${icon(iconName)}<p>${esc(texto)}</p></div>`;
}

// ---------- Snackbar ----------
let snackTimer;
export function avisar(texto, tipo = '') {
  const s = $('#snackbar');
  s.textContent = texto;
  s.className = 'snackbar ' + tipo;
  s.hidden = false;
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => (s.hidden = true), tipo === 'error' ? 6000 : 3500);
}

// Traduce los errores más comunes de la base a mensajes entendibles
export function mensajeError(err) {
  const m = err?.message || String(err);
  if (/MES_CERRADO/.test(m)) return 'Ese mes ya fue rendido y cerrado: no se pueden cargar ni anular pagos.';
  if (/Indicá el motivo|ya estaba anulado|permiso para anular/.test(m)) return m.replace(/^.*?(Indicá|Ese pago|No tenés)/, '$1');
  if (/cuotas_alumno_id_fkey/.test(m)) return 'El alumno tiene pagos registrados: no se puede eliminar. Dalo de baja.';
  if (/alumnos_dni_por_curso/.test(m)) return 'Ya hay un alumno con ese DNI en este curso.';
  if (/alumnos_dni_check/.test(m)) return 'El DNI tiene que tener entre 7 y 9 números, sin puntos.';
  if (/duplicate key|unique/i.test(m)) {
    if (/legajo/i.test(m)) return 'Ya existe un usuario con ese legajo.';
    if (/email/i.test(m)) return 'Ya existe un usuario con ese mail.';
    if (/cuotas/i.test(m)) return 'Esa cuota ya estaba registrada.';
    return 'Ya existe un registro con esos datos.';
  }
  if (/row-level security|permission denied/i.test(m)) return 'No tenés permiso para hacer esa operación.';
  if (/foreign key|violates.*constraint.*_fkey|still referenced/i.test(m)) return 'No se puede borrar: tiene datos asociados. Probá darlo de baja.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisá internet y volvé a intentar.';
  return 'Ocurrió un error: ' + m;
}
export const avisarError = err => { console.error(err); avisar(mensajeError(err), 'error'); };

// ---------- Diálogos ----------
// abrirFormulario({ titulo, html, textoOk }) → Promise<FormData | null>
export function abrirFormulario({ titulo, html, textoOk = 'Guardar', peligro = false, alAbrir }) {
  const d = $('#dialogo');
  d.innerHTML = `
    <form method="dialog" novalidate>
      <h2>${esc(titulo)}</h2>
      ${html}
      <p class="body-s" data-error role="alert" style="color:var(--error)"></p>
      <div class="actions">
        <button type="button" class="btn btn-text" data-cancelar>Cancelar</button>
        <button type="submit" class="btn ${peligro ? 'btn-danger' : 'btn-filled'}">${esc(textoOk)}</button>
      </div>
    </form>`;
  const form = d.querySelector('form');
  return new Promise(resolve => {
    let resuelto = false;
    const fin = v => { if (!resuelto) { resuelto = true; resolve(v); } };
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!form.checkValidity()) {
        const inv = form.querySelector(':invalid');
        form.querySelector('[data-error]').textContent = 'Revisá el campo: ' + (inv?.closest('.field')?.querySelector('label')?.textContent || 'obligatorio');
        inv?.focus();
        return;
      }
      fin(new FormData(form));
      d.close();
    });
    d.querySelector('[data-cancelar]').onclick = () => { d.close(); };
    // El evento "close" llega con retraso: si ya se abrió otro diálogo encima, lo ignoramos
    const alCerrar = () => {
      if (d.open) return;
      d.removeEventListener('close', alCerrar);
      fin(null);
    };
    d.addEventListener('close', alCerrar);
    d.showModal();
    alAbrir?.(d);
    d.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea')?.focus();
  });
}

export async function confirmar(titulo, texto, textoOk = 'Eliminar') {
  const r = await abrirFormulario({ titulo, html: `<p>${esc(texto)}</p>`, textoOk, peligro: true });
  return r !== null;
}

// Texto apto para nombre de archivo: sin tildes ni símbolos
export const paraArchivo = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\W+/g, '_');

// Descarga un Excel (.xlsx). hojas = { 'Nombre de hoja': [[fila], [fila], ...] }
// La librería se carga recién al exportar, así la app abre rápido.
export async function descargarExcel(nombre, hojas) {
  const { utils, writeFile } = await import('./xlsx.js');
  const libro = utils.book_new();
  for (const [titulo, filas] of Object.entries(hojas)) {
    const hoja = utils.aoa_to_sheet(filas);
    // Ancho de columnas según el contenido
    const anchos = [];
    for (const f of filas) f.forEach((v, i) => { anchos[i] = Math.min(50, Math.max(anchos[i] || 8, String(v ?? '').length + 2)); });
    hoja['!cols'] = anchos.map(wch => ({ wch }));
    utils.book_append_sheet(libro, hoja, titulo.slice(0, 31));
  }
  writeFile(libro, nombre);
}

// Compatibilidad: las planillas sueltas ahora también salen en .xlsx
export const descargarCSV = (nombre, filas) =>
  descargarExcel(nombre.replace(/\.csv$/, '.xlsx'), { Planilla: filas }).catch(err => avisarError(err));
