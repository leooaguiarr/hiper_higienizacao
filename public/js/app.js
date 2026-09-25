// Interface da Hiper Higienizações.
// Toda leitura vem de store.state e toda escrita passa pelas funções do
// store.js, que decidem entre localStorage (demonstração) e Firestore (nuvem).

import { brl, dateFmt, fullDateFmt, monthFmt, localISO, parseDate, addDays, addMonths, startOfWeek, startOfMonth, uid, esc, phoneDigits, cap, whatsappLink, maskPhone, maskCep, maskCpfCnpj, maskCurrency, parseCurrency } from './utils.js';
import {
  store, iniciar, iniciarDemo, entrarComGoogle, sair, irParaLogin,
  criar, atualizar, remover, gravarLote, restaurarDemo, aoMudar, aoErro, mensagemErro
} from './store.js';
import {
  suportaNotificacoes, permissaoAtual, pedirPermissao,
  publicarLembretes, verificarAgora, registrarPeriodicSync, periodicSyncAtivo
} from './notificacoes.js';

const STATUS = {
  scheduled: ['Agendado', 'scheduled'],
  confirmed: ['Confirmado', 'confirmed'],
  in_service: ['Em atendimento', 'in_service'],
  completed: ['Concluído', 'completed'],
  canceled: ['Cancelado', 'canceled']
};
const ICONS = {
  sofa: 'fa-couch', chair: 'fa-chair', mattress: 'fa-bed', rug: 'fa-rug',
  shield: 'fa-shield-halved', pet: 'fa-paw', baby: 'fa-baby-carriage', business: 'fa-building'
};

let currentView = 'dashboard';
let agendaMode = 'week';
let agendaDate = new Date();

const state = () => store.state;

function getClient(id) { return state().clients.find(item => item.id === id); }
function getService(id) { return state().services.find(item => item.id === id) || { id, name: 'Serviço desativado/removido', icon: 'sparkles', duration: 120, basePrice: 0, active: false }; }
function clientName(client) { return client ? `${client.firstName} ${client.lastName}`.trim() : 'Cliente removido'; }
function clientHistory(id) { return state().appointments.filter(item => item.clientId === id && item.status === 'completed').sort((a,b) => b.date.localeCompare(a.date)); }
function statusBadge(status) { const config = STATUS[status]; return `<span class="badge" style="--status:var(--${config?.[1] || 'muted'})">${esc(config?.[0] || status)}</span>`; }

function buildAlerts() {
  const today = localISO(new Date());
  const pending = state().appointments.filter(item => item.paymentStatus === 'pending' && item.status !== 'canceled');
  const overdue = state().clients.filter(client => client.nextRecommendation && client.nextRecommendation <= today);
  const unconfirmed = state().appointments.filter(item => item.date >= today && item.status === 'scheduled');
  const alerts = [];
  if (pending.length) alerts.push({ icon:'fa-money-bill-wave', tone:'warning', title:`${pending.length} recebimento(s) pendente(s)`, text:`Total ${brl.format(pending.reduce((sum,item) => sum + Number(item.value),0))}` });
  if (overdue.length) alerts.push({ icon:'fa-rotate', tone:'info', title:`${overdue.length} cliente(s) para reativar`, text:'Recomendação de nova higienização vencida' });
  if (unconfirmed.length) alerts.push({ icon:'fa-calendar-check', tone:'warning', title:`${unconfirmed.length} serviço(s) sem confirmação`, text:'Confirme a rota com os clientes' });
  return alerts;
}

function renderDashboard() {
  const today = localISO(new Date());
  const month = today.slice(0,7);
  const currentAppointments = state().appointments.filter(item => item.date.startsWith(month));
  const completed = currentAppointments.filter(item => item.status === 'completed');
  const paidIncome = state().transactions.filter(item => item.type === 'income' && item.status === 'paid' && item.date.startsWith(month));
  const revenue = paidIncome.reduce((sum,item) => sum + Number(item.value),0);
  const recurrent = state().clients.filter(client => clientHistory(client.id).length > 1).length;
  const ticket = completed.length ? completed.reduce((sum,item) => sum + Number(item.value),0) / completed.length : 0;
  const metrics = [
    ['fa-chart-line', brl.format(revenue), 'Faturamento do mês', '+ operação'],
    ['fa-circle-check', completed.length, 'Serviços concluídos', `${currentAppointments.length} no mês`],
    ['fa-user-group', recurrent, 'Clientes recorrentes', `${state().clients.length} cadastrados`],
    ['fa-receipt', brl.format(ticket), 'Ticket médio', 'serviços concluídos']
  ];
  document.getElementById('dashboardMetrics').innerHTML = metrics.map(([icon,value,label,hint]) => `<article class="metric-card"><div class="metric-icon"><i class="fa-solid ${icon}"></i></div><strong>${value}</strong><span>${label}</span><small>${hint}</small></article>`).join('');

  const upcoming = state().appointments
    .filter(item => item.date >= today && item.status !== 'canceled' && item.status !== 'completed')
    .sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0,5);
  document.getElementById('upcomingList').innerHTML = upcoming.length ? upcoming.map(item => {
    const client = getClient(item.clientId), service = getService(item.serviceId);
    const subtexto = [service?.name, item.team].filter(Boolean).map(esc).join(' · ');
    return `<button class="list-item" data-detail="${item.id}"><span class="list-time"><strong>${item.time}</strong><span>${dateFmt.format(parseDate(item.date))}</span></span><span class="list-main"><strong>${esc(clientName(client))}</strong><span>${subtexto}</span></span><span class="list-value">${brl.format(item.value)}${statusBadge(item.status)}</span></button>`;
  }).join('') : empty('Nenhum serviço à frente. Aproveite para prospectar.');

  const alerts = buildAlerts();
  document.getElementById('notificationCount').textContent = alerts.length;
  document.getElementById('notificationCount').style.display = alerts.length ? 'grid' : 'none';
  const alertsHtml = alerts.length ? alerts.map(alertCard).join('') : empty('Tudo em dia por aqui.');
  document.getElementById('alertsList').innerHTML = alertsHtml;
  document.getElementById('drawerAlerts').innerHTML = alertsHtml;

  const dueClients = state().clients
    .filter(client => client.nextRecommendation)
    .sort((a,b) => a.nextRecommendation.localeCompare(b.nextRecommendation))
    .slice(0,5);
  document.getElementById('recurrenceList').innerHTML = dueClients.length ? dueClients.map(client => {
    const due = client.nextRecommendation <= today;
    return `<div class="list-item"><span class="list-main"><strong>${esc(clientName(client))}</strong><span>${due ? 'Recomendação vencida' : `Previsto para ${dateFmt.format(parseDate(client.nextRecommendation))}`}</span></span><a class="whats-link" target="_blank" rel="noopener noreferrer" href="https://wa.me/55${phoneDigits(client.phone)}"><i class="fa-brands fa-whatsapp"></i></a></div>`;
  }).join('') : empty('Cadastre clientes para acompanhar a recorrência.');

  renderRevenueChart();
}

function alertCard(alert) { return `<div class="list-item"><span class="alert-icon ${alert.tone}"><i class="fa-solid ${alert.icon}"></i></span><span class="list-main"><strong>${esc(alert.title)}</strong><span>${esc(alert.text)}</span></span></div>`; }
function empty(message) { return `<div class="empty-state"><i class="fa-regular fa-circle-check"></i><br>${esc(message)}</div>`; }

function renderRevenueChart() {
  const today = new Date();
  const months = Array.from({ length:6 }, (_,index) => new Date(today.getFullYear(), today.getMonth() - 5 + index, 1));
  const values = months.map(date => {
    const key = localISO(date).slice(0,7);
    return state().transactions.filter(item => item.type === 'income' && item.status === 'paid' && item.date.startsWith(key)).reduce((sum,item) => sum + Number(item.value),0);
  });
  const max = Math.max(...values,1);
  document.getElementById('revenueChart').innerHTML = months.map((date,index) => `<div class="bar-column"><strong>${values[index] ? brl.format(values[index]).replace(/,00/,'') : '-'}</strong><div class="bar" style="height:${Math.max(3,values[index]/max*135)}px"></div><span>${cap(date.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''))}</span></div>`).join('');
}

