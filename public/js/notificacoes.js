// Lembretes de agenda no celular.
//
// Sem Cloud Functions (plano Spark) não existe push disparado por servidor.
// O que dá para fazer, e é o que está aqui:
//
//   - avisar dos serviços do dia quando o app é aberto;
//   - no Android com a PWA instalada, registrar um Periodic Background Sync
//     para o próprio aparelho acordar e avisar mesmo com o app fechado.
//
// O intervalo do periodicsync é decidido pelo navegador (na prática, cerca de
// uma vez por dia, e mais frequente em apps usados com regularidade). Não é um
// horário garantido, e por isso a verificação na abertura continua valendo.

const CACHE_DADOS = 'hiper-dados';
const CHAVE_LEMBRETES = '/__lembretes';
const TAG_SYNC = 'lembretes-hiper';

export const suportaNotificacoes = () => 'Notification' in window && 'serviceWorker' in navigator;
export const permissaoAtual = () => (suportaNotificacoes() ? Notification.permission : 'unsupported');

export async function pedirPermissao() {
  if (!suportaNotificacoes()) return 'unsupported';
  const resposta = await Notification.requestPermission();
  if (resposta === 'granted') await registrarPeriodicSync();
  return resposta;
}

// Guarda no cache o resumo que o service worker vai ler quando acordar.
// Só o necessário para montar a notificação: nada de dados sensíveis a mais.
export async function publicarLembretes(estado, clientePorId) {
  if (!('caches' in window)) return;
  const hoje = new Date();
  const limite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 7);
  const iso = data => {
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
  };
  const inicio = iso(hoje);
  const fim = iso(limite);

  const agendamentos = (estado.appointments || [])
    .filter(item => item.date >= inicio && item.date <= fim)
    .map(item => ({
      date: item.date,
      time: item.time,
      status: item.status,
      cliente: clientePorId(item.clientId),
      endereco: item.address
    }));

  try {
    const cache = await caches.open(CACHE_DADOS);
    const anterior = await cache.match(CHAVE_LEMBRETES);
    const ultimoAviso = anterior ? (await anterior.json()).ultimoAviso : null;
    await cache.put(CHAVE_LEMBRETES, new Response(JSON.stringify({ agendamentos, ultimoAviso })));
  } catch { /* cache indisponível: apenas não haverá lembrete em segundo plano */ }
}

// Pede ao service worker que avalie os lembretes agora.
export async function verificarAgora() {
  if (permissaoAtual() !== 'granted') return;
  const registro = await navigator.serviceWorker.ready;
  if (registro.active) registro.active.postMessage({ tipo: 'verificar-lembretes' });
}

export async function registrarPeriodicSync() {
  try {
    const registro = await navigator.serviceWorker.ready;
    if (!('periodicSync' in registro)) return false;
    const estado = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (estado.state !== 'granted') return false;
    await registro.periodicSync.register(TAG_SYNC, { minInterval: 12 * 60 * 60 * 1000 });
    return true;
  } catch { return false; }
}

export async function periodicSyncAtivo() {
  try {
    const registro = await navigator.serviceWorker.ready;
    if (!('periodicSync' in registro)) return false;
    const tags = await registro.periodicSync.getTags();
    return tags.includes(TAG_SYNC);
  } catch { return false; }
}
