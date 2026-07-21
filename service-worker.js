const CACHE_NAME = 'box-estoque-v3.1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/entrada.html',
  '/saida.html',
  '/transferencia.html',
  '/inventario.html',
  '/visualizacao.html',
  '/qrcodes.html',
  '/movimentacoes.html',
  '/relatorios.html',
  '/cadastro_produto.html',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/assets/img/logo.webp',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.pathname.startsWith('/api/')) {
    if (e.request.method !== 'GET') {
      return;
    }
    e.respondWith(
      fetch(e.request).catch(() => {
        return new Response(JSON.stringify({ erro: 'Sem conexao' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        fetch(e.request).then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, response));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      });
    })
  );
});
