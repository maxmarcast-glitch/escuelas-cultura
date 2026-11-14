/**
 * =====================================================================
 *  Sincronización de memos → App Escuelas (Neon)
 *
 *  Va en la planilla de respuestas del formulario de memos:
 *  Extensiones → Apps Script → pegar este archivo → Guardar.
 *  Con un formulario por escuela: se pega en CADA planilla, cambiando ESCUELA_FIJA.
 *
 *  1. Configuración del proyecto (ícono de engranaje) → Propiedades del
 *     script → agregar:
 *        NEON_CONEXION = postgresql://memos_sync:CLAVE@ep-xxxx.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require
 *     (la clave es la que pusiste en sql/03_rol_memos.sql; no la pegues en el código)
 *  2. Ajustá COLUMNAS con los títulos reales de tu planilla.
 *  3. Ejecutá probarConexion() una vez (te pide permisos).
 *  4. Ejecutá crearDisparador() una vez: sincroniza cada 10 minutos.
 * =====================================================================
 */

// Títulos de las columnas de la hoja de respuestas (tal cual aparecen en la fila 1).
// Para "link" alcanza con el comienzo del título: Autocrat crea una columna
// "Merged Doc URL - nombre del trabajo".
const COLUMNAS = {
  marca:   'Marca temporal',      // la crea Google Forms
  escuela: 'Escuela',             // desplegable nuevo del formulario
  numero:  'Número de memo',
  fecha:   'Fecha',               // si no existe, se usa la marca temporal
  asunto:  'Asunto',
  detalle: 'Detalle',
  link:    'Merged Doc URL',
};
const HOJA = 'Respuestas de formulario 1';

// Si esta planilla es de UNA sola escuela (un formulario por escuela), escribí
// acá su nombre tal cual figura en la app y no hace falta la pregunta "Escuela".
// Si el formulario es compartido entre escuelas, dejalo vacío: ''.
const ESCUELA_FIJA = '';

function sincronizarMemos() {
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA);
  if (!hoja) throw new Error('No encuentro la hoja "' + HOJA + '"');
  const valores = hoja.getDataRange().getValues();
  if (valores.length < 2) return;

  const enc = valores[0].map(String);
  const col = clave => {
    const t = COLUMNAS[clave];
    return clave === 'link' ? enc.findIndex(h => h.indexOf(t) === 0) : enc.indexOf(t);
  };
  const c = Object.fromEntries(Object.keys(COLUMNAS).map(k => [k, col(k)]));
  if (c.marca < 0) throw new Error('Falta la columna "' + COLUMNAS.marca + '"');
  if (!ESCUELA_FIJA && c.escuela < 0) throw new Error('Falta la columna "' + COLUMNAS.escuela + '" (o completá ESCUELA_FIJA)');
  const idPlanilla = SpreadsheetApp.getActive().getId().slice(0, 10);

  const tz = Session.getScriptTimeZone();
  const aFecha = v => (v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : null);
  const val = (fila, k) => (c[k] >= 0 ? String(fila[c[k]] ?? '').trim() : '');

  const memos = valores.slice(1)
    .filter(f => f[c.marca] instanceof Date)
    .map(f => ({
      // planilla + fecha y hora: único aunque haya varias planillas (una por escuela)
      fila_origen: idPlanilla + '|' + Utilities.formatDate(f[c.marca], tz, "yyyy-MM-dd'T'HH:mm:ss"),
      escuela: ESCUELA_FIJA || val(f, 'escuela'),
      numero:  val(f, 'numero') || null,
      fecha:   (c.fecha >= 0 && aFecha(f[c.fecha])) || aFecha(f[c.marca]),
      asunto:  val(f, 'asunto') || null,
      detalle: val(f, 'detalle').slice(0, 2000) || null,
      link_doc: val(f, 'link') || null,
    }));

  // Una sola consulta para todas las filas: inserta las nuevas y actualiza las existentes
  const sql = `
    INSERT INTO memos (fila_origen, escuela_id, numero, fecha, asunto, detalle, link_doc)
    SELECT x.fila_origen,
           (SELECT e.id FROM escuelas e WHERE lower(trim(e.nombre)) = lower(trim(x.escuela))),
           x.numero, x.fecha, x.asunto, x.detalle, x.link_doc
    FROM jsonb_to_recordset($1::jsonb)
      AS x(fila_origen text, escuela text, numero text, fecha date, asunto text, detalle text, link_doc text)
    ON CONFLICT (fila_origen) DO UPDATE SET
      escuela_id = EXCLUDED.escuela_id, numero = EXCLUDED.numero, fecha = EXCLUDED.fecha,
      asunto = EXCLUDED.asunto, detalle = EXCLUDED.detalle,
      link_doc = coalesce(EXCLUDED.link_doc, memos.link_doc)`;
  const r = consultaNeon(sql, [JSON.stringify(memos)]);
  console.log('Memos sincronizados: ' + memos.length + ' (filas afectadas: ' + r.rowCount + ')');
}

// Envía SQL a Neon por HTTPS (mismo mecanismo que usa el driver serverless de Neon)
function consultaNeon(query, params) {
  const conexion = PropertiesService.getScriptProperties().getProperty('NEON_CONEXION');
  if (!conexion) throw new Error('Falta la propiedad NEON_CONEXION');
  const host = conexion.match(/@([^/:?]+)/)[1];
  const url = 'https://' + host.replace(/^[^.]+\./, 'api.') + '/sql';
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Neon-Connection-String': conexion, 'Neon-Raw-Text-Output': 'true' },
    payload: JSON.stringify({ query: query, params: params || [] }),
    muteHttpExceptions: true,
  });
  const cuerpo = JSON.parse(resp.getContentText() || '{}');
  if (resp.getResponseCode() !== 200) throw new Error('Neon respondió ' + resp.getResponseCode() + ': ' + (cuerpo.message || resp.getContentText()));
  return cuerpo;
}

function probarConexion() {
  const r = consultaNeon('SELECT nombre FROM escuelas ORDER BY nombre', []);
  console.log('Conexión OK. Escuelas en la app: ' + r.rows.map(x => x.nombre).join(', '));
}

function crearDisparador() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sincronizarMemos')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sincronizarMemos').timeBased().everyMinutes(10).create();
  console.log('Listo: sincroniza cada 10 minutos.');
}
