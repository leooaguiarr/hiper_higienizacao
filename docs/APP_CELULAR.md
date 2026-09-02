# O aplicativo no celular

A Hiper é uma **PWA**: um só sistema que roda no navegador do computador e
instala como aplicativo no celular. Não há duas bases de código, e não existe
versão que fique para trás — todo deploy atualiza os dois de uma vez.

---

## Para a equipe: instalar no Android

1. Abra o endereço do sistema no **Chrome** do celular.
2. Toque no menu (três pontos) e em **Instalar aplicativo** (ou
   "Adicionar à tela inicial").
3. Confirme. O ícone da Hiper aparece na tela inicial do aparelho.

O aplicativo também pode ser instalado pela própria tela de **Configurações >
Instalar no celular**, quando o botão estiver disponível.

Depois de instalado, ele abre em tela cheia, sem a barra de endereço, e se
comporta como qualquer outro aplicativo do aparelho. Segurando o ícone, os
atalhos levam direto para **Agenda**, **Ordens de serviço** e **Clientes**.

### No iPhone

Funciona também, pelo **Safari**: botão de compartilhar e depois **Adicionar à
Tela de Início**. A instalação pelo Chrome do iPhone não é oferecida pelo
sistema da Apple, e as notificações são mais limitadas.

### No computador

Basta acessar pelo navegador, como sempre. Se preferir, o Chrome e o Edge
também permitem instalar o sistema como um aplicativo de janela própria.

---

## Trabalhar sem internet

O app foi feito para a casa do cliente, onde o sinal costuma falhar:

- **A interface abre sem rede**, pelo cache do service worker.
- **Os dados continuam disponíveis**: o Firestore mantém uma cópia local no
  aparelho e responde por ela quando não há conexão.
- **Dá para trabalhar offline**: consultar a agenda, abrir a ficha do cliente,
  concluir a ordem de serviço e lançar o pagamento. As gravações entram numa
  fila e sobem sozinhas quando a conexão volta.

O indicador no alto da tela mostra o que está acontecendo:

| Indicador | Significado |
| --- | --- |
| **Sem conexão** | O aparelho está sem rede; o app segue funcionando pelos dados locais. |
| **Sincronizando** | Há alterações suas ainda não confirmadas pelo servidor. |
| **Dados locais** | A tela está mostrando a cópia local enquanto o servidor responde. |

Nada disso vale para o **modo demonstração**, que por natureza já é todo local
e nunca envia dados para a nuvem.

---

## Lembretes dos serviços do dia

Em **Configurações > Serviços do dia**, o botão **Ativar lembretes** pede a
permissão de notificação do aparelho. A partir daí, o app avisa quantos
atendimentos há no dia e o horário do primeiro, com os três primeiros
endereços.

### Como funciona, e o limite honesto

O plano Spark não inclui Cloud Functions, então **não existe push disparado por
servidor**. O que existe é o lembrete montado no próprio aparelho:

- **Sempre**: ao abrir o app, se houver serviço hoje e o aviso do dia ainda não
  tiver saído, a notificação aparece.
- **No Android, com o app instalado**: registramos um `Periodic Background
  Sync`, que permite ao sistema acordar o app e notificar **mesmo com ele
  fechado**. Quem decide a frequência é o navegador — na prática cerca de uma
  vez por dia, mais confiável em apps usados com regularidade. Não é um horário
  garantido.
- **No iPhone e nos navegadores sem esse recurso**: o aviso sai quando o app é
  aberto.

O painel de Configurações mostra em **Em segundo plano** qual dos dois casos
está valendo no aparelho.

Para lembretes em horário garantido, com o app fechado, seria necessário o
plano Blaze (Cloud Functions + FCM) ou um agendador externo chamando a API do
FCM. Nada disso é preciso para o uso atual.

---

## Notas técnicas

- `public/manifest.webmanifest` — identidade, ícones e atalhos do aplicativo.
- `public/sw.js` — cache do app shell e o `periodicsync` dos lembretes.
- `public/js/notificacoes.js` — permissão, publicação do resumo e registro do
  sync em segundo plano.
- Os ícones saem de `logo-hiper.png`. O `maskable` usa só a espiral da marca,
  porque o Android recorta as bordas e o nome em circunferência do logo
  completo ficaria ilegível em tamanho pequeno.
- **A instalação exige HTTPS.** Em `localhost` funciona para testes; publicado
  no Firebase Hosting, o HTTPS já vem pronto.
- Ao alterar arquivos estáticos, suba a constante `VERSAO` no `sw.js`: é ela
  que descarta o cache antigo na ativação do novo service worker.

Para validar tudo automaticamente:

```powershell
node tests/pwa.js
```

O teste confere o manifest, o registro do service worker, os ícones, e recarrega
o app com a rede desligada para garantir que ele abre e aceita cadastro offline.
