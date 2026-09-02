// Camada de dados da Hiper Higienizações.
//
// Opera em dois modos, expostos pela mesma API para a interface:
//
//   'demo'  - dados demonstrativos guardados em localStorage, sem login.
//   'nuvem' - dados do Firestore da conta autenticada, em tempo real.
//
// Em ambos os modos a interface só chama criar/atualizar/remover e escuta
// aoMudar(). O SDK do Firebase é carregado sob demanda: em modo demonstração
// nenhuma requisição ao Firebase acontece.

import { firebaseConfig, configPendente } from './firebase-config.js';
import { seedData, SERVICOS_PADRAO } from './seed.js';
import { uid } from './utils.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.9.0';
const STORAGE_KEY = 'hiper-higienizacoes-v1';
const MODO_KEY = 'hiper-modo';

// Chaves do estado em memória -> nomes das coleções no Firestore.
const COLECOES = {
  services: 'servicos',
  clients: 'clientes',
  appointments: 'agendamentos',
  transactions: 'lancamentos'
};

const estadoVazio = () => ({ services: [], clients: [], appointments: [], transactions: [] });

let fb = null;
let ouvintes = [];
let notificar = () => {};
let notificarErro = () => {};

export const store = {
  modo: 'carregando',
  usuario: null,
  state: estadoVazio(),
  configPendente,
  // Sincronização: 'doCache' indica que os dados vieram do cache local e
  // 'pendentes' que há gravações ainda não confirmadas pelo servidor.
  doCache: false,
  pendentes: false
};

/* ------------------------------------------------------------------ SDK -- */

async function carregarSDK() {
  if (fb) return fb;
  const [appMod, authMod, dbMod] = await Promise.all([
    import(SDK + '/firebase-app.js'),
    import(SDK + '/firebase-auth.js'),
    import(SDK + '/firebase-firestore.js')
  ]);
  const app = appMod.initializeApp(firebaseConfig);

  // Cache local persistente: a equipe abre a agenda, consulta o cliente e
  // conclui a OS sem sinal; as gravações ficam na fila e sobem sozinhas
  // quando a conexão volta. O gerenciador de múltiplas abas evita conflito
  // entre o app no celular e o navegador aberto no computador.
  let db;
  try {
    db = dbMod.initializeFirestore(app, {
      localCache: dbMod.persistentLocalCache({ tabManager: dbMod.persistentMultipleTabManager() })
    });
  } catch {
    // Navegador sem IndexedDB (ou aba anônima): segue online, sem cache.
    db = dbMod.getFirestore(app);
  }

  fb = { auth: authMod.getAuth(app), db, authApi: authMod, dbApi: dbMod };
  return fb;
}

const ERROS = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/user-not-found': 'Não encontramos uma conta com este e-mail.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Este e-mail já possui uma conta.',
  'auth/weak-password': 'A senha precisa ter ao menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
  'auth/operation-not-allowed': 'Ative o login por e-mail/senha no console do Firebase.',
  'auth/unauthorized-domain': 'Domínio não autorizado no Firebase Authentication.',
  'auth/user-disabled': 'Esta conta está desativada.',
  'auth/missing-password': 'Informe a senha.',
  'auth/missing-email': 'Informe o e-mail.',
  'auth/requires-recent-login': 'Por segurança, entre novamente para concluir.',
  'auth/invalid-api-key': 'Chave de API inválida. Revise o firebase-config.js.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Chave de API inválida. Revise o firebase-config.js.',
  'permission-denied': 'Sem permissão para este dado. Confira as regras do Firestore.',
  'unavailable': 'Sem conexão com o Firestore. Tentaremos novamente.',
  'failed-precondition': 'O Firestore ainda não foi criado no console do Firebase.',
  'not-found': 'Registro não encontrado. Ele pode ter sido removido.'
};
export function mensagemErro(error) {
  const codigo = String((error && error.code) || '');
  if (ERROS[codigo]) return ERROS[codigo];
  // O SDK devolve mensagens como "Firebase: Error (auth/algo-assim)." Sem
  // tradução própria, ao menos mostramos o código sem o ruído em volta.
  const bruta = (error && error.message) || '';
  if (codigo) return `Falha no Firebase (${codigo}). Confira docs/FIREBASE_SETUP.md.`;
  return bruta || 'Não foi possível concluir a operação.';
}

/* -------------------------------------------------------------- Sessão -- */

export function aoMudar(callback) { notificar = callback; }
export function aoErro(callback) { notificarErro = callback; }

// Observa o login e decide o modo de operação na abertura do app.
export async function iniciar() {
  if (configPendente) { iniciarDemo(); return; }
  const { auth, authApi } = await carregarSDK();
  authApi.onAuthStateChanged(auth, async usuario => {
    if (usuario) {
      store.usuario = usuario;
      store.modo = 'nuvem';
      localStorage.setItem(MODO_KEY, 'nuvem');
      await escutarColecoes(usuario.uid);
    } else {
      pararEscuta();
      store.usuario = null;
      // Sem sessão: volta para a tela de login, salvo se o usuário já havia
      // escolhido explicitamente a demonstração.
      store.modo = localStorage.getItem(MODO_KEY) === 'demo' ? 'demo' : 'deslogado';
      store.state = store.modo === 'demo' ? carregarLocal() : estadoVazio();
    }
    notificar();
  });
}

export function iniciarDemo() {
  pararEscuta();
  store.modo = 'demo';
  store.usuario = null;
  store.state = carregarLocal();
  localStorage.setItem(MODO_KEY, 'demo');
  notificar();
}

