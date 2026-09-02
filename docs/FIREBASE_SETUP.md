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

## 4. Ativar o login por e-mail e senha

1. Menu lateral: **Criação > Authentication > Vamos começar**.
2. Aba **Sign-in method** > **E-mail/senha** > ative a primeira chave
   (deixe "Link do e-mail" desativado) > **Salvar**.
3. Em **Settings > Domínios autorizados**, confirme que `localhost` está na
   lista. Após o primeiro deploy, adicione também o domínio do Hosting.

Não crie usuários pela mão: a própria tela de acesso do app tem a opção
**Criar uma conta**.

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

```
usuarios/{uid}/clientes/{id}       nome, telefone, endereço, recorrência
usuarios/{uid}/servicos/{id}       catálogo, duração e preço base
usuarios/{uid}/agendamentos/{id}   data, hora, equipe, valor, status, pagamento
usuarios/{uid}/lancamentos/{id}    receitas e despesas do financeiro
usuarios/{uid}/equipes/{id}        reservado para o cadastro de equipes
```

No primeiro acesso de uma conta nova, o app publica sozinho os oito serviços
do catálogo da Hiper, para que a agenda já nasça utilizável.

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

Para testar login e banco sem tocar nos dados reais, use os emuladores:

```powershell
firebase emulators:start
```

Eles sobem em `localhost:5000` (Hosting), `9099` (Auth) e `8080` (Firestore),
conforme o bloco `emulators` do `firebase.json`.

---

## Limites do plano Spark

| Recurso | Cota diária gratuita |
| --- | --- |
| Leituras no Firestore | 50.000 |
| Gravações no Firestore | 20.000 |
| Exclusões no Firestore | 20.000 |
| Armazenamento no Firestore | 1 GiB |
| Hosting (transferência) | 360 MB/dia, 10 GB armazenados |
| Authentication (e-mail/senha) | ilimitado |

O app assina as coleções com `onSnapshot`, então a carga inicial custa uma
leitura por documento e, depois disso, só as alterações consomem cota. Para a
operação da Hiper isso fica muito abaixo do limite gratuito.

**Fora do Spark** (exigem Blaze, e por isso não são usados): Cloud Storage —
o que adiaria as fotos antes/depois das ordens de serviço —, Cloud Functions,
e o envio de SMS pelo Authentication.

## Problemas comuns

| Mensagem | O que fazer |
| --- | --- |
| "Ative o login por e-mail/senha no console" | Passo 4 não concluído. |
| "Domínio não autorizado" | Adicione o domínio em Authentication > Settings. |
| "Sem permissão. Confira as regras do Firestore." | Publique `firestore.rules` (passo 5). |
| A tela de login não aparece | `firebase-config.js` ainda está com o placeholder. |
| "Missing or insufficient permissions" no console | O banco foi criado em modo produção sem as regras publicadas. |
