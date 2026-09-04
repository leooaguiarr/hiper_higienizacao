# Contexto do projeto — leia antes de editar

Documento de continuidade. O trabalho acontece em **mais de uma máquina**, então
tudo que não dá para deduzir do código está aqui: as decisões e o porquê delas,
o que já foi entregue, o que falta e as armadilhas que já custaram tempo.

**Ao terminar uma sessão que mude algo relevante, atualize este arquivo** —
principalmente as seções *Estado atual*, *O que vem a seguir* e *Histórico*.

- Repositório: <https://github.com/leooaguiarr/hiper_higienizacao> (público)
- Última atualização deste documento: 04/09/2026

---

## 1. O que é

Sistema de gestão da **Hiper Higienizações**, empresa de higienização e
impermeabilização de estofados em Ribeirão Preto. Controla agenda de serviços
externos, clientes, recorrência, ordens de serviço e financeiro.

Um só sistema serve dois usos: **aplicativo instalado no celular** da equipe em
campo e **acesso pelo navegador** no computador. É uma PWA — não existe segunda
base de código.

O projeto nasceu de um sistema-base de salão de beleza (`lexion_salao`), do qual
se reaproveitou a arquitetura, não o conteúdo. O histórico está em
[INVENTARIO_ARQUITETURA.md](INVENTARIO_ARQUITETURA.md) e
[PLANO_DE_MIGRACAO.md](PLANO_DE_MIGRACAO.md).

**Responda sempre em português do Brasil.**

## 2. Rodar e testar

```powershell
node server.js          # http://localhost:8000
node tests/smoke.js     # modo demonstração, ponta a ponta
node tests/crud.js      # editar e excluir, com as regras de vínculo
node tests/pwa.js       # manifest, service worker e uso offline real
node tests/regras.js    # segurança do Firestore (não precisa do servidor)
```

Os três primeiros sobem o Chrome headless por CDP e **precisam do servidor
rodando em outro terminal**. O `regras.js` não precisa: fala com a API de teste
do Firebase e só exige o `gcloud` autenticado.

Não há npm, nem build, nem `package.json` — e essa ausência é proposital:
mantenha assim.

## 3. As três restrições que explicam quase tudo

Antes de propor qualquer mudança de arquitetura, saiba que estas três decisões
já estão tomadas e moldam o resto:

| Restrição | Consequência prática |
| --- | --- |
| **Plano Spark do Firebase** (gratuito) | Sem Cloud Functions e sem Cloud Storage. Nada de backend próprio: tudo é client-side e a segurança vive nas Security Rules. |
| **Sem etapa de build** | O SDK do Firebase entra como módulo ES pelo CDN `gstatic`, versão fixada. Nada de bundler, npm ou transpilação. |
| **Repositório público** | A config do Firebase fica visível. Não é vazamento (a chave Web é pública por design), mas exige as proteções de `docs/FIREBASE_SETUP.md`. |

O que o Spark impede, e que **não** deve ser implementado sem migrar para Blaze:
fotos antes/depois nas OS (precisa de Cloud Storage) e push disparado por
servidor (precisa de Cloud Functions + FCM).

## 4. Arquitetura

```text
public/
  index.html            todas as telas + tela de acesso (SPA de seção única)
  manifest.webmanifest  identidade do app instalável
  sw.js                 cache offline + periodicsync dos lembretes
  css/app.css           identidade visual e responsividade
  js/firebase-config.js credenciais do projeto (públicas por design)
  js/utils.js           formatação BR de data, moeda e texto
  js/seed.js            SERVICOS_PADRAO + dados demonstrativos
  js/store.js           camada de dados: decide entre localStorage e Firestore
  js/notificacoes.js    permissão, resumo de lembretes e background sync
  js/app.js             renderização, eventos e controle de sessão
firestore.rules         autorização por lista e isolamento por conta
firebase.json           Hosting, regras e emuladores
server.js               servidor local, só com módulos nativos do Node
tests/                  smoke.js, crud.js, pwa.js e regras.js
```

### A regra central

**A interface nunca fala com o Firebase.** `app.js` lê de `store.state` e grava
por `criar`, `atualizar`, `remover` e `gravarLote`. Quem decide entre navegador
e nuvem é o `store.js`. É isso que permite os dois modos com o mesmo código de
tela — não quebre essa fronteira.

### Os dois modos

| Modo | Quando | Dados |
| --- | --- | --- |
| `demo` | Sem login, ou `firebase-config.js` não preenchido | `localStorage` |
| `nuvem` | Autenticado **e** autorizado | Firestore, tempo real, com cache offline |
| `sem-acesso` | Autenticado, mas fora da lista de autorizados | Nenhum |
| `deslogado` | Sessão ausente | Tela de acesso |
| `carregando` | Enquanto o SDK carrega | Spinner |