function renderAgenda() {
  document.getElementById('agendaPeriod').textContent = agendaMode === 'day' ? cap(fullDateFmt.format(agendaDate)) : agendaMode === 'week' ? weekPeriodLabel() : cap(monthFmt.format(agendaDate));
  document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === agendaMode));
  if (agendaMode === 'day') renderDay(); else if (agendaMode === 'week') renderWeek(); else renderMonth();
}
function weekPeriodLabel() {
  const start = startOfWeek(agendaDate), end = addDays(start,6);
  return `${dateFmt.format(start)} - ${dateFmt.format(end)}`;
}
function eventCard(item, month = false) {
  const client = getClient(item.clientId), service = getService(item.serviceId);
  if (month) return `<button class="month-event ${item.status}" style="--status:var(--${item.status})" data-detail="${item.id}">${item.time} ${esc(client?.firstName || '')}</button>`;
  return `<button class="appointment-card ${item.status}" data-detail="${item.id}"><time>${item.time} · ${item.duration} min</time><strong>${esc(clientName(client))}</strong><span>${esc(service?.name || '')}</span></button>`;
}
function renderWeek() {
  const start = startOfWeek(agendaDate), today = localISO(new Date());
  document.getElementById('calendar').innerHTML = `<div class="week-grid">${Array.from({length:7},(_,index) => {
    const date = addDays(start,index), key = localISO(date);
    const appointments = state().appointments.filter(item => item.date === key && item.status !== 'canceled').sort((a,b) => a.time.localeCompare(b.time));
    return `<div class="week-day"><div class="day-heading ${key===today?'today':''}"><span>${date.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}</span><strong>${date.getDate()}</strong></div><div class="day-appointments">${appointments.map(item => eventCard(item)).join('') || '<span class="muted">Livre</span>'}</div></div>`;
  }).join('')}</div>`;
}
function renderDay() {
  const key = localISO(agendaDate);
  const appointments = state().appointments.filter(item => item.date === key && item.status !== 'canceled').sort((a,b) => a.time.localeCompare(b.time));
  document.getElementById('calendar').innerHTML = `<div class="day-list">${appointments.map(item => eventCard(item)).join('') || empty('Nenhum serviço neste dia.')}</div>`;
}
function renderMonth() {
  const first = startOfMonth(agendaDate), gridStart = startOfWeek(first), today = localISO(new Date());
  const weekdays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  let html = `<div class="month-grid">${weekdays.map(day => `<div class="month-weekday">${day}</div>`).join('')}`;
  for (let index=0; index<42; index++) {
    const date = addDays(gridStart,index), key = localISO(date);
    const items = state().appointments.filter(item => item.date === key && item.status !== 'canceled').sort((a,b) => a.time.localeCompare(b.time));
    html += `<div class="month-day ${date.getMonth()!==agendaDate.getMonth()?'outside':''} ${key===today?'today':''}"><span class="day-number">${date.getDate()}</span>${items.slice(0,3).map(item => eventCard(item,true)).join('')}${items.length>3?`<span class="muted">+${items.length-3}</span>`:''}</div>`;
  }
  document.getElementById('calendar').innerHTML = `${html}</div>`;
}

function renderClients() {
  const query = document.getElementById('clientSearch').value.trim().toLowerCase();
  const filtered = state().clients.filter(client => `${clientName(client)} ${client.phone} ${client.neighborhood}`.toLowerCase().includes(query));
  const totalSpend = state().appointments.filter(item => item.status === 'completed').reduce((sum,item) => sum + Number(item.value),0);
  const due = state().clients.filter(client => client.nextRecommendation && client.nextRecommendation <= localISO(new Date())).length;
  document.getElementById('clientMetrics').innerHTML = `<div class="mini-metric"><strong>${state().clients.length}</strong><span>Clientes cadastrados</span></div><div class="mini-metric"><strong>${brl.format(totalSpend)}</strong><span>Valor histórico concluído</span></div><div class="mini-metric"><strong>${due}</strong><span>Contatos de recorrência</span></div>`;
  document.getElementById('clientGrid').innerHTML = filtered.length ? filtered.map(client => {
    const history = clientHistory(client.id), total = history.reduce((sum,item) => sum + Number(item.value),0), last = history[0];
    const initials = `${client.firstName?.[0] || ''}${client.lastName?.[0] || ''}`.toUpperCase();
    const address = `${client.address}${client.number ? ', ' + client.number : ''}${client.complement ? ' - ' + client.complement : ''}, ${client.neighborhood} - ${client.city}`;
    return `<article class="client-card"><div class="client-head"><span class="initials">${esc(initials)}</span><div><h3>${esc(clientName(client))}</h3><span>${esc(client.phone)}</span></div></div><div class="client-stats"><div><strong>${history.length}</strong><span>serviços</span></div><div><strong>${brl.format(total)}</strong><span>total gasto</span></div><div><strong>${last?dateFmt.format(parseDate(last.date)):'-'}</strong><span>última higiene</span></div></div><p class="client-address"><i class="fa-solid fa-location-dot"></i> ${esc(address)}</p><div class="client-actions"><a target="_blank" rel="noopener noreferrer" href="https://wa.me/55${phoneDigits(client.phone)}"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}"><i class="fa-solid fa-route"></i> Maps</a><button data-client-detail="${client.id}">Ver ficha</button></div></article>`;
  }).join('') : empty('Nenhum cliente encontrado.');
}

function renderServices() {
  const servicos = state().services;
  document.getElementById('serviceGrid').innerHTML = servicos.map(service => {
    const duracaoH = Math.floor(service.duration / 60);
    const duracaoMin = service.duration % 60 ? ` ${service.duration % 60}min` : '';
    const duracaoTexto = `${duracaoH}h${duracaoMin}`;
    const badgeHtml = service.active !== false
      ? '<span class="badge" style="color:var(--success);background:rgba(16,185,129,0.1)">Ativo</span>'
      : '<span class="badge" style="color:var(--danger);background:rgba(239,68,68,0.1)">Inativo</span>';

    return `<article class="service-card ${service.active === false ? 'is-inactive' : ''}">
      <div class="service-header">
        <div class="service-icon"><i class="fa-solid ${ICONS[service.icon] || 'fa-sparkles'}"></i></div>
        ${badgeHtml}
      </div>
      <h3>${esc(service.name)}</h3>
      <p>${esc(service.description || 'Sem descrição operacional cadastrada.')}</p>
      <div class="service-meta">
        <span><i class="fa-regular fa-clock"></i> ${duracaoTexto}</span>
        <span>A partir de ${brl.format(service.basePrice)}</span>
      </div>
      <div class="service-actions">
        <button type="button" class="secondary-button" data-edit-service="${service.id}"><i class="fa-solid fa-pen"></i> Editar</button>
        <button type="button" class="danger-button" data-delete-service="${service.id}"><i class="fa-solid fa-trash"></i> Excluir</button>
      </div>
    </article>`;
  }).join('') || empty('Nenhum serviço no catálogo.');
  bindDynamicActions();
}

