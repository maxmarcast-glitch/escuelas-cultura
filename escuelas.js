// Sección Escuelas (solo master): alta/edición de escuelas y ajustes generales.

import { client, q, cargarEscuelas } from './db.js';
import { esc, icon, cargando, vacio, abrirFormulario, avisar, avisarError } from './ui.js';
import { fab } from './comun.js';

export async function vistaEscuelas(cont) {
  cargando(cont);
  const [escuelas, cursos, perfiles, ajustes] = await Promise.all([
    cargarEscuelas(),
    q(client.from('cursos').select('escuela_id, activo')),
    q(client.from('perfiles').select('escuela_id, activo')),
    q(client.from('ajustes').select('clave, valor')),
  ]);
  const cuenta = (lista, id) => lista.filter(x => x.escuela_id === id && x.activo).length;
  const linkForm = ajustes.find(a => a.clave === 'link_formulario_memos')?.valor || '';

  cont.innerHTML = `
    <div class="section-head"><h2 class="title-m">Escuelas</h2></div>
    ${escuelas.length ? `<ul class="list">${escuelas.map(e => `
      <li class="clickable ${e.activa ? '' : 'inactive'}" data-id="${e.id}">
        <div class="avatar">${icon('account_balance')}</div>
        <div class="grow"><div>${esc(e.nombre)}</div>
          <div class="body-s">${cuenta(cursos, e.id)} cursos activos · ${cuenta(perfiles, e.id)} usuarios</div></div>
        ${e.activa ? '' : '<span class="chip chip-neutral">Inactiva</span>'}
        ${icon('chevron_right')}
      </li>`).join('')}</ul>` : vacio('account_balance', 'No hay escuelas cargadas.')}

    <div class="section-head" style="margin-top:28px"><h2 class="title-m">Ajustes</h2></div>
    <div class="card">
      <div class="row between">
        <div style="min-width:0"><h3>Formulario de memos</h3>
          <div class="body-s" style="word-break:break-all">${linkForm ? esc(linkForm) : 'Sin configurar'}</div></div>
        <button class="btn btn-tonal" data-link>${icon('link')} ${linkForm ? 'Cambiar link' : 'Cargar link'}</button>
      </div>
    </div>`;

  cont.onclick = async e => {
    if (e.target.closest('[data-link]')) {
      const fd = await abrirFormulario({
        titulo: 'Link del formulario de memos',
        html: `<div class="field"><label for="lf">Link de Google Forms</label>
          <input id="lf" name="valor" type="url" placeholder="https://forms.gle/..." value="${esc(linkForm)}">
          <span class="hint">El link para responder (botón Enviar › ícono de enlace).</span></div>`,
      });
      if (!fd) return;
      try {
        await q(client.from('ajustes').update({ valor: fd.get('valor').trim() }).eq('clave', 'link_formulario_memos'));
        avisar('Link guardado.'); vistaEscuelas(cont);
      } catch (err) { avisarError(err); }
      return;
    }
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
        <span class="hint">Tiene que ser idéntico a la opción del desplegable "Escuela" del formulario de memos.</span></div>
      ${e ? `<label class="row"><input type="checkbox" name="activa" ${e.activa ? 'checked' : ''}> Escuela activa</label>` : ''}`,
  });
  if (!fd) return false;
  const datos = { nombre: fd.get('nombre').trim() };
  if (e) datos.activa = fd.get('activa') === 'on';
  try {
    if (e) await q(client.from('escuelas').update(datos).eq('id', e.id));
    else await q(client.from('escuelas').insert(datos));
    await cargarEscuelas();
    avisar(e ? 'Escuela actualizada.' : 'Escuela creada.');
    return true;
  } catch (err) { avisarError(err); return false; }
}
