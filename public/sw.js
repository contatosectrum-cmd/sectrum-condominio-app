// Sectrum Gestão — Service Worker (PWA React + Web Push Nativo iOS/Android p/ Interfone, Emergências e Encomendas)
const CACHE_NAME = 'sectrum-react-v15';
const PRECACHE = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('push', function (event) {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    try {
      payload = { body: event.data ? event.data.text() : '' };
    } catch {}
  }
  const data = payload.data || {};

  // Se a chamada ou emergência foi encerrada, fecha as notificações ativas correspondentes
  if (data.tipo === 'interfone_encerrado' || data.tipo === 'emergencia_encerrada') {
    event.waitUntil(
      (async function () {
        try {
          const antigas = await self.registration.getNotifications();
          for (const n of antigas) {
            if (
              n.tag &&
              (n.tag.startsWith('sectrum-interfone-call') || n.tag.startsWith('sectrum-emergencia'))
            ) {
              n.close();
            }
          }
        } catch {}
        const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of janelas) {
          try {
            client.postMessage({ type: 'SECTRUM_PUSH_INTERFONE', payload: payload, data: data });
          } catch {}
        }
      })()
    );
    return;
  }

  const ehEmergencia =
    data.tipo === 'emergencia' ||
    String(payload.title || '').includes('EMERGÊNCIA') ||
    String(payload.title || '').includes('EMERGENCIA');
  const ehInterfone =
    !ehEmergencia &&
    (data.tipo === 'interfone' || String(payload.title || '').includes('Interfone'));
  const ehUrgente = ehEmergencia || ehInterfone;

  const titulo =
    payload.title ||
    (payload.notification && payload.notification.title) ||
    (ehEmergencia
      ? '🚨 ALERTA DE EMERGÊNCIA NO CONDOMÍNIO!'
      : ehInterfone
        ? '📞 CHAMADA DE INTERFONE!'
        : '📦 Sectrum');
  const corpo =
    payload.body ||
    (payload.notification && payload.notification.body) ||
    (ehEmergencia
      ? '🆘 Um morador acionou o Botão de Emergência! Toque para ver o apartamento e prestar socorro.'
      : ehInterfone
        ? '📲 Interfone tocando para o seu apartamento! Toque aqui para ATENDER e conversar.'
        : 'Você tem uma nova notificação.');

  const urlNotif = payload.url || data.url || '/morador';
  const dadosCompletos = Object.assign({ url: urlNotif }, data);
  const furarNaoPerturbe = ehEmergencia && String(data.furar_nao_perturbe ?? '1') !== '0';
  const pulsoNum = String(data.pulso || '1');
  const tagChamada = ehEmergencia
    ? 'sectrum-emergencia-' + (data.emergencia_id || 'ativa') + (furarNaoPerturbe ? '-p' + pulsoNum : '')
    : ehInterfone
      ? 'sectrum-interfone-call-' + (data.call_id || 'ativa')
      : 'sectrum-notif';

  const opcoesNotif = {
    body: corpo,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: tagChamada,
    renotify: true,
    requireInteraction: ehUrgente,
    silent: false,
    sound: 'default',
    timestamp: Date.now(),
    vibrate: ehEmergencia
      ? furarNaoPerturbe
        ? [1000, 140, 500, 140, 500, 220, 1000, 140, 500, 140, 500]
        : [1000, 150, 1000, 150, 1000]
      : ehInterfone
        ? [800, 200, 800, 200, 900, 200, 800]
        : [200, 100, 200],
    data: dadosCompletos,
    actions: ehEmergencia
      ? [{ action: 'socorro', title: '🚨 Ver Alerta de Emergência' }]
      : ehInterfone
        ? [{ action: 'atender', title: '📞 Atender Chamada Agora' }]
        : [{ action: 'ver', title: '👀 Abrir App' }],
  };

  event.waitUntil(
    (async function () {
      // Quando furar_nao_perturbe está ativo, substitui a notificação anterior por uma nova tag de pulso
      // para forçar o sistema operacional (Android/iOS) a tocar o som em TODOS os pulsos e acionar o bypass
      // nativo de "Chamadas/Alertas Repetidos" do modo Não Perturbe.
      if (furarNaoPerturbe && pulsoNum !== '1') {
        try {
          const antigas = await self.registration.getNotifications();
          for (const n of antigas) {
            if (n.tag && n.tag.startsWith('sectrum-emergencia-') && n.tag !== tagChamada) {
              n.close();
            }
          }
        } catch {}
      }
      await self.registration.showNotification(titulo, opcoesNotif);
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of janelas) {
        try {
          client.postMessage({ type: 'SECTRUM_PUSH_INTERFONE', payload: payload, data: dadosCompletos });
        } catch {}
      }
    })()
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const urlDestino = (event.notification.data && event.notification.data.url) || '/morador';
  event.waitUntil(
    (async function () {
      try {
        const todas = await self.registration.getNotifications();
        for (const n of todas) {
          n.close();
        }
      } catch {}
      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          try {
            client.postMessage({
              type: 'SECTRUM_PUSH_INTERFONE',
              data: event.notification.data || {},
            });
          } catch {}
          try {
            await client.navigate(urlDestino);
          } catch {}
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlDestino);
      }
    })()
  );
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const tinhaAnterior = keys.some((k) => k !== CACHE_NAME);
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
      if (tinhaAnterior) {
        const janelas = await self.clients.matchAll({ type: 'window' });
        for (const c of janelas) {
          try { c.navigate(c.url); } catch {}
        }
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Nunca intercepta chamadas de API, WebSockets do Vite ou streaming go2rtc
  if (
    url.pathname.startsWith('/api.php') ||
    url.pathname.startsWith('/go2rtc') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }
  event.respondWith(
    fetch(req).catch(() =>
      caches.match(req).then((cached) => {
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return new Response(
            '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão — Sectrum</title><style>body{font-family:Inter,sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}.box{max-width:360px}h1{font-size:1.3em;font-weight:800;margin-bottom:10px}p{color:rgba(255,255,255,.65);font-size:.9em;line-height:1.6;margin-bottom:24px}button{background:#2563eb;color:#fff;border:none;padding:12px 28px;border-radius:10px;font-size:.95em;font-weight:600;cursor:pointer}</style></head><body><div class="box"><div style="font-size:3.5em;margin-bottom:16px">📡</div><h1>Sem conexão com a internet</h1><p>Verifique sua conexão e tente novamente. O Sectrum precisa de internet para funcionar.</p><button onclick="location.reload()">Tentar novamente</button></div></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
        return Response.error();
      })
    )
  );
});