function renderFinance() {
  const monthInput = document.getElementById('financeMonth');
  if (!monthInput.value) monthInput.value = localISO(new Date()).slice(0,7);
  const month = monthInput.value;
  const transactions = state().transactions.filter(item => item.date.startsWith(month)).sort((a,b) => b.date.localeCompare(a.date));
  const income = transactions.filter(item => item.type === 'income' && item.status === 'paid').reduce((sum,item) => sum + Number(item.value),0);
  const expenses = transactions.filter(item => item.type === 'expense' && item.status === 'paid').reduce((sum,item) => sum + Number(item.value),0);
  const receivable = state().appointments.filter(item => item.paymentStatus === 'pending' && item.date.startsWith(month) && item.status !== 'canceled').reduce((sum,item) => sum + Number(item.value),0);
  const paidServices = transactions.filter(item => item.type === 'income' && item.status === 'paid').length;
  const metrics = [
    ['fa-arrow-trend-up', brl.format(income), 'Receitas recebidas'],
    ['fa-arrow-trend-down', brl.format(expenses), 'Despesas pagas'],
    ['fa-sack-dollar', brl.format(income-expenses), 'Lucro estimado'],
    ['fa-clock', brl.format(receivable), 'Contas a receber'],
    ['fa-receipt', brl.format(paidServices?income/paidServices:0), 'Ticket médio recebido']
  ];
  document.getElementById('financeMetrics').innerHTML = metrics.map(([icon,value,label]) => `<article class="metric-card"><div class="metric-icon"><i class="fa-solid ${icon}"></i></div><strong>${value}</strong><span>${label}</span></article>`).join('');
  document.getElementById('transactionRows').innerHTML = transactions.length ? transactions.map(item => `<tr><td>${dateFmt.format(parseDate(item.date))}</td><td><strong>${esc(item.description)}</strong><br><span class="muted">${esc(item.category || 'Geral')}</span></td><td>${esc(item.paymentMethod)}</td><td><span class="badge" style="--status:${item.status==='paid'?'var(--success)':'var(--warning)'}">${item.status==='paid'?'Pago':'Pendente'}</span></td><td class="${item.type}">${item.type==='expense'?'- ':'+ '}${brl.format(item.value)}</td><td class="row-actions"><button type="button" class="icon-button" data-edit-transaction="${item.id}" aria-label="Editar lançamento" title="Editar"><i class="fa-solid fa-pen"></i></button><button type="button" class="icon-button danger" data-delete-transaction="${item.id}" aria-label="Excluir lançamento" title="Excluir"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('') : `<tr><td colspan="6">${empty('Nenhuma movimentação no período.')}</td></tr>`;
  renderServiceRevenue(month);
}
function renderServiceRevenue(month) {
  const grouped = {};
  state().appointments.filter(item => item.date.startsWith(month) && item.status === 'completed').forEach(item => { const name = getService(item.serviceId)?.name || 'Outros'; grouped[name] = (grouped[name] || 0) + Number(item.value); });
  const sorted = Object.entries(grouped).sort((a,b) => b[1]-a[1]);
  const max = Math.max(...sorted.map(([,value]) => value),1);
  document.getElementById('serviceRevenue').innerHTML = sorted.length ? sorted.map(([name,value]) => `<div class="progress-row"><header><span>${esc(name)}</span><strong>${brl.format(value)}</strong></header><div class="progress-track"><div class="progress-fill" style="width:${value/max*100}%"></div></div></div>`).join('') : empty('Conclua serviços para ver a composição.');
}

function renderOrders() {
  const query = document.getElementById('orderSearch').value.trim().toLowerCase();
  const orders = [...state().appointments].sort((a,b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).filter(item => {
    const client = getClient(item.clientId); return `${item.id} ${clientName(client)} ${item.address}`.toLowerCase().includes(query);
  });
  document.getElementById('orderList').innerHTML = orders.length ? orders.map(item => {
    const client = getClient(item.clientId), service = getService(item.serviceId);
    return `<article class="order-card"><div><strong>#${item.id.split('-').pop().toUpperCase()}</strong><span>${dateFmt.format(parseDate(item.date))} · ${item.time}</span></div><div><strong>${esc(clientName(client))}</strong><span>${esc(service?.name || '')}</span></div><div><strong>${esc(item.team || 'Atendimento')}</strong><span>${esc(item.address)}</span></div><div>${statusBadge(item.status)}</div><button data-detail="${item.id}">Abrir OS</button></article>`;
  }).join('') : empty('Nenhuma ordem de serviço encontrada.');
}

function renderAll() {
  if (store.modo !== 'demo' && store.modo !== 'nuvem') return;
  renderDashboard(); renderAgenda(); renderClients(); renderServices(); renderFinance(); renderOrders();
  bindDynamicActions();
}

function bindDynamicActions() {
  document.querySelectorAll('[data-detail]').forEach(button => button.onclick = () => showAppointmentDetail(button.dataset.detail));
  document.querySelectorAll('[data-client-detail]').forEach(button => button.onclick = () => showClientDetail(button.dataset.clientDetail));
  document.querySelectorAll('[data-edit-transaction]').forEach(button => button.onclick = () => openForm('transaction', button.dataset.editTransaction));
  document.querySelectorAll('[data-delete-transaction]').forEach(button => button.onclick = () => excluirLancamento(button.dataset.deleteTransaction));
  document.querySelectorAll('[data-edit-service]').forEach(button => button.onclick = () => openForm('service', button.dataset.editService));
  document.querySelectorAll('[data-delete-service]').forEach(button => button.onclick = () => excluirServico(button.dataset.deleteService));
}

function getSettings() {
  return state().settings?.find(s => s.id === 'empresa') || {
    msgConfirmacao: 'Olá {{cliente}}! Passando para confirmar nosso agendamento de {{servico}} para o dia {{data}} às {{hora}}.',
    msgGarantia: 'Olá {{cliente}}! Seu serviço de {{servico}} foi concluído.\n\n⚠️ *Orientações:*\nDeixe o estofado secando em local ventilado por 12 a 24 horas. Evite usar durante a secagem.\nQualquer dúvida, estamos à disposição!',
    msgLembrete: 'Olá {{cliente}}! Como você está?\nJá faz um tempinho desde a última limpeza. Que tal agendar uma nova higienização para manter seus estofados limpos e livres de ácaros?'
  };
}

function renderTemplate(templateStr, params) {
  if (!templateStr) return '';
  return templateStr.replace(/\{\{(\w+)\}\}/g, (match, key) => params[key] || match);
}

