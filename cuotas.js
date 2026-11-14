// Sección Cuotas: planilla alumno × mes (marzo a noviembre), rendición mensual
// de la escuela y cierre de meses rendidos.

import { client, estado, esMaster, q, nombreEscuela } from './db.js';
import { $, esc, icon, pesos, fecha, hoyISO, MESES, MESES_CORTOS, MESES_CICLO, cargando, vacio,
  abrirFormulario, confirmar, avisar, avisarError, descargarCSV, paraArchivo } from './ui.js';
import { chipsEscuela, escucharChipsEscuela } from './comun.js';

const anioActual = () => new Date().getFullYear();
const mesActual = () => new Date().getMonth() + 1;
let anioSel = anioActual();
let modo = 'planilla';          // 'planilla' | 'rendicion'
let mesRendicion = null;

// ¿El mes ya debería estar pago?
const vencido = (anio, mes) => anio < anioActual() || (anio === anioActual() && mes <= mesActual());
const suma = lista => lista.reduce((s, c) => s + Number(c.monto), 0);
const nombreCompleto = a => `${a.apellido}, ${a.nombre}`;

// Motivos frecuentes cuando se cobra un monto distinto a la cuota del curso
const MOTIVOS_MONTO = ['Beca completa', 'Media beca', 'Descuento por hermanos', 'Pago parcial', 'Cuota con recargo', 'Ajuste de valor de cuota'];

// ===================== ENTRADA =====================
export async function vistaCuotas(cont) {
  cargando(cont);
  // Si viene desde el detalle de un curso, abre la escuela de ese curso
  const escDesdeCurso = Number(sessionStorage.getItem('escuelaCuotas'));
  sessionStorage.removeItem('escuelaCuotas');
  if (esMaster() && escDesdeCurso) estado.escuelaSel = escDesdeCurso;
  // El master tiene que elegir una escuela concreta
  if (esMaster() && !estado.escuelaSel) estado.escuelaSel = estado.escuelas.find(e => e.activa)?.id ?? null;
  const escuelaId = esMaster() ? estado.escuelaSel : estado.perfil.escuela_id;
  if (!escuelaId) { cont.innerHTML = vacio('account_balance', 'Primero creá una escuela en la sección Escuelas.'); return; }

  const [cursos, cierres] = await Promise.all([
    q(client.from('cursos').select('id, nombre, monto_cuota, activo').eq('escuela_id', escuelaId).order('nombre')),
    q(client.from('cierres').select('mes, cerrado_por, cerrado_en').eq('escuela_id', escuelaId).eq('anio', anioSel)),
  ]);
  const cerrado = Object.fromEntries(cierres.map(c => [c.mes, c]));

  const cabecera = `
    ${chipsEscuela(false)}
    <div class="filter-chips" role="group" aria-label="Vista">
      <button class="filter-chip" data-modo="planilla" aria-pressed="${modo === 'planilla'}">${icon('grid_on')} Planilla por curso</button>
      <button class="filter-chip" data-modo="rendicion" aria-pressed="${modo === 'rendicion'}">${icon('receipt_long')} Rendición y cierre del mes</button>
    </div>`;

  const ctx = { cont, escuelaId, cursos, cerrado, cabecera };
  if (!cursos.length) {
    cont.innerHTML = cabecera + vacio('menu_book', 'Esta escuela no tiene cursos. Crealos en la sección Cursos.');
  } else if (modo === 'rendicion') {
    await vistaRendicion(ctx);
  } else {
    await vistaPlanilla(ctx);
  }
  escucharChipsEscuela(cont, () => { sessionStorage.removeItem('cursoCuotas'); vistaCuotas(cont); });
  cont.querySelectorAll('[data-modo]').forEach(b => (b.onclick = () => { modo = b.dataset.modo; vistaCuotas(cont); }));
}

const selectorAnio = () => `
  <div class="field"><label for="sel-anio">Año</label>
    <select id="sel-anio">${[anioActual() + 1, anioActual(), anioActual() - 1, anioActual() - 2].map(a => `<option ${a === anioSel ? 'selected' : ''}>${a}</option>`).join('')}</select></div>`;

