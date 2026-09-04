# Configurar o Firebase da Hiper Higienizações

Guia do zero até o app publicado. Tudo aqui cabe no **plano Spark (gratuito)**:
usamos apenas Firestore, Authentication e Hosting. Não há Cloud Functions nem
Cloud Storage, que exigiriam o plano Blaze.

Tempo estimado: 15 minutos.

---

## 1. Criar o projeto

1. Acesse <https://console.firebase.google.com> e clique em **Criar um projeto**.
2. Nome sugerido: `hiper-higienizacoes`. Anote o **ID do projeto** que o console
   gerar (algo como `hiper-higienizacoes-a1b2c`) — ele será usado adiante.
3. O Google Analytics é opcional; pode desativar.

## 2. Registrar o aplicativo web

1. No painel do projeto, clique no ícone **`</>`** (Web).
2. Apelido: `Hiper Gestão`. **Não** marque "Firebase Hosting" nessa tela — o
   Hosting será configurado pela linha de comando no passo 6.
3. O console mostrará um bloco `const firebaseConfig = { ... }`. Deixe aberto.

## 3. Colar as credenciais no projeto

Abra `public/js/firebase-config.js` e substitua os valores pelos do seu projeto:

```js
export const firebaseConfig = {
  apiKey: 'AIza...',
  authDomain: 'hiper-higienizacoes-a1b2c.firebaseapp.com',
  projectId: 'hiper-higienizacoes-a1b2c',
  storageBucket: 'hiper-higienizacoes-a1b2c.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:abcdef'
};
```

Depois abra `.firebaserc` e troque `SEU-PROJECT-ID` pelo mesmo ID do projeto.

> **Estes valores não são segredo.** A chave de API do Firebase Web é pública
> por design: ela apenas identifica o projeto. Quem protege os dados são as
> regras do Firestore (passo 5) e a lista de domínios autorizados do Auth.
> Por isso o arquivo pode ser versionado normalmente.

Enquanto esse arquivo não for preenchido, o app abre direto em modo
demonstração e a tela de login fica desativada — sem erros.

## 4. Ativar o login com Google

1. Menu lateral: **Criação > Authentication > Vamos começar**.
2. Aba **Sign-in method** > **Google** > ative, escolha o **e-mail de suporte
   do projeto** > **Salvar**.
3. Em **Settings > Domínios autorizados**, confirme que `localhost` está na
   lista. Após o primeiro deploy, adicione também o domínio do Hosting.

Não há login por senha: ninguém cria conta, esquece senha ou precisa de
recuperação. Quem entra é controlado pela lista de autorizados do passo 5.

## 5. Criar o Firestore e publicar as regras

1. Menu lateral: **Criação > Firestore Database > Criar banco de dados**.
2. Escolha **Iniciar no modo de produção** (as regras corretas vêm no passo
   seguinte) e a região `southamerica-east1` (São Paulo), mais perto de
   Ribeirão Preto.
3. Publique as regras deste repositório — pela linha de comando (recomendado):

   ```powershell
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules
   ```

   Ou manualmente: abra a aba **Regras** no console, cole o conteúdo de
   `firestore.rules` e clique em **Publicar**.

### Como os dados ficam organizados

Cada conta guarda tudo sob o próprio UID, então o isolamento é garantido pelo
caminho do documento:

```text
autorizados/{email}                quem pode entrar no sistema
usuarios/{uid}/clientes/{id}       nome, telefone, endereço, recorrência
usuarios/{uid}/servicos/{id}       catálogo, duração e preço base
usuarios/{uid}/agendamentos/{id}   data, hora, equipe, valor, status, pagamento
usuarios/{uid}/lancamentos/{id}    receitas e despesas do financeiro
usuarios/{uid}/equipes/{id}        reservado para o cadastro de equipes
```

No primeiro acesso de uma conta nova, o app publica sozinho os oito serviços
do catálogo da Hiper, para que a agenda já nasça utilizável.

### Liberar quem pode entrar

Entrar com Google não dá acesso a nada: qualquer pessoa com conta Google
consegue se autenticar, então a liberação vem da coleção `autorizados`, que as
regras consultam. Quem não consta nela vê a tela de **acesso não liberado**.

Para liberar alguém, crie um documento cujo **ID é o e-mail** da pessoa:

1. Console > **Firestore Database** > coleção `autorizados`.
2. **Adicionar documento**, com o ID sendo o e-mail exato da conta Google.
3. Campos livres, só para você se organizar — por exemplo `nome` e `papel`.

Para revogar o acesso, exclua o documento. O app nunca escreve nessa coleção:
cada pessoa só consegue ler o próprio registro, e apenas para saber se entra.