function showAppointmentDetail(id) {
  const item = state().appointments.find(appointment => appointment.id === id); if (!item) return;
  const client = getClient(item.clientId), service = getService(item.serviceId);
  
  const params = {
    cliente: clientName(client),
    servico: service?.name || 'higienização',
    data: dateFmt.format(parseDate(item.date)),
    hora: item.time
  };
  
  let whatsButton = '';
  const config = getSettings();
  if (item.status === 'scheduled') {
    const text = renderTemplate(config.msgConfirmacao, params);
    whatsButton = `<a target="_blank" rel="noopener noreferrer" href="${whatsappLink(client?.phone, text)}" class="secondary-button" style="color:var(--success); border-color:var(--success)"><i class="fa-brands fa-whatsapp"></i> Confirmar</a>`;
  } else if (item.status === 'completed') {
    const text = renderTemplate(config.msgGarantia, params);
    whatsButton = `<a target="_blank" rel="noopener noreferrer" href="${whatsappLink(client?.phone, text)}" class="secondary-button" style="color:var(--success); border-color:var(--success)"><i class="fa-brands fa-whatsapp"></i> Garantia</a>`;
  }

  openDetail('ORDEM DE SERVIÇO', `OS #${item.id.split('-').pop().toUpperCase()}`, `<div class="detail-hero"><span class="initials"><i class="fa-solid ${ICONS[service?.icon] || 'fa-sparkles'}"></i></span><div><strong>${esc(clientName(client))}</strong><p>${esc(service?.name || '')}</p></div></div><div class="detail-grid"><div><span>Data e horário</span><strong>${cap(fullDateFmt.format(parseDate(item.date)))} · ${item.time}</strong></div><div><span>Duração e valor</span><strong>${item.duration} min · ${brl.format(item.value)}</strong></div><div><span>Responsável/equipe</span><strong>${esc(item.team || 'Não informado')}</strong></div><div><span>Pagamento</span><strong>${item.paymentStatus==='paid'?'Pago':'A receber'} · ${esc(item.paymentMethod)}</strong></div><div style="grid-column:1/-1"><span>Endereço</span><strong>${esc(item.address)}</strong></div><div style="grid-column:1/-1"><span>Observações</span><strong>${esc(item.notes || 'Sem observações')}</strong></div></div><div class="status-actions">${Object.entries(STATUS).map(([key,[label]]) => `<button data-set-status="${key}" ${item.status===key?'disabled':''}>${label}</button>`).join('')}</div><div class="detail-actions">${whatsButton}<button type="button" class="secondary-button" data-edit-appointment="${item.id}"><i class="fa-solid fa-pen"></i> Editar</button><button type="button" class="danger-button" data-delete-appointment="${item.id}"><i class="fa-solid fa-trash"></i> Excluir</button></div>`);
  document.querySelectorAll('[data-set-status]').forEach(button => button.onclick = () => updateAppointmentStatus(item.id, button.dataset.setStatus));
  document.querySelector('[data-edit-appointment]').onclick = () => openForm('appointment', item.id);
  document.querySelector('[data-delete-appointment]').onclick = () => excluirAgendamento(item.id);
}
function showClientDetail(id) {
  const client = getClient(id); if (!client) return;
  const history = clientHistory(id), total = history.reduce((sum,item) => sum + Number(item.value),0);
  const params = { cliente: clientName(client) };
  let whatsButton = '';
  const config = getSettings();
  if (client.nextRecommendation && client.nextRecommendation <= localISO(new Date())) {
    const text = renderTemplate(config.msgLembrete, params);
    whatsButton = `<a target="_blank" rel="noopener noreferrer" href="${whatsappLink(client.phone, text)}" class="secondary-button" style="color:var(--success); border-color:var(--success)"><i class="fa-brands fa-whatsapp"></i> Lembrete</a>`;
  } else {
    whatsButton = `<a target="_blank" rel="noopener noreferrer" href="${whatsappLink(client.phone)}" class="secondary-button" style="color:var(--success); border-color:var(--success)"><i class="fa-brands fa-whatsapp"></i> Conversar</a>`;
  }

  const numStr = client.number ? `, ${client.number}` : '';
  const compStr = client.complement ? ` - ${client.complement}` : '';
  const fullAddress = `${client.address}${numStr}${compStr}, ${client.neighborhood} - ${client.city}`;

  const docStr = client.document ? `<div style="grid-column:1/-1"><span>CPF / CNPJ</span><strong>${esc(client.document)}</strong></div>` : '';

  openDetail('FICHA DO CLIENTE', clientName(client), `<div class="detail-hero"><span class="initials">${esc((client.firstName?.[0]||'')+(client.lastName?.[0]||''))}</span><div><strong>${esc(clientName(client))}</strong><p>${esc(client.phone)}</p></div></div><div class="detail-grid"><div><span>Total gasto</span><strong>${brl.format(total)}</strong></div><div><span>Serviços concluídos</span><strong>${history.length}</strong></div><div><span>Última higienização</span><strong>${history[0]?dateFmt.format(parseDate(history[0].date)):'-'}</strong></div><div><span>Próxima recomendação</span><strong>${client.nextRecommendation?dateFmt.format(parseDate(client.nextRecommendation)):'Não definida'}</strong></div>${docStr}<div style="grid-column:1/-1"><span>Endereço</span><strong>${esc(fullAddress)}</strong></div></div><h3>Histórico</h3><div class="stack-list" style="margin-top:10px">${history.length?history.map(item => `<div class="list-item"><span class="list-time">${dateFmt.format(parseDate(item.date))}</span><span class="list-main"><strong>${esc(getService(item.serviceId)?.name || '')}</strong><span>${esc(item.team || '')}</span></span><span class="list-value">${brl.format(item.value)}</span></div>`).join(''):empty('Ainda não há serviços concluídos.')}</div><div class="detail-actions">${whatsButton}<button type="button" class="secondary-button" data-edit-client="${client.id}"><i class="fa-solid fa-pen"></i> Editar</button><button type="button" class="danger-button" data-delete-client="${client.id}"><i class="fa-solid fa-trash"></i> Excluir</button></div>`);
  document.querySelector('[data-edit-client]').onclick = () => openForm('client', client.id);
  document.querySelector('[data-delete-client]').onclick = () => excluirCliente(client.id);
}

// Concluir um serviço move três registros de uma vez: o agendamento, a
// recomendação do cliente e a receita correspondente. Por isso vai em lote.
async function updateAppointmentStatus(id, status) {
  const item = state().appointments.find(appointment => appointment.id === id); if (!item) return;
  const operacoes = [{ tipo:'atualizar', chave:'appointments', id:item.id, dados:{ status } }];
  if (status === 'completed') {
    const client = getClient(item.clientId);
    if (client) operacoes.push({ tipo:'atualizar', chave:'clients', id:client.id, dados:{ nextRecommendation: localISO(addMonths(parseDate(item.date),6)) } });
    if (item.paymentStatus === 'paid' && !state().transactions.some(tx => tx.appointmentId === item.id)) {
      const receita = incomeFromAppointment(item);
      operacoes.push({ tipo:'criar', chave:'transactions', id:receita.id, dados:receita });
    }
  }
  closeModal();
  await comFeedback(() => gravarLote(operacoes), `Serviço atualizado para ${STATUS[status][0]}.`);
}
function incomeFromAppointment(item) {
  return { id:uid('tx'), appointmentId:item.id, type:'income', date:item.date, description:`${getService(item.serviceId)?.name || 'Serviço'} - ${clientName(getClient(item.clientId))}`, value:Number(item.value), paymentMethod:item.paymentMethod, status:'paid', category:'Serviços' };
}

// Guarda o registro em edição. Nulo significa que o formulário está criando.
let editando = null;

const CHAVE_DE = { appointment:'appointments', client:'clients', transaction:'transactions', service:'services', settings:'settings' };

function buscarRegistro(type, id) { return state()[CHAVE_DE[type]].find(item => item.id === id); }

// Os names dos campos batem com as chaves do registro, então o preenchimento
// é direto. Campos ausentes no registro ficam como estão.
function preencherForm(form, registro) {
  Object.entries(registro).forEach(([chave, valor]) => {
    const campo = form.elements[chave];
    if (campo && valor !== undefined && valor !== null) {
      if (campo.classList.contains('mask-phone')) campo.value = maskPhone(valor);
      else if (campo.classList.contains('mask-currency')) campo.value = maskCurrency(Number(valor).toFixed(2));
      else campo.value = valor;
    }
  });
}