// ===================== PLANILLA POR CURSO =====================
async function vistaPlanilla({ cont, escuelaId, cursos, cerrado, cabecera }) {
  let cursoId = Number(sessionStorage.getItem('cursoCuotas'));
  if (!cursos.some(c => c.id === cursoId)) cursoId = (cursos.find(c => c.activo) || cursos[0]).id;
  const curso = cursos.find(c => c.id === cursoId);

  const alumnos = await q(client.from('alumnos').select('id, nombre, apellido, dni, activo').eq('curso_id', cursoId).order('apellido').order('nombre'));
  const ids = alumnos.map(a => a.id);
  const cuotas = ids.length
    ? await q(client.from('cuotas').select('*').in('alumno_id', ids).eq('anio', anioSel).eq('anulada', false))
    : [];
  const pago = {}; // pago[alumno][mes] = cuota vigente
  for (const c of cuotas) (pago[c.alumno_id] ??= {})[c.mes] = c;

  // Activos, y también los de baja que tengan pagos este año
  const filas = alumnos.filter(a => a.activo || pago[a.id]);
  const delMes = m => cuotas.filter(c => c.mes === m);
  const totalAnio = suma(cuotas);

  cont.innerHTML = `
    ${cabecera}
    <div class="field-row" style="margin-bottom:8px">
      <div class="field"><label for="sel-curso">Curso</label>
        <select id="sel-curso">${cursos.map(c => `<option value="${c.id}" ${c.id === cursoId ? 'selected' : ''}>${esc(c.nombre)}${c.activo ? '' : ' (de baja)'}</option>`).join('')}</select></div>
      ${selectorAnio()}
    </div>
    <div class="stat-row">
      <div class="stat"><div class="label">Cobrado ${anioSel}</div><div class="n">${pesos(totalAnio)}</div></div>
      <div class="stat"><div class="label">Cuota del curso</div><div class="n">${pesos(curso.monto_cuota)}</div></div>
      <div class="stat"><div class="label">Alumnos</div><div class="n">${filas.length}</div></div>
    </div>
    <div class="section-head">
      <div class="legend">
        <span><i class="dot" style="background:var(--success-container)"></i>Pagada</span>
        <span><i class="dot" style="background:var(--warning-container)"></i>Monto distinto</span>
        <span><i class="dot" style="border:1px dashed var(--error)"></i>Vencida sin pagar</span>
        <span>${icon('lock')} Mes cerrado</span>
      </div>
      <button class="btn btn-tonal" data-csv ${cuotas.length ? '' : 'disabled'}>${icon('download')} Planilla del curso (Excel)</button>
    </div>
    ${filas.length ? `
    <div class="table-wrap">
      <table class="cuotas">
        <thead><tr><th scope="col">Alumno</th>${MESES_CICLO.map(m => `
          <th scope="col" class="${anioSel === anioActual() && m === mesActual() ? 'actual' : ''}" ${cerrado[m] ? `title="Cerrado por ${esc(cerrado[m].cerrado_por)}"` : ''}>
            ${MESES_CORTOS[m]}${cerrado[m] ? ' ' + icon('lock') : ''}</th>`).join('')}<th scope="col">Total</th></tr></thead>
        <tbody>${filas.map(a => `
          <tr>
            <th scope="row" style="font-weight:400">${esc(nombreCompleto(a))}${a.activo ? '' : ' <span class="body-s">(baja)</span>'}</th>
            ${MESES_CICLO.map(m => {
              const c = pago[a.id]?.[m];
              const distinto = c && Number(c.monto) !== Number(curso.monto_cuota);
              const etiqueta = `${MESES[m]}, ${a.nombre} ${a.apellido}: ${c ? 'pagada ' + pesos(c.monto) + (c.observacion ? ' (' + c.observacion + ')' : '') : cerrado[m] ? 'sin pagar, mes cerrado' : 'sin pagar'}`;
              const clase = c ? (distinto ? 'paga distinta' : 'paga') : cerrado[m] ? 'cerrada' : vencido(anioSel, m) ? 'vencida' : '';
              return `<td><button class="cell ${clase}" data-a="${a.id}" data-m="${m}" title="${esc(etiqueta)}" aria-label="${esc(etiqueta)}">${c ? icon(distinto ? 'percent' : 'check') : ''}</button></td>`;
            }).join('')}
            <td>${pesos(suma(Object.values(pago[a.id] || {})))}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Total del mes</td>${MESES_CICLO.map(m => `<td title="${delMes(m).length} pagos">${delMes(m).length ? pesos(suma(delMes(m))) : '—'}</td>`).join('')}<td>${pesos(totalAnio)}</td></tr></tfoot>
      </table>
    </div>` : vacio('group_off', 'Este curso no tiene alumnos activos.')}`;

  $('#sel-curso', cont).onchange = e => { sessionStorage.setItem('cursoCuotas', e.target.value); vistaCuotas(cont); };
  $('#sel-anio', cont).onchange = e => { anioSel = Number(e.target.value); vistaCuotas(cont); };

  cont.querySelector('table')?.addEventListener('click', async e => {
    const b = e.target.closest('.cell');
    if (!b) return;
    const alumno = alumnos.find(a => a.id === Number(b.dataset.a));
    const mes = Number(b.dataset.m);
    const c = pago[alumno.id]?.[mes];
    if (!c && cerrado[mes]) return avisar(`${MESES[mes]} ya está cerrado: no se pueden cargar pagos.${esMaster() ? ' Podés reabrirlo desde "Rendición y cierre del mes".' : ''}`, 'error');
    const cambio = c ? await detallePago(c, alumno, !!cerrado[mes]) : await registrarPago(alumno, curso, mes, anioSel);
    if (cambio) vistaCuotas(cont);
  });

  $('[data-csv]', cont).onclick = () => {
    const enc = ['Apellido', 'Nombre', 'DNI', ...MESES_CICLO.map(m => MESES[m]), 'Total'];
    const cuerpo = filas.map(a => [a.apellido, a.nombre, a.dni || '',
      ...MESES_CICLO.map(m => pago[a.id]?.[m]?.monto ?? ''), suma(Object.values(pago[a.id] || {}))]);
    const pie = ['TOTAL', '', '', ...MESES_CICLO.map(m => suma(delMes(m))), totalAnio];
    const titulo = [[`Cuotas ${anioSel}`], [`Escuela: ${nombreEscuela(escuelaId)}`], [`Curso: ${curso.nombre}`], []];
    descargarCSV(`cuotas_${paraArchivo(curso.nombre)}_${anioSel}.csv`, [...titulo, enc, ...cuerpo, pie]);
  };
}

// ===================== RENDICIÓN Y CIERRE DEL MES =====================
async function vistaRendicion({ cont, escuelaId, cursos, cerrado, cabecera }) {
  // Mes por defecto: el último mes del ciclo que ya pasó (o el actual)
  if (!mesRendicion) mesRendicion = Math.min(Math.max(mesActual() - (new Date().getDate() < 10 ? 1 : 0), 3), 11);
  const mes = mesRendicion;

  const alumnos = await q(client.from('alumnos').select('id, curso_id, nombre, apellido, dni').in('curso_id', cursos.map(c => c.id)));
  const porId = Object.fromEntries(alumnos.map(a => [a.id, a]));
  const cuotas = alumnos.length
    ? await q(client.from('cuotas').select('*').in('alumno_id', alumnos.map(a => a.id)).eq('anio', anioSel).eq('mes', mes))
    : [];
  const vigentes = cuotas.filter(c => !c.anulada);
  const anuladas = cuotas.filter(c => c.anulada);
  const cursoDe = c => cursos.find(x => x.id === porId[c.alumno_id]?.curso_id);
  const porCurso = cursos.map(cu => ({ curso: cu, pagos: vigentes.filter(c => cursoDe(c)?.id === cu.id) })).filter(x => x.pagos.length || x.curso.activo);
  const total = suma(vigentes);
  const cierre = cerrado[mes];

  cont.innerHTML = `
    ${cabecera}
    <div class="field-row" style="margin-bottom:8px">
      <div class="field"><label for="sel-mes">Mes</label>
        <select id="sel-mes">${MESES_CICLO.map(m => `<option value="${m}" ${m === mes ? 'selected' : ''}>${MESES[m]}${cerrado[m] ? ' (cerrado)' : ''}</option>`).join('')}</select></div>
      ${selectorAnio()}
    </div>

    ${cierre
      ? `<div class="banner">${icon('lock')}<div><b>${MESES[mes]} ${anioSel} está cerrado.</b> Lo cerró ${esc(cierre.cerrado_por || '—')} el ${fecha(cierre.cerrado_en)}. No se pueden cargar ni anular pagos de este mes.</div></div>`
      : `<div class="banner warn">${icon('lock_open')}<div><b>${MESES[mes]} ${anioSel} está abierto.</b> Cuando presentes la rendición, cerralo para que no cambie.</div></div>`}

    <div class="stat-row">
      <div class="stat"><div class="label">Total cobrado</div><div class="n">${pesos(total)}</div></div>
      <div class="stat"><div class="label">Pagos</div><div class="n">${vigentes.length}</div></div>
      <div class="stat"><div class="label">Anulados en el mes</div><div class="n">${anuladas.length}</div></div>
    </div>

    <ul class="list" style="margin-bottom:16px">
      ${porCurso.map(({ curso, pagos }) => `
        <li><div class="grow"><div>${esc(curso.nombre)}</div><div class="body-s">${pagos.length} pago(s)${pagos.some(p => p.observacion) ? ' · con montos distintos' : ''}</div></div>
          <b>${pesos(suma(pagos))}</b></li>`).join('')}
      <li><div class="grow"><b>Total ${esc(nombreEscuela(escuelaId))}</b></div><b>${pesos(total)}</b></li>
    </ul>

    ${anuladas.length ? `
      <div class="section-head"><h2 class="title-m">Pagos anulados en ${MESES[mes]}</h2></div>
      <ul class="list" style="margin-bottom:16px">${anuladas.map(c => `
        <li class="inactive"><div class="grow"><div><s>${esc(nombreCompleto(porId[c.alumno_id] || {}))} · ${pesos(c.monto)}</s></div>
          <div class="body-s">Anuló ${esc(c.anulada_por || '—')} el ${fecha(c.anulada_en)}: ${esc(c.motivo_anulacion)}</div></div></li>`).join('')}</ul>` : ''}

    <div class="row">
      <button class="btn btn-tonal" data-descargar ${cuotas.length ? '' : 'disabled'}>${icon('download')} Descargar rendición (Excel)</button>
      ${cierre
        ? (esMaster() ? `<button class="btn btn-outlined" data-reabrir>${icon('lock_open')} Reabrir mes</button>` : '')
        : `<button class="btn btn-filled" data-cerrar>${icon('lock')} Cerrar ${MESES[mes]}</button>`}
    </div>`;

  $('#sel-mes', cont).onchange = e => { mesRendicion = Number(e.target.value); vistaCuotas(cont); };
  $('#sel-anio', cont).onchange = e => { anioSel = Number(e.target.value); vistaCuotas(cont); };

  $('[data-descargar]', cont).onclick = () => {
    const filas = [
      [`Rendición de cuotas · ${MESES[mes]} ${anioSel}`], [`Escuela: ${nombreEscuela(escuelaId)}`],
      [`Estado: ${cierre ? `cerrado por ${cierre.cerrado_por} el ${fecha(cierre.cerrado_en)}` : 'abierto (sin cerrar)'}`],
      [`Generado: ${new Date().toLocaleString('es-AR')} por ${estado.perfil.nombre} ${estado.perfil.apellido}`], [],
      ['Curso', 'Apellido', 'Nombre', 'DNI', 'Fecha de pago', 'Recibo', 'Monto', 'Observación', 'Registró'],
    ];
    for (const { curso, pagos } of porCurso) {
      for (const c of pagos.sort((a, b) => nombreCompleto(porId[a.alumno_id]).localeCompare(nombreCompleto(porId[b.alumno_id])))) {
        const a = porId[c.alumno_id];
        filas.push([curso.nombre, a.apellido, a.nombre, a.dni || '', fecha(c.fecha_pago), c.nro_recibo || '', Number(c.monto), c.observacion || '', c.registrado_nombre || '']);
      }
      if (pagos.length) filas.push([`Subtotal ${curso.nombre}`, '', '', '', '', '', suma(pagos)]);
    }
    filas.push([], ['TOTAL ESCUELA', '', '', '', '', '', total]);
    if (anuladas.length) {
      filas.push([], ['PAGOS ANULADOS (no suman)'], ['Apellido', 'Nombre', 'Monto', 'Anuló', 'Fecha', 'Motivo']);
      for (const c of anuladas) { const a = porId[c.alumno_id]; filas.push([a.apellido, a.nombre, Number(c.monto), c.anulada_por, fecha(c.anulada_en), c.motivo_anulacion]); }
    }
    descargarCSV(`rendicion_${paraArchivo(nombreEscuela(escuelaId))}_${anioSel}_${String(mes).padStart(2, '0')}.csv`, filas);
  };

  const btnCerrar = $('[data-cerrar]', cont);
  if (btnCerrar) btnCerrar.onclick = async () => {
    const ok = await confirmar(`Cerrar ${MESES[mes]} ${anioSel}`,
      `Total: ${pesos(total)} en ${vigentes.length} pagos. Una vez cerrado no se podrán cargar ni anular pagos de ${MESES[mes]} en ${nombreEscuela(escuelaId)}. Solo el master puede reabrirlo.`,
      'Cerrar mes');
    if (!ok) return;
    try { await q(client.from('cierres').insert({ escuela_id: escuelaId, anio: anioSel, mes })); avisar(`${MESES[mes]} cerrado.`); vistaCuotas(cont); }
    catch (err) { avisarError(err); }
  };
  const btnReabrir = $('[data-reabrir]', cont);
  if (btnReabrir) btnReabrir.onclick = async () => {
    if (!(await confirmar(`Reabrir ${MESES[mes]}`, 'Se van a poder volver a cargar y anular pagos de este mes. Si ya presentaste la rendición, tendrás que rehacerla.', 'Reabrir'))) return;
    try { await q(client.from('cierres').delete().eq('escuela_id', escuelaId).eq('anio', anioSel).eq('mes', mes)); avisar(`${MESES[mes]} reabierto.`); vistaCuotas(cont); }
    catch (err) { avisarError(err); }
  };
}

// ===================== DIÁLOGOS =====================
async function registrarPago(alumno, curso, mes, anio) {
  const fd = await abrirFormulario({
    titulo: `Registrar cuota de ${MESES[mes]}`,
    textoOk: 'Registrar pago',
    html: `
      <p class="body-s">${esc(nombreCompleto(alumno))} · ${esc(curso.nombre)} · ${anio}</p>
      <div class="field-row">
        <div class="field"><label for="p-monto">Monto ($)</label><input id="p-monto" name="monto" type="number" min="0" step="1" required value="${esc(curso.monto_cuota)}"></div>
        <div class="field"><label for="p-fecha">Fecha de pago</label><input id="p-fecha" name="fecha_pago" type="date" required value="${hoyISO()}" max="${hoyISO()}"></div>
      </div>
      <div class="field" data-campo-obs hidden>
        <label for="p-obs">Motivo del monto distinto</label>
        <input id="p-obs" name="observacion" list="motivos-monto" maxlength="120" placeholder="Ej.: Media beca">
        <datalist id="motivos-monto">${MOTIVOS_MONTO.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
        <span class="hint">La cuota del curso es ${pesos(curso.monto_cuota)}. Queda registrado para la rendición.</span>
      </div>
      <div class="field"><label for="p-rec">N.º de recibo (opcional)</label><input id="p-rec" name="nro_recibo" maxlength="40"></div>`,
    alAbrir: d => {
      const monto = d.querySelector('#p-monto'), campo = d.querySelector('[data-campo-obs]'), obs = d.querySelector('#p-obs');
      const sync = () => { const dist = Number(monto.value) !== Number(curso.monto_cuota); campo.hidden = !dist; obs.required = dist; };
      monto.oninput = sync; sync();
    },
  });
  if (!fd) return false;
  const monto = Number(fd.get('monto'));
  try {
    await q(client.from('cuotas').insert({
      alumno_id: alumno.id, anio, mes, monto,
      fecha_pago: fd.get('fecha_pago'),
      nro_recibo: fd.get('nro_recibo').trim() || null,
      observacion: monto !== Number(curso.monto_cuota) ? fd.get('observacion').trim() : null,
    }));
    avisar(`Cuota de ${MESES[mes]} registrada.`);
    return true;
  } catch (err) { avisarError(err); return false; }
}

async function detallePago(c, alumno, mesCerrado = false) {
  const datos = `
    <ul class="list">
      <li><div class="grow"><div class="label">Alumno</div>${esc(nombreCompleto(alumno))}</div></li>
      <li><div class="grow"><div class="label">Monto</div>${pesos(c.monto)}${c.observacion ? ` · ${esc(c.observacion)}` : ''}</div></li>
      <li><div class="grow"><div class="label">Fecha de pago</div>${fecha(c.fecha_pago)}${c.nro_recibo ? ` · Recibo ${esc(c.nro_recibo)}` : ''}</div></li>
      <li><div class="grow"><div class="label">Registró</div>${esc(c.registrado_nombre || '—')} · ${fecha(c.creado_en)}</div></li>
    </ul>`;
  if (mesCerrado) {
    await abrirFormulario({ titulo: `Cuota de ${MESES[c.mes]}`, textoOk: 'Cerrar', html: datos + `<p class="body-s">${icon('lock')} El mes está cerrado: este pago ya no se puede anular.</p>`, alAbrir: d => { d.querySelector('[data-cancelar]').hidden = true; } });
    return false;
  }
  const fd = await abrirFormulario({
    titulo: `Cuota de ${MESES[c.mes]}`,
    textoOk: 'Anular pago',
    peligro: true,
    html: datos + `
      <p class="body-s" style="margin-top:12px">Si el pago se cargó por error, anulalo indicando el motivo. No se borra: queda registrado quién lo anuló y por qué.</p>
      <div class="field"><label for="p-motivo">Motivo de la anulación</label>
        <input id="p-motivo" name="motivo" minlength="5" maxlength="200" required placeholder="Ej.: se cargó en el alumno equivocado"></div>`,
  });
  if (!fd) return false;
  try {
    await q(client.rpc('anular_cuota', { p_id: c.id, p_motivo: fd.get('motivo').trim() }));
    avisar('Pago anulado. Quedó registrado en la rendición del mes.');
    return true;
  } catch (err) { avisarError(err); return false; }
}

// Vista rápida desde el detalle del curso: las cuotas del año de un alumno
export async function dialogoCuotasAlumno(alumno, curso) {
  const anio = anioActual();
  const [cuotas, cierres] = await Promise.all([
    q(client.from('cuotas').select('*').eq('alumno_id', alumno.id).eq('anio', anio).eq('anulada', false)),
    q(client.from('cierres').select('mes').eq('escuela_id', curso.escuela_id).eq('anio', anio)),
  ]);
  const pago = Object.fromEntries(cuotas.map(c => [c.mes, c]));
  const cerrado = new Set(cierres.map(c => c.mes));
  let elegido = null;

  const fd = await abrirFormulario({
    titulo: nombreCompleto(alumno),
    textoOk: 'Cerrar',
    html: `
      <p class="body-s">Cuotas ${anio} · tocá un mes para registrar o ver el pago</p>
      <ul class="list">${MESES_CICLO.map(m => {
        const c = pago[m];
        return `<li class="clickable" data-mes="${m}">
          <div class="grow">${MESES[m]}${cerrado.has(m) ? ' ' + icon('lock') : ''}</div>
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
  if (!pago[elegido] && cerrado.has(elegido)) { avisar(`${MESES[elegido]} ya está cerrado: no se pueden cargar pagos.`, 'error'); return dialogoCuotasAlumno(alumno, curso); }
  const cambio = pago[elegido] ? await detallePago(pago[elegido], alumno, cerrado.has(elegido)) : await registrarPago(alumno, curso, elegido, anio);
  if (cambio) return true;
  return dialogoCuotasAlumno(alumno, curso);
}
