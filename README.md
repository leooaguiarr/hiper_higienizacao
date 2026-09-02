# Hiper Higienizações - Sistema de Gestão

Aplicação para controlar agenda de serviços externos, clientes, recorrência,
ordens de serviço e financeiro da Hiper Higienizações.

Um só sistema atende os dois usos: **aplicativo instalável no celular** da
equipe em campo e **acesso pelo navegador** no computador. É uma PWA, então não
há duas bases de código nem versões que fiquem para trás — todo deploy atualiza
os dois. Detalhes em [docs/APP_CELULAR.md](docs/APP_CELULAR.md).

## Executar

```powershell
node server.js
```

Abra `http://localhost:8000`.

## Os dois modos de operação

| Modo | Quando é usado | Onde os dados ficam |
| --- | --- | --- |
| **Demonstração** | Sem login, ou enquanto o Firebase não estiver configurado | `localStorage` do navegador |
| **Nuvem** | Após entrar com uma conta | Firestore, sincronizado em tempo real |

Sem configuração do Firebase, o app abre direto em demonstração com dados de
exemplo — nada é enviado para a internet. Use **Restaurar demonstração** em
Configurações para repor os dados iniciais.

Para ligar a nuvem, siga [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md): são
15 minutos e tudo cabe no plano gratuito (Spark).

## Estrutura

```text
public/
  index.html            telas, formulários e tela de acesso
  manifest.webmanifest  identidade do aplicativo instalável
  sw.js                 service worker: cache offline e lembretes
  css/app.css           identidade visual e responsividade
  js/firebase-config.js credenciais do projeto Firebase (você preenche)
  js/utils.js           formatação brasileira de data, moeda e texto
  js/seed.js            catálogo padrão e dados demonstrativos
  js/store.js           camada de dados: alterna localStorage x Firestore
  js/notificacoes.js    permissão e lembretes dos serviços do dia
  js/app.js             estado de tela, renderização e eventos
firestore.rules         regras de acesso do banco
firebase.json           Hosting, regras e emuladores
tests/smoke.js          teste headless do modo demonstração
tests/pwa.js            teste do aplicativo instalável e do uso offline
docs/FIREBASE_SETUP.md  passo a passo do Firebase
docs/APP_CELULAR.md     instalação no celular, offline e lembretes
```

A interface nunca fala com o Firebase diretamente: ela lê `store.state` e grava
por `criar`, `atualizar`, `remover` e `gravarLote`. É o `store.js` que decide
entre navegador e nuvem, o que mantém os dois modos com o mesmo código de tela.

## Testar

Com o servidor rodando em outro terminal:

```powershell
node tests/smoke.js
node tests/pwa.js
```

`smoke.js` percorre o modo demonstração no Chrome headless: renderização das
sete telas, os três modos da agenda, detalhe da ordem de serviço, cadastro de
cliente, conclusão de serviço e layout em 390px. Falha se houver erro de console.

`pwa.js` confere o manifest, o registro do service worker e os ícones, depois
recarrega o app **com a rede desligada** para garantir que ele abre pelo cache e
ainda aceita cadastro offline.

## Publicar

```powershell
npm install -g firebase-tools
firebase login
firebase deploy
```

Publica a pasta `public/` no Firebase Hosting e as regras do Firestore no mesmo
comando. Depois do primeiro deploy, adicione o domínio gerado em
**Authentication > Settings > Domínios autorizados**.

## Arquitetura

Estática, sem framework e sem etapa de build: o SDK do Firebase é carregado como
módulo ES a partir do CDN `gstatic`, e só quando há configuração válida — em
modo demonstração nenhuma requisição ao Firebase acontece.

Serviços usados, todos dentro do plano Spark: **Firestore** (banco),
**Authentication** (e-mail/senha) e **Hosting**. Cloud Storage e Cloud Functions
exigiriam o plano Blaze e por isso ficaram de fora — é o que adia as fotos
antes/depois nas ordens de serviço, e o que limita os lembretes ao próprio
aparelho, sem push disparado por servidor.

O uso offline vem de duas camadas: o service worker guarda a interface, e o
Firestore mantém a cópia local dos dados com as gravações em fila. Na prática, a
equipe consulta a agenda e conclui a ordem de serviço na casa do cliente mesmo
sem sinal, e tudo sobe sozinho quando a conexão volta.

## Continuando o desenvolvimento

[CLAUDE.md](CLAUDE.md) é o documento de continuidade do projeto: decisões e seus
porquês, estado atual, pendências e armadilhas conhecidas. Leia antes de editar,
principalmente ao retomar o trabalho em outra máquina, e atualize ao terminar
uma sessão que mude algo relevante.

## Histórico

- [INVENTARIO_ARQUITETURA.md](INVENTARIO_ARQUITETURA.md): inventário do sistema
  usado como base.
- [PLANO_DE_MIGRACAO.md](PLANO_DE_MIGRACAO.md): plano registrado antes da
  implementação.