function openForm(type, id = null) {
  let registro = null;
  if (type === 'settings') {
    id = 'empresa';
    registro = getSettings();
  } else {
    registro = id ? buscarRegistro(type, id) : null;
    if (id && !registro) { toast('Registro não encontrado.'); return; }
  }
  
  editando = registro && type !== 'settings' ? { type, id } : null; // settings usa o seu próprio handler sem depender do editando global

  const configs = {
    appointment: { formId:'appointmentForm', criar:['NOVO SERVIÇO','Agendar atendimento','Salvar agendamento'], editar:['EDITAR SERVIÇO','Editar atendimento','Salvar alterações'] },
    client:      { formId:'clientForm',      criar:['NOVO CADASTRO','Adicionar cliente','Salvar cliente'],      editar:['EDITAR CADASTRO','Editar cliente','Salvar alterações'] },
    transaction: { formId:'transactionForm', criar:['FINANCEIRO','Novo lançamento','Salvar lançamento'],        editar:['FINANCEIRO','Editar lançamento','Salvar alterações'] },
    service:     { formId:'serviceForm',     criar:['CATÁLOGO','Novo serviço','Salvar serviço'],                editar:['CATÁLOGO','Editar serviço','Salvar alterações'] },
    settings:    { formId:'settingsForm',    criar:['MENSAGENS','Editar mensagens do WhatsApp','Salvar alterações'], editar:['MENSAGENS','Editar mensagens do WhatsApp','Salvar alterações'] }
  };
  const { formId } = configs[type];
  const [eyebrow, titulo, rotuloBotao] = registro ? configs[type].editar : configs[type].criar;
  document.getElementById('modalEyebrow').textContent = eyebrow;
  document.getElementById('modalTitle').textContent = titulo;
  document.querySelectorAll('.modal-form, #detailContent, #guideContent').forEach(element => element.hidden = true);
  const form = document.getElementById(formId); form.hidden = false; form.reset();
  form.querySelector('button[type="submit"]').textContent = rotuloBotao;

  if (type === 'appointment') {
    if (!state().clients.length) { toast('Cadastre um cliente antes de agendar.'); navigate('clientes'); return; }
    if (!state().services.some(service => service.active)) { toast('Nenhum serviço ativo no catálogo.'); navigate('servicos'); return; }
    // Na edição o serviço pode estar inativo hoje: garante que ele apareça.
    const servicos = state().services.filter(service => service.active || service.id === registro?.serviceId);
    form.elements.clientId.innerHTML = state().clients.map(client => `<option value="${client.id}">${esc(clientName(client))}</option>`).join('');
    form.elements.serviceId.innerHTML = servicos.map(service => `<option value="${service.id}">${esc(service.name)}</option>`).join('');
    // Ao trocar o serviço, sugere duração e preço; ao trocar o cliente, o
    // endereço. Só na criação, para não sobrescrever o que já foi ajustado.
    form.elements.serviceId.onchange = () => { const service = getService(form.elements.serviceId.value); if (service) { form.elements.duration.value = service.duration; form.elements.value.value = maskCurrency(Number(service.basePrice).toFixed(2)); } };
    form.elements.clientId.onchange = () => { 
      const client = getClient(form.elements.clientId.value); 
      if (client) {
        const numStr = client.number ? `, ${client.number}` : '';
        const compStr = client.complement ? ` (${client.complement})` : '';
        const enderecoRua = client.address || client.street || '';
        form.elements.address.value = `${enderecoRua}${numStr}${compStr} - ${client.neighborhood || ''}, ${client.city || ''}`;
      }
    };
    if (!registro) {
      form.elements.date.value = localISO(new Date()); form.elements.time.value = '08:00'; form.elements.duration.value = 180;
      form.elements.serviceId.onchange();
      form.elements.clientId.onchange();
    }
  }
  if (type === 'transaction' && !registro) form.elements.date.value = localISO(new Date());
  if (type === 'service') {
    if (!registro) {
      form.elements.icon.value = 'sofa';
      form.elements.duration.value = 120;
      form.elements.basePrice.value = '150,00';
      form.elements.active.value = 'true';
    }
  }
  if (registro) {
    preencherForm(form, registro);
    if (type === 'service') form.elements.active.value = String(registro.active !== false);
  }
  openModal();
}
function openDetail(eyebrow,title,html) {
  document.getElementById('modalEyebrow').textContent = eyebrow;
  document.getElementById('modalTitle').textContent = title;
  document.querySelectorAll('.modal-form, #guideContent').forEach(element => element.hidden = true);
  const detail = document.getElementById('detailContent'); detail.hidden = false; detail.innerHTML = html; openModal();
}
function openGuide() {
  document.getElementById('modalEyebrow').textContent = 'AJUDA';
  document.getElementById('modalTitle').textContent = 'Guia rápido';
  document.querySelectorAll('.modal-form, #detailContent').forEach(element => element.hidden = true);
  document.getElementById('guideContent').hidden = false;
  openModal();
}
function openModal() { const backdrop = document.getElementById('modalBackdrop'); backdrop.classList.add('open'); backdrop.setAttribute('aria-hidden','false'); }
function closeModal() { const backdrop = document.getElementById('modalBackdrop'); backdrop.classList.remove('open'); backdrop.setAttribute('aria-hidden','true'); }
function toast(message) { const element = document.getElementById('toast'); element.textContent = message; element.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove('show'),2600); }

// Envolve uma escrita: bloqueia o botão, avisa em caso de falha da nuvem.
async function comFeedback(operacao, mensagemOk) {
  try { await operacao(); if (mensagemOk) toast(mensagemOk); }
  catch (error) { toast(mensagemErro(error)); }
}

async function handleAppointmentSubmit(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const dados = { ...values, duration:Number(values.duration), value:parseCurrency(values.value) };
  const emEdicao = editando;

  // Validação: data/hora no passado
  const apptDate = parseDate(dados.date);
  const [hours, minutes] = dados.time.split(':').map(Number);
  apptDate.setHours(hours, minutes, 0, 0);
  
  const dataHoraAlterada = !emEdicao || emEdicao.date !== dados.date || emEdicao.time !== dados.time;
  if (dataHoraAlterada && apptDate < new Date()) {
    toast('Não é possível agendar em uma data ou horário que já passou.');
    return;
  }

  // Validação: conflito de horário (sobreposição)
  const inicioNovo = apptDate.getTime();
  const fimNovo = inicioNovo + (dados.duration * 60000);

  const conflito = state().appointments.find(a => {
    if (a.id === emEdicao?.id) return false;
    if (a.date !== dados.date) return false;
    
    const [h, m] = a.time.split(':').map(Number);
    const inicioExistente = new Date(apptDate).setHours(h, m, 0, 0);
    const fimExistente = inicioExistente + (a.duration * 60000);
    
    return inicioNovo < fimExistente && fimNovo > inicioExistente;
  });

  if (conflito) {
    toast('Já existe um agendamento conflitante neste horário.');
    return;
  }

  closeModal();

  if (emEdicao) {
    const receita = state().transactions.find(tx => tx.appointmentId === emEdicao.id);
    await comFeedback(async () => {
      const operacoes = [{ tipo:'atualizar', chave:'appointments', id:emEdicao.id, dados }];
      // Mantém o financeiro coerente com o pagamento informado aqui.
      if (dados.paymentStatus === 'paid' && !receita) {
        const nova = incomeFromAppointment({ ...dados, id:emEdicao.id });
        operacoes.push({ tipo:'criar', chave:'transactions', id:nova.id, dados:nova });
      } else if (dados.paymentStatus === 'pending' && receita) {
        operacoes.push({ tipo:'remover', chave:'transactions', id:receita.id });
      }
      await gravarLote(operacoes);
    }, 'Atendimento atualizado.');
    agendaDate = parseDate(dados.date); renderAgenda(); bindDynamicActions();
    return;
  }

  const appointment = { id:uid('apt'), ...dados };
  await comFeedback(async () => {
    const operacoes = [{ tipo:'criar', chave:'appointments', id:appointment.id, dados:appointment }];
    if (appointment.paymentStatus === 'paid') {
      const receita = incomeFromAppointment(appointment);
      operacoes.push({ tipo:'criar', chave:'transactions', id:receita.id, dados:receita });
    }
    await gravarLote(operacoes);
  }, 'Serviço agendado com sucesso.');
  navigate('agenda'); agendaDate = parseDate(appointment.date); renderAgenda(); bindDynamicActions();
}
async function handleClientSubmit(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const emEdicao = editando;
  closeModal();
  if (emEdicao) await comFeedback(() => atualizar('clients', emEdicao.id, values), 'Cliente atualizado.');
  else await comFeedback(() => criar('clients', values), 'Cliente cadastrado com sucesso.');
  navigate('clientes');
}
async function handleTransactionSubmit(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const dados = { ...values, value:parseCurrency(values.value) };
  const emEdicao = editando;
  closeModal();
  if (emEdicao) await comFeedback(() => atualizar('transactions', emEdicao.id, dados), 'Lançamento atualizado.');
  else await comFeedback(() => criar('transactions', dados), 'Lançamento registrado.');
  navigate('financeiro');
}
async function handleServiceSubmit(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const dados = {
    ...values,
    duration: Number(values.duration) || 60,
    basePrice: parseCurrency(values.basePrice),
    active: values.active === 'true' || values.active === true
  };
  const emEdicao = editando;
  closeModal();
  if (emEdicao) await comFeedback(() => atualizar('services', emEdicao.id, dados), 'Serviço atualizado.');
  else await comFeedback(() => criar('services', dados), 'Serviço cadastrado com sucesso.');
  navigate('servicos');
}
async function handleSettingsSubmit(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  closeModal();
  const settingsDoc = state().settings?.find(s => s.id === 'empresa');
  if (settingsDoc) {
    await comFeedback(() => atualizar('settings', 'empresa', values), 'Mensagens atualizadas.');
  } else {
    await comFeedback(() => criar('settings', { id: 'empresa', ...values }), 'Mensagens configuradas.');
  }
}

/* ------------------------------------------------------------ Exclusão -- */