export async function entrar(email, senha) {
  const { auth, authApi } = await carregarSDK();
  await authApi.signInWithEmailAndPassword(auth, email, senha);
}
export async function criarConta(email, senha, nome) {
  const { auth, authApi } = await carregarSDK();
  const credencial = await authApi.createUserWithEmailAndPassword(auth, email, senha);
  if (nome) await authApi.updateProfile(credencial.user, { displayName: nome });
}
export async function recuperarSenha(email) {
  const { auth, authApi } = await carregarSDK();
  await authApi.sendPasswordResetEmail(auth, email);
}
export async function sair() {
  localStorage.removeItem(MODO_KEY);
  if (!fb) { store.modo = 'deslogado'; store.state = estadoVazio(); notificar(); return; }
  await fb.authApi.signOut(fb.auth);
}
export function irParaLogin() {
  localStorage.removeItem(MODO_KEY);
  pararEscuta();
  store.modo = 'deslogado';
  store.state = estadoVazio();
  notificar();
}

/* ------------------------------------------------------------- Leitura -- */

function carregarLocal() {
  try {
    const salvo = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return salvo ? { ...estadoVazio(), ...salvo } : seedData();
  } catch { return seedData(); }
}
function salvarLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify(store.state)); }

function pararEscuta() { ouvintes.forEach(cancelar => cancelar()); ouvintes = []; }

// Assina as quatro coleções da conta. O Firestore entrega a alteração local
// antes da confirmação do servidor, então a interface responde na hora.
async function escutarColecoes(uidConta) {
  pararEscuta();
  const { db, dbApi } = await carregarSDK();
  store.state = estadoVazio();
  let semeado = false;
  const cacheDe = {};
  const pendentesDe = {};
  Object.entries(COLECOES).forEach(([chave, nome]) => {
    const referencia = dbApi.collection(db, 'usuarios', uidConta, nome);
    const cancelar = dbApi.onSnapshot(referencia, { includeMetadataChanges: true }, async snapshot => {
      store.state[chave] = snapshot.docs.map(documento => ({ id: documento.id, ...documento.data() }));
      cacheDe[chave] = snapshot.metadata.fromCache;
      pendentesDe[chave] = snapshot.metadata.hasPendingWrites;
      store.doCache = Object.values(cacheDe).some(Boolean);
      store.pendentes = Object.values(pendentesDe).some(Boolean);
      // Conta nova: publica o catálogo padrão para a agenda já nascer utilizável.
      if (chave === 'services' && snapshot.empty && !snapshot.metadata.fromCache && !semeado) {
        semeado = true;
        try { await semearServicos(uidConta); } catch (error) { notificarErro(mensagemErro(error)); }
      }
      notificar();
    }, error => notificarErro(mensagemErro(error)));
    ouvintes.push(cancelar);
  });
}

async function semearServicos(uidConta) {
  const { db, dbApi } = await carregarSDK();
  const lote = dbApi.writeBatch(db);
  SERVICOS_PADRAO.forEach(servico => {
    const { id, ...dados } = servico;
    lote.set(dbApi.doc(db, 'usuarios', uidConta, 'servicos', id), dados);
  });
  await lote.commit();
}

/* ------------------------------------------------------------- Escrita -- */

function referenciaDoc(chave, id) {
  return fb.dbApi.doc(fb.db, 'usuarios', store.usuario.uid, COLECOES[chave], id);
}

export async function criar(chave, dados) {
  const registro = { id: dados.id || uid(chave.slice(0, 3)), ...dados };
  if (store.modo === 'nuvem') {
    await carregarSDK();
    const { id, ...corpo } = registro;
    await fb.dbApi.setDoc(referenciaDoc(chave, id), corpo);
    return registro;
  }
  store.state[chave].push(registro);
  salvarLocal(); notificar();
  return registro;
}

export async function atualizar(chave, id, patch) {
  if (store.modo === 'nuvem') {
    await carregarSDK();
    await fb.dbApi.updateDoc(referenciaDoc(chave, id), patch);
    return;
  }
  const registro = store.state[chave].find(item => item.id === id);
  if (registro) Object.assign(registro, patch);
  salvarLocal(); notificar();
}

export async function remover(chave, id) {
  if (store.modo === 'nuvem') {
    await carregarSDK();
    await fb.dbApi.deleteDoc(referenciaDoc(chave, id));
    return;
  }
  store.state[chave] = store.state[chave].filter(item => item.id !== id);
  salvarLocal(); notificar();
}

// Grava várias operações de uma vez (usado ao concluir uma OS, que atualiza o
// agendamento, o cliente e cria a receita no mesmo gesto).
export async function gravarLote(operacoes) {
  if (store.modo === 'nuvem') {
    await carregarSDK();
    const lote = fb.dbApi.writeBatch(fb.db);
    operacoes.forEach(({ tipo, chave, id, dados }) => {
      const referencia = referenciaDoc(chave, id);
      if (tipo === 'criar') { const { id: descartado, ...corpo } = dados; lote.set(referencia, corpo); }
      else if (tipo === 'atualizar') lote.update(referencia, dados);
      else if (tipo === 'remover') lote.delete(referencia);
    });
    await lote.commit();
    return;
  }
  operacoes.forEach(({ tipo, chave, id, dados }) => {
    if (tipo === 'criar') store.state[chave].push({ id, ...dados });
    else if (tipo === 'atualizar') {
      const registro = store.state[chave].find(item => item.id === id);
      if (registro) Object.assign(registro, dados);
    } else if (tipo === 'remover') store.state[chave] = store.state[chave].filter(item => item.id !== id);
  });
  salvarLocal(); notificar();
}

export function restaurarDemo() {
  if (store.modo !== 'demo') return;
  store.state = seedData();
  salvarLocal(); notificar();
}
