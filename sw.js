// Service worker: permite instalar la app y abrirla rápido.
// Los archivos de la app se buscan primero en la red (así siempre ves la última
// versión) y, si no hay conexión, se usa la copia guardada. Los datos de Neon
// nunca se guardan acá.

const CACHE = 'escuelas-v5';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'styles.css',
  'app.js', 'auth.js', 'comun.js', 'config.js', 'cuotas.js', 'cursos.js',
  'db.js', 'escuelas.js', 'memos.js', 'ui.js', 'usuarios.js',
  'neon.js', 'exportar.js', 'xlsx.js', 'icon.svg', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Neon, Google, etc.: directo a la red
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