async function excluirAgendamento(id) {
  const item = state().appointments.find(appointment => appointment.id === id); if (!item) return;
  const receita = state().transactions.find(tx => tx.appointmentId === id);
  const numero = id.split('-').pop().toUpperCase();
  const aviso = receita
    ? `\n\nA receita de ${brl.format(receita.value)} gerada por este atendimento também será excluída.`
    : '';
  if (!confirm(`Excluir a OS #${numero}, de ${clientName(getClient(item.clientId))}?${aviso}\n\nEsta ação não pode ser desfeita.`)) return;
  closeModal();
  const operacoes = [{ tipo:'remover', chave:'appointments', id }];
  if (receita) operacoes.push({ tipo:'remover', chave:'transactions', id:receita.id });
  await comFeedback(() => gravarLote(operacoes), 'Atendimento excluído.');
}

async function excluirCliente(id) {
  const client = getClient(id); if (!client) return;
  const atendimentos = state().appointments.filter(item => item.clientId === id);
  // O histórico é preservado de propósito: apagar junto tiraria do financeiro
  // receitas que de fato aconteceram.
  const aviso = atendimentos.length
    ? `\n\nOs ${atendimentos.length} atendimento(s) deste cliente serão mantidos no histórico e passarão a aparecer como "Cliente removido".`
    : '';
  if (!confirm(`Excluir o cadastro de ${clientName(client)}?${aviso}\n\nEsta ação não pode ser desfeita.`)) return;
  closeModal();
  await comFeedback(() => remover('clients', id), 'Cliente excluído.');
}

async function excluirLancamento(id) {
  const item = state().transactions.find(tx => tx.id === id); if (!item) return;
  const vinculo = item.appointmentId
    ? '\n\nEste lançamento veio de um atendimento concluído. Excluí-lo altera o faturamento do período.'
    : '';
  if (!confirm(`Excluir o lançamento "${item.description}" de ${brl.format(item.value)}?${vinculo}\n\nEsta ação não pode ser desfeita.`)) return;
  closeModal();
  await comFeedback(() => remover('transactions', id), 'Lançamento excluído.');
}

async function excluirServico(id) {
  const service = state().services.find(s => s.id === id); if (!service) return;
  const vinculados = state().appointments.filter(a => a.serviceId === id);
  const aviso = vinculados.length
    ? `\n\nATENÇÃO: Existem ${vinculados.length} atendimento(s) vinculados a este serviço no histórico.\nRecomendamos editar e marcá-lo como "Inativo" em vez de excluir.`
    : '';
  if (!confirm(`Excluir o serviço "${service.name}"?${aviso}\n\nEsta ação não pode ser desfeita.`)) return;
  closeModal();
  await comFeedback(() => remover('services', id), 'Serviço excluído.');
}

function navigate(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('active', section.id === `view-${view}`));
  document.querySelectorAll('.nav-item, .bottom-nav-item[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  const titles = { dashboard:['Operação de hoje','Início'], agenda:['Planejamento de equipes','Agenda de serviços'], clientes:['Relacionamento e recorrência','Clientes'], servicos:['Padrões de atendimento','Catálogo de serviços'], financeiro:['Entradas, despesas e recebimentos','Controle financeiro'], ordens:['Execução em campo','Atendimentos'], configuracoes:['Dados e preferências','Configurações'] };
  document.getElementById('eyebrow').textContent = titles[view][0]; document.getElementById('pageTitle').textContent = titles[view][1];
  toggleSidebar(false);
  window.scrollTo({ top:0, behavior:'smooth' });
}

/* ------------------------------------------------------- Tela de acesso -- */

function renderAuth() {
  const tela = document.getElementById('authScreen');
  const app = document.querySelector('.app-shell');
  const carregando = store.modo === 'carregando';
  const semAcesso = store.modo === 'sem-acesso';
  const logado = store.modo === 'demo' || store.modo === 'nuvem';
  tela.hidden = logado;
  app.hidden = !logado;
  document.getElementById('authLoading').hidden = !carregando;
  document.getElementById('authBox').hidden = carregando || semAcesso;
  document.getElementById('deniedBox').hidden = !semAcesso;
  if (semAcesso) document.getElementById('deniedEmail').textContent = store.usuario?.email || '-';
  if (!logado) return;

  // Cabeçalho e configurações refletem o modo em uso.
  const demo = store.modo === 'demo';
  renderNetworkBadge();
  const demoPanel = document.getElementById('demoPanel');
  if (demoPanel) demoPanel.hidden = !demo;
  const cloudPanel = document.getElementById('cloudPanel');
  if (cloudPanel) cloudPanel.hidden = demo;
  document.getElementById('accountEmail').textContent = store.usuario?.email || '-';
  document.getElementById('accountName').textContent = store.usuario?.displayName || 'Sem nome definido';
  renderProfile(demo);
}

function profileInitials(name, email) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length) return `${parts[0][0] || ''}${parts.length > 1 ? parts.at(-1)[0] : parts[0][1] || ''}`.toUpperCase();
  return String(email || 'HH').slice(0, 2).toUpperCase();
}

function renderProfile(demo) {
  const name = demo ? 'Modo demonstração' : store.usuario?.displayName || 'Equipe Hiper';
  const email = demo ? 'Dados locais neste dispositivo' : store.usuario?.email || '-';
  const photoURL = demo ? '' : store.usuario?.photoURL || '';
  const initials = profileInitials(name, email);

  document.getElementById('profileName').textContent = name;
  document.getElementById('profileEmail').textContent = email;
  document.getElementById('profileInitials').textContent = initials;
  document.getElementById('profileMenuInitials').textContent = initials;
  ['profilePhoto', 'profileMenuPhoto'].forEach(id => {
    const image = document.getElementById(id);
    image.hidden = !photoURL;
    if (photoURL) image.src = photoURL;
    else image.removeAttribute('src');
  });
  closeProfile();
}

function closeProfile() {
  document.getElementById('profilePopover')?.setAttribute('hidden', '');
  document.getElementById('profileButton')?.setAttribute('aria-expanded', 'false');
}

function toggleProfile() {
  const popover = document.getElementById('profilePopover');
  const button = document.getElementById('profileButton');
  const open = popover.hidden;
  popover.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
}

function mostrarAvisoAuth(mensagem, tom = 'erro') {
  const aviso = document.getElementById('authNotice');
  aviso.textContent = mensagem;
  aviso.hidden = !mensagem;
  aviso.className = `auth-notice ${tom}`;
}

async function handleGoogleLogin() {
  const botao = document.getElementById('googleButton');
  botao.disabled = true;
  mostrarAvisoAuth('');
  try {
    await entrarComGoogle();
  } catch (error) {
    // Fechar a janela do Google é desistência, não erro para exibir.
    if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
      mostrarAvisoAuth(mensagemErro(error));
    }
  } finally {
    botao.disabled = false;
  }
}

/* ------------------------------------------- Aplicativo (PWA e avisos) -- */

let promptInstalacao = null;

const instalado = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    reg.addEventListener('updatefound', () => {
      const novoWorker = reg.installing;
      novoWorker?.addEventListener('statechange', () => {
        if (novoWorker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Nova versão disponível! Toque em Mais > Atualizar para aplicar.');
        }
      });
    });
  }
  catch { /* sem service worker o app segue funcionando, só não abre offline */ }
}

// Barra de estado da sincronização: só aparece quando há algo a comunicar.
function renderSync() {
  const badge = document.getElementById('syncBadge');
  const semRede = !navigator.onLine;
  const pendentes = store.modo === 'nuvem' && store.pendentes;
  const doCache = store.modo === 'nuvem' && store.doCache && !pendentes;

  if (semRede) badge.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Sem conexão';
  else if (pendentes) badge.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Sincronizando';
  else if (doCache) badge.innerHTML = '<i class="fa-solid fa-database"></i> Dados locais';

  badge.hidden = !(semRede || pendentes || doCache);
  badge.className = `sync-badge ${semRede ? 'offline' : pendentes ? 'pendente' : 'cache'}`;
}

