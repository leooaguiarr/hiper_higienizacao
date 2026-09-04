// Service worker da Hiper Higienizações.
//
// Responsabilidades:
//   1. Deixar o app abrir sem internet (cache do app shell e do SDK).
//   2. Acordar uma vez por dia no Android para lembrar dos serviços do dia.
//
// Suba a VERSAO a cada alteração de arquivo estático: o cache antigo é
// descartado no activate.

const VERSAO = 'hiper-v3';
const CACHE_APP = `${VERSAO}-app`;
const CACHE_EXTERNO = `${VERSAO}-externo`;
const CACHE_DADOS = 'hiper-dados';
const CHAVE_LEMBRETES = '/__lembretes';

// Arquivos próprios, suficientes para a interface abrir offline.
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/store.js',
  '/js/seed.js',
  '/js/utils.js',
  '/js/notificacoes.js',
  '/js/firebase-config.js',
  '/manifest.webmanifest',
  '/assets/logo-hiper.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon-maskable-512.png'
];

// Hosts de terceiros que valem cachear: SDK, fontes e ícones.
const HOSTS_ESTATICOS = [
  'www.gstatic.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com'
];

self.addEventListener('install', evento => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    // addAll falha inteiro se um arquivo faltar; aqui cada um é independente.
    await Promise.allSettled(APP_SHELL.map(caminho => cache.add(caminho)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', evento => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes
      .filter(nome => nome !== CACHE_APP && nome !== CACHE_EXTERNO && nome !== CACHE_DADOS)
      .map(nome => caches.delete(nome)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', evento => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);

  // O Firestore mantém o próprio cache em IndexedDB e usa long-polling:
  // interceptar essas chamadas quebraria a sincronização.
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('firebaseio.com')) return;

  // Navegação: rede primeiro, para pegar deploys novos; cache como rede de
  // segurança quando não há conexão.
  if (requisicao.mode === 'navigate') {
    evento.respondWith((async () => {
      try {
        const resposta = await fetch(requisicao);
        const cache = await caches.open(CACHE_APP);
        cache.put('/index.html', resposta.clone());
        return resposta;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  const mesmaOrigem = url.origin === self.location.origin;
  const externoEstatico = HOSTS_ESTATICOS.includes(url.hostname);
  if (!mesmaOrigem && !externoEstatico) return;

  // Estáticos: responde do cache na hora e revalida em segundo plano.
  evento.respondWith((async () => {
    const nomeCache = mesmaOrigem ? CACHE_APP : CACHE_EXTERNO;
    const cache = await caches.open(nomeCache);
    const emCache = await cache.match(requisicao);
    const naRede = fetch(requisicao).then(resposta => {
      if (resposta && resposta.ok) cache.put(requisicao, resposta.clone());
      return resposta;
    }).catch(() => null);
    return emCache || (await naRede) || Response.error();
  })());
});

/* ------------------------------------------------------------ Lembretes -- */

// O app grava aqui um resumo dos agendamentos; o service worker não enxerga
// o localStorage nem o estado da página, então esta é a ponte entre os dois.
async function lerLembretes() {
  try {
    const cache = await caches.open(CACHE_DADOS);
    const resposta = await cache.match(CHAVE_LEMBRETES);
    return resposta ? await resposta.json() : null;
  } catch { return null; }
}

function hojeISO() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

async function notificarDoDia() {
  const dados = await lerLembretes();
  if (!dados || !Array.isArray(dados.agendamentos)) return;

  const hoje = hojeISO();
  if (dados.ultimoAviso === hoje) return;

  const doDia = dados.agendamentos
    .filter(item => item.date === hoje && item.status !== 'canceled' && item.status !== 'completed')
    .sort((a, b) => a.time.localeCompare(b.time));
  if (!doDia.length) return;

  const primeiro = doDia[0];
  const titulo = doDia.length === 1
    ? `1 serviço hoje, às ${primeiro.time}`
    : `${doDia.length} serviços hoje, a partir das ${primeiro.time}`;
  const corpo = doDia.slice(0, 3).map(item => `${item.time} · ${item.cliente} - ${item.endereco || ''}`.trim()).join('\n');

  await self.registration.showNotification(titulo, {
    body: corpo,
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    tag: 'hiper-agenda-do-dia',
    renotify: false,
    data: { url: '/?tela=agenda' }
  });

  const cache = await caches.open(CACHE_DADOS);
  await cache.put(CHAVE_LEMBRETES, new Response(JSON.stringify({ ...dados, ultimoAviso: hoje })));
}

// Disponível no Android com a PWA instalada; o intervalo real é decidido
// pelo navegador conforme o uso do app.
self.addEventListener('periodicsync', evento => {
  if (evento.tag === 'lembretes-hiper') evento.waitUntil(notificarDoDia());
});

// Permite que a página peça a verificação (usado ao abrir o app).
self.addEventListener('message', evento => {
  if (evento.data && evento.data.tipo === 'verificar-lembretes') {
    evento.waitUntil(notificarDoDia());
  }
});

self.addEventListener('notificationclick', evento => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || '/';
  evento.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = janelas.find(janela => janela.url.includes(self.location.origin));
    if (aberta) { await aberta.focus(); return aberta.navigate(destino); }
    return self.clients.openWindow(destino);
  })());
});