O `store.js` expõe: `iniciar`, `iniciarDemo`, `entrarComGoogle`, `sair`,
`irParaLogin`, `criar`, `atualizar`, `remover`, `gravarLote`, `restaurarDemo`,
`aoMudar`, `aoErro`, `mensagemErro`.

`window.__store` está exposto para inspeção no console e é usado pelos testes.

### Acesso: duas travas independentes

**Autenticar não é ter acesso.** O login é só com Google, e qualquer pessoa com
conta Google consegue se autenticar no projeto. A liberação vem da coleção
`autorizados/{email}`, que as regras consultam com `exists()`. Quem não consta
não lê nem grava nada, e o app mostra a tela de acesso não liberado.

A lista fica no banco, **não escrita nas regras**, porque o repositório é
público e exporia os e-mails da equipe. O app nunca a escreve: cada pessoa só
lê o próprio registro, para saber se entra. Liberar ou revogar é criar ou
apagar o documento pelo console — o passo a passo está em
`docs/FIREBASE_SETUP.md`.

`tests/regras.js` cobre isso com 22 casos, pela API de teste do Firebase Rules
(sem emulador, sem Java, sem tocar no banco real).

### Dados no Firestore

Tudo sob `usuarios/{uid}`, então **o isolamento vem do caminho do documento** —
é o substituto do RLS que existiria no Postgres.

```text
autorizados/{email}
usuarios/{uid}/clientes|servicos|agendamentos|lancamentos|equipes/{id}
```

Conta nova recebe automaticamente os oito serviços de `SERVICOS_PADRAO`, para a
agenda já nascer utilizável.

> **Antes de autorizar uma segunda pessoa, leia isto.** Como cada conta tem sua
> própria base, quem entrar depois vê um sistema **vazio**, não a agenda da
> Hiper. Para a equipe compartilhar os dados, é preciso mover os documentos
> para um caminho da empresa (algo como `empresa/hiper/...`), ajustar o
> `COLECOES`/caminho no `store.js` e trocar a checagem de dono nas regras por
> uma de pertencimento. Foi decidido em 04/09/2026 não fazer isso ainda, porque
> só há um usuário.

### Regras que ligam as coleções

Editar e excluir não mexem num registro só. Três vínculos são mantidos pelo
`app.js`, sempre via `gravarLote` para não deixar estado pela metade:

- Marcar um atendimento como **pago** cria a receita correspondente; voltar
  para **a receber** remove essa receita.
- **Excluir um atendimento** exclui junto a receita que ele gerou — senão o
  financeiro mostraria dinheiro de um serviço que não existe mais.
- **Excluir um cliente** preserva os atendimentos dele. Apagar em cascata
  tiraria do faturamento receitas que de fato aconteceram; as ordens antigas
  passam a exibir "Cliente removido", que `clientName()` já trata.

O `tests/crud.js` cobre os três, incluindo o caminho de volta.

### Offline

Duas camadas independentes: o **service worker** guarda a interface e o
**cache do Firestore** (`persistentLocalCache`) guarda os dados, com gravações
em fila. A equipe conclui uma OS na casa do cliente sem sinal e tudo sobe
sozinho depois. O indicador no topo mostra *Sem conexão*, *Sincronizando* ou
*Dados locais*.

## 5. Estado atual

**Funciona e está testado:** as sete telas, agenda em dia/semana/mês, ficha do
cliente com histórico, ordens de serviço com os cinco estados, financeiro por
período, **criar, editar e excluir** cliente/agendamento/lançamento, conclusão
de serviço em lote (status + recorrência + receita), login com Google e o
bloqueio de quem não está autorizado, instalação como app, operação offline e
lembretes locais.

**Não existe ainda:**

- **Cadastro de equipes** — a coleção `equipes` está reservada nas regras, mas
  no formulário a equipe é texto livre.
- **Cadastro/edição de serviços** — o catálogo é somente leitura na interface,
  embora o modelo tenha o campo `active`.
- **Fotos antes/depois** — bloqueado pelo Spark.

**Firebase configurado** no projeto `hiper-higienizacoes`, publicado em
<https://hiper-higienizacoes.web.app>. Firestore em `southamerica-east1`, login
com Google ativo, regras publicadas e testadas.

**Ainda não validado com login real:** o fluxo autenticado ponta a ponta
(entrar, gravar, semear o catálogo) depende de um login humano com Google, que
os testes headless não conseguem fazer. As regras estão cobertas por
`tests/regras.js`; o que falta é a confirmação em uso.

## 6. O que vem a seguir

