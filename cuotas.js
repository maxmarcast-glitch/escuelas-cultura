// Sección Cuotas: planilla alumno × mes (marzo a noviembre) y rendición por curso.

import { client, estado, esMaster, q, nombreEscuela } from './db.js';
import { $, esc, icon, pesos, fecha, hoyISO, MESES, MESES_CORTOS, MESES_CICLO, cargando, vacio,
  abrirFormulario, confirmar, avisar, avisarError, descargarCSV } from './ui.js';
import { chipsEscuela, escucharChipsEscuela } from './comun.js';

const anioActual = () => new Date().getFullYear();
const mesActual = () => new Date().getMonth() + 1;
let anioSel = anioActual();

// ¿El mes ya debería estar pago?
const vencido = (anio, mes) => anio < anioActual() || (anio === anioActual() && mes <= mesActual());

// ===================== PLANILLA =====================
export async function vistaCuotas(cont) {
  cargando(cont);
  // Si viene desde el detalle de un curso, abre la escuela de ese curso
  const escDesdeCurso = Number(sessionStorage.getItem('escuelaCuotas'));
  sessionStorage.removeItem('escuelaCuotas');
  if (esMaster() && escDesdeCurso) estado.escuelaSel = escDesdeCurso;
  // El master tiene que elegir una escuela concreta para ver la planilla
  if (esMaster() && !estado.escuelaSel) estado.escuelaSel = estado.escuelas.find(e => e.activa)?.id ?? null;
  const escuelaId = esMaster() ? estado.escuelaSel : estado.perfil.escuela_id;
  if (!escuelaId) { cont.innerHTML = vacio('account_balance', 'Primero creá una escuela en la sección Escuelas.'); return; }

  const cursos = await q(client.from('cursos').select('id, nombre, monto_cuota, activo').eq('escuela_id', escuelaId).order('nombre'));
  if (!cursos.length) {
    cont.innerHTML = chipsEscuela(false) + vacio('menu_book', 'Esta escuela no tiene cursos. Crealos en la sección Cursos.');
    escucharChipsEscuela(cont, () => vistaCuotas(cont));
    return;
  }

  let cursoId = Number(sessionStorage.getItem('cursoCuotas'));
  if (!cursos.some(c => c.id === cursoId)) cursoId = (cursos.find(c => c.activo) || cursos[0]).id;
  const curso = cursos.find(c => c.id === cursoId);

  const alumnos = await q(client.from('alumnos').select('id, nombre, apellido, activo').eq('curso_id', cursoId).order('apellido').order('nombre'));
  const ids = alumnos.map(a => a.id);
  const cuotas = ids.length
    ? await q(client.from('cuotas').select('id, alumno_id, mes, monto, fecha_pago, nro_recibo').in('alumno_id', ids).eq('anio', anioSel))
    : [];
  const pago = {}; // pago[alumno][mes] = cuota
  for (const c of cuotas) (pago[c.alumno_id] ??= {})[c.mes] = c;

  // Se muestran los activos y también los de baja que tengan pagos este año
  const filas = alumnos.filter(a => a.activo || pago[a.id]);
  const totalMes = m => cuotas.filter(c => c.mes === m).reduce((s, c) => s + Number(c.monto), 0);
  const cantMes = m => cuotas.filter(c => c.mes === m).length;
  const totalAnio = cuotas.reduce((s, c) => s + Number(c.monto), 0);

  cont.innerHTML = `
    ${chipsEscuela(false)}
    <div class="field-row" style="margin-bottom:8px">
      <div class="field"><label for="sel-curso">Curso</label>
        <select id="sel-curso">${cursos.map(c => `<option value="${c.id}" ${c.id === cursoId ? 'selected' : ''}>${esc(c.nombre)}${c.activo ? '' : ' (de baja)'}</option>`).join('')}</select></div>
      <div class="field"><label for="sel-anio">Año</label>
        <select id="sel-anio">${[anioActual() + 1, anioActual(), anioActual() - 1, anioActual() - 2].map(a => `<option ${a === anioSel ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="label">Cobrado ${anioSel}</div><div class="n">${pesos(totalAnio)}</div></div>
      <div class="stat"><div class="label">Cuota del curso</div><div class="n">${pesos(curso.monto_cuota)}</div></div>
      <div class="stat"><div class="label">Alumnos</div><div class="n">${filas.length}</div></div>
    </div>
    <div class="section-head">
      <div class="legend">
        <span><i class="dot" style="background:var(--success-container)"></i>Pagada</span>
        <span><i class="dot" style="border:1px dashed var(--error)"></i>Vencida sin pagar</span>
        <span><i class="dot" style="border:1px dashed var(--outline)"></i>Por vencer</span>
      </div>
      <button class="btn btn-tonal" data-csv ${cuotas.length ? '' : 'disabled'}>${icon('download')} Rendición (Excel)</button>
    </div>
    ${filas.length ? `
    <div class="table-wrap">
      <table class="cuotas">
        <thead><tr><th scope="col">Alumno</th>${MESES_CICLO.map(m => `<th scope="col" class="${anioSel === anioActual() && m === mesActual() ? 'actual' : ''}">${MESES_CORTOS[m]}</th>`).join('')}<th scope="col">Total</th></tr></thead>
        <tbody>${filas.map(a => `
          <tr>
            <th scope="row" style="font-weight:400">${esc(a.apellido)}, ${esc(a.nombre)}${a.activo ? '' : ' <span class="body-s">(baja)</span>'}</th>
            ${MESES_CICLO.map(m => {
              const c = pago[a.id]?.[m];
              const etiqueta = `${MESES[m]}, ${a.nombre} ${a.apellido}: ${c ? 'pagada ' + pesos(c.monto) : 'sin pagar'}`;
              return `<td><button class="cell ${c ? 'paga' : vencido(anioSel, m) ? 'vencida' : ''}" data-a="${a.id}" data-m="${m}" title="${esc(etiqueta)}" aria-label="${esc(etiqueta)}">${c ? icon('check') : ''}</button></td>`;
            }).join('')}
            <td>${pesos(Object.values(pago[a.id] || {}).reduce((s, c) => s + Number(c.monto), 0))}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Total del mes</td>${MESES_CICLO.map(m => `<td title="${cantMes(m)} pagos">${totalMes(m) ? pesos(totalMes(m)) : '—'}</td>`).join('')}<td>${pesos(totalAnio)}</td></tr></tfoot>
      </table>
    </div>` : vacio('group_off', 'Este curso no tiene alumnos activos.')}`;

  escucharChipsEscuela(cont, () => { sessionStorage.removeItem('cursoCuotas'); vistaCuotas(cont); });
  $('#sel-curso', cont).onchange = e => { sessionStorage.setItem('cursoCuotas', e.target.value); vistaCuotas(cont); };
  $('#sel-anio', cont).onchange = e => { anioSel = Number(e.target.value); vistaCuotas(cont); };

  cont.querySelector('table')?.addEventListener('click', async e => {
    const b = e.target.closest('.cell');
    if (!b) return;
    const alumno = alumnos.find(a => a.id === Number(b.dataset.a));
    const mes = Number(b.dataset.m);
    const c = pago[alumno.id]?.[mes];
    const cambio = c ? await detallePago(c, alumno) : await registrarPago(alumno, curso, mes, anioSel);
    if (cambio) vistaCuotas(cont);
  });

  $('[data-csv]', cont).onclick = () => {
    const enc = ['Apellido', 'Nombre', ...MESES_CICLO.map(m => MESES[m]), 'Total'];
    const cuerpo = filas.map(a => [a.apellido, a.nombre,
      ...MESES_CICLO.map(m => pago[a.id]?.[m]?.monto ?? ''),
      Object.values(pago[a.id] || {}).reduce((s, c) => s + Number(c.monto), 0)]);
    const pie = ['TOTAL', '', ...MESES_CICLO.map(totalMes), totalAnio];
    const titulo = [[`Rendición de cuotas ${anioSel}`], [`Escuela: ${nombreEscuela(escuelaId)}`], [`Curso: ${curso.nombre}`], []];
    descargarCSV(`rendicion_${curso.nombre.replace(/\W+/g, '_')}_${anioSel}.csv`, [...titulo, enc, ...cuerpo, pie]);
  };
}

// ===================== DIÁLOGOS =====================
async function registrarPago(alumno, curso, mes, anio) {
  const fd = await abrirFormulario({
    titulo: `Registrar cuota de ${MESES[mes]}`,
    textoOk: 'Registrar pago',
    html: `
      <p class="body-s">${esc(alumno.apellido)}, ${esc(alumno.nombre)} · ${esc(curso.nombre)} · ${anio}</p>
      <div class="field-row">
        <div class="field"><label for="p-monto">Monto ($)</label><input id="p-monto" name="monto" type="number" min="0" step="1" required value="${esc(curso.monto_cuota)}"></div>
        <div class="field"><label for="p-fecha">Fecha de pago</label><input id="p-fecha" name="fecha_pago" type="date" required value="${hoyISO()}" max="${hoyISO()}"></div>
      </div>
      <div class="field"><label for="p-rec">N.º de recibo (opcional)</label><input id="p-rec" name="nro_recibo" maxlength="40"></div>`,
  });
  if (!fd) return false;
  try {
    await q(client.from('cuotas').insert({
      alumno_id: alumno.id, anio, mes,
      monto: Number(fd.get('monto')),
      fecha_pago: fd.get('fecha_pago'),
      nro_recibo: fd.get('nro_recibo').trim() || null,
    }));
    avisar(`Cuota de ${MESES[mes]} registrada.`);
    return true;
  } catch (err) { avisarError(err); return false; }
}

async function detallePago(c, alumno) {
  const fd = await abrirFormulario({
    titulo: `Cuota de ${MESES[c.mes]}`,
    textoOk: 'Anular pago',
    peligro: true,
    html: `
      <ul class="list">
        <li><div class="grow"><div class="label">Alumno</div>${esc(alumno.apellido)}, ${esc(alumno.nombre)}</div></li>
        <li><div class="grow"><div class="label">Monto</div>${pesos(c.monto)}</div></li>
        <li><div class="grow"><div class="label">Fecha de pago</div>${fecha(c.fecha_pago)}</div></li>
        ${c.nro_recibo ? `<li><div class="grow"><div class="label">Recibo</div>${esc(c.nro_recibo)}</div></li>` : ''}
      </ul>
      <p class="body-s">Anulá el pago solo si se cargó por error.</p>`,
  });
  if (!fd) return false;
  if (!(await confirmar('Anular pago', `¿Seguro que querés anular la cuota de ${MESES[c.mes]}?`, 'Anular'))) return false;
  try { await q(client.from('cuotas').delete().eq('id', c.id)); avisar('Pago anulado.'); return true; }
  catch (err) { avisarError(err); return false; }
}

// Vista rápida desde el detalle del curso: las 9 cuotas de un alumno
export async function dialogoCuotasAlumno(alumno, curso) {
  const anio = anioActual();
  const cuotas = await q(client.from('cuotas').select('id, mes, monto, fecha_pago, nro_recibo').eq('alumno_id', alumno.id).eq('anio', anio));
  const pago = Object.fromEntries(cuotas.map(c => [c.mes, c]));
  let elegido = null;

  const fd = await abrirFormulario({
    titulo: `${alumno.apellido}, ${alumno.nombre}`,
    textoOk: 'Cerrar',
    html: `
      <p class="body-s">Cuotas ${anio} · tocá un mes para registrar o ver el pago</p>
      <ul class="list">${MESES_CICLO.map(m => {
        const c = pago[m];
        return `<li class="clickable" data-mes="${m}">
          <div class="grow">${MESES[m]}</div>
          ${c ? `<span class="body-s">${pesos(c.monto)} · ${fecha(c.fecha_pago)}</span><span class="chip chip-ok">${icon('check')} Paga</span>`
              : vencido(anio, m) ? '<span class="chip chip-err">Impaga</span>' : '<span class="chip chip-neutral">Por vencer</span>'}
        </li>`;
      }).join('')}</ul>`,
    alAbrir: d => {
      d.querySelector('[data-cancelar]').hidden = true;
      d.querySelector('.list').onclick = e => {
        const li = e.target.closest('[data-mes]');
        if (li) { elegido = Number(li.dataset.mes); d.close(); }
      };
    },
  });
  if (fd || elegido === null) return false;
  const cambio = pago[elegido] ? await detallePago(pago[elegido], alumno) : await registrarPago(alumno, curso, elegido, anio);
  if (cambio) return true;
  return dialogoCuotasAlumno(alumno, curso);
}
