// Sección Memos: acceso al formulario de Google y consulta de memos generados.

import { client, estado, esMaster, q, nombreEscuela, escuelaTrabajo } from './db.js';
import { $, esc, icon, fecha, cargando, vacio } from './ui.js';
import { chipsEscuela, escucharChipsEscuela } from './comun.js';

let busqueda = '';

export async function vistaMemos(cont) {
  cargando(cont);
  const escId = escuelaTrabajo();
  let qm = client.from('memos').select('id, escuela_id, numero, fecha, asunto, detalle, link_doc').order('fecha', { ascending: false, nullsFirst: false }).limit(500);
  if (escId) qm = qm.eq('escuela_id', escId);
  const [memos, ajustes] = await Promise.all([
    q(qm),
    q(client.from('ajustes').select('valor').eq('clave', 'link_formulario_memos')),
  ]);
  const linkForm = ajustes[0]?.valor?.trim();
  const sinEscuela = esMaster() && !escId ? memos.filter(m => !m.escuela_id).length : 0;

  cont.innerHTML = `
    ${chipsEscuela()}
    <div class="card" style="margin-bottom:16px">
      <div class="row between">
        <div><h3>Nuevo memo</h3>
          <div class="body-s">Se completa en el formulario de Google; el documento lo genera Autocrat y aparece acá en unos minutos.</div></div>
        ${linkForm
          ? `<a class="btn btn-filled" href="${esc(linkForm)}" target="_blank" rel="noopener">${icon('open_in_new')} Abrir formulario</a>`
          : `<span class="chip chip-warn">${esMaster() ? 'Cargá el link en Escuelas › Ajustes' : 'Formulario sin configurar'}</span>`}
      </div>
    </div>
    ${sinEscuela ? `<div class="banner warn">${icon('warning')}<div>Hay <b>${sinEscuela}</b> memo(s) cuya escuela no coincide con ninguna cargada en la app. Revisá que las opciones del formulario tengan exactamente el mismo nombre que en Escuelas.</div></div>` : ''}
    <label class="search">${icon('search')}<input type="search" placeholder="Buscar por número, asunto o texto" value="${esc(busqueda)}" aria-label="Buscar memo"></label>
    <div id="res"></div>`;

  const pintar = () => {
    const t = busqueda.toLowerCase().trim();
    const lista = memos.filter(m => !t || [m.numero, m.asunto, m.detalle, fecha(m.fecha)].some(v => (v || '').toLowerCase().includes(t)));
    $('#res', cont).innerHTML = lista.length
      ? `<p class="body-s">${lista.length} memo(s)</p><ul class="list">${lista.map(m => `
          <li>
            <div class="avatar">${icon('description')}</div>
            <div class="grow">
              <div><b>${esc(m.numero || 'Sin número')}</b> · ${esc(m.asunto || 'Sin asunto')}</div>
              <div class="body-s">${fecha(m.fecha)}${esMaster() ? ' · ' + esc(m.escuela_id ? nombreEscuela(m.escuela_id) : 'Escuela sin identificar') : ''}</div>
            </div>
            ${m.link_doc
              ? `<a class="btn btn-tonal" href="${esc(m.link_doc)}" target="_blank" rel="noopener">${icon('open_in_new')} Abrir</a>`
              : '<span class="chip chip-neutral">Generando…</span>'}
          </li>`).join('')}</ul>`
      : vacio('find_in_page', memos.length ? 'Ningún memo coincide con la búsqueda.' : 'Todavía no hay memos sincronizados.');
  };
  pintar();
  $('input[type=search]', cont).oninput = e => { busqueda = e.target.value; pintar(); };
  escucharChipsEscuela(cont, () => vistaMemos(cont));
}
