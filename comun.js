// Piezas de interfaz que usan varias secciones.

import { estado, esMaster } from './db.js';
import { esc, icon } from './ui.js';

// Filtro de escuela (solo lo ve el master). conTodas: agrega la opción "Todas".
export function chipsEscuela(conTodas = true) {
  if (!esMaster()) return '';
  const opciones = [
    ...(conTodas ? [{ id: '', nombre: 'Todas' }] : []),
    ...estado.escuelas.filter(e => e.activa),
  ];
  const sel = estado.escuelaSel ?? '';
  return `<div class="filter-chips" role="group" aria-label="Filtrar por escuela">
    ${opciones.map(e => `<button class="filter-chip" data-escuela="${e.id}" aria-pressed="${String(e.id) === String(sel)}">${esc(e.nombre)}</button>`).join('')}
  </div>`;
}

export function escucharChipsEscuela(cont, alCambiar) {
  cont.querySelectorAll('[data-escuela]').forEach(b => (b.onclick = () => {
    estado.escuelaSel = b.dataset.escuela ? Number(b.dataset.escuela) : null;
    alCambiar();
  }));
}

// Botón flotante principal (M3 FAB extendido)
export function fab(texto, iconName, alClic) {
  document.querySelector('.fab')?.remove();
  const b = document.createElement('button');
  b.className = 'fab';
  b.innerHTML = `${icon(iconName)}<span>${esc(texto)}</span>`;
  b.onclick = alClic;
  document.body.appendChild(b);
}

// Estado de cuotas de un alumno → chip
export function chipEstado(pagas, exigibles) {
  const debe = Math.max(0, exigibles - pagas);
  if (exigibles === 0) return `<span class="chip chip-neutral">Ciclo sin iniciar</span>`;
  if (debe === 0) return `<span class="chip chip-ok">${icon('check_circle')} Al día</span>`;
  if (debe === 1) return `<span class="chip chip-warn">${icon('schedule')} Debe 1 cuota</span>`;
  return `<span class="chip chip-err">${icon('error')} Debe ${debe} cuotas</span>`;
}