1. **Cadastro de equipes**, substituindo o campo de texto livre.
2. **Tela de serviços** editável.
3. **Restringir a chave de API** por domínio no Google Cloud Console
   (`docs/FIREBASE_SETUP.md`, seção *Proteger o projeto*).

## 7. Armadilhas conhecidas

Cada uma destas já custou tempo. Leia antes de repetir.

- **Heredoc do Bash come barras invertidas.** Escrever JS com `'C:\\caminho'` ou
  arquivos grandes por `cat <<'EOF'` corrompe o conteúdo silenciosamente. Use a
  ferramenta de escrita de arquivo, ou barras normais em caminhos do Windows.
- **`[hidden]` precisa de `!important`.** Vários elementos do CSS têm
  `display: grid/flex`, que vence o atributo `hidden`. A regra que corrige isso
  está no fim de `app.css` — não a remova.
- **`navigator.onLine` não muda no CDP.** `Network.emulateNetworkConditions`
  bloqueia o tráfego mas não altera a propriedade, então o indicador de conexão
  é testado disparando o evento `offline` à mão. O carregamento offline em si é
  testado de verdade.
- **Ao mudar arquivos estáticos, suba `VERSAO` no `sw.js`.** É ela que descarta
  o cache antigo; sem isso o navegador serve a versão anterior.
- **O ícone `maskable` usa só a espiral da marca.** O logo completo tem o nome
  em circunferência, que vira ruído ilegível abaixo de 200px. Já foi tentado.
- **Servidor fantasma na porta 8000.** Um `node server.js` antigo continua vivo
  e serve código desatualizado, o que faz um teste falhar por motivo errado.
  Ao ver comportamento inexplicável, mate os processos node e suba de novo.
- **O seed é relativo à data de hoje.** No dia 1º do mês o financeiro parece
  vazio, porque quase todos os lançamentos caem no mês anterior. Não é bug.
- **A versão do SDK do Firebase está fixada em 12.9.0** nas URLs do `gstatic`,
  dentro de `store.js`. Ao mudar, confirme antes que a versão existe no CDN.
- **`firebase emulators:start` exige Java 21**, e a máquina tem o Java 8. Por
  isso o teste de regras usa a API do Firebase Rules, e não o emulador. Não
  perca tempo tentando subir o emulador sem instalar um JDK novo.
- **Ativar provedores do Auth só pelo console.** A API `initializeAuth` é do
  Identity Platform e recusa projetos no Spark com `BILLING_NOT_ENABLED`. Todo
  o resto do Firebase (projeto, app web, Firestore, regras, deploy) foi feito
  pela linha de comando.
- **Testes headless não conseguem fazer login com Google.** O popup é do
  domínio do Google, com senha e 2FA. O fluxo autenticado precisa de
  verificação humana; o que dá para automatizar são as regras.

## 8. Convenções

- **Idioma:** respostas e documentação em pt-BR. Comentários de código em
  português.
- **Inconsistência intencional no código:** as chaves de `store.state` estão em
  **inglês** (`services`, `clients`, `appointments`, `transactions`), herdadas
  do sistema-base, enquanto as funções novas e as coleções do Firestore estão em
  **português**. O mapa `COLECOES` no `store.js` faz a ponte. Não "corrija" isso
  sem necessidade: renomear exige varrer todo o `app.js`.
- **Estilo:** o projeto usa funções curtas, muitas em uma linha, com template
  strings para HTML. Sempre passe texto de usuário por `esc()`.
- **Sem dependências.** Nem no app, nem nos testes.
- **Commits:** mensagem em português, explicando o porquê e não só o quê.

## 9. Histórico

| Quando | O que aconteceu |
| --- | --- |
| 01/09/2026 | Sistema criado a partir do inventário do `lexion_salao`: telas, dados demonstrativos e operação local. |
| 01/09/2026 | **Backend definido como Firebase**, no lugar do Supabase que estava planejado. Código modularizado em `utils/seed/store/app`, login e regras de isolamento. Testes headless. |
| 01/09/2026 | **PWA**: app instalável, operação offline completa e lembretes locais. Ícones gerados do logo. |
| 01/09/2026 | Repositório publicado no GitHub e documentação de proteção do projeto Firebase. |
| 04/09/2026 | **Editar e excluir** cliente, atendimento e lançamento, com as regras de vínculo entre as coleções. Teste `tests/crud.js`. |
| 04/09/2026 | **Firebase configurado e publicado**: projeto `hiper-higienizacoes`, Firestore em São Paulo, Hosting no ar. |
| 04/09/2026 | **Login trocado para conta Google**, com liberação por lista `autorizados/{email}` nas regras. Teste `tests/regras.js`, 22 casos. |
