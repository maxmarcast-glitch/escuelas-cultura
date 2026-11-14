// Arranque de la app: sesión, perfil, menú y navegación entre secciones.

import { client, estado, esMaster, q, cargarEscuelas } from './db.js';
import { $, esc, icon, avisarError } from './ui.js';
import { pantallaLogin, pantallaNoHabilitado, pantallaNuevaContraseña } from './auth.js';
import { vistaCursos, vistaCurso } from './cursos.js';
import { vistaCuotas } from './cuotas.js';
import { vistaMemos } from './memos.js';
import { vistaUsuarios } from './usuarios.js';
import { vistaEscuelas } from './escuelas.js';

const SECCIONES = [
  { id: 'cursos',   titulo: 'Cursos',   icono: 'menu_book',      vista: vistaCursos },
  { id: 'cuotas',   titulo: 'Cuotas',   icono: 'payments',       vista: vistaCuotas },
  { id: 'memos',    titulo: 'Memos',    icono: 'description',    vista: vistaMemos },
  { id: 'usuarios', titulo: 'Usuarios', icono: 'group',          vista: vistaUsuarios, soloMaster: true },
  { id: 'escuelas', titulo: 'Escuelas', icono: 'account_balance', vista: vistaEscuelas, soloMaster: true },
];

async function iniciar() {
  // Enlace de "recuperar contraseña": trae ?token=
  const token = new URLSearchParams(location.search).get('token');
  if (token) return pantallaNuevaContraseña(token, iniciar);

  try {
    const { data } = await client.auth.getSession();
    if (!data?.session) return pantallaLogin(iniciar);
    estado.usuario = data.user;

    const perfil = await q(client.rpc('vincular_perfil'));
    if (!perfil?.length) return pantallaNoHabilitado(data.user.email, iniciar);
    estado.perfil = perfil[0];

    await cargarEscuelas();
    if (!esMaster()) estado.escuelaSel = estado.perfil.escuela_id;
    mostrarApp();
  } catch (err) {
    avisarError(err);
    pantallaLogin(iniciar);
  }
}

function mostrarApp() {
  $('#arranque').hidden = true;
  $('#acceso').hidden = true;
  $('#app').hidden = false;

  const p = estado.perfil;
  $('#subtitulo').textContent = `${p.nombre} ${p.apellido} · ${esMaster() ? 'Master (todas las escuelas)' : p.escuela}`;

  $('#nav').innerHTML = SECCIONES.filter(s => !s.soloMaster || esMaster()).map(s => `
    <button class="nav-item" data-ir="${s.id}">
      <span class="pill">${icon(s.icono)}</span>${esc(s.titulo)}
    </button>`).join('');
  $('#nav').onclick = e => {
    const b = e.target.closest('[data-ir]');
    if (b) location.hash = '#/' + b.dataset.ir;
  };

  $('#btn-salir').onclick = async () => { await client.auth.signOut(); location.hash = ''; location.reload(); };

  window.onhashchange = enrutar;
  enrutar();
}

function enrutar() {
  const [, seccion = 'cursos', id] = location.hash.split('/');
  const cont = $('#vista');
  cont.onclick = null; // cada sección pone sus propios manejadores
  let s = SECCIONES.find(x => x.id === seccion);

  if (seccion === 'curso' && id) {
    s = SECCIONES[0];
    marcarNav('cursos', 'Curso');
    return vistaCurso(cont, Number(id)).catch(avisarError);
  }
  if (!s || (s.soloMaster && !esMaster())) { location.hash = '#/cursos'; return; }

  marcarNav(s.id, s.titulo);
  document.querySelector('.fab')?.remove();
  s.vista(cont).catch(avisarError);
  cont.focus({ preventScroll: true });
}

function marcarNav(id, titulo) {
  document.querySelector('.fab')?.remove();
  $('#titulo').textContent = titulo;
  document.title = `${titulo} · Escuelas`;
  document.querySelectorAll('.nav-item').forEach(b =>
    b.dataset.ir === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

iniciar();