> **Atenção ao adicionar a segunda pessoa.** Hoje os dados vivem sob
> `usuarios/{uid}`, ou seja, cada conta tem a própria base. Uma segunda pessoa
> autorizada entraria num sistema vazio, não na agenda da Hiper. Para a equipe
> compartilhar os mesmos dados, os documentos precisam ser movidos para um
> caminho da empresa e as regras ajustadas.

## 6. Publicar no Firebase Hosting

```powershell
firebase login
firebase deploy
```

O `firebase.json` já aponta o Hosting para a pasta `public/`, com o fallback de
SPA e as regras do Firestore no mesmo deploy. Para publicar só uma parte:

```powershell
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

Ao final, o console mostra a URL (`https://SEU-PROJECT-ID.web.app`). Volte ao
**Authentication > Settings > Domínios autorizados** e adicione esse domínio.

## 7. Testar localmente

Para o dia a dia, o servidor local sem dependências continua valendo:

```powershell
node server.js
```

As regras de acesso têm teste próprio, que não toca no banco real nem precisa
do emulador — ele usa a API de teste do Firebase Rules:

```powershell
node tests/regras.js
```

Para testar login e banco sem tocar nos dados reais, existem os emuladores:

```powershell
firebase emulators:start
```

Eles sobem em `localhost:5000` (Hosting), `9099` (Auth) e `8080` (Firestore),
conforme o bloco `emulators` do `firebase.json`. **Exigem Java 21 ou superior** —
versões do `firebase-tools` a partir de 2025 recusam JDKs anteriores. Se o
comando reclamar da versão do Java, instale um JDK novo ou fique com
`tests/regras.js`, que cobre a parte crítica sem essa dependência.

---

## Proteger o projeto

O código está num repositório público, então a configuração do passo 3 fica
visível para qualquer pessoa. Isso **não** é um vazamento — a chave de API do
Firebase Web é pública por design e sozinha não dá acesso a nada. Mas ela
identifica o seu projeto, e é isso que torna os três itens abaixo obrigatórios
antes de colocar clientes reais no sistema.

### 1. Mantenha a lista de autorizados enxuta

É ela que controla o acesso. Qualquer pessoa com conta Google consegue se
autenticar no seu projeto, mas sem constar em `autorizados` não lê nem grava
nada — o que as regras garantem, e `node tests/regras.js` verifica.

Revise a lista de tempos em tempos e remova quem saiu da equipe. Não é preciso
fechar o cadastro no console: sem login por senha, não há cadastro a fechar.

### 2. Restrinja a chave de API

No **Google Cloud Console > APIs e serviços > Credenciais**, abra a chave do
navegador e, em **Restrições de aplicativo**, escolha **Sites**. Adicione apenas
`localhost` e o domínio do seu Hosting. Assim a chave não funciona a partir de
outros sites.

### 3. Confirme as regras antes de usar

As regras do passo 5 são o que impede uma conta de ler os dados de outra. Sem
elas publicadas, um banco em modo de teste fica aberto. Verifique na aba
**Regras** do Firestore que o conteúdo é o de `firestore.rules`, e que a data de
publicação é posterior à criação do banco.

## Limites do plano Spark

| Recurso | Cota diária gratuita |
| --- | --- |
| Leituras no Firestore | 50.000 |
| Gravações no Firestore | 20.000 |
| Exclusões no Firestore | 20.000 |
| Armazenamento no Firestore | 1 GiB |
| Hosting (transferência) | 360 MB/dia, 10 GB armazenados |
| Authentication (login com Google) | ilimitado |

O app assina as coleções com `onSnapshot`, então a carga inicial custa uma
leitura por documento e, depois disso, só as alterações consomem cota. Para a
operação da Hiper isso fica muito abaixo do limite gratuito.

**Fora do Spark** (exigem Blaze, e por isso não são usados): Cloud Storage —
o que adiaria as fotos antes/depois das ordens de serviço —, Cloud Functions,
e o envio de SMS pelo Authentication.

## Problemas comuns

| Mensagem | O que fazer |
| --- | --- |
| "Ative o login com Google no console" | Passo 4 não concluído. |
| "Domínio não autorizado" | Adicione o domínio em Authentication > Settings. |
| "Acesso não liberado" após entrar | O e-mail não está em `autorizados`. Veja *Liberar quem pode entrar*. |
| "Sem permissão. Confira as regras do Firestore." | Publique `firestore.rules` (passo 5). |
| A tela de login não aparece | `firebase-config.js` ainda está com o placeholder. |
| O navegador bloqueou a janela de login | O app tenta o redirecionamento sozinho; libere os pop-ups se insistir. |
