// Teste headless de edição e exclusão, via Chrome DevTools Protocol.
//
// Cobre as regras de negócio que ligam as três coleções:
//   - editar um atendimento para "pago" cria a receita correspondente;
//   - voltar para "a receber" remove essa receita;
//   - excluir um atendimento leva junto a receita que ele gerou;
//   - excluir um cliente preserva o histórico de atendimentos.
//
// Uso (com `node server.js` rodando em outro terminal):
//   node tests/crud.js

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

const PORT = 9355;
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
  console.log(`${condicao ? 'OK   ' : 'FALHA'} ${nome}${detalhe ? ' -> ' + detalhe : ''}`);
  if (!condicao) falhas.push(nome);
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + os.tmpdir() + '/hiper-crud-' + Date.now(),
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
  await enviar('Page.navigate', { url: ALVO });
  await esperar(4000);

  const avaliar = async expressao => {
    const r = await enviar('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { erro: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value;
  };

  // confirm() bloquearia o headless: aqui toda confirmação é aceita.
  await avaliar('window.confirm = () => true; true');

  // --- Editar cliente ---
  const edicaoCliente = await avaliar(`(async () => {
    const alvo = window.__store.state.clients[0];
    document.querySelector('.nav-item[data-view="clientes"]').click();
    document.querySelector('[data-client-detail="' + alvo.id + '"]').click();
    await new Promise(r => setTimeout(r, 300));
    const temBotao = !!document.querySelector('[data-edit-client]');
    document.querySelector('[data-edit-client]').click();
    await new Promise(r => setTimeout(r, 300));
    const form = document.getElementById('clientForm');
    const preencheu = form.elements.firstName.value === alvo.firstName && form.elements.phone.value === alvo.phone;
    const rotulo = form.querySelector('button[type="submit"]').textContent;
    form.elements.firstName.value = 'NomeEditado';
    form.elements.neighborhood.value = 'Bairro Novo';
    form.requestSubmit();
    await new Promise(r => setTimeout(r, 700));
    const depois = window.__store.state.clients.find(c => c.id === alvo.id);
    return {
      temBotao, preencheu, rotulo,
      nome: depois.firstName,
      bairro: depois.neighborhood,
      telefonePreservado: depois.phone === alvo.phone,
      total: window.__store.state.clients.length
    };
  })()`);
  console.log('\n=== EDITAR CLIENTE ===');
  conferir('botão de editar na ficha', edicaoCliente.temBotao === true);
  conferir('formulário abre preenchido', edicaoCliente.preencheu === true);
  conferir('botão diz "Salvar alterações"', edicaoCliente.rotulo === 'Salvar alterações', edicaoCliente.rotulo);
  conferir('nome alterado', edicaoCliente.nome === 'NomeEditado', edicaoCliente.nome);
  conferir('bairro alterado', edicaoCliente.bairro === 'Bairro Novo');
  conferir('campos não tocados preservados', edicaoCliente.telefonePreservado === true);
  conferir('não criou registro duplicado', edicaoCliente.total === 5, `${edicaoCliente.total} clientes`);

  // --- Editar atendimento: a receber -> pago cria receita ---
  const viraPago = await avaliar(`(async () => {
    const alvo = window.__store.state.appointments.find(a => a.paymentStatus === 'pending' && a.status !== 'canceled');
    const receitasAntes = window.__store.state.transactions.length;
    document.querySelector('.nav-item[data-view="ordens"]').click();
    document.querySelector('[data-detail="' + alvo.id + '"]').click();
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('[data-edit-appointment]').click();
    await new Promise(r => setTimeout(r, 300));
    const form = document.getElementById('appointmentForm');
    const preencheu = form.elements.address.value === alvo.address && Number(form.elements.value.value) === Number(alvo.value);
    const clienteCerto = form.elements.clientId.value === alvo.clientId;
    form.elements.paymentStatus.value = 'paid';
    form.elements.value.value = 999;
    form.requestSubmit();
    await new Promise(r => setTimeout(r, 800));
    const depois = window.__store.state.appointments.find(a => a.id === alvo.id);
    const receita = window.__store.state.transactions.find(t => t.appointmentId === alvo.id);
    return {
      id: alvo.id, preencheu, clienteCerto,
      pagamento: depois.paymentStatus,
      valor: depois.value,
      receitasAntes,
      receitasDepois: window.__store.state.transactions.length,
      receitaCriada: !!receita,
      valorReceita: receita ? receita.value : null
    };
  })()`);
  console.log('\n=== EDITAR ATENDIMENTO (a receber -> pago) ===');
  conferir('formulário abre preenchido', viraPago.preencheu === true);
  conferir('cliente correto selecionado', viraPago.clienteCerto === true);
  conferir('pagamento atualizado', viraPago.pagamento === 'paid');
  conferir('valor atualizado', Number(viraPago.valor) === 999, String(viraPago.valor));
  conferir('receita criada automaticamente', viraPago.receitaCriada === true,
    `${viraPago.receitasAntes} -> ${viraPago.receitasDepois}`);
  conferir('receita com o valor novo', Number(viraPago.valorReceita) === 999, String(viraPago.valorReceita));

  // --- O caminho de volta: pago -> a receber remove a receita ---
  const voltaPendente = await avaliar(`(async () => {
    const id = '${viraPago.id}';
    document.querySelector('.nav-item[data-view="ordens"]').click();
    document.querySelector('[data-detail="' + id + '"]').click();
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('[data-edit-appointment]').click();
    await new Promise(r => setTimeout(r, 300));
    const form = document.getElementById('appointmentForm');
    form.elements.paymentStatus.value = 'pending';
    form.requestSubmit();
    await new Promise(r => setTimeout(r, 800));
    return {
      pagamento: window.__store.state.appointments.find(a => a.id === id).paymentStatus,
      receitaRemovida: !window.__store.state.transactions.some(t => t.appointmentId === id)
    };
  })()`);
  console.log('\n=== EDITAR ATENDIMENTO (pago -> a receber) ===');
  conferir('pagamento voltou para pendente', voltaPendente.pagamento === 'pending');
  conferir('receita correspondente removida', voltaPendente.receitaRemovida === true);

  // --- Editar lançamento pela tabela do financeiro ---
  const edicaoLancamento = await avaliar(`(async () => {
    document.querySelector('.nav-item[data-view="financeiro"]').click();
    await new Promise(r => setTimeout(r, 300));
    const botao = document.querySelector('[data-edit-transaction]');
    if (!botao) return { semLancamentos: true };
    const id = botao.dataset.editTransaction;
    const antes = window.__store.state.transactions.find(t => t.id === id);
    botao.click();
    await new Promise(r => setTimeout(r, 300));
    const form = document.getElementById('transactionForm');
    const preencheu = form.elements.description.value === antes.description;
    form.elements.description.value = 'Descricao Editada';
    form.requestSubmit();
    await new Promise(r => setTimeout(r, 700));
    const depois = window.__store.state.transactions.find(t => t.id === id);
    return { preencheu, descricao: depois.description, tipoPreservado: depois.type === antes.type };
  })()`);
  console.log('\n=== EDITAR LANÇAMENTO ===');
  if (edicaoLancamento.semLancamentos) {
    conferir('há lançamentos no período', false, 'nenhum lançamento no mês exibido');
  } else {
    conferir('formulário abre preenchido', edicaoLancamento.preencheu === true);
    conferir('descrição alterada', edicaoLancamento.descricao === 'Descricao Editada');
    conferir('tipo preservado', edicaoLancamento.tipoPreservado === true);
  }

  // --- Excluir lançamento ---
  const exclusaoLancamento = await avaliar(`(async () => {
    document.querySelector('.nav-item[data-view="financeiro"]').click();
    await new Promise(r => setTimeout(r, 300));
    const botao = document.querySelector('[data-delete-transaction]');
    if (!botao) return { semLancamentos: true };
    const id = botao.dataset.deleteTransaction;
    const antes = window.__store.state.transactions.length;
    botao.click();
    await new Promise(r => setTimeout(r, 700));
    return { antes, depois: window.__store.state.transactions.length, sumiu: !window.__store.state.transactions.some(t => t.id === id) };
  })()`);
  console.log('\n=== EXCLUIR LANÇAMENTO ===');
  if (!exclusaoLancamento.semLancamentos) {
    conferir('lançamento removido', exclusaoLancamento.sumiu === true,
      `${exclusaoLancamento.antes} -> ${exclusaoLancamento.depois}`);
  }

  // --- Excluir atendimento leva junto a receita gerada ---
  const exclusaoAtendimento = await avaliar(`(async () => {
    const comReceita = window.__store.state.transactions.find(t => t.appointmentId);
    if (!comReceita) return { semVinculo: true };
    const id = comReceita.appointmentId;
    const totalAntes = window.__store.state.appointments.length;
    document.querySelector('.nav-item[data-view="ordens"]').click();
    document.querySelector('[data-detail="' + id + '"]').click();
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('[data-delete-appointment]').click();
    await new Promise(r => setTimeout(r, 800));
    return {
      atendimentoSumiu: !window.__store.state.appointments.some(a => a.id === id),
      receitaSumiu: !window.__store.state.transactions.some(t => t.id === comReceita.id),
      totalAntes,
      totalDepois: window.__store.state.appointments.length,
      modalFechado: !document.getElementById('modalBackdrop').classList.contains('open')
    };
  })()`);
  console.log('\n=== EXCLUIR ATENDIMENTO ===');
  if (!exclusaoAtendimento.semVinculo) {
    conferir('atendimento removido', exclusaoAtendimento.atendimentoSumiu === true,
      `${exclusaoAtendimento.totalAntes} -> ${exclusaoAtendimento.totalDepois}`);
    conferir('receita vinculada removida junto', exclusaoAtendimento.receitaSumiu === true);
    conferir('modal fecha após excluir', exclusaoAtendimento.modalFechado === true);
  }

  // --- Excluir cliente preserva o histórico ---
  const exclusaoCliente = await avaliar(`(async () => {
    const comHistorico = window.__store.state.clients.find(c =>
      window.__store.state.appointments.some(a => a.clientId === c.id));
    if (!comHistorico) return { semHistorico: true };
    const atendimentos = window.__store.state.appointments.filter(a => a.clientId === comHistorico.id).length;
    document.querySelector('.nav-item[data-view="clientes"]').click();
    document.querySelector('[data-client-detail="' + comHistorico.id + '"]').click();
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('[data-delete-client]').click();
    await new Promise(r => setTimeout(r, 800));
    const restantes = window.__store.state.appointments.filter(a => a.clientId === comHistorico.id).length;
    document.querySelector('.nav-item[data-view="ordens"]').click();
    await new Promise(r => setTimeout(r, 300));
    return {
      clienteSumiu: !window.__store.state.clients.some(c => c.id === comHistorico.id),
      atendimentos,
      restantes,
      mostraRemovido: document.getElementById('orderList').textContent.includes('Cliente removido')
    };
  })()`);
  console.log('\n=== EXCLUIR CLIENTE ===');
  if (!exclusaoCliente.semHistorico) {
    conferir('cliente removido', exclusaoCliente.clienteSumiu === true);
    conferir('atendimentos preservados', exclusaoCliente.restantes === exclusaoCliente.atendimentos,
      `${exclusaoCliente.atendimentos} mantidos`);
    conferir('ordens exibem "Cliente removido"', exclusaoCliente.mostraRemovido === true);
  }

  // --- Criar continua funcionando depois de tanta edição ---
  const criacao = await avaliar(`(async () => {
    document.querySelector('.nav-item[data-view="clientes"]').click();
    const antes = window.__store.state.clients.length;
    document.querySelector('[data-open="client"]').click();
    await new Promise(r => setTimeout(r, 300));
    const form = document.getElementById('clientForm');
    const rotulo = form.querySelector('button[type="submit"]').textContent;
    const limpo = form.elements.firstName.value === '';
    form.elements.firstName.value = 'Novo';
    form.elements.lastName.value = 'Cliente';
    form.elements.phone.value = '(16) 92222-2222';
    form.elements.address.value = 'Rua Nova, 2';
    form.elements.neighborhood.value = 'Centro';
    form.elements.city.value = 'Ribeirao Preto';
    form.requestSubmit();
    await new Promise(r => setTimeout(r, 700));
    return { rotulo, limpo, antes, depois: window.__store.state.clients.length };
  })()`);
  console.log('\n=== CRIAR AINDA FUNCIONA ===');
  conferir('formulário volta limpo', criacao.limpo === true);
  conferir('botão volta a "Salvar cliente"', criacao.rotulo === 'Salvar cliente', criacao.rotulo);
  conferir('cliente criado', criacao.depois === criacao.antes + 1, `${criacao.antes} -> ${criacao.depois}`);

  console.log('\n=== ERROS DE CONSOLE ===');
  console.log(erros.length ? erros.join('\n') : 'nenhum');
  if (erros.length) falhas.push('erros de console');

  console.log(`\n${falhas.length ? 'FALHAS: ' + falhas.join(', ') : 'TODOS OS TESTES PASSARAM'}`);
  socket.close();
  chrome.kill();
  process.exit(falhas.length ? 1 : 0);
}

main().catch(e => { console.error('FALHA NO TESTE:', e); process.exit(1); });