function renderNetworkBadge() {
  const badge = document.getElementById('modeBadge');
  if (!badge) return;
  const online = navigator.onLine;
  badge.innerHTML = online 
    ? '<i class="fa-solid fa-wifi"></i>' 
    : '<i class="fa-solid fa-wifi" style="opacity: 0.5;"></i>';
  badge.className = `mode-badge ${online ? 'cloud' : 'demo'}`;
  badge.title = online ? 'Conectado' : 'Sem internet';
  badge.style.padding = '7px 10px';
  badge.style.fontSize = '14px';
}

function renderAppPanel() {
  const suporta = suportaNotificacoes();
  const permissao = permissaoAtual();
  const rotulos = { granted: 'Ativados', denied: 'Bloqueados no navegador', default: 'Não ativados', unsupported: 'Não suportado neste navegador' };

  document.getElementById('installStatus').textContent = instalado()
    ? 'Aplicativo instalado'
    : promptInstalacao ? 'Disponível para instalar' : 'Use o menu do navegador para instalar';
  document.getElementById('installButton').hidden = !promptInstalacao || instalado();
  document.getElementById('offlineStatus').textContent = 'serviceWorker' in navigator
    ? (navigator.onLine ? 'Pronto para uso offline' : 'Em uso offline agora')
    : 'Não suportado neste navegador';

  // Banner no topo para instalação proativa no celular
  const banner = document.getElementById('installBanner');
  const dispensou = sessionStorage.getItem('hiper-dispensou-instalacao');
  const jaInstalado = instalado();
  const ehIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;

  if (banner) {
    if (jaInstalado || dispensou) {
      banner.hidden = true;
    } else if (promptInstalacao) {
      banner.hidden = false;
      document.getElementById('installBannerTitle').textContent = 'Instalar aplicativo Hiper';
      document.getElementById('installBannerText').textContent = 'Acesso rápido na tela inicial e funciona sem sinal em campo.';
      document.getElementById('bannerInstallButton').hidden = false;
    } else if (ehIos) {
      banner.hidden = false;
      document.getElementById('installBannerTitle').textContent = 'Instalar no iPhone';
      document.getElementById('installBannerText').innerHTML = 'Toque em <i class="fa-solid fa-arrow-up-from-bracket"></i> e <strong>Adicionar à Tela de Início</strong>.';
      document.getElementById('bannerInstallButton').hidden = true;
    } else {
      banner.hidden = true;
    }
  }

  const bloqueado = permissao === 'denied';
  const avisoBloqueado = document.getElementById('notifyDeniedAlert');
  if (avisoBloqueado) avisoBloqueado.hidden = !bloqueado;

  document.getElementById('notifyStatus').textContent = rotulos[permissao] || permissao;
  const botaoNotify = document.getElementById('notifyButton');
  if (botaoNotify) {
    botaoNotify.hidden = !suporta || permissao === 'granted';
    if (bloqueado) {
      botaoNotify.disabled = false;
      botaoNotify.className = 'secondary-button';
      botaoNotify.innerHTML = '<i class="fa-solid fa-circle-question"></i> Como desbloquear';
      botaoNotify.onclick = () => {
        alert('Para desbloquear as notificações no iPhone:\n\n1. Abra o app "Ajustes" do iPhone\n2. Toque em "Notificações"\n3. Procure por "Hiper" (ou "Safari")\n4. Ative "Permitir Notificações"\n\nAo voltar para o app da Hiper, os lembretes serão ativados automaticamente!');
      };
    } else {
      botaoNotify.disabled = false;
      botaoNotify.className = 'primary-button';
      botaoNotify.innerHTML = '<i class="fa-regular fa-bell"></i> Ativar lembretes';
      botaoNotify.onclick = ativarLembretes;
    }
  }
  document.getElementById('notifyTest').hidden = permissao !== 'granted';
}

async function atualizarStatusSegundoPlano() {
  const campo = document.getElementById('notifyBackground');
  if (permissaoAtual() !== 'granted') { campo.textContent = 'Depende dos lembretes'; return; }
  campo.textContent = (await periodicSyncAtivo())
    ? 'Ativo: avisa com o app fechado'
    : 'Só com o app aberto neste aparelho';
}

async function ativarLembretes() {
  const resposta = await pedirPermissao();
  if (resposta === 'granted') {
    await publicarLembretes(state(), id => clientName(getClient(id)));
    await registrarPeriodicSync();
    toast('Lembretes ativados.');
  } else if (resposta === 'denied') {
    toast('Notificações bloqueadas. Libere nas permissões do navegador.');
  }
  renderAppPanel();
  atualizarStatusSegundoPlano();
}

/* ------------------------------------------------------------- Eventos -- */

document.querySelectorAll('.nav-item, .bottom-nav-item[data-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
document.getElementById('bottomNavMenu')?.addEventListener('click', () => toggleSidebar());
document.getElementById('sidebarClose')?.addEventListener('click', () => toggleSidebar(false));
document.getElementById('sidebarBackdrop')?.addEventListener('click', () => toggleSidebar(false));
document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openForm(button.dataset.open)));
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go)));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', closeModal));
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeModal(); closeAlerts(); closeProfile(); toggleSidebar(false); } });
document.getElementById('profileButton')?.addEventListener('click', event => { event.stopPropagation(); toggleProfile(); });
document.getElementById('profilePopover')?.addEventListener('click', event => event.stopPropagation());
document.addEventListener('click', closeProfile);
document.getElementById('appointmentForm').addEventListener('submit', handleAppointmentSubmit);
document.getElementById('clientForm').addEventListener('submit', handleClientSubmit);
document.getElementById('transactionForm').addEventListener('submit', handleTransactionSubmit);
document.getElementById('serviceForm').addEventListener('submit', handleServiceSubmit);
document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);
document.getElementById('clientSearch').addEventListener('input', renderClients);
document.getElementById('orderSearch').addEventListener('input', renderOrders);
document.getElementById('financeMonth').addEventListener('change', renderFinance);
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { agendaMode = button.dataset.mode; renderAgenda(); bindDynamicActions(); }));
document.getElementById('agendaPrev').addEventListener('click', () => { agendaDate = agendaMode === 'day' ? addDays(agendaDate,-1) : agendaMode === 'week' ? addDays(agendaDate,-7) : addMonths(agendaDate,-1); renderAgenda(); bindDynamicActions(); });
document.getElementById('agendaNext').addEventListener('click', () => { agendaDate = agendaMode === 'day' ? addDays(agendaDate,1) : agendaMode === 'week' ? addDays(agendaDate,7) : addMonths(agendaDate,1); renderAgenda(); bindDynamicActions(); });
document.getElementById('agendaToday').addEventListener('click', () => { agendaDate = new Date(); renderAgenda(); bindDynamicActions(); });
document.getElementById('menuButton')?.addEventListener('click', () => toggleSidebar());
document.getElementById('notificationButton').addEventListener('click', () => { document.getElementById('alertDrawer').classList.add('open'); document.getElementById('drawerBackdrop').classList.add('open'); });
document.getElementById('closeAlerts').addEventListener('click', closeAlerts);
document.getElementById('drawerBackdrop').addEventListener('click', closeAlerts);
function closeAlerts() { document.getElementById('alertDrawer').classList.remove('open'); document.getElementById('drawerBackdrop').classList.remove('open'); }
function toggleSidebar(abrir) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const estado = typeof abrir === 'boolean' ? abrir : !sidebar?.classList.contains('open');
  sidebar?.classList.toggle('open', estado);
  backdrop?.classList.toggle('open', estado);
}

document.addEventListener('input', e => {
  if (e.target.classList.contains('mask-phone')) {
    e.target.value = maskPhone(e.target.value);
  } else if (e.target.classList.contains('mask-cpf')) {
    e.target.value = maskCpfCnpj(e.target.value);
  } else if (e.target.classList.contains('mask-currency')) {
    e.target.value = maskCurrency(e.target.value);
  } else if (e.target.classList.contains('mask-cep')) {
    e.target.value = maskCep(e.target.value);
    if (e.target.value.length === 9) buscarCep(e.target.value, e.target.form);
  }
});

