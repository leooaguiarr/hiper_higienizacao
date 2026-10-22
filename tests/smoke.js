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
    const agora = new Date();
    const hoje = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0') + '-' + String(agora.getDate()).padStart(2, '0');
    const clientesParaChamar = [...document.querySelectorAll('#recurrenceList [data-client-due]')].map(element => window.__store.state.clients.find(client => client.id === element.dataset.clientDue));
    return {
      modo: window.__store ? window.__store.modo : 'sem-store',
      appVisivel: visivel('.app-shell'),
      authVisivel: visivel('#authScreen'),
      metricas: document.querySelectorAll('#dashboardMetrics .metric-card').length,
      proximos: document.querySelectorAll('#upcomingList .list-item').length,
      painelDevolucoesRemovido: !document.getElementById('returnsPanel'),
      clientesParaChamar: clientesParaChamar.length,
      quantidadeParaChamarEsperada: Math.min(6, window.__store.state.clients.filter(client => client.nextRecommendation && client.nextRecommendation <= hoje).length),
      somenteClientesVencidos: clientesParaChamar.every(client => client?.nextRecommendation <= hoje),
      clientes: document.querySelectorAll('#clientGrid .client-card').length,
      servicos: document.querySelectorAll('#serviceGrid .service-card').length,
      ordens: document.querySelectorAll('#orderList .order-card').length,
      linhasFinanceiro: document.querySelectorAll('#transactionRows tr').length,
      barras: document.querySelectorAll('#revenueChart .bar-column').length,
      semanaDias: document.querySelectorAll('#calendar .week-day').length,
      badge: document.getElementById('modeBadge').textContent.trim(),
      painelDemo: visivel('#demoPanel'),
      painelNuvem: visivel('#cloudPanel'),
      titulo: document.getElementById('pageTitle').textContent,
      creditoLoginLegivel: parseFloat(getComputedStyle(document.querySelector('.auth-footer')).fontSize) >= 11,
      linkLgpd: document.querySelector('.auth-footer a[href="/lgpd.html"]')?.textContent.includes('LGPD')
    };
  })()`);

  console.log('\n=== ESTADO INICIAL ===');
  console.log(JSON.stringify(relatorio, null, 2));
  if (!relatorio.creditoLoginLegivel || !relatorio.linkLgpd || !relatorio.painelDevolucoesRemovido || relatorio.clientesParaChamar !== relatorio.quantidadeParaChamarEsperada || !relatorio.somenteClientesVencidos) erros.push('rodapé, LGPD ou organização do início não está correta');

  const recebimentosPendentes = await avaliar(`(() => {
    const isoOffset = offset => {
      const data = new Date();
      data.setDate(data.getDate() + offset);
      return data.getFullYear() + '-' + String(data.getMonth() + 1).padStart(2, '0') + '-' + String(data.getDate()).padStart(2, '0');
    };
    const hoje = isoOffset(0), ontem = isoOffset(-1), anteontem = isoOffset(-2), amanha = isoOffset(1);
    const candidatos = window.__store.state.appointments.filter(item => item.paymentStatus === 'pending').slice(0, 3);
    const originais = candidatos.map(item => ({ item, date:item.date, returnDate:item.returnDate, returnTime:item.returnTime }));
    Object.assign(candidatos[0], { date:ontem, returnDate:amanha, returnTime:'10:00' });
    Object.assign(candidatos[1], { date:ontem, returnDate:'', returnTime:'' });
    Object.assign(candidatos[2], { date:anteontem, returnDate:ontem, returnTime:'15:00' });
    document.getElementById('financeMonth').dispatchEvent(new Event('change'));
    document.querySelector('.nav-item[data-view="financeiro"]').click();
    const pendentes = window.__store.state.appointments.filter(item => item.paymentStatus === 'pending' && item.status !== 'canceled' && (item.returnDate || item.date) < hoje);
    const exibidos = [...document.querySelectorAll('#receivableRows [data-detail]')].map(button => window.__store.state.appointments.find(item => item.id === button.dataset.detail));
    const resultado = {
      financeiroVisivel: document.getElementById('view-financeiro').classList.contains('active'),
      quantidadeExibida: exibidos.length,
      quantidadeEsperada: pendentes.length,
      somenteVencidos: exibidos.every(item => (item?.returnDate || item?.date) < hoje),
      devolucaoFuturaExcluida: !exibidos.includes(candidatos[0]),
      atendimentoVencidoIncluido: exibidos.includes(candidatos[1]),
      devolucaoVencidaIncluida: exibidos.includes(candidatos[2]),
      dataDevolucaoIndicada: document.querySelector('#receivableRows [data-detail="' + candidatos[2].id + '"]')?.closest('tr')?.textContent.includes('Devolução'),
      abreAtendimento: pendentes.length === 0 || !!document.querySelector('#receivableRows [data-detail]')
    };
    originais.forEach(original => Object.assign(original.item, { date:original.date, returnDate:original.returnDate, returnTime:original.returnTime }));
    document.getElementById('financeMonth').dispatchEvent(new Event('change'));
    return resultado;
  })()`);
  console.log('\n=== RECEBIMENTOS PENDENTES ===');
  console.log(JSON.stringify(recebimentosPendentes, null, 2));
  if (!recebimentosPendentes.financeiroVisivel || recebimentosPendentes.quantidadeExibida !== recebimentosPendentes.quantidadeEsperada || !recebimentosPendentes.somenteVencidos || !recebimentosPendentes.devolucaoFuturaExcluida || !recebimentosPendentes.atendimentoVencidoIncluido || !recebimentosPendentes.devolucaoVencidaIncluida || !recebimentosPendentes.dataDevolucaoIndicada || !recebimentosPendentes.abreAtendimento) {
    erros.push('recebimentos pendentes não respeitaram a data efetiva de atendimento ou devolução');
  }

  const politica = await avaliar(`(async () => {
    const resposta = await fetch('/lgpd.html');
    const html = await resposta.text();
    return {
      status: resposta.status,
      titulo: html.includes('Política de Privacidade e LGPD'),
      direitos: html.includes('Direitos do titular'),
      contato: html.includes('(16) 99760-3600')
    };
  })()`);
  console.log('\n=== POLITICA LGPD ===');
  console.log(JSON.stringify(politica, null, 2));
  if (politica.status !== 200 || !politica.titulo || !politica.direitos || !politica.contato) erros.push('página da Política de Privacidade e LGPD está incompleta');

  const perfil = await avaliar(`(() => {
    const botao = document.getElementById('profileButton');
    botao.click();
    const popover = document.getElementById('profilePopover');
    const resultado = {
      abriu: !popover.hidden,
      nome: document.getElementById('profileName').textContent,
      editarPerfil: !!popover.querySelector('a[href*="myaccount.google.com/profile"]')
    };
    botao.click();
    return resultado;
  })()`);
  console.log('\n=== PERFIL ===');
  console.log(JSON.stringify(perfil, null, 2));
  if (!perfil.abriu || !perfil.editarPerfil) erros.push('menu de perfil não abriu corretamente');

  // Guia completo, suporte e preferência salva neste aparelho.
  const guia = await avaliar(`(async () => {
    localStorage.removeItem('hiper-guide-hidden');
    document.getElementById('helpGuideButton').click();
    const modal = document.getElementById('modalBackdrop');
    const preferencia = document.getElementById('guideDontShow');
    const resultado = {
      abriu: modal.classList.contains('open'),
      titulo: document.getElementById('modalTitle').textContent.trim(),
      secoes: document.querySelectorAll('#guideContent .guide-details details').length,
      telefoneCorreto: document.querySelector('#guideContent .guide-support')?.textContent.includes('(16) 99760-3600'),
      linkCorreto: document.querySelector('#guideContent .guide-support a')?.href.includes('5516997603600'),
      creditoLexion: document.querySelector('.sidebar-credit')?.href === 'https://lexionconsultoria.com.br/'
        && document.querySelector('.sidebar-credit')?.textContent.includes('Desenvolvido por Lexion Consultoria')
    };
    preferencia.checked = true;
    preferencia.dispatchEvent(new Event('change', { bubbles: true }));
    resultado.preferenciaSalva = localStorage.getItem('hiper-guide-hidden') === '1';
    document.getElementById('modalClose').click();
    localStorage.removeItem('hiper-guide-hidden');
    window.__store.modo = 'nuvem';
    maybeOpenGuide();
    await new Promise(resolve => setTimeout(resolve, 500));
    resultado.aberturaAutomatica = modal.classList.contains('open');
    document.getElementById('modalClose').click();
    window.__store.modo = 'demo';
    return resultado;
  })()`);
  console.log('\n=== GUIA RAPIDO ===');
  console.log(JSON.stringify(guia, null, 2));
  if (!guia.abriu || guia.titulo !== 'Guia rápido' || guia.secoes < 7 || !guia.telefoneCorreto || !guia.linkCorreto || !guia.creditoLexion || !guia.preferenciaSalva || !guia.aberturaAutomatica) {
    erros.push('guia rápido, suporte ou preferência não funcionou corretamente');
  }

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
      r[b.dataset.mode] = {
        periodo: document.getElementById('agendaPeriod').textContent,
        itens: document.querySelectorAll('#calendar [data-detail]').length,
        prontidoes: document.querySelectorAll('#calendar [data-duty]').length,
        ciclo: Array.from(document.querySelectorAll('#calendar [data-duty]')).slice(0, 4).map(item => item.dataset.duty),
        fundos: Array.from(document.querySelectorAll('#calendar .week-day .day-heading, #calendar .month-day, #calendar .duty-day-view')).slice(0, 4).map(item => getComputedStyle(item).backgroundColor),
        areasSemana: Array.from(document.querySelectorAll('#calendar .week-day')).slice(0, 4).map(item => getComputedStyle(item).backgroundColor)
      };
    });
    return r;
  })()`);
  console.log('\n=== AGENDA ===');
  console.log(JSON.stringify(agenda, null, 2));
  if (agenda.day.prontidoes !== 1 || agenda.week.prontidoes !== 7 || agenda.month.prontidoes !== 42 || agenda.month.ciclo[0] !== agenda.month.ciclo[3]) {
    erros.push('escala de prontidões não foi renderizada corretamente na agenda');
  }
  if (!agenda.day.fundos[0] || agenda.week.fundos[0] === agenda.week.fundos[1] || agenda.month.fundos[0] === agenda.month.fundos[1]) {
    erros.push('cores suaves das prontidões não preencheram os dias da agenda');
  }
  if (agenda.week.areasSemana.length !== 4 || agenda.week.areasSemana[0] === agenda.week.areasSemana[1]) {
    erros.push('fundo das prontidões não agrupou os dias da agenda semanal');
  }

  // Abrir detalhe de uma OS
  await enviar('Emulation.setDeviceMetricsOverride', { width: 1200, height: 820, deviceScaleFactor: 1, mobile: false });
  await esperar(300);
  const detalhe = await avaliar(`(() => {
    const botao = document.querySelector('#orderList [data-detail]');
    if (!botao) return 'sem ordens';
    const item = window.__store.state.appointments.find(appointment => appointment.id === botao.dataset.detail);
    botao.click();
    const aberto = document.getElementById('modalBackdrop').classList.contains('open');
    const modal = document.querySelector('#modalBackdrop .modal');
    const conteudoCabeNaTela = modal.scrollHeight <= modal.clientHeight + 1;
    const barraVisualOculta = getComputedStyle(modal).scrollbarWidth === 'none';
    const titulo = document.getElementById('modalTitle').textContent;
    const acoes = document.querySelectorAll('[data-set-status]').length;
    const statusSelecionado = document.querySelector('[data-set-status].is-active');
    const statusAtualMarcado = statusSelecionado?.dataset.setStatus === item.status
      && statusSelecionado?.getAttribute('aria-pressed') === 'true';
    const botaoRemarcar = document.querySelector('[data-reschedule-appointment]');
    botaoRemarcar.click();
    const form = document.getElementById('appointmentForm');
    const remarcacaoAbriu = document.getElementById('modalTitle').textContent === 'Alterar data do atendimento'
      && form.querySelector('button[type="submit"]').textContent === 'Salvar nova data'
      && form.elements.status.value === 'scheduled';
    document.getElementById('modalClose').click();
    return {
      aberto, titulo, acoes, statusAtualMarcado, temBotaoRemarcar:!!botaoRemarcar, remarcacaoAbriu,
      conteudoCabeNaTela,
      barraVisualOculta
    };
  })()`);
  console.log('\n=== DETALHE DA OS ===');
  console.log(JSON.stringify(detalhe, null, 2));
  if (!detalhe.aberto || detalhe.acoes !== 5 || !detalhe.statusAtualMarcado || !detalhe.temBotaoRemarcar || !detalhe.remarcacaoAbriu || !detalhe.conteudoCabeNaTela || !detalhe.barraVisualOculta) {
    erros.push('status atual ou fluxo de remarcação da OS não funcionou corretamente');
  }

  // Cadastro de cliente ponta a ponta
  const cadastro = await avaliar(`(async () => {
    const antes = document.querySelectorAll('#clientGrid .client-card').length;
    document.querySelector('[data-open="client"]').click();
    const form = document.getElementById('clientForm');
    const camposIguaisAoPublico = !!form.elements.documentType && !!document.getElementById('clientCepSearch')
      && !!form.elements.birthDate && form.elements.birthDate.required && !form.elements.notes;
    form.elements.firstName.value = 'Teste';
    form.elements.lastName.value = 'Headless';
    form.elements.phone.value = '(16) 90000-0000';
    form.elements.birthDate.value = '1990-05-15';
    form.elements.documentType.value = 'cnpj';
    form.elements.documentType.dispatchEvent(new Event('change'));
    form.elements.document.value = '12345678000199';
    form.elements.document.dispatchEvent(new Event('input', { bubbles: true }));
    const fetchOriginal = window.fetch;
    window.fetch = async input => String(input).includes('viacep.com.br')
      ? { json: async () => ({ logradouro:'Rua Teste', bairro:'Centro', localidade:'Ribeirao Preto' }) }
      : fetchOriginal(input);
    form.elements.cep.value = '14000000';
    form.elements.cep.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    window.fetch = fetchOriginal;
    const cepBuscado = form.elements.cep.value === '14000-000'
      && form.elements.address.value === 'Rua Teste'
      && form.elements.neighborhood.value === 'Centro'
      && form.elements.city.value === 'Ribeirao Preto';
    form.elements.number.value = '1';
    form.requestSubmit();
    await new Promise(r => setTimeout(r, 600));
    const depois = document.querySelectorAll('#clientGrid .client-card').length;
    const criado = window.__store.state.clients.find(client => client.firstName === 'Teste' && client.lastName === 'Headless');
    criado.street = criado.address;
    delete criado.address;
    document.getElementById('clientSearch').dispatchEvent(new Event('input'));
    const card = [...document.querySelectorAll('#clientGrid .client-card')]
      .find(item => item.querySelector('h3')?.textContent === 'Teste Headless');
    const endereco = card?.querySelector('.client-address')?.textContent || '';
    return {
      antes,
      depois,
      criou: depois === antes + 1,
      camposIguaisAoPublico,
      cepBuscado,
      tipoDocumentoSalvo: criado.documentType === 'cnpj' && criado.document === '12.345.678/0001-99',
      enderecoLegadoOk: endereco.includes('Rua Teste, 1') && !endereco.includes('undefined')
    };
  })()`);
  console.log('\n=== CADASTRO DE CLIENTE ===');
  console.log(JSON.stringify(cadastro, null, 2));
  if (!cadastro.criou || !cadastro.camposIguaisAoPublico || !cadastro.cepBuscado || !cadastro.tipoDocumentoSalvo || !cadastro.enderecoLegadoOk) {
    erros.push('cadastro de cliente ou compatibilidade de endereço legado falhou');
  }

  // Novo agendamento e descarte do convite para enviar a confirmação.
  const conviteWhatsApp = await avaliar(`(async () => {
    const antes = window.__store.state.appointments.length;
    document.querySelector('[data-open="appointment"]').click();
    const form = document.getElementById('appointmentForm');
    const conviteCadastroVisivel = !document.getElementById('modalClientInvite').hidden;
    const clientesSincronizados = form.elements.clientId.options.length === window.__store.state.clients.length;
    form.elements.serviceId.value = 'svc-rug';
    form.elements.date.value = '2099-12-31';
    form.elements.time.value = '23:30';
    form.elements.serviceId.dispatchEvent(new Event('change'));
    const devolucaoVisivel = !document.getElementById('returnSchedule').hidden;
    const prazoSugerido = form.elements.returnDate.value === '2100-01-07';
    form.requestSubmit();
    await new Promise(r => setTimeout(r, 700));
    const modal = document.getElementById('modalBackdrop');
    const botao = document.getElementById('whatsappDismiss');
    const abriu = modal.classList.contains('open') && !!botao;
    if (botao) botao.click();
    const criado = window.__store.state.appointments.find(item => item.date === '2099-12-31' && item.serviceId === 'svc-rug');
    const alertaDevolucao = document.querySelector('#alertsList [data-alert-action="devolucoes"]');
    alertaDevolucao?.click();
    const alertaAbriuDia = document.getElementById('view-agenda').classList.contains('active')
      && document.querySelector('[data-mode="day"]').classList.contains('active')
      && document.querySelector('.return-event[data-detail="' + criado?.id + '"]');
    document.querySelector('[data-mode="month"]').click();
    const devolucaoNaAgenda = document.querySelectorAll('.return-event').length > 0;
    return {
      criou: window.__store.state.appointments.length === antes + 1,
      conviteCadastroVisivel,
      clientesSincronizados,
      devolucaoVisivel,
      prazoSugerido,
      statusInicialAgendado: criado?.status === 'scheduled',
      statusInicialDevolucao: criado?.returnStatus === 'scheduled',
      devolucaoSalva: criado?.returnDate === '2100-01-07' && criado?.returnTime === '17:00',
      alertaDevolucao: !!alertaDevolucao && !!alertaAbriuDia,
      devolucaoNaAgenda,
      abriu,
      fechou: !modal.classList.contains('open')
    };
  })()`);
  console.log('\n=== CONVITE DO WHATSAPP ===');
  console.log(JSON.stringify(conviteWhatsApp, null, 2));
  if (!conviteWhatsApp.criou || !conviteWhatsApp.conviteCadastroVisivel || !conviteWhatsApp.clientesSincronizados || !conviteWhatsApp.devolucaoVisivel || !conviteWhatsApp.prazoSugerido || !conviteWhatsApp.statusInicialAgendado || !conviteWhatsApp.statusInicialDevolucao || !conviteWhatsApp.devolucaoSalva || !conviteWhatsApp.alertaDevolucao || !conviteWhatsApp.devolucaoNaAgenda || !conviteWhatsApp.abriu || !conviteWhatsApp.fechou) {
    erros.push('fluxo integrado de cadastro e agendamento não funcionou corretamente');
  }

  const devolucaoConcluida = await avaliar(`(async () => {
    const card = document.querySelector('.return-event');
    if (!card) return { encontrada: false };
    card.click();
    document.querySelector('[data-set-status="completed"]')?.click();
    await new Promise(r => setTimeout(r, 700));
    const atualizado = document.querySelector('.return-event.completed');
    const corConcluida = atualizado ? getComputedStyle(atualizado).color === 'rgb(21, 155, 99)' : false;
    let registro = window.__store.state.appointments.find(item => item.date === '2099-12-31' && item.serviceId === 'svc-rug');
    const statusDevolucaoConcluido = registro?.returnStatus === 'completed';
    const atendimentoPermaneceuAgendado = registro?.status === 'scheduled';

    atualizado?.click();
    document.querySelector('[data-set-status="scheduled"]')?.click();
    await new Promise(r => setTimeout(r, 700));
    document.querySelector('.nav-item[data-view="ordens"]').click();
    document.querySelector('[data-detail="' + registro.id + '"]')?.click();
    document.querySelector('[data-set-status="completed"]')?.click();
    await new Promise(r => setTimeout(r, 700));
    document.querySelector('.nav-item[data-view="agenda"]').click();
    registro = window.__store.state.appointments.find(item => item.id === registro.id);
    return {
      encontrada: true,
      statusConcluido: !!atualizado,
      statusDevolucaoConcluido,
      atendimentoPermaneceuAgendado,
      corConcluida,
      atendimentoConcluidoSeparadamente: registro?.status === 'completed',
      devolucaoPermaneceuAgendada: registro?.returnStatus === 'scheduled' && !!document.querySelector('.return-event.scheduled')
    };
  })()`);
  console.log('\n=== DEVOLUCAO CONCLUIDA ===');
  console.log(JSON.stringify(devolucaoConcluida, null, 2));
  if (!devolucaoConcluida.encontrada || !devolucaoConcluida.statusConcluido || !devolucaoConcluida.statusDevolucaoConcluido || !devolucaoConcluida.atendimentoPermaneceuAgendado || !devolucaoConcluida.corConcluida || !devolucaoConcluida.atendimentoConcluidoSeparadamente || !devolucaoConcluida.devolucaoPermaneceuAgendada) {
    erros.push('status da devolução não ficou independente do atendimento');
  }

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

  // Largura intermediária: os subcards precisam permanecer dentro dos painéis.
  await enviar('Emulation.setDeviceMetricsOverride', { width: 1058, height: 800, deviceScaleFactor: 1, mobile: false });
  await esperar(500);
  const intermediario = await avaliar(`(() => {
    document.querySelector('.nav-item[data-view="dashboard"]').click();
    const painel = document.getElementById('alertsPanel').getBoundingClientRect();
    const itens = [...document.querySelectorAll('#alertsList .list-item')].map(item => item.getBoundingClientRect());
    return {
      scrollHorizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
      painelDentroDaTela: painel.right <= window.innerWidth + 1,
      subcardsContidos: itens.every(item => item.left >= painel.left && item.right <= painel.right + 1),
      colunas: getComputedStyle(document.querySelector('#view-dashboard .dashboard-grid')).gridTemplateColumns
    };
  })()`);
  console.log('\n=== RESPONSIVO 1058px ===');
  console.log(JSON.stringify(intermediario, null, 2));
  if (intermediario.scrollHorizontal || !intermediario.painelDentroDaTela || !intermediario.subcardsContidos) {
    erros.push('dashboard ultrapassa as margens em largura intermediária');
  }

  const botoesServico = await avaliar(`(() => {
    document.querySelector('.nav-item[data-view="servicos"]').click();
    const botoes = [...document.querySelector('.service-card .service-actions').querySelectorAll('button')];
    const caixas = botoes.map(botao => botao.getBoundingClientRect());
    return {
      quantidade: botoes.length,
      mesmaAltura: Math.abs(caixas[0].height - caixas[1].height) < 1,
      mesmaLargura: Math.abs(caixas[0].width - caixas[1].width) < 1,
      mesmoTopo: Math.abs(caixas[0].top - caixas[1].top) < 1,
      semMargemExtra: botoes.every(botao => parseFloat(getComputedStyle(botao).marginTop) === 0)
    };
  })()`);
  console.log('\n=== BOTOES DOS SERVICOS ===');
  console.log(JSON.stringify(botoesServico, null, 2));
  if (botoesServico.quantidade !== 2 || !botoesServico.mesmaAltura || !botoesServico.mesmaLargura || !botoesServico.mesmoTopo || !botoesServico.semMargemExtra) {
    erros.push('botões de editar e excluir serviço estão desalinhados');
  }

  const paginacaoClientes = await avaliar(`(() => {
    while (window.__store.state.clients.length < 23) {
      const numero = String(window.__store.state.clients.length + 1).padStart(2, '0');
      window.__store.state.clients.push({ id:'cli-page-' + numero, firstName:'Z Cliente', lastName:numero, phone:'(16) 90000-0000', neighborhood:'Teste', city:'Ribeirão Preto' });
    }
    document.querySelector('.nav-item[data-view="clientes"]').click();
    const input = document.getElementById('clientSearch');
    input.value = '';
    input.dispatchEvent(new Event('input'));
    const nomesPrimeira = [...document.querySelectorAll('#clientGrid .client-card h3')].map(el => el.textContent.trim());
    const ordenados = [...nomesPrimeira].sort((a,b) => a.localeCompare(b, 'pt-BR', { sensitivity:'base' }));
    document.getElementById('clientNext').click();
    const nomesSegunda = [...document.querySelectorAll('#clientGrid .client-card h3')].map(el => el.textContent.trim());
    const segundaPagina = document.getElementById('clientPageCurrent').textContent;
    input.value = 'Z Cliente 18';
    input.dispatchEvent(new Event('input'));
    const buscaReiniciou = document.getElementById('clientPageCurrent').textContent === 'Página 1 de 1'
      && document.querySelectorAll('#clientGrid .client-card').length === 1;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    return {
      somenteTotal: document.querySelectorAll('#clientMetrics .mini-metric').length === 1
        && !document.getElementById('clientMetrics').textContent.includes('Valor histórico')
        && !document.getElementById('clientMetrics').textContent.includes('Contatos de recorrência'),
      dezNaPrimeira: nomesPrimeira.length === 10,
      ordemAlfabetica: nomesPrimeira.join('|') === ordenados.join('|'),
      dezNaSegunda: nomesSegunda.length === 10,
      paginasDiferentes: nomesPrimeira.join('|') !== nomesSegunda.join('|'),
      segundaPagina: segundaPagina === 'Página 2 de 3',
      buscaReiniciou
    };
  })()`);
  console.log('\n=== PAGINACAO DE CLIENTES ===');
  console.log(JSON.stringify(paginacaoClientes, null, 2));
  if (!Object.values(paginacaoClientes).every(Boolean)) erros.push('ordenação ou paginação de clientes falhou');

  // Responsivo mobile
  await enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await esperar(600);
  const mobile = await avaliar(`(() => {
    const topbar = document.querySelector('.topbar');
    const acoes = [...document.querySelectorAll('.topbar-action, .profile-trigger')];
    const tamanhos = acoes.map(el => {
      const rect = el.getBoundingClientRect();
      return [Math.round(rect.width), Math.round(rect.height)];
    });
    document.querySelector('.nav-item[data-view="financeiro"]').click();
    const financeiro = document.getElementById('view-financeiro');
    const paineisFinanceiros = [...financeiro.querySelectorAll('.dashboard-grid > article')].map(item => item.getBoundingClientRect());
    const financeiroSemSobreposicao = paineisFinanceiros.every((item, index) => index === 0 || item.top >= paineisFinanceiros[index - 1].bottom - 1);
    const financeiroContido = financeiro.scrollWidth <= financeiro.clientWidth + 1
      && paineisFinanceiros.every(item => item.left >= -1 && item.right <= window.innerWidth + 1);
    document.querySelector('.bottom-nav-item[data-view="agenda"]').click();
    document.querySelector('[data-mode="month"]').click();
    const calendar = document.getElementById('calendar');
    const monthGrid = calendar.querySelector('.month-grid');
    return {
      scrollHorizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
      larguraDoc: document.documentElement.scrollWidth,
      janela: window.innerWidth,
      bottomNavVisivel: getComputedStyle(document.querySelector('.bottom-nav')).display === 'flex',
      menuOculto: getComputedStyle(document.getElementById('menuButton')).display === 'none',
      cabecalhoContido: topbar.scrollWidth <= topbar.clientWidth,
      acoesUniformes: tamanhos.every(([largura, altura]) => largura === 40 && altura === 40),
      indicadorRedundanteOculto: getComputedStyle(document.getElementById('modeBadge')).display === 'none',
      financeiroSemSobreposicao,
      financeiroContido,
      mesSemRolagemHorizontal: calendar.scrollWidth <= calendar.clientWidth + 1,
      seteColunasNoMes: getComputedStyle(monthGrid).gridTemplateColumns.split(' ').length === 7,
      conviteCadastroClaro: document.getElementById('shareClientLinkButton').getAttribute('aria-label') === 'Enviar cadastro ao cliente'
        && document.querySelector('#shareClientLinkButton .fa-address-card') !== null
    };
  })()`);
  console.log('\n=== MOBILE 390px ===');
  console.log(JSON.stringify(mobile, null, 2));
  if (!mobile.cabecalhoContido || !mobile.acoesUniformes || !mobile.indicadorRedundanteOculto || !mobile.financeiroSemSobreposicao || !mobile.financeiroContido || !mobile.conviteCadastroClaro || !mobile.mesSemRolagemHorizontal || !mobile.seteColunasNoMes) {
    erros.push('layout mobile ou calendário mensal ultrapassou a largura disponível');
  }

  console.log('\n=== ERROS DE CONSOLE ===');
  console.log(erros.length ? erros.join('\n') : 'nenhum');

  socket.close();
  chrome.kill();
  process.exit(erros.length ? 1 : 0);
}

main().catch(e => { console.error('FALHA NO TESTE:', e); process.exit(1); });
