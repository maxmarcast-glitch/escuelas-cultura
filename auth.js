// Pantallas de acceso: ingresar, crear cuenta, recuperar contraseña y "no habilitado".

import { client } from './db.js';
import { $, esc, icon, avisar } from './ui.js';
import { NOMBRE_APP } from './config.js';

const urlApp = () => location.origin + location.pathname;

function marco(contenido) {
  const c = $('#acceso');
  c.innerHTML = `
    <div class="auth-card">
      <div class="brand">
        <div class="logo">${icon('school')}</div>
        <div><h1 class="title-l">${esc(NOMBRE_APP)}</h1><div class="body-s">Administración de escuelas</div></div>
      </div>
      ${contenido}
    </div>`;
  $('#arranque').hidden = true;
  $('#app').hidden = true;
  c.hidden = false;
  return c;
}

function errorEn(form, texto) {
  form.querySelector('[data-error]').textContent = texto;
}

function traducirAuth(err) {
  const m = (err?.message || '') + ' ' + (err?.code || '');
  if (/EMAIL_NOT_VERIFIED|not verified/i.test(m)) return 'Tenés que verificar tu mail antes de entrar. Revisá tu bandeja (y spam).';
  if (/INVALID_EMAIL_OR_PASSWORD|invalid/i.test(m)) return 'Mail o contraseña incorrectos.';
  if (/USER_ALREADY_EXISTS|already/i.test(m)) return 'Ya hay una cuenta con ese mail. Ingresá o recuperá la contraseña.';
  if (/PASSWORD_TOO_SHORT|too short/i.test(m)) return 'La contraseña es muy corta (mínimo 8 caracteres).';
  if (/fetch|network/i.test(m)) return 'Sin conexión con el servidor. Revisá internet.';
  return err?.message || 'No se pudo completar la operación.';
}

export function pantallaLogin(alEntrar, pestaña = 'ingresar') {
  const c = marco(`
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-tab="ingresar" aria-selected="${pestaña === 'ingresar'}">Ingresar</button>
      <button class="tab" role="tab" data-tab="registro" aria-selected="${pestaña === 'registro'}">Crear cuenta</button>
    </div>
    <div id="panel"></div>`);

  c.querySelectorAll('[data-tab]').forEach(b => (b.onclick = () => pantallaLogin(alEntrar, b.dataset.tab)));
  const panel = $('#panel', c);

  if (pestaña === 'ingresar') {
    panel.innerHTML = `
      <form novalidate>
        <div class="field"><label for="l-mail">Mail</label><input id="l-mail" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="l-pass">Contraseña</label><input id="l-pass" name="password" type="password" autocomplete="current-password" required></div>
        <p class="body-s" data-error role="alert" style="color:var(--error)"></p>
        <button class="btn btn-filled" style="width:100%">Ingresar</button>
        <div class="row between" style="margin-top:12px">
          <button type="button" class="btn btn-text" data-olvide>Olvidé mi contraseña</button>
          <button type="button" class="btn btn-text" data-reenviar hidden>Verificar mi mail</button>
        </div>
      </form>`;
    const f = $('form', panel);
    f.onsubmit = async e => {
      e.preventDefault();
      const email = f.email.value.trim().toLowerCase();
      const password = f.password.value;
      if (!email || !password) return errorEn(f, 'Completá mail y contraseña.');
      const btn = f.querySelector('button.btn-filled');
      btn.disabled = true; btn.textContent = 'Ingresando…';
      const { error } = await client.auth.signIn.email({ email, password });
      btn.disabled = false; btn.textContent = 'Ingresar';
      if (error) {
        errorEn(f, traducirAuth(error));
        if (/verif/i.test(traducirAuth(error))) f.querySelector('[data-reenviar]').hidden = false;
        return;
      }
      alEntrar();
    };
    f.querySelector('[data-olvide]').onclick = () => pantallaRecuperar(alEntrar);
    f.querySelector('[data-reenviar]').onclick = () => pantallaCodigo(f.email.value.trim().toLowerCase(), alEntrar);
  } else {
    panel.innerHTML = `
      <div class="banner">${icon('info')}<div>Usá el <b>mismo mail</b> con el que te habilitó el administrador. Si no estás habilitado, la cuenta se crea pero no vas a ver datos.</div></div>
      <form novalidate>
        <div class="field"><label for="r-nombre">Nombre y apellido</label><input id="r-nombre" name="name" autocomplete="name" required></div>
        <div class="field"><label for="r-mail">Mail</label><input id="r-mail" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="r-pass">Contraseña</label><input id="r-pass" name="password" type="password" minlength="8" autocomplete="new-password" required><span class="hint">Mínimo 8 caracteres.</span></div>
        <p class="body-s" data-error role="alert" style="color:var(--error)"></p>
        <button class="btn btn-filled" style="width:100%">Crear cuenta</button>
      </form>`;
    const f = $('form', panel);
    f.onsubmit = async e => {
      e.preventDefault();
      if (!f.checkValidity()) return errorEn(f, 'Completá todos los campos (contraseña de 8 caracteres o más).');
      const btn = f.querySelector('button');
      btn.disabled = true; btn.textContent = 'Creando…';
      const { error } = await client.auth.signUp.email({
        name: f.name.value.trim(),
        email: f.email.value.trim().toLowerCase(),
        password: f.password.value,
        callbackURL: urlApp(),
      });
      btn.disabled = false; btn.textContent = 'Crear cuenta';
      if (error) return errorEn(f, traducirAuth(error));
      pantallaCodigo(f.email.value.trim().toLowerCase(), alEntrar, false);
    };
  }
  c.querySelector('input')?.focus();
}

