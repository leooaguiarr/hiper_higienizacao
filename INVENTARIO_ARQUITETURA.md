# Inventário do projeto-base `lexion_salao`

Levantamento realizado em 01/09/2026, antes da implementação da Hiper Higienizações.

## Stack atual

- Aplicação web estática, sem framework e sem etapa de build.
- Frontend em HTML, CSS e JavaScript organizados por ordem numérica.
- Servidor local em Node.js usando apenas módulos nativos (`http`, `fs` e `path`).
- Deploy no Vercel publicando somente a pasta `public/`, com fallback de SPA.
- Persistência de produção no Supabase (Auth, PostgreSQL, RPC e RLS).
- Persistência local em `localStorage` para demonstração/fallback.
- Testes headless próprios via Chrome DevTools Protocol, sem dependências npm.

## Módulos encontrados

- Autenticação e recuperação de senha.
- Dashboard operacional e financeiro.
- Agenda, disponibilidade, encaixe e agendamento público.
- Clientes, leads em Kanban e mensagens por WhatsApp.
- Financeiro, caixa, pagamentos e extratos em PDF.
- Profissionais, níveis de acesso e multi-login.
- Produtos, estoque e movimentações.
- Configurações e guia de ajuda.

## Banco atual

O esquema é multiempresa e possui `business_info`, `services`, `professionals`,
`clients`, `appointments`, `transactions`, `cash_registers`, `leads`,
`salon_members`, `professional_blocks`, `products` e `stock_movements`, com RLS.

## O que será reaproveitado

- Estrutura estática simples, rápida e fácil de publicar.
- Servidor local e configuração do Vercel.
- Padrão de navegação lateral, cartões, modais e layout responsivo.
- Conceitos de agenda, clientes, pagamentos, equipe e isolamento de dados.
- Formatação brasileira de datas, horários, telefone e moeda.
- A ideia de operação local imediata, preparando a mesma interface para Supabase.

## O que será substituído

- Marca, paleta, textos e imagens do salão.
- Vocabulário de salão (`profissional`, `procedimento`, `cadeira`, `encaixe`) por
  serviço externo, responsável/equipe, endereço e ordem de serviço.
- Modelo de agendamento para incluir duração, endereço, observações, valor e os
  cinco estados operacionais da Hiper.
- Cadastro de clientes para incluir endereço completo, nascimento, recorrência,
  total gasto, última higienização e próxima recomendação.
- Financeiro para priorizar fluxo de caixa, contas a receber, despesas, ticket
  médio, lucro estimado e faturamento por período.

## Cuidados de migração

- O repositório-base contém alterações locais não versionadas e não será alterado.
- A pasta `.git`, credenciais Supabase, dados de clientes e regras exclusivas do
  salão não serão copiadas.
- A nova aplicação será criada em `hiper_higienizacao`, que estava vazia.


## Atualização de 01/09/2026 - o que de fato foi adotado

O levantamento acima descreve o projeto-base `lexion_salao` e permanece como
registro do que foi encontrado. Na implementação da Hiper, um item mudou:

- **A persistência de produção passou a ser o Firebase, não o Supabase.** Onde
  se lia "preparando a mesma interface para Supabase", leia-se Firestore com
  Authentication e Hosting, no plano Spark. O detalhamento está em
  `PLANO_DE_MIGRACAO.md` e o passo a passo em `docs/FIREBASE_SETUP.md`.

O restante do reaproveitamento se confirmou: estrutura estática sem build,
servidor local em Node nativo, navegação lateral com cartões e modais, testes
headless por Chrome DevTools Protocol sem dependências npm, formatação
brasileira e operação local imediata com a mesma interface da nuvem.
