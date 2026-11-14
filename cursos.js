// Sección Cursos: listado por escuela, detalle con alumnos y estado de cuotas.

import { client, estado, esMaster, q, nombreEscuela, escuelaTrabajo } from './db.js';
import { $, esc, icon, pesos, hora, diasTexto, DIAS, MESES_CICLO, iniciales, cargando, vacio,
  abrirFormulario, confirmar, avisar, avisarError } from './ui.js';
import { chipsEscuela, escucharChipsEscuela, fab, chipEstado } from './comun.js';
import { dialogoCuotasAlumno } from './cuotas.js';

let filtroTexto = '';

// ===================== LISTADO =====================
export async function vistaCursos(cont) {
  cargando(cont);
  const esc_id = escuelaTrabajo();

  let qc = client.from('cursos').select('id, nombre, dias, hora_inicio, hora_fin, docente, monto_cuota, activo, escuela_id').order('nombre');
  let qe = client.from('estado_alumnos').select('curso_id, cuotas_pagas, cuotas_exigibles, activo');
  if (esc_id) { qc = qc.eq('escuela_id', esc_id); qe = qe.eq('escuela_id', esc_id); }
  const [cursos, estados] = await Promise.all([q(qc), q(qe)]);

  const resumen = {};
  for (const e of estados) {
    if (!e.activo) continue;
    const r = (resumen[e.curso_id] ??= { total: 0, alDia: 0, deben: 0 });
    r.total++;
    e.cuotas_pagas >= e.cuotas_exigibles ? r.alDia++ : r.deben++;
  }
  const totAlumnos = Object.values(resumen).reduce((a, r) => a + r.total, 0);
  const totDeben = Object.values(resumen).reduce((a, r) => a + r.deben, 0);

  cont.innerHTML = `
    ${chipsEscuela()}
    <div class="stat-row">
      <div class="stat"><div class="label">Cursos activos</div><div class="n">${cursos.filter(c => c.activo).length}</div></div>
      <div class="stat"><div class="label">Alumnos activos</div><div class="n">${totAlumnos}</div></div>
      <div class="stat"><div class="label">Con cuotas adeudadas</div><div class="n">${totDeben}</div></div>
    </div>
    <label class="search">${icon('search')}<input type="search" placeholder="Buscar curso o docente" value="${esc(filtroTexto)}" aria-label="Buscar curso"></label>
    <div class="grid" id="lista-cursos"></div>`;

  const pintar = () => {
    const t = filtroTexto.toLowerCase();
    const lista = cursos
      .filter(c => !t || c.nombre.toLowerCase().includes(t) || (c.docente || '').toLowerCase().includes(t))
      .sort((a, b) => b.activo - a.activo);
    $('#lista-cursos', cont).innerHTML = lista.length ? lista.map(c => {
      const r = resumen[c.id] || { total: 0, alDia: 0, deben: 0 };
      return `
      <article class="card clickable" tabindex="0" data-curso="${c.id}" ${c.activo ? '' : 'style="opacity:.6"'}>
        <div class="row between"><h3>${esc(c.nombre)}</h3>${c.activo ? '' : '<span class="chip chip-neutral">De baja</span>'}</div>
        ${esMaster() && !estado.escuelaSel ? `<div class="body-s">${esc(nombreEscuela(c.escuela_id))}</div>` : ''}
        <div class="meta">
          <span>${icon('calendar_today')}${esc(diasTexto(c.dias))}</span>
          <span>${icon('schedule')}${esc(hora(c.hora_inicio))}–${esc(hora(c.hora_fin))}</span>
          ${c.docente ? `<span>${icon('person')}${esc(c.docente)}</span>` : ''}
          <span>${icon('payments')}${pesos(c.monto_cuota)}</span>
        </div>
        <div class="row">
          <span class="chip chip-neutral">${icon('groups')} ${r.total} alumnos</span>
          ${r.deben ? `<span class="chip chip-err">${r.deben} con deuda</span>` : r.total ? '<span class="chip chip-ok">Todos al día</span>' : ''}
        </div>
      </article>`;
    }).join('') : vacio('menu_book', cursos.length ? 'Ningún curso coincide con la búsqueda.' : 'Todavía no hay cursos cargados. Tocá "Nuevo curso".');
  };
  pintar();

  $('input[type=search]', cont).oninput = e => { filtroTexto = e.target.value; pintar(); };
  $('#lista-cursos', cont).onclick = e => { const c = e.target.closest('[data-curso]'); if (c) location.hash = '#/curso/' + c.dataset.curso; };
  $('#lista-cursos', cont).onkeydown = e => { if (e.key === 'Enter') e.target.closest('[data-curso]')?.click(); };
  escucharChipsEscuela(cont, () => vistaCursos(cont));

  fab('Nuevo curso', 'add', async () => {
    if (await formularioCurso()) vistaCursos(cont);
  });
}

