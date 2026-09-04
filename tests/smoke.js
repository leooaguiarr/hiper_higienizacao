// Teste de fumaça headless via Chrome DevTools Protocol, sem dependências npm.
// Percorre o modo demonstração inteiro: renderização, navegação, os três modos
// da agenda, detalhe da OS, cadastro, conclusão de serviço e layout no celular.
//
// Uso (com `node server.js` rodando em outro terminal):
//   node tests/smoke.js
//   node tests/smoke.js http://localhost:8000
//
// Sai com código 1 se algum erro de console aparecer.

const { spawn } = require('child_process');
const { existsSync } = require('fs');
const http = require('http');
const os = require('os');

const CANDIDATOS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const CHROME = CANDIDATOS.find(caminho => existsSync(caminho));
if (!CHROME) {
  console.error('Chrome não encontrado. Defina CHROME_PATH com o caminho do executável.');
  process.exit(1);
}

const PORT = 9222;
const ALVO = process.argv[2] || 'http://localhost:8000';

const esperar = ms => new Promise(r => setTimeout(r, ms));

function pegarJSON(caminho) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: caminho }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + os.tmpdir() + '/hiper-cdp-' + Date.now(),
    'about:blank'
  ], { stdio: 'ignore' });

  let alvos = null;
  for (let i = 0; i < 40 && !alvos; i++) {
    await esperar(250);
    try { alvos = await pegarJSON('/json/list'); } catch { /* ainda subindo */ }
  }
  if (!alvos) { console.error('Chrome nao respondeu'); chrome.kill(); process.exit(1); }

  const pagina = alvos.find(t => t.type === 'page');
  // WebSocket nativo do Node
  const socket = new WebSocket(pagina.webSocketDebuggerUrl);

  const pendentes = new Map();
  const logs = [];
  const erros = [];
  let proximoId = 1;

  function enviar(method, params = {}) {
    const id = proximoId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise(resolve => pendentes.set(id, resolve));
  }

  await new Promise(resolve => socket.addEventListener('open', resolve));

  socket.addEventListener('message', evento => {
    const msg = JSON.parse(evento.data);
    if (msg.id && pendentes.has(msg.id)) { pendentes.get(msg.id)(msg.result); pendentes.delete(msg.id); return; }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const texto = (msg.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' ');
      logs.push(`[${msg.params.type}] ${texto}`);
      if (msg.params.type === 'error') erros.push(texto);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      erros.push(d.exception?.description || d.text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      erros.push(msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
    }
  });

  await enviar('Runtime.enable');
  await enviar('Log.enable');
  await enviar('Page.enable');
  await enviar('Page.navigate', { url: ALVO });
  await esperar(3500);

  const avaliar = async expressao => {
    const r = await enviar('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { erro: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value;
  };

  // Com o Firebase configurado o app abre na tela de acesso; este teste é do
  // modo demonstração, então entra nele quando não há sessão.
  await avaliar(`(async () => {
    if (window.__store.modo === 'deslogado') {
      document.getElementById('demoButton').click();
      await new Promise(r => setTimeout(r, 1200));
    }
    return true;
  })()`);

  const relatorio = await avaliar(`(() => {
    const visivel = sel => { const el = document.querySelector(sel); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; };
    return {
      modo: window.__store ? window.__store.modo : 'sem-store',
      appVisivel: visivel('.app-shell'),
      authVisivel: visivel('#authScreen'),
      metricas: document.querySelectorAll('#dashboardMetrics .metric-card').length,
      proximos: document.querySelectorAll('#upcomingList .list-item').length,
      clientes: document.querySelectorAll('#clientGrid .client-card').length,
      servicos: document.querySelectorAll('#serviceGrid .service-card').length,
      ordens: document.querySelectorAll('#orderList .order-card').length,
      linhasFinanceiro: document.querySelectorAll('#transactionRows tr').length,
      barras: document.querySelectorAll('#revenueChart .bar-column').length,
      semanaDias: document.querySelectorAll('#calendar .week-day').length,
      badge: document.getElementById('modeBadge').textContent.trim(),
      painelDemo: visivel('#demoPanel'),
      painelNuvem: visivel('#cloudPanel'),
      titulo: document.getElementById('pageTitle').textContent
    };
  })()`);

  console.log('\n=== ESTADO INICIAL ===');
  console.log(JSON.stringify(relatorio, null, 2));

  // Navegação entre telas
  const navegacao = await avaliar(`(() => {
    const resultado = {};
    document.querySelectorAll('.nav-item').forEach(b => {
      b.click();
      const view = document.querySelector('.view.active');
      resultado[b.dataset.view] = view ? view.id : 'nenhuma';
    });
    document.querySelector('.nav-item').click();
    return resultado;
  })()`);
  console.log('\n=== NAVEGACAO ===');
  console.log(JSON.stringify(navegacao, null, 2));

  // Modos da agenda
  const agenda = await avaliar(`(() => {
    const r = {};
    document.querySelectorAll('[data-mode]').forEach(b => {
      b.click();
      r[b.dataset.mode] = { periodo: document.getElementById('agendaPeriod').textContent, itens: document.querySelectorAll('#calendar [data-detail]').length };
    });
    return r;
  })()`);
  console.log('\n=== AGENDA ===');
  console.log(JSON.stringify(agenda, null, 2));

  // Abrir detalhe de uma OS
  const detalhe = await avaliar(`(() => {
    const botao = document.querySelector('#orderList [data-detail]');
    if (!botao) return 'sem ordens';
    botao.click();
    const aberto = document.getElementById('modalBackdrop').classList.contains('open');
    const titulo = document.getElementById('modalTitle').textContent;
    const acoes = document.querySelectorAll('[data-set-status]').length;
    document.getElementById('modalClose').click();
    return { aberto, titulo, acoes };
  })()`);
  console.log('\n=== DETALHE DA OS ===');
  console.log(JSON.stringify(detalhe, null, 2));

  // Cadastro de cliente ponta a ponta
  const cadastro = await avaliar(`(async () => {
    const antes = document.querySelectorAll('#clientGrid .client-card').length;
    document.querySelector('[data-open="client"]').click();
    const form = document.getElementById('clientForm');
    form.elements.firstName.value = 'Teste';
    form.elements.lastName.value = 'Headless';
    form.elements.phone.value = '(16) 90000-0000';
    form.elements.address.value = 'Rua Teste, 1';
    form.elements.neighborhood.value = 'Centro';
    form.elements.city.value = 'Ribeirao Preto';
    form.requestSubmit();
    await new Promise(r => setTimeout(r, 600));
    const depois = document.querySelectorAll('#clientGrid .client-card').length;
    return { antes, depois, criou: depois === antes + 1 };
  })()`);
  console.log('\n=== CADASTRO DE CLIENTE ===');
  console.log(JSON.stringify(cadastro, null, 2));

  // Conclusão de serviço (status + receita + recorrência)
  const conclusao = await avaliar(`(async () => {
    const pendente = window.__store.state.appointments.find(a => a.status !== 'completed' && a.status !== 'canceled');
    if (!pendente) return 'sem agendamento pendente';
    const receitasAntes = window.__store.state.transactions.length;
    document.querySelector('.nav-item[data-view="ordens"]').click();
    const botao = document.querySelector('[data-detail="' + pendente.id + '"]');
    if (!botao) return 'OS nao encontrada na lista';
    botao.click();
    document.querySelector('[data-set-status="completed"]').click();
    await new Promise(r => setTimeout(r, 700));
    const alvo = window.__store.state.appointments.find(a => a.id === pendente.id);
    const cliente = window.__store.state.clients.find(c => c.id === pendente.clientId);
    return {
      status: alvo.status,
      pagamento: pendente.paymentStatus,
      receitasAntes,
      receitasDepois: window.__store.state.transactions.length,
      recorrenciaAtualizada: !!cliente && !!cliente.nextRecommendation
    };
  })()`);
  console.log('\n=== CONCLUSAO DE SERVICO ===');
  console.log(JSON.stringify(conclusao, null, 2));

  // Responsivo
  await enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await esperar(600);
  const mobile = await avaliar(`(() => ({
    scrollHorizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
    larguraDoc: document.documentElement.scrollWidth,
    janela: window.innerWidth,
    menuVisivel: getComputedStyle(document.getElementById('menuButton')).display !== 'none'
  }))()`);
  console.log('\n=== MOBILE 390px ===');
  console.log(JSON.stringify(mobile, null, 2));

  console.log('\n=== ERROS DE CONSOLE ===');
  console.log(erros.length ? erros.join('\n') : 'nenhum');

  socket.close();
  chrome.kill();
  process.exit(erros.length ? 1 : 0);
}

main().catch(e => { console.error('FALHA NO TESTE:', e); process.exit(1); });
