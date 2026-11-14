// Sección Usuarios (solo master): alta de usuarios por escuela y su estado.

import { client, estado, q, nombreEscuela } from './db.js';
import { $, esc, icon, iniciales, cargando, vacio, abrirFormulario, confirmar, avisar, avisarError } from './ui.js';
import { fab } from './comun.js';

export async function vistaUsuarios(cont) {
  cargando(cont);
  const perfiles = await q(client.from('perfiles').select('*').order('apellido').order('nombre'));

  const grupos = new Map();
  for (const p of perfiles) {
    const k = p.rol === 'master' ? 'Master' : nombreEscuela(p.escuela_id);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  }

  cont.innerHTML = `
    <div class="banner">${icon('info')}<div>
      Para dar de alta a alguien, cargalo acá con su mail. Después esa persona entra a la app, toca
      <b>Crear cuenta</b> con ese mismo mail y lo verifica. Hasta entonces figura como <b>Pendiente</b>.
    </div></div>
    ${[...grupos.entries()].map(([g, lista]) => `
      <div class="section-head" style="margin-top:20px"><h2 class="title-m">${esc(g)}</h2><span class="body-s">${lista.length} usuario(s)</span></div>
      <ul class="list">${lista.map(p => `
        <li class="clickable ${p.activo ? '' : 'inactive'}" data-id="${p.id}">
          <div class="avatar">${esc(iniciales(p.nombre, p.apellido))}</div>
          <div class="grow">
            <div>${esc(p.apellido)}, ${esc(p.nombre)} <span class="body-s">· Legajo ${esc(p.legajo)}</span></div>
            <div class="body-s">${esc(p.email)}</div>
          </div>
          ${!p.activo ? '<span class="chip chip-neutral">Inactivo</span>'
            : p.user_id ? '<span class="chip chip-ok">Activo</span>' : '<span class="chip chip-warn">Pendiente</span>'}
        </li>`).join('')}</ul>`).join('') || vacio('group', 'No hay usuarios.')}`;

  cont.onclick = async e => {
    const li = e.target.closest('[data-id]');
    if (!li) return;
    const p = perfiles.find(x => x.id === Number(li.dataset.id));
    if (await formularioUsuario(p)) vistaUsuarios(cont);
  };
  fab('Nuevo usuario', 'person_add', async () => { if (await formularioUsuario()) vistaUsuarios(cont); });
}

async function formularioUsuario(p = null) {
  const esMiPerfil = p?.id === estado.perfil.id;
  const fd = await abrirFormulario({
    titulo: p ? 'Editar usuario' : 'Nuevo usuario',
    html: `
      <div class="field-row">
        <div class="field"><label for="u-nom">Nombre</label><input id="u-nom" name="nombre" required maxlength="60" value="${esc(p?.nombre)}"></div>
        <div class="field"><label for="u-ape">Apellido</label><input id="u-ape" name="apellido" required maxlength="60" value="${esc(p?.apellido)}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="u-leg">Legajo</label><input id="u-leg" name="legajo" required maxlength="20" value="${esc(p?.legajo)}"></div>
        <div class="field"><label for="u-rol">Rol</label>
          <select id="u-rol" name="rol" ${esMiPerfil ? 'disabled' : ''}>
            <option value="administrativo" ${p?.rol !== 'master' ? 'selected' : ''}>Administrativo de escuela</option>
            <option value="master" ${p?.rol === 'master' ? 'selected' : ''}>Master (ve todo)</option>
          </select></div>
      </div>
      <div class="field"><label for="u-mail">Mail</label><input id="u-mail" name="email" type="email" required value="${esc(p?.email)}" ${p?.user_id ? 'readonly' : ''}>
        ${p?.user_id ? '<span class="hint">Ya vinculado: el mail no se puede cambiar.</span>' : '<span class="hint">Con este mail la persona crea su cuenta.</span>'}</div>
      <div class="field" data-campo-escuela><label for="u-esc">Escuela</label>
        <select id="u-esc" name="escuela_id">
          <option value="">Elegí una escuela</option>
          ${estado.escuelas.filter(e => e.activa || e.id === p?.escuela_id).map(e => `<option value="${e.id}" ${e.id === p?.escuela_id ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}
        </select></div>
      ${p && !esMiPerfil ? `<label class="row"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}> Usuario activo (desmarcá para quitarle el acceso)</label>` : ''}
      ${p?.user_id && !esMiPerfil ? `<label class="row" style="margin-top:8px"><input type="checkbox" name="desvincular"> Desvincular su cuenta (si la borraste en Neon para que se registre de nuevo)</label>` : ''}`,
    alAbrir: d => {
      const rol = d.querySelector('#u-rol'), campo = d.querySelector('[data-campo-escuela]'), sel = d.querySelector('#u-esc');
      const sync = () => { const m = rol.value === 'master'; campo.hidden = m; sel.required = !m; };
      rol.onchange = sync; sync();
    },
  });
  if (!fd) return false;

  const rol = esMiPerfil ? 'master' : fd.get('rol');
  const datos = {
    nombre: fd.get('nombre').trim(),
    apellido: fd.get('apellido').trim(),
    legajo: fd.get('legajo').trim(),
    email: fd.get('email').trim().toLowerCase(),
    rol,
    escuela_id: rol === 'master' ? null : Number(fd.get('escuela_id')),
  };
  if (p && !esMiPerfil) datos.activo = fd.get('activo') === 'on';
  if (p?.user_id) delete datos.email;
  if (fd.get('desvincular') === 'on') datos.user_id = null;

  try {
    if (p) await q(client.from('perfiles').update(datos).eq('id', p.id));
    else await q(client.from('perfiles').insert(datos));
    avisar(p ? 'Usuario actualizado.' : 'Usuario creado. Avisale que cree su cuenta con ese mail.');
    return true;
  } catch (err) { avisarError(err); return false; }
}