// Verificación del mail con el código que manda Neon Auth
function pantallaCodigo(email, alEntrar, reenviar = true) {
  const c = marco(`
    <h2 class="title-m" style="margin-bottom:8px">Verificá tu mail</h2>
    <p class="body-s">Te enviamos un código a <b>${esc(email)}</b>. Revisá también la carpeta de spam.</p>
    <form novalidate>
      <div class="field"><label for="otp">Código</label><input id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" required maxlength="10"></div>
      <p class="body-s" data-error role="alert" style="color:var(--error)"></p>
      <button class="btn btn-filled" style="width:100%">Verificar</button>
      <div class="row between" style="margin-top:12px">
        <button type="button" class="btn btn-text" data-volver>Volver</button>
        <button type="button" class="btn btn-text" data-reenviar>Reenviar código</button>
      </div>
    </form>`);
  const f = $('form', c);
  const enviar = async () => {
    const { error } = await client.auth.sendVerificationEmail({ email, callbackURL: urlApp() });
    error ? errorEn(f, traducirAuth(error)) : avisar('Te enviamos un código nuevo.');
  };
  if (reenviar) enviar();
  f.querySelector('[data-reenviar]').onclick = enviar;
  f.querySelector('[data-volver]').onclick = () => pantallaLogin(alEntrar);
  f.onsubmit = async e => {
    e.preventDefault();
    const otp = f.otp.value.trim();
    if (!otp) return errorEn(f, 'Escribí el código.');
    const { data, error } = await client.auth.emailOtp.verifyEmail({ email, otp });
    if (error) return errorEn(f, /invalid|expired/i.test(error.message || '') ? 'Código incorrecto o vencido. Pedí uno nuevo.' : traducirAuth(error));
    if (data?.session) return alEntrar();
    avisar('Mail verificado. Ya podés ingresar.');
    pantallaLogin(alEntrar);
  };
  f.otp.focus();
}

function pantallaRecuperar(alEntrar) {
  const c = marco(`
    <h2 class="title-m" style="margin-bottom:8px">Recuperar contraseña</h2>
    <p class="body-s">Te mandamos un enlace para crear una nueva.</p>
    <form novalidate>
      <div class="field"><label for="rc-mail">Mail</label><input id="rc-mail" name="email" type="email" required></div>
      <p class="body-s" data-error role="alert" style="color:var(--error)"></p>
      <div class="row between">
        <button type="button" class="btn btn-text" data-volver>Volver</button>
        <button class="btn btn-filled">Enviar enlace</button>
      </div>
    </form>`);
  const f = $('form', c);
  f.querySelector('[data-volver]').onclick = () => pantallaLogin(alEntrar);
  f.onsubmit = async e => {
    e.preventDefault();
    const email = f.email.value.trim().toLowerCase();
    if (!email) return errorEn(f, 'Escribí tu mail.');
    const { error } = await client.auth.requestPasswordReset({ email, redirectTo: urlApp() });
    if (error) return errorEn(f, traducirAuth(error));
    avisar('Si el mail está registrado, te llega el enlace en unos minutos.');
    pantallaLogin(alEntrar);
  };
}

export function pantallaNuevaContraseña(token, alEntrar) {
  const c = marco(`
    <h2 class="title-m" style="margin-bottom:12px">Nueva contraseña</h2>
    <form novalidate>
      <div class="field"><label for="np">Contraseña nueva</label><input id="np" name="password" type="password" minlength="8" autocomplete="new-password" required></div>
      <p class="body-s" data-error role="alert" style="color:var(--error)"></p>
      <button class="btn btn-filled" style="width:100%">Guardar</button>
    </form>`);
  const f = $('form', c);
  f.onsubmit = async e => {
    e.preventDefault();
    if (!f.checkValidity()) return errorEn(f, 'Mínimo 8 caracteres.');
    const { error } = await client.auth.resetPassword({ newPassword: f.password.value, token });
    if (error) return errorEn(f, traducirAuth(error));
    history.replaceState(null, '', urlApp());
    avisar('Contraseña actualizada. Ya podés ingresar.');
    pantallaLogin(alEntrar);
  };
}

export function pantallaNoHabilitado(email, alReintentar) {
  const c = marco(`
    <div class="banner warn">${icon('lock')}<div>
      <b>Tu cuenta todavía no está habilitada.</b><br>
      Ingresaste como <b>${esc(email)}</b>, pero ese mail no figura entre los usuarios de la app
      (o está dado de baja). Pedile al administrador que te dé de alta con este mismo mail.
    </div></div>
    <div class="row between">
      <button class="btn btn-text" data-salir>Cerrar sesión</button>
      <button class="btn btn-tonal" data-reintentar>${icon('refresh')} Reintentar</button>
    </div>`);
  c.querySelector('[data-reintentar]').onclick = alReintentar;
  c.querySelector('[data-salir]').onclick = async () => { await client.auth.signOut(); location.reload(); };
}
