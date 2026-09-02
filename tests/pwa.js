// Teste headless da PWA via Chrome DevTools Protocol, sem dependências npm.
// Verifica o manifest, o registro do service worker e, principalmente, se o
// app abre e opera com a rede desligada.
//
// Uso (com `node server.js` rodando em outro terminal):
//   node tests/pwa.js

const { spawn } = require('child_process');
const { existsSync } = require('fs');
const http = require('http');
const os = require('os');

const CANDIDATOS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const CHROME = CANDIDATOS.find(caminho => existsSync(caminho));
if (!CHROME) {
  console.error('Chrome não encontrado. Defina CHROME_PATH com o caminho do executável.');
  process.exit(1);
}

const PORT = 9333;
const ALVO = process.argv[2] || 'http://localhost:8000';

const esperar = ms => new Promise(r => setTimeout(r, ms));
const pegarJSON = caminho => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: PORT, path: caminho }, res => {
    let corpo = '';
    res.on('data', c => corpo += c);
    res.on('end', () => { try { resolve(JSON.parse(corpo)); } catch (e) { reject(e); } });
  }).on('error', reject);
});

const falhas = [];
function conferir(nome, condicao, detalhe) {
  console.log(`${condicao ? 'OK  ' : 'FALHA'} ${nome}${detalhe ? ' -> ' + detalhe : ''}`);
  if (!condicao) falhas.push(nome);
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + os.tmpdir() + '/hiper-pwa-' + Date.now(),
    'about:blank'
  ], { stdio: 'ignore' });

  let alvos = null;
  for (let i = 0; i < 40 && !alvos; i++) {
    await esperar(250);
    try { alvos = await pegarJSON('/json/list'); } catch { /* subindo */ }
  }
  if (!alvos) { console.error('Chrome não respondeu'); chrome.kill(); process.exit(1); }

  const pagina = alvos.find(t => t.type === 'page');
  const socket = new WebSocket(pagina.webSocketDebuggerUrl);
  const pendentes = new Map();
  const erros = [];
  let proximoId = 1;

  const enviar = (metodo, params = {}) => {
    const id = proximoId++;
    socket.send(JSON.stringify({ id, method: metodo, params }));
    return new Promise(resolve => pendentes.set(id, resolve));
  };

  await new Promise(resolve => socket.addEventListener('open', resolve));
  socket.addEventListener('message', evento => {
    const msg = JSON.parse(evento.data);
    if (msg.id && pendentes.has(msg.id)) { pendentes.get(msg.id)(msg.result); pendentes.delete(msg.id); return; }
    if (msg.method === 'Runtime.exceptionThrown') {
      erros.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    }
  });

  await enviar('Runtime.enable');
  await enviar('Page.enable');
  await enviar('Network.enable');

  const avaliar = async expressao => {
    const r = await enviar('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { erro: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value;
  };

  // --- Carga inicial e registro do service worker ---
  await enviar('Page.navigate', { url: ALVO });
  await esperar(4000);

  const sw = await avaliar(`(async () => {
    const registro = await navigator.serviceWorker.ready;
    return {
      registrado: !!registro,
      escopo: registro.scope,
      ativo: !!registro.active,
      controlando: !!navigator.serviceWorker.controller
    };
  })()`);
  console.log('\n=== SERVICE WORKER ===');
  conferir('service worker registrado', sw.registrado === true);
  conferir('service worker ativo', sw.ativo === true);
  conferir('página controlada pelo service worker', sw.controlando === true, sw.escopo);

  // --- Manifest lido pelo próprio Chrome ---
  const manifest = await enviar('Page.getAppManifest');
  const dados = manifest.parsed && manifest.parsed.manifestLocation ? manifest : manifest;
  let manifestJSON = {};
  try { manifestJSON = JSON.parse(manifest.data || '{}'); } catch { /* sem manifest */ }
  console.log('\n=== MANIFEST ===');
  conferir('manifest encontrado', !!manifest.url, manifest.url);
  conferir('sem erros de parsing', !(manifest.errors || []).some(e => e.critical),
    (manifest.errors || []).map(e => e.message).join('; ') || 'nenhum');
  conferir('display standalone', manifestJSON.display === 'standalone');
  conferir('tem ícone 512', (manifestJSON.icons || []).some(i => i.sizes === '512x512'));
  conferir('tem ícone maskable', (manifestJSON.icons || []).some(i => i.purpose === 'maskable'));
  conferir('start_url definido', !!manifestJSON.start_url);

  // --- Ícones realmente carregam ---
  const icones = await avaliar(`(async () => {
    const caminhos = ['/assets/icon-192.png','/assets/icon-512.png','/assets/icon-maskable-512.png','/assets/apple-touch-icon.png'];
    const saida = {};
    for (const caminho of caminhos) {
      try { const r = await fetch(caminho); saida[caminho] = r.status; } catch (e) { saida[caminho] = 'erro'; }
    }
    return saida;
  })()`);
  console.log('\n=== ÍCONES ===');
  Object.entries(icones).forEach(([caminho, status]) => conferir(caminho, status === 200, String(status)));

  // --- Painéis de aplicativo e lembretes ---
  const paineis = await avaliar(`(() => {
    const visivel = sel => { const el = document.querySelector(sel); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; };
    document.querySelector('.nav-item[data-view="configuracoes"]').click();
    return {
      painelApp: visivel('#appPanel'),
      painelLembretes: visivel('#notifyPanel'),
      statusInstalacao: document.getElementById('installStatus').textContent,
      statusOffline: document.getElementById('offlineStatus').textContent,
      statusPermissao: document.getElementById('notifyStatus').textContent
    };
  })()`);
  console.log('\n=== PAINÉIS DE CONFIGURAÇÃO ===');
  conferir('painel do aplicativo visível', paineis.painelApp === true);
  conferir('painel de lembretes visível', paineis.painelLembretes === true);
  console.log(`     instalação: ${paineis.statusInstalacao}`);
  console.log(`     offline:    ${paineis.statusOffline}`);
  console.log(`     permissão:  ${paineis.statusPermissao}`);

  // --- O teste que importa: recarregar sem rede ---
  await enviar('Network.emulateNetworkConditions', {
    offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0
  });
  await esperar(500);
  await enviar('Page.reload', { ignoreCache: false });
  await esperar(5000);

  const offline = await avaliar(`(() => {
    const visivel = sel => { const el = document.querySelector(sel); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; };
    return {
      online: navigator.onLine,
      appVisivel: visivel('.app-shell'),
      titulo: document.title,
      clientes: document.querySelectorAll('#clientGrid .client-card').length,
      servicos: document.querySelectorAll('#serviceGrid .service-card').length,
      metricas: document.querySelectorAll('#dashboardMetrics .metric-card').length,
      diasAgenda: document.querySelectorAll('#calendar .week-day').length,
      avisoSync: visivel('#syncBadge') ? document.getElementById('syncBadge').textContent.trim() : null,
      cssAplicado: getComputedStyle(document.querySelector('.sidebar')).position === 'fixed'
    };
  })()`);
  console.log('\n=== RECARGA SEM REDE ===');
  conferir('app carregou do cache', offline.appVisivel === true);
  conferir('CSS veio do cache', offline.cssAplicado === true);
  conferir('dados renderizados', offline.clientes > 0 && offline.servicos > 0, `${offline.clientes} clientes, ${offline.servicos} serviços`);
  conferir('agenda renderizada', offline.diasAgenda === 7);

  // O CDP bloqueia o tráfego mas não mexe em navigator.onLine no headless, e
  // é ele que o app observa. Aqui forçamos o mesmo par (propriedade + evento)
  // que o navegador emite de verdade ao perder a rede.
  const indicador = await avaliar(`(async () => {
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
    await new Promise(r => setTimeout(r, 300));
    const semRede = {
      visivel: !document.getElementById('syncBadge').hidden,
      texto: document.getElementById('syncBadge').textContent.trim(),
      classe: document.getElementById('syncBadge').className
    };
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    window.dispatchEvent(new Event('online'));
    await new Promise(r => setTimeout(r, 300));
    const comRede = { oculto: document.getElementById('syncBadge').hidden };
    if (original) Object.defineProperty(navigator, 'onLine', original);
    return { semRede, comRede };
  })()`);
  console.log('\n=== INDICADOR DE CONEXÃO ===');
  conferir('aparece ao perder a rede', indicador.semRede.visivel === true, indicador.semRede.texto);
  conferir('usa o estilo de offline', /offline/.test(indicador.semRede.classe || ''));
  conferir('some ao voltar a rede', indicador.comRede.oculto === true);

  // --- Escrita offline: precisa continuar operando ---
  const escritaOffline = await avaliar(`(async () => {
    const antes = document.querySelectorAll('#clientGrid .client-card').length;
    document.querySelector('[data-open="client"]').click();
    const form = document.getElementById('clientForm');
    form.elements.firstName.value = 'Offline';
    form.elements.lastName.value = 'Teste';
    form.elements.phone.value = '(16) 91111-1111';
    form.elements.address.value = 'Rua Sem Sinal, 0';
    form.elements.neighborhood.value = 'Centro';
    form.elements.city.value = 'Ribeirao Preto';
    form.requestSubmit();
    await new Promise(r => setTimeout(r, 800));
    return { antes, depois: document.querySelectorAll('#clientGrid .client-card').length };
  })()`);
  console.log('\n=== CADASTRO SEM REDE ===');
  conferir('cadastro funciona offline', escritaOffline.depois === escritaOffline.antes + 1,
    `${escritaOffline.antes} -> ${escritaOffline.depois}`);

  // --- Volta da rede ---
  await enviar('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1
  });
  await esperar(1500);
  const voltou = await avaliar(`({ online: navigator.onLine, aviso: document.getElementById('syncBadge').hidden })`);
  console.log('\n=== REDE DE VOLTA ===');
  conferir('navegador reporta online', voltou.online === true);
  conferir('indicador de sem conexão some', voltou.aviso === true);

  console.log('\n=== ERROS DE CONSOLE ===');
  const relevantes = erros.filter(e => !/Failed to fetch|NetworkError|net::ERR/i.test(e));
  console.log(relevantes.length ? relevantes.join('\n') : 'nenhum');
  if (relevantes.length) falhas.push('erros de console');

  console.log(`\n${falhas.length ? 'FALHAS: ' + falhas.join(', ') : 'TODOS OS TESTES PASSARAM'}`);
  socket.close();
  chrome.kill();
  process.exit(falhas.length ? 1 : 0);
}

main().catch(e => { console.error('FALHA NO TESTE:', e); process.exit(1); });