async function buscarCep(cep, form) {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return;
  
  const currentCity = form.elements.city?.value;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await res.json();
    if (!data.erro) {
      if (form.elements.address) form.elements.address.value = data.logradouro || '';
      if (form.elements.neighborhood) form.elements.neighborhood.value = data.bairro || '';
      if (form.elements.city) form.elements.city.value = data.localidade || '';
      if (form.elements.address) form.elements.address.focus();
    }
  } catch (err) {
    console.error('Erro ao buscar CEP', err);
  }
}

async function recarregarApp() {
  toast('Atualizando aplicativo...');
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    }
  } catch {}
  setTimeout(() => window.location.reload(true), 250);
}
document.getElementById('reloadAppButton')?.addEventListener('click', recarregarApp);
document.getElementById('helpGuideButton')?.addEventListener('click', openGuide);
document.getElementById('mobileHelpGuideButton')?.addEventListener('click', openGuide);
window.addEventListener('focus', () => {
  renderAppPanel();
  atualizarStatusSegundoPlano();
  if (permissaoAtual() === 'granted') {
    publicarLembretes(state(), id => clientName(getClient(id)));
    verificarAgora();
  }
});

// document.getElementById('resetDemo').addEventListener('click', () => {
//   if (confirm('Restaurar os dados demonstrativos e apagar alterações locais?')) { restaurarDemo(); toast('Demonstração restaurada.'); }
// });
// document.getElementById('goToLogin').addEventListener('click', irParaLogin);
async function confirmarSaida() {
  if (confirm('Sair da conta?')) await comFeedback(() => sair());
}
document.getElementById('signOut').addEventListener('click', confirmarSaida);
document.getElementById('profileSignOut')?.addEventListener('click', confirmarSaida);
document.getElementById('googleButton').addEventListener('click', handleGoogleLogin);
// document.getElementById('demoButton').addEventListener('click', iniciarDemo);
document.getElementById('deniedSignOut').addEventListener('click', () => comFeedback(() => sair()));
// document.getElementById('deniedDemo').addEventListener('click', async () => { await sair(); iniciarDemo(); });

document.querySelectorAll('[data-service-choice]').forEach(link => link.addEventListener('click', () => {
  const select = document.getElementById('landingServiceSelect');
  select.value = link.dataset.serviceChoice;
}));

const landingDate = document.getElementById('landingPreferredDate');
if (landingDate) landingDate.min = localISO(new Date());

document.getElementById('landingQuoteForm')?.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const date = data.get('preferredDate');
  const period = data.get('period');
  const periodText = { 'Manhã':'pela manhã', 'Tarde':'à tarde', 'Qualquer período':'em qualquer período' }[period] || '';
  const preference = date
    ? `${dateFmt.format(parseDate(date))}${periodText ? `, ${periodText}` : ''}`
    : periodText ? `${cap(periodText)}, em data a combinar` : 'Data e período a combinar';
  const message = [
    'Olá! Quero solicitar um orçamento na Hiper Higienizações.',
    '',
    `*Nome:* ${data.get('name')}`,
    `*WhatsApp:* ${data.get('phone')}`,
    `*Serviço:* ${data.get('service')}`,
    `*Local:* ${data.get('neighborhood')} — ${data.get('city')}`,
    `*Peça / necessidade:* ${data.get('details')}`,
    `*Preferência de atendimento:* ${preference}`
  ].join('\n');
  window.open(`https://wa.me/5516997603600?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
});

document.getElementById('copyClientLink')?.addEventListener('click', () => {
  const empresaUid = store.empresaUid;
  if (!store.usuario || !empresaUid) {
    toast('É preciso estar logado para gerar o link.');
    return;
  }
  const url = `${window.location.origin}/cadastro.html?u=${empresaUid}`;
  navigator.clipboard.writeText(url)
    .then(() => toast('Link de cadastro copiado!'))
    .catch(() => toast('Erro ao copiar link.'));
});

document.getElementById('shareClientLinkButton')?.addEventListener('click', () => {
  const empresaUid = store.empresaUid;
  if (!store.usuario || !empresaUid) {
    toast('É preciso estar logado para gerar o link.');
    return;
  }
  const url = `${window.location.origin}/cadastro.html?u=${empresaUid}`;
  const text = encodeURIComponent(`Olá! Por favor, preencha seu cadastro para podermos agendar o seu serviço na Hiper Higienizações:\n${url}`);
  window.open(`https://wa.me/?text=${text}`, '_blank');
});
// O navegador avisa quando a instalação é possível; guardamos o evento para
// disparar no clique do usuário, que é a única forma aceita.
window.addEventListener('beforeinstallprompt', evento => {
  evento.preventDefault();
  promptInstalacao = evento;
  renderAppPanel();
});
window.addEventListener('appinstalled', () => {
  promptInstalacao = null;
  const banner = document.getElementById('installBanner');
  if (banner) banner.hidden = true;
  renderAppPanel();
  toast('Aplicativo instalado no aparelho.');
});
document.getElementById('installButton').addEventListener('click', async () => {
  if (!promptInstalacao) return;
  promptInstalacao.prompt();
  await promptInstalacao.userChoice;
  promptInstalacao = null;
  renderAppPanel();
});
document.getElementById('bannerInstallButton')?.addEventListener('click', async () => {
  if (!promptInstalacao) return;
  promptInstalacao.prompt();
  await promptInstalacao.userChoice;
  promptInstalacao = null;
  renderAppPanel();
});
document.getElementById('dismissInstallBanner')?.addEventListener('click', () => {
  sessionStorage.setItem('hiper-dispensou-instalacao', '1');
  const banner = document.getElementById('installBanner');
  if (banner) banner.hidden = true;
});
document.getElementById('notifyButton').addEventListener('click', ativarLembretes);
document.getElementById('notifyTest').addEventListener('click', async () => {
  await publicarLembretes(state(), id => clientName(getClient(id)));
  await verificarAgora();
  toast('Se houver serviço hoje, o aviso aparece em instantes.');
});
window.addEventListener('online', () => { renderSync(); renderNetworkBadge(); renderAppPanel(); });
window.addEventListener('offline', () => { renderSync(); renderNetworkBadge(); renderAppPanel(); });

/* ------------------------------------------------------------- Arranque -- */



// Exposto para inspeção no console do navegador e para os testes headless.
window.__store = store;

aoMudar(() => {
  renderAuth();
  renderAll();
  renderSync();
  renderAppPanel();
  // Mantém o resumo que o service worker lê para lembrar dos serviços do dia.
  if (store.modo === 'demo' || store.modo === 'nuvem') {
    publicarLembretes(state(), id => clientName(getClient(id)));
  }
});
aoErro(mensagem => toast(mensagem));

// Sem firebase-config.js preenchido não existe nuvem: some com o que leva ao
// login e explica o porquê, na tela de acesso e nas configurações.
if (store.configPendente) {
  document.getElementById('configWarning').hidden = false;
  document.getElementById('configHint').hidden = false;
  document.getElementById('authEntrar').hidden = true;
//  document.getElementById('goToLogin').hidden = true;
}

// Pinta o "Verificando acesso..." antes de iniciar: com o Firebase configurado,
// o carregamento do SDK acontece entre este ponto e o primeiro aoMudar().
renderAuth();

// Se o SDK não carregar (CDN bloqueado, sem rede), o app não pode ficar preso
// na tela de carregamento: cai para o login com o aviso e a opção de demonstrar.
iniciar().catch(error => {
  store.modo = 'deslogado';
  renderAuth();
  mostrarAvisoAuth(`Não foi possível carregar o Firebase: ${mensagemErro(error)}`);
});

// Atalhos do ícone no Android abrem direto numa tela (/?tela=agenda).
const telaInicial = new URLSearchParams(location.search).get('tela');
if (telaInicial && document.getElementById(`view-${telaInicial}`)) navigate(telaInicial);

registrarServiceWorker();
renderAppPanel();
atualizarStatusSegundoPlano();

// Ao abrir o app, confere se cabe lembrar dos serviços de hoje.
if (permissaoAtual() === 'granted') {
  navigator.serviceWorker.ready.then(() => verificarAgora()).catch(() => {});
}
