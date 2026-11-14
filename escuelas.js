// Sección Escuelas (solo master): alta/edición de escuelas y ajustes generales.

import { client, q, cargarEscuelas } from './db.js';
import { esc, icon, cargando, vacio, abrirFormulario, avisar, avisarError } from './ui.js';
import { fab } from './comun.js';

export async function vistaEscuelas(cont) {
  cargando(cont);
  const [escuelas, cursos, perfiles] = await Promise.all([
    cargarEscuelas(),
    q(client.from('cursos').select('escuela_id, activo')),
    q(client.from('perfiles').select('escuela_id, activo')),
  ]);
  const cuenta = (lista, id) => lista.filter(x => x.escuela_id === id && x.activo).length;

  cont.innerHTML = `
    <div class="section-head"><h2 class="title-m">Escuelas</h2></div>
    ${escuelas.length ? `<ul class="list">${escuelas.map(e => `
      <li class="clickable ${e.activa ? '' : 'inactive'}" data-id="${e.id}">
        <div class="avatar">${icon('account_balance')}</div>
        <div class="grow"><div>${esc(e.nombre)}</div>
          <div class="body-s">${cuenta(cursos, e.id)} cursos activos · ${cuenta(perfiles, e.id)} usuarios</div></div>
        ${e.activa ? '' : '<span class="chip chip-neutral">Inactiva</span>'}
        ${e.link_formulario ? `<span class="chip chip-ok">${icon('description')} Formulario</span>` : '<span class="chip chip-warn">Sin formulario</span>'}
        ${icon('chevron_right')}
      </li>`).join('')}</ul>` : vacio('account_balance', 'No hay escuelas cargadas.')}
`;

  cont.onclick = async e => {
    const li = e.target.closest('[data-id]');
    if (li && await formularioEscuela(escuelas.find(x => x.id === Number(li.dataset.id)))) vistaEscuelas(cont);
  };

  fab('Nueva escuela', 'add', async () => { if (await formularioEscuela()) vistaEscuelas(cont); });
}

async function formularioEscuela(e = null) {
  const fd = await abrirFormulario({
    titulo: e ? 'Editar escuela' : 'Nueva escuela',
    html: `
      <div class="field"><label for="e-nom">Nombre</label><input id="e-nom" name="nombre" required maxlength="80" value="${esc(e?.nombre)}">
        <span class="hint">Si los memos vienen de un formulario compartido, tiene que ser idéntico a la opción del desplegable "Escuela".</span></div>
      <div class="field"><label for="e-link">Link del formulario de memos</label>
        <input id="e-link" name="link_formulario" type="url" placeholder="https://forms.gle/..." value="${esc(e?.link_formulario)}">
        <span class="hint">El link para responder (en el formulario: Enviar › ícono de enlace). Lo ven los usuarios de esta escuela.</span></div>
      ${e ? `<label class="row"><input type="checkbox" name="activa" ${e.activa ? 'checked' : ''}> Escuela activa</label>` : ''}`,
  });
  if (!fd) return false;
  const datos = { nombre: fd.get('nombre').trim(), link_formulario: fd.get('link_formulario').trim() || null };
  if (e) datos.activa = fd.get('activa') === 'on';
  try {
    if (e) await q(client.from('escuelas').update(datos).eq('id', e.id));
    else await q(client.from('escuelas').insert(datos));
    await cargarEscuelas();
    avisar(e ? 'Escuela actualizada.' : 'Escuela creada.');
    return true;
  } catch (err) { avisarError(err); return false; }
}
