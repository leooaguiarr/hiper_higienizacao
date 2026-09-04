// Teste das regras do Firestore, sem dependências npm e sem emulador.
//
// É o teste de segurança do sistema. Verifica que entrar com Google não basta,
// que a liberação vem de autorizados/{email} e que ninguém alcança a base de
// outra conta.
//
// Usa a API de teste do Firebase Rules, que avalia as regras no servidor. Não
// precisa de Java nem do emulador, e não toca no banco real: as chamadas a
// exists() são simuladas por functionMocks.
//
// Uso (precisa do gcloud autenticado na conta do projeto):
//   node tests/regras.js

const { execSync } = require('child_process');
const { readFileSync } = require('fs');
const https = require('https');
const path = require('path');

const PROJETO = 'hiper-higienizacoes';
const RAIZ = path.join(__dirname, '..');
const REGRAS = readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');
const DOCS = '/databases/(default)/documents';

function token() {
  try {
    return execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    console.error('Não foi possível obter o token. Rode: gcloud auth login');
    process.exit(1);
  }
}

function chamar(corpo, autorizacao) {
  const dados = JSON.stringify(corpo);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'firebaserules.googleapis.com',
      path: `/v1/projects/${PROJETO}:test`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${autorizacao}`,
        'x-goog-user-project': PROJETO,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dados)
      }
    }, res => {
      let texto = '';
      res.on('data', c => texto += c);
      res.on('end', () => {
        try { resolve(JSON.parse(texto)); } catch { reject(new Error(texto.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.write(dados);
    req.end();
  });
}

// O único uso de exists() nas regras é a consulta à lista de autorizados,
// então o mock representa "está na lista" ou "não está".
const mockAutorizacao = naLista => [{
  function: 'exists',
  args: [{ anyValue: {} }],
  result: { value: naLista }
}];

function caso({ nome, esperado, uid, email, caminho, metodo, dados, naLista }) {
  const request = {
    path: DOCS + caminho,
    method: metodo
  };
  if (uid) request.auth = { uid, token: { email, email_verified: true } };
  if (dados) {
    const campos = Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, v]));
    request.resource = { data: campos };
  }
  return {
    nome,
    teste: {
      expectation: esperado,
      request,
      functionMocks: naLista === undefined ? [] : mockAutorizacao(naLista)
    }
  };
}

const CLIENTE = { firstName: 'Ana', lastName: 'Martins', phone: '(16) 90000-0000' };

const CASOS = [
  // --- Quem está na lista de autorizados ---
  caso({ nome: 'lê o próprio cliente', esperado: 'ALLOW', uid: 'u-dono', email: 'dono@exemplo.com',
    caminho: '/usuarios/u-dono/clientes/c1', metodo: 'get', naLista: true }),
  caso({ nome: 'cria cliente na própria base', esperado: 'ALLOW', uid: 'u-dono', email: 'dono@exemplo.com',
    caminho: '/usuarios/u-dono/clientes/c1', metodo: 'create', dados: CLIENTE, naLista: true }),
  caso({ nome: 'edita o próprio cliente', esperado: 'ALLOW', uid: 'u-dono', email: 'dono@exemplo.com',
    caminho: '/usuarios/u-dono/clientes/c1', metodo: 'update', dados: CLIENTE, naLista: true }),
  caso({ nome: 'exclui o próprio cliente', esperado: 'ALLOW', uid: 'u-dono', email: 'dono@exemplo.com',
    caminho: '/usuarios/u-dono/clientes/c1', metodo: 'delete', naLista: true }),
  caso({ nome: 'cria agendamento', esperado: 'ALLOW', uid: 'u-dono', email: 'dono@exemplo.com',
    caminho: '/usuarios/u-dono/agendamentos/a1', metodo: 'create', dados: { clientId: 'c1', date: '2026-09-10' }, naLista: true }),
  caso({ nome: 'cria lançamento', esperado: 'ALLOW', uid: 'u-dono', email: 'dono@exemplo.com',
    caminho: '/usuarios/u-dono/lancamentos/t1', metodo: 'create', dados: { type: 'income', value: 100 }, naLista: true }),

  // --- Autenticou com Google, mas não está na lista ---
  caso({ nome: 'NÃO lê nada, nem na própria base', esperado: 'DENY', uid: 'u-fora', email: 'estranho@exemplo.com',
    caminho: '/usuarios/u-fora/clientes/c1', metodo: 'get', naLista: false }),
  caso({ nome: 'NÃO cria nada', esperado: 'DENY', uid: 'u-fora', email: 'estranho@exemplo.com',
    caminho: '/usuarios/u-fora/clientes/c1', metodo: 'create', dados: CLIENTE, naLista: false }),
  caso({ nome: 'NÃO exclui nada', esperado: 'DENY', uid: 'u-fora', email: 'estranho@exemplo.com',
    caminho: '/usuarios/u-fora/clientes/c1', metodo: 'delete', naLista: false }),

  // --- Isolamento entre contas, mesmo entre autorizados ---
  caso({ nome: 'autorizado NÃO lê a base de outra conta', esperado: 'DENY', uid: 'u-outro', email: 'equipe@exemplo.com',
    caminho: '/usuarios/u-dono/clientes/c1', metodo: 'get', naLista: true }),
  caso({ nome: 'autorizado NÃO grava na base de outra conta', esperado: 'DENY', uid: 'u-outro', email: 'equipe@exemplo.com',
    caminho: '/usuarios/u-dono/clientes/c1', metodo: 'update', dados: CLIENTE, naLista: true }),
  caso({ nome: 'autorizado NÃO exclui da base de outra conta', esperado: 'DENY', uid: 'u-outro', email: 'equipe@exemplo.com',
    caminho: '/usuarios/u-dono/clientes/c1', metodo: 'delete', naLista: true }),

  // --- A lista de autorizados ---
  caso({ nome: 'cada um lê o próprio registro de autorização', esperado: 'ALLOW', uid: 'u-dono', email: 'dono@exemplo.com',
    caminho: '/autorizados/dono@exemplo.com', metodo: 'get' }),
  caso({ nome: 'NÃO lê o registro de outra pessoa', esperado: 'DENY', uid: 'u-fora', email: 'estranho@exemplo.com',
    caminho: '/autorizados/dono@exemplo.com', metodo: 'get' }),
  caso({ nome: 'ninguém se autoriza pelo app', esperado: 'DENY', uid: 'u-fora', email: 'estranho@exemplo.com',
    caminho: '/autorizados/estranho@exemplo.com', metodo: 'create', dados: { nome: 'Auto-liberado' } }),
  caso({ nome: 'nem quem já está na lista a altera', esperado: 'DENY', uid: 'u-dono', email: 'dono@exemplo.com',
    caminho: '/autorizados/dono@exemplo.com', metodo: 'update', dados: { papel: 'dono' }, naLista: true }),
  caso({ nome: 'ninguém apaga a lista pelo app', esperado: 'DENY', uid: 'u-dono', email: 'dono@exemplo.com',
    caminho: '/autorizados/dono@exemplo.com', metodo: 'delete', naLista: true }),

  // --- Sem login ---
  caso({ nome: 'visitante não lê os dados', esperado: 'DENY',
    caminho: '/usuarios/u-dono/clientes/c1', metodo: 'get' }),
  caso({ nome: 'visitante não lê a lista de autorizados', esperado: 'DENY',
    caminho: '/autorizados/dono@exemplo.com', metodo: 'get' }),
  caso({ nome: 'visitante não grava nada', esperado: 'DENY',
    caminho: '/usuarios/u-dono/clientes/c1', metodo: 'create', dados: CLIENTE }),

  // --- Coleção fora das previstas ---
  caso({ nome: 'não cria em coleção não prevista', esperado: 'DENY', uid: 'u-dono', email: 'dono@exemplo.com',
    caminho: '/usuarios/u-dono/secreta/s1', metodo: 'create', dados: { a: '1' }, naLista: true }),
  caso({ nome: 'raiz do banco permanece fechada', esperado: 'DENY', uid: 'u-dono', email: 'dono@exemplo.com',
    caminho: '/qualquer/coisa', metodo: 'get', naLista: true })
];

async function main() {
  const autorizacao = token();
  const resposta = await chamar({
    source: { files: [{ name: 'firestore.rules', content: REGRAS }] },
    testSuite: { testCases: CASOS.map(c => c.teste) }
  }, autorizacao);

  if (resposta.error) {
    console.error('Erro na API:', resposta.error.message);
    process.exit(1);
  }

  const problemas = (resposta.issues || []).filter(i => i.severity === 'ERROR');
  if (problemas.length) {
    console.error('As regras não compilam:');
    problemas.forEach(i => console.error(` linha ${i.sourcePosition?.line}: ${i.description}`));
    process.exit(1);
  }

  const resultados = resposta.testResults || [];
  const falhas = [];
  console.log('=== REGRAS DO FIRESTORE ===\n');
  CASOS.forEach((caso, indice) => {
    const passou = resultados[indice]?.state === 'SUCCESS';
    const esperado = caso.teste.expectation === 'ALLOW' ? 'permitir' : 'negar';
    console.log(`${passou ? 'OK   ' : 'FALHA'} ${caso.nome} (${esperado})`);
    if (!passou) falhas.push(caso.nome);
  });

  console.log(`\n${resultados.length} casos avaliados`);
  console.log(falhas.length ? `FALHAS: ${falhas.join(', ')}` : 'TODOS OS TESTES PASSARAM');
  process.exit(falhas.length ? 1 : 0);
}

main().catch(e => { console.error('FALHA NO TESTE:', e.message); process.exit(1); });