// ===================== FORMULARIO CURSO =====================
async function formularioCurso(curso = null) {
  const escDef = curso?.escuela_id ?? escuelaTrabajo();
  const selectEscuela = esMaster()
    ? `<div class="field"><label for="c-esc">Escuela</label>
        <select id="c-esc" name="escuela_id" required>
          <option value="">Elegí una escuela</option>
          ${estado.escuelas.filter(e => e.activa || e.id === escDef).map(e => `<option value="${e.id}" ${e.id === escDef ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}
        </select></div>`
    : '';
  const fd = await abrirFormulario({
    titulo: curso ? 'Editar curso' : 'Nuevo curso',
    html: `
      ${selectEscuela}
      <div class="field"><label for="c-nom">Nombre del curso</label><input id="c-nom" name="nombre" required maxlength="80" value="${esc(curso?.nombre)}"></div>
      <div class="field"><label for="c-doc">Docente (opcional)</label><input id="c-doc" name="docente" maxlength="80" value="${esc(curso?.docente)}"></div>
      <div class="field"><label>Días</label>
        <div class="day-picker">${DIAS.map(([k, c]) => `<label><input type="checkbox" name="dias" value="${k}" ${curso?.dias?.includes(k) ? 'checked' : ''}><span>${c}</span></label>`).join('')}</div>
      </div>
      <div class="field-row">
        <div class="field"><label for="c-hi">Desde</label><input id="c-hi" name="hora_inicio" type="time" required value="${esc(hora(curso?.hora_inicio))}"></div>
        <div class="field"><label for="c-hf">Hasta</label><input id="c-hf" name="hora_fin" type="time" required value="${esc(hora(curso?.hora_fin))}"></div>
      </div>
      <div class="field"><label for="c-monto">Monto de la cuota ($)</label><input id="c-monto" name="monto_cuota" type="number" min="0" step="1" required value="${esc(curso?.monto_cuota ?? '')}"><span class="hint">Se propone al registrar cada pago; se puede cambiar en el momento.</span></div>
      ${curso ? `<label class="row" style="margin-top:4px"><input type="checkbox" name="activo" ${curso.activo ? 'checked' : ''}> Curso activo</label>` : ''}`,
  });
  if (!fd) return false;

  const datos = {
    nombre: fd.get('nombre').trim(),
    docente: fd.get('docente').trim() || null,
    dias: fd.getAll('dias'),
    hora_inicio: fd.get('hora_inicio'),
    hora_fin: fd.get('hora_fin'),
    monto_cuota: Number(fd.get('monto_cuota')),
    escuela_id: esMaster() ? Number(fd.get('escuela_id')) : estado.perfil.escuela_id,
  };
  if (curso) datos.activo = fd.get('activo') === 'on';
  if (!datos.dias.length) { avisar('Elegí al menos un día.', 'error'); return formularioCurso({ ...curso, ...datos }); }
  if (datos.hora_fin <= datos.hora_inicio) { avisar('La hora de fin tiene que ser posterior a la de inicio.', 'error'); return formularioCurso({ ...curso, ...datos }); }

  try {
    if (curso?.id) await q(client.from('cursos').update(datos).eq('id', curso.id));
    else await q(client.from('cursos').insert(datos));
    avisar(curso?.id ? 'Curso actualizado.' : 'Curso creado.');
    return true;
  } catch (err) { avisarError(err); return false; }
}

// ===================== DETALLE DE CURSO =====================
export async function vistaCurso(cont, id) {
  cargando(cont);
  const [curso] = await q(client.from('cursos').select('*').eq('id', id));
  if (!curso) { cont.innerHTML = vacio('search_off', 'No se encontró el curso (o no tenés acceso).'); return; }
  const [alumnos, estados] = await Promise.all([
    q(client.from('alumnos').select('id, nombre, apellido, activo').eq('curso_id', id).order('apellido').order('nombre')),
    q(client.from('estado_alumnos').select('alumno_id, cuotas_pagas, cuotas_exigibles').eq('curso_id', id)),
  ]);
  const est = Object.fromEntries(estados.map(e => [e.alumno_id, e]));
  $('#titulo').textContent = curso.nombre;

  const activos = alumnos.filter(a => a.activo);
  cont.innerHTML = `
    <button class="btn btn-text back" data-volver>${icon('arrow_back')} Cursos</button>
    <div class="card" style="margin-bottom:16px">
      <div class="row between">
        <div>
          <h3>${esc(curso.nombre)}</h3>
          <div class="body-s">${esc(nombreEscuela(curso.escuela_id))}${curso.activo ? '' : ' · <b>De baja</b>'}</div>
        </div>
        <div class="row">
          <button class="icon-btn" data-editar title="Editar curso" aria-label="Editar curso">${icon('edit')}</button>
          <button class="icon-btn" data-borrar title="Eliminar curso" aria-label="Eliminar curso">${icon('delete')}</button>
        </div>
      </div>
      <div class="meta">
        <span>${icon('calendar_today')}${esc(diasTexto(curso.dias))}</span>
        <span>${icon('schedule')}${esc(hora(curso.hora_inicio))}–${esc(hora(curso.hora_fin))}</span>
        ${curso.docente ? `<span>${icon('person')}${esc(curso.docente)}</span>` : ''}
        <span>${icon('payments')}Cuota ${pesos(curso.monto_cuota)}</span>
      </div>
      <div class="row">
        <a class="btn btn-tonal" href="#/cuotas" data-cuotas>${icon('grid_on')} Planilla de cuotas</a>
        <button class="btn btn-outlined" data-varios>${icon('playlist_add')} Cargar varios alumnos</button>
      </div>
    </div>
    <div class="section-head"><h2 class="title-m">Alumnos (${activos.length} activos)</h2><span class="body-s">Tocá un alumno para ver o registrar sus cuotas</span></div>
    ${alumnos.length ? `<ul class="list">${alumnos.map(a => `
      <li class="clickable ${a.activo ? '' : 'inactive'}" data-alumno="${a.id}">
        <div class="avatar">${esc(iniciales(a.nombre, a.apellido))}</div>
        <div class="grow"><div>${esc(a.apellido)}, ${esc(a.nombre)}</div>
          <div class="body-s">${a.activo ? `${est[a.id]?.cuotas_pagas ?? 0} de ${MESES_CICLO.length} cuotas pagas` : 'De baja'}</div></div>
        ${a.activo ? chipEstado(est[a.id]?.cuotas_pagas ?? 0, est[a.id]?.cuotas_exigibles ?? 0) : ''}
        <button class="icon-btn" data-edit-alumno="${a.id}" title="Editar alumno" aria-label="Editar ${esc(a.nombre)} ${esc(a.apellido)}">${icon('edit')}</button>
      </li>`).join('')}</ul>`
      : vacio('person_add', 'Este curso todavía no tiene alumnos. Tocá "Nuevo alumno".')}`;

  const recargar = () => vistaCurso(cont, id);
  $('[data-volver]', cont).onclick = () => (location.hash = '#/cursos');
  $('[data-cuotas]', cont).onclick = () => {
    sessionStorage.setItem('cursoCuotas', id);
    sessionStorage.setItem('escuelaCuotas', curso.escuela_id);
  };
  // Si después se abre Cuotas desde el menú, arranca en este curso
  sessionStorage.setItem('cursoCuotas', id);
  sessionStorage.setItem('escuelaCuotas', curso.escuela_id);
  $('[data-editar]', cont).onclick = async () => { if (await formularioCurso(curso)) recargar(); };
  $('[data-borrar]', cont).onclick = async () => {
    if (alumnos.length) return avisar('El curso tiene alumnos: editalo y desmarcá "Curso activo" para darlo de baja.', 'error');
    if (!(await confirmar('Eliminar curso', `¿Eliminar "${curso.nombre}"? No se puede deshacer.`))) return;
    try { await q(client.from('cursos').delete().eq('id', id)); avisar('Curso eliminado.'); location.hash = '#/cursos'; }
    catch (err) { avisarError(err); }
  };
  $('[data-varios]', cont).onclick = async () => { if (await cargarVarios(curso)) recargar(); };

  cont.querySelector('.list')?.addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit-alumno]');
    if (ed) {
      e.stopPropagation();
      const a = alumnos.find(x => x.id === Number(ed.dataset.editAlumno));
      if (await formularioAlumno(curso, a)) recargar();
      return;
    }
    const li = e.target.closest('[data-alumno]');
    if (li) {
      const a = alumnos.find(x => x.id === Number(li.dataset.alumno));
      if (await dialogoCuotasAlumno(a, curso)) recargar();
    }
  });

  fab('Nuevo alumno', 'person_add', async () => { if (await formularioAlumno(curso)) recargar(); });
}

// ===================== ALUMNOS =====================
async function formularioAlumno(curso, alumno = null) {
  const fd = await abrirFormulario({
    titulo: alumno ? 'Editar alumno' : 'Nuevo alumno',
    html: `
      <div class="field"><label for="a-ape">Apellido</label><input id="a-ape" name="apellido" required maxlength="60" value="${esc(alumno?.apellido)}"></div>
      <div class="field"><label for="a-nom">Nombre</label><input id="a-nom" name="nombre" required maxlength="60" value="${esc(alumno?.nombre)}"></div>
      ${alumno ? `<label class="row"><input type="checkbox" name="activo" ${alumno.activo ? 'checked' : ''}> Alumno activo (desmarcá para darlo de baja sin perder sus pagos)</label>
        <p style="margin-top:16px"><button type="button" class="btn btn-text" data-eliminar style="color:var(--error)">${icon('delete')} Eliminar alumno y sus cuotas</button></p>` : ''}`,
    alAbrir: d => {
      const b = d.querySelector('[data-eliminar]');
      if (b) b.onclick = async () => {
        d.close();
        if (await confirmar('Eliminar alumno', `Se borran ${alumno.nombre} ${alumno.apellido} y todas sus cuotas registradas. Si dejó de venir, mejor dalo de baja.`)) {
          try { await q(client.from('alumnos').delete().eq('id', alumno.id)); avisar('Alumno eliminado.'); location.reload(); }
          catch (err) { avisarError(err); }
        }
      };
    },
  });
  if (!fd) return false;
  const datos = { nombre: fd.get('nombre').trim(), apellido: fd.get('apellido').trim() };
  if (alumno) datos.activo = fd.get('activo') === 'on';
  try {
    if (alumno) await q(client.from('alumnos').update(datos).eq('id', alumno.id));
    else await q(client.from('alumnos').insert({ ...datos, curso_id: curso.id }));
    avisar(alumno ? 'Alumno actualizado.' : 'Alumno agregado.');
    return true;
  } catch (err) { avisarError(err); return false; }
}

async function cargarVarios(curso) {
  const fd = await abrirFormulario({
    titulo: 'Cargar varios alumnos',
    textoOk: 'Agregar',
    html: `
      <p class="body-s">Un alumno por línea, con el formato <b>Apellido, Nombre</b>. Podés pegar la columna desde Excel.</p>
      <div class="field"><label for="varios">Alumnos</label><textarea id="varios" name="lista" rows="8" required placeholder="Pérez, Juan&#10;Gómez, María"></textarea></div>`,
  });
  if (!fd) return false;
  const filas = fd.get('lista').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [apellido, ...resto] = l.split(/[,;\t]/);
    return { curso_id: curso.id, apellido: apellido.trim(), nombre: resto.join(' ').trim() || '-' };
  });
  if (!filas.length) return false;
  try {
    await q(client.from('alumnos').insert(filas));
    avisar(`Se agregaron ${filas.length} alumnos.`);
    return true;
  } catch (err) { avisarError(err); return false; }
}
