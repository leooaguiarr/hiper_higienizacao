# Plano curto de migração

1. **Isolar a nova versão** - criar a Hiper em projeto separado e manter
   `lexion_salao` intacto.
2. **Trocar o domínio e a identidade** - aplicar logo, azul/ciano da marca,
   linguagem de higienização e dados públicos reais de contato.
3. **Reformular os dados** - adaptar agenda, clientes, equipes, serviços e
   financeiro; acrescentar recorrência e ordem de serviço.
4. **Entregar uma operação navegável** - iniciar com dados demonstrativos e
   persistência local, incluindo cadastros e atualização de status.
5. **Preparar produção** - fornecer banco próprio, com regras de isolamento,
   para a posterior conexão da conta definitiva sem carregar dados do salão.
6. **Validar** - testar desktop e celular, os três modos da agenda, cadastros,
   indicadores financeiros e estados vazios.

## Atualização de 01/09/2026 - backend definido

O passo 5 foi executado com **Firebase**, não com Supabase. A escolha veio da
preferência pelo ecossistema Google e da restrição do **plano Spark**, que
delimitou o desenho:

- **Firestore** substitui o PostgreSQL. O isolamento por conta, que seria feito
  com RLS, passou a ser garantido pelo caminho dos documentos: tudo vive sob
  `usuarios/{uid}`, e `firestore.rules` só libera quem for dono do caminho.
- **Authentication** com e-mail e senha, incluindo recuperação.
- **Hosting** substitui o Vercel; `vercel.json` foi removido.
- **Sem Cloud Storage e sem Cloud Functions**, que exigem o plano Blaze. É o que
  adia as fotos antes/depois nas ordens de serviço.

O passo 4 continua valendo em paralelo: sem login, o app segue operando com
dados demonstrativos no navegador, agora como um modo explícito ao lado do modo
nuvem.

O passo 6 ganhou um teste automatizado em `tests/smoke.js`, headless via Chrome
DevTools Protocol e sem dependências npm, cobrindo o modo demonstração de ponta
a ponta. A operação autenticada ainda depende de validação manual com um projeto
Firebase real.


## Atualização de 01/09/2026 - aplicativo no celular

Requisito acrescentado depois: além do acesso pelo navegador no computador, a
equipe precisa de um aplicativo no celular. A entrega foi feita como **PWA**,
mantendo uma única base de código para os dois usos, sem etapa de build e sem
reescrita em React Native ou Flutter.

- **Instalação pelo navegador**, sem Play Store. Manifest com ícones próprios,
  atalhos para agenda, ordens e clientes, e abertura em tela cheia.
- **Operação completa offline**, que era o ponto crítico do trabalho em campo:
  o service worker guarda a interface e o cache do Firestore guarda os dados,
  com as gravações em fila até a conexão voltar. Indicador de estado na tela.
- **Lembretes dos serviços do dia** montados no próprio aparelho. Sem Cloud
  Functions no plano Spark não há push por servidor; no Android com o app
  instalado, o `Periodic Background Sync` permite avisar com o app fechado.
- Os ícones foram gerados a partir do logo. O `maskable` usa só a espiral da
  marca: o nome em circunferência fica ilegível abaixo de 200px.

Validação em `tests/pwa.js`, que recarrega o app com a rede desligada e confere
que ele abre pelo cache e aceita cadastro offline.
