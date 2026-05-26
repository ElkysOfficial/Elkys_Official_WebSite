# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O versionamento segue a política descrita em `docs/VERSIONING.md`.

## [3.5.0] - 2026-05-26

Auditoria completa de modelagem do banco + refactor estrutural seguindo o
relatório em `obsidian_elkys/13-issues/_audit-2026-05-25/`. Quebras de schema
e código aplicadas em conjunto para manter consistência entre frontend e DB.

### Auditoria (Onda 1) — quick wins de segurança e performance

- 4 índices/constraints duplicados removidos (`user_roles`, `client_contacts`,
  `project_installments`, `projects`).
- 9 funções com `search_path mutable` agora têm `SET search_path = public,
pg_catalog` (previne hijack via objeto malicioso).
- 49 índices criados em FKs sem cobertura (advisor `unindexed_foreign_keys`).
- ~95 policies RLS reescritas trocando `auth.uid()` por `(SELECT auth.uid())`
  para forçar initplan caching (advisor `auth_rls_initplan`).
- 6 cron jobs migrados para Vault: secret `cron_function_bearer` em
  `vault.secrets`, helper `public.cron_auth_header()` lê em runtime.
  `SELECT` em `cron.job` revogado de `anon`/`authenticated`.
- Buckets `email-assets` e `profile-photos` com listagem restrita (URLs
  públicas via `public=true` continuam funcionando).

### Auditoria (Onda 2) — consolidações estruturais

- ~50 policies permissivas duplicadas consolidadas em 1 por (table, action)
  com OR (advisor `multiple_permissive_policies`: 76 → 25).
- DELETE policies explícitas em 7 tabelas operacionais; RESTRICTIVE deny em
  `legal_acceptance_log`, `project_contract_versions`, `audit_logs`.
- CHECK exclusive-arc em `timeline_events.source_*`, `team_tasks` (FKs
  principais), `communications.entity_id`.
- 8 FKs padronizadas: `expenses` e `proposals.lead_id` agora `SET NULL`;
  `billing_actions_log.charge_id` agora `CASCADE`.
- Trigger `fn_cleanup_auth_user_orphans` em `AFTER DELETE auth.users` limpa
  ~25 colunas que referenciam o usuário sem FK formal.
- **25 enums tipados** substituindo `text + CHECK` em `leads`, `proposals`,
  `support_tickets`, `charges`, `projects`, `expenses`,
  `marketing_calendar_events`, `notifications`, `billing_*`, `tracked_links`,
  `tracking_events`, `communications`, `timeline_events`, `ticket_messages`,
  `project_validation_rounds`, `admin_notifications`, `financial_goals`.

### Auditoria (Onda 3) — refactor de modelagem

- **DROP `internal_team_documents`** + adicionado `audience` e `client_id
nullable` em `documents`. Unificação completa; UI `InternalDocuments.tsx`
  migrada para `documents` com filtro de audience.
- **DROP 8 colunas snapshot mortas em `clients`**: `monthly_value`,
  `project_total_value`, `contract_status`, `contract_type`,
  `contract_start`, `contract_end`, `scope_summary`, `payment_due_day`.
  Trigger guard `fn_guard_clients_legacy_snapshots` removido. Frontend lê
  exclusivamente da view `client_financial_summary` (campos `*_calculated`).
- **DROP `team_members.system_role`**; nova view `team_members_with_role`
  expõe `system_role` derivado de `user_roles` (fonte única).

### Código adaptado

- `src/hooks/useAdminClients.ts`: select sem colunas mortas; merge final
  vem 100% da view calculada.
- `src/pages/portal/admin/ClientDetail.tsx`: fallbacks `client.X` removidos
  (snapshots mortos não existem mais); rendering só usa
  `summary?.X_calculated` + entidades primárias (`project_contracts`).
- `src/pages/portal/admin/Team.tsx`, `TeamCreate.tsx`, `TeamEdit.tsx`,
  `Tasks.tsx`, `MarketingCalendar.tsx`: leituras passam pela view
  `team_members_with_role`; escritas em `team_members` sem mais
  `system_role`; rollback de delete sem o campo.
- `src/pages/portal/admin/InternalDocuments.tsx`: queries em `documents`
  com `audience` + mapeamento `type_label → description`.
- `supabase/functions/send-invoice-due/index.ts`: status de inadimplência
  vem da view `client_financial_summary.contract_status_calculated`.
- `supabase/functions/_shared/notification-sender.ts`: filtro
  `contract_status` agora resolve `client_id`s via view antes de aplicar.
- `src/integrations/supabase/types.ts`: regenerado pelo MCP refletindo
  schema novo (sem colunas mortas, com enums, com view nova).

### Resultado dos advisors

| Categoria   | Inicial | Final | Δ           |
| ----------- | ------- | ----- | ----------- |
| Security    | 80      | 69    | −11 (−14%)  |
| Performance | 256     | 100   | −156 (−61%) |

O que sobra é "by design": 68 advisors de `security_definer_function_executable`
(helpers de RLS + RPCs precisam de SECURITY DEFINER) + 1 HIBP (toggle manual
no painel). Performance: 75 unused_index (48 são os FK indexes novos, ainda
sem load) + 25 `multiple_permissive` por dimensão de role `anon` vs
`authenticated` (falso positivo do advisor).

### Validação

- `npx tsc --noEmit` ✓
- `npm test` ✓ 121/121 testes Vitest
- `npx eslint` ✓ nos 11 arquivos modificados
- `npm run format:check` ✓
- `npm run build` ✓ bundle 32.64s

### ⚠️ Ação manual pendente

Ativar HaveIBeenPwned password protection em
**Supabase Dashboard → Auth → Settings → Password Protection** (não
acessível via MCP).

## [3.4.2] - 2026-05-23

UX dos seletores de período padronizada — "Mês atual" pré-selecionado.

### UX

- Botões de período no Overview (Receita & fluxo de caixa) e Forecast
  (Previsão de receita) agora abrem com `1` pré-selecionado por default
  (antes era `6M`). Label `1M` foi substituído por **"Mês atual"** no
  histórico e **"Próximo mês"** no forecast — semanticamente mais claro
  do que o número genérico.
- Label "Crescimento do MRR (1M)" vira "Crescimento do MRR (Mês atual)"
  quando `selectedPeriod=1`.
- RevenueByClient já tinha o padrão "Mês atual" desde v3.4.0; agora o
  comportamento é consistente em todo o portal admin.

## [3.4.1] - 2026-05-23

Hotfix da v3.4.0 — corrige ReferenceError que quebrava a aba Análise do Finance.

### Correções

- `pipelineCount` no `loadAnalise` da aba Análise (`/portal/admin/financeiro`)
  ainda referenciava variáveis intermediárias (`negIds`, `pendingProposals`,
  `leadsInProposta`) que foram removidas no refactor pra `computePipelineSummary`.
  Resultado: `Uncaught (in promise) ReferenceError: negIds is not defined`
  derrubando a tela inteira. Troca de 1 linha pra `pipelineSummary.count`.
- Causa-raiz do não-pegar-no-CI: projeto tem `strict: false` em
  `tsconfig.app.json` — issue separada vai propor migrar pra strict.

## [3.4.0] - 2026-05-23

Auditoria minuciosa em 5 fases sobre todos os cálculos financeiros e do CRM
do portal admin. 14 bugs corrigidos, 17 funções centralizadas em libs novas
com 121 testes Vitest. Funil de leads simplificado. Duas migrations no
Supabase. ADR-014 registrando o novo padrão.

### Funil de leads simplificado

- Status de lead reduzidos para 5 etapas:
  `prospeccao → qualificado → proposta → ganho/perdido`. Removidos `novo`,
  `diagnostico` e `negociacao`. Migration `lead_status_simplify_flow_v3`
  remapeou os dados existentes. Pipeline (CRM) reescrito com 5 colunas
  seguindo esse funil — projetos deixam de aparecer no pipeline (têm
  `/portal/admin/projetos` próprio).

### Métricas centralizadas (novo)

- Criadas `src/lib/finance-metrics.ts` (13 funções + 11 constantes) e
  `src/lib/crm-metrics.ts` (4 funções). Setup Vitest novo com `npm test` /
  `npm test:watch`, 121 testes em ~500ms cobrindo edge cases (div/0, null,
  dedup, IEEE-754 em centavos). ADR-014 documenta a decisão.

### Bugs corrigidos

- **Forecast divergente** entre Overview e Finance — Overview somava
  propostas aprovadas (com double-count após contrato ativar); Finance só
  agendadas. Ambos agora consomem `computeForecastRevenue` (charges
  agendadas + contratos rascunho).
- **`pipelineCount` esquecia leads em proposta** no Finance.
- **`overdueProjects` divergente** — Projects.tsx incluía status
  `negociacao`/`pausado`; Overview/Finance só `em_andamento`. Unificado
  via `isProjectOverdue`.
- **Form do ClientDetail mostrava status legacy** enquanto o header
  mostrava `client_financial_summary.contract_status_calculated` (view).
  `deriveContractSnapshot` agora recebe o summary e prioriza a fonte de
  verdade calculada.
- **`Conversion rate` em Leads** trocada de `ganho/total` (penaliza
  abertos) para `ganho/(ganho+perdido)` (padrão CRM).
- **`Approval rate` de Propostas** passou a incluir `expirada` como
  rejeição implícita no denominador.
- **`Top sources` em Leads** agora normaliza casing/whitespace.
- **`newLast7Days`** valida `Number.isFinite` para datas inválidas.
- **`Delinquency`** usa constantes `AGING_BUCKET_30/60` da lib em vez de
  thresholds hardcoded.
- **Label "1M" em RevenueByClient** renomeada para "Mês atual" e
  pré-selecionada como default.
- **`<Button size="sm" size="sm">`** duplicado em Finance.tsx removido.

### Backend (Supabase)

- **Migration `drop_dead_rpc_mark_overdue_clients_inadimplente`** —
  removida RPC órfã desde v2.89.1 (cron desagendado pq guard P-18
  bloqueava UPDATE em snapshot legacy). Verificadas zero referências
  em crons, RPCs, triggers, views, RLS, frontend e edge functions.
- **Migration `approve_proposal_idempotent_via_source_link`** — corrige
  bug crítico onde duplo-clique em "Aprovar proposta" criava 2 contratos
  - 2 tarefas pro jurídico + 2 notificações + 2 timeline events. Nova
    coluna `project_contracts.source_proposal_id` (FK pra proposals) +
    backfill via timeline_events + index parcial. RPC reescrita pra
    detectar reentrada e retornar contrato existente.

### Limitações conhecidas

- E2E Playwright (`npm run test:e2e`) precisa ser executado manualmente
  antes da validação real.
- 3 contratos legados ficaram sem `source_proposal_id` (não tinham event
  `proposta_aprovada` na timeline). Perdem idempotência retroativa, mas
  já estão criados e não são afetados por novas aprovações.
- Edge functions de email/tracking (`send-*`, `check-*`, `track`) não
  auditadas em profundidade — fora do escopo desta auditoria.

## [3.3.2] - 2026-05-21

Otimização do bundle inicial: React Query sai do carregamento da landing.

### Performance

- O `QueryClientProvider` foi movido do root (`App.tsx`) para o `PortalShell`,
  que já é lazy e já hospeda o `AuthProvider`. Nenhuma página pública consome
  React Query — apenas o portal (`AuthContext` e os hooks `useAdmin*` /
  `useClient*`). Com isso o chunk `query-vendor` (~9 KB gzip) deixa de ser
  baixado no boot da landing, junto com o `modulepreload` hint correspondente
  e uma requisição HTTP. O React Query passa a carregar somente ao entrar em
  `/login`, `/forgot-password` ou `/portal/*`.

## [3.3.1] - 2026-05-21

A barra lateral do portal admin passa a sempre iniciar recolhida.

### Tela

- A barra lateral do portal admin agora sempre inicia recolhida (modo
  icon-only) a cada carregamento. Removida a persistência da preferência no
  localStorage (`elkys-admin-sidebar-collapsed`), que reexpandia a barra para
  quem a tivesse expandido antes. O usuário ainda pode expandi-la durante a
  sessão, mas o estado não é mais mantido entre recarregamentos.

## [3.3.0] - 2026-05-21

Barra lateral do portal admin inicia recolhida e novo sistema de atalhos de
teclado para navegação rápida.

### Novidades

- Sistema de atalhos de teclado em três camadas, pensado para um público
  misto, com muitas pessoas não técnicas. O estudo de benchmark de 13 produtos
  que embasou as decisões está em `docs/KEYBOARD-SHORTCUTS.md`.
  - Busca: `Ctrl+K`, `Cmd+K` e `/` abrem a paleta de busca. Sem mudança.
  - Ajuda: `?` abre um painel com a lista completa de atalhos, gerada a partir
    da barra lateral do usuário.
  - Navegação: a sequência `E` (de Elkys) seguida de uma letra leva direto à
    área. Ao apertar `E`, um indicador na tela confirma que a sequência está
    ativa.
- Cada área da barra lateral exibe sua letra de atalho quando a barra está
  expandida.
- `[` recolhe e expande a barra lateral.

### Tela

- A barra lateral do portal admin agora inicia recolhida (modo icon-only). A
  preferência do usuário, se já gravada no localStorage, continua valendo.

## [3.2.1] - 2026-05-20

Polish de UI no portal admin.

### Tela

- Sidebar agora sempre inicia com todas as seções colapsadas. A seção que
  contém a rota ativa é auto-expandida pelo `containsActive` durante o
  render. Antes o estado de colapso ficava persistido em localStorage
  (`SIDEBAR_SECTIONS_STORAGE_KEY`) e com o tempo divergia da realidade da
  navegação. Removida essa persistência.
- Card "Cobranças vencidas" no Overview passou a ocupar duas colunas em
  telas xl (>= 1280px) via `xl:col-span-2`. Antes ficava espremido em uma
  coluna só, com texto cortado quando havia múltiplas linhas.

## [3.2.0] - 2026-05-20

Dashboard de Comunicações repensado por canal e audiência, correção do bug do
"Líder direto" no cadastro de equipe e auditoria de cálculos financeiros do
admin documentada.

### Novidades

- Tela `/portal/admin/comunicacoes` ganhou 3 abas dedicadas (Clientes, Equipe
  Elkys e Sistema). Cada aba filtra todas as métricas, gráficos e tabelas para
  aquela audiência. Antes a mistura mascarava qualquer decisão de canal,
  agora a operação consegue olhar separadamente para o relacionamento com
  cliente versus alertas internos versus fluxos automáticos.
- Funis de engajamento agora são dois, lado a lado: um para e-mail
  (Tentados, Entregues, Abertos, Clicados) e outro para WhatsApp
  (Tentados, Entregues, Clicados, já que WhatsApp não mede abertura).
  Cada canal mostra suas próprias taxas, sempre apples-to-apples.
- Três novas pizzas na aba Clientes:
  - Volume por canal: quanto da operação roda em cada canal.
  - Preferência de canal por cliente: seis buckets (só clica e-mail,
    prefere e-mail multi-canal, engaja igual nos dois, prefere WhatsApp,
    só clica WhatsApp, recebe e não clica). É o sinal de decisão para
    saber onde investir engajamento por cliente.
  - Cobertura de contato: cobertura dupla versus contato single-channel
    apenas. Mostra risco operacional quando um único canal falha.
- Cliques separados por canal em todos os gráficos: dia da semana,
  desempenho por tipo de comunicação e tabela Top 10 clientes (que ganhou
  coluna "Preferência" com chip colorido).
- Tabela "Comunicações recentes" passou a ter "Clicou e-mail" e "Clicou
  WhatsApp" em colunas independentes, já que uma mesma comunicação sai
  pelos dois canais e os cliques são independentes.

### Correção de bug

- "Cliente arquivado" aparecia para todos os clientes no dashboard de
  comunicações. O código lia `clientsBundle?.clients` mas o hook
  `useAdminClients` retorna o array direto, então o map ficava sempre
  vazio. Agora resolve o nome real, marcando "(arquivado)" no select
  quando o cliente está inativo.
- "Equipe Elkys" genérico aparecia em todos os envios internos.
  Adicionada resolução `email -> full_name` em `team_members` para
  mostrar o nome do membro que recebeu o envio.
- Pessoas que clicaram no e-mail sem o pixel disparar (Outlook, proxy do
  Gmail/Apple Mail, modo offline) agora são listadas nominalmente em vez
  de apenas contagem. Gestor consegue acionar individualmente.
- Empty state explícito no gráfico de série temporal quando há 0 ou 1
  dia com atividade no período. Antes o LineChart renderizava vazio
  porque linhas precisam de pelo menos 2 pontos.
- Bug do "Líder direto" em `TeamCreate` e `TeamEdit`: o dropdown filtrava
  `is_active=true AND user_id IS NOT NULL`, escondendo o admin_super
  logado quando o registro dele em `team_members` estava desalinhado.
  Resultado: você não conseguia se selecionar como líder de um novo
  membro. Agora inclui o usuário logado sempre, com fallback resolvendo
  `user_id` via auth context. Em `TeamEdit` continua excluindo o
  próprio membro editado (não pode ser líder de si).

### Tela

- Removidos os em-dashes (—) da UI da tela de Comunicações. Substituídos
  por pontuação adequada (vírgula, ponto, dois pontos) na prosa, e por
  "n/a" nas células de tabela quando o canal não foi disparado.
- Texto explicativo da etapa "Clicados sem abrir" agora especifica
  quantas pessoas foram (singular versus plural) e abre uma lista com
  nome do destinatário, tipo de comunicação e data, tornando o sinal
  acionável.

### Documentação

- `docs/AUDIT-FINANCEIRO-2026-05.md`: auditoria de cálculos do dashboard
  admin (Overview, Finance, Clients, Charges via Delinquency, Contracts e
  Communications). 14 achados documentados com `arquivo:linha`,
  severidade e proposta de fix. Quatro bugs já corrigidos nesta versão;
  os demais (1 bug-potencial sobre dependência de trigger de DB, 3 UX e
  4 nits) ficam abertos para PRs isolados a partir de `develop`.

## [3.1.1] - 2026-05-20

Patch de segurança e clareza no dashboard de Comunicações.

### Segurança

- Resolvidas 31 vulnerabilidades reportadas pelo Dependabot (18 alta, 13
  moderada), todas em dependências transitivas. Pacotes elevados pela
  transitividade: minimatch (9 ReDoS), dompurify (4 bypass), picomatch
  (4 ReDoS/injection), vite (3 path traversal/WebSocket), flatted (2
  DoS/Prototype Pollution), brace-expansion (2 DoS), ws, postcss, yaml,
  svgo, immutable, rollup e ajv. Resultado: `npm audit` reporta 0
  vulnerabilidades.

### Correção de bug

- Dashboard de Comunicações deixou de mostrar "Sem cliente vinculado"
  e "Cliente removido" em envios que são deliberadamente internos. Cada
  mensagem é agora classificada como sendo para um cliente, para a
  equipe Elkys ou um envio de sistema, com badge colorida e nome de
  contexto. Boas-vindas de novo membro e alertas de ticket aberto não
  aparecem mais misturados com clientes.
- Ranking de Top 10 clientes agora filtra apenas envios para clientes,
  ignorando comunicação interna e fluxos de sistema.
- Substituídos os traços (`—`) por descrições claras em toda a tela:
  "Não medido", "Não aplicável", "Não enviado", "0%".
- Cabeçalho da tela ganhou legenda explicando as 3 audiências e rodapé
  expandido detalhando como ler abertura e clique no e-mail versus
  WhatsApp.

## [3.1.0] - 2026-05-20

Consolidação ampla de UX nos portais admin e cliente, fechamento do ciclo de
comunicação por WhatsApp e novo gerador de PDF para os documentos legais.

### Novidade

- Sidebar admin reduzida de cerca de 30 itens para 14, com seções
  colapsáveis e entradas únicas de Tarefas e Calendário que resolvem o
  domínio do usuário pelo seu papel.
- Cmd+K (Ctrl+K no Windows) abre uma paleta de busca global em qualquer
  rota admin, com pesquisa cruzada em clientes, projetos, leads e propostas
  mais atalhos para ações comuns.
- Edição de status em linha disponível em Cobranças, Projetos, Leads e
  Propostas. Transições com efeito colateral relevante (pagamento, envio
  de proposta) seguem usando o fluxo seguro existente.
- Botão "Copiar link" passou a estar presente em todos os detalhes do
  portal (cliente e admin), facilitando o compartilhamento interno.
- Dashboard de Comunicações ganhou filtro por canal (e-mail ou WhatsApp),
  série temporal com linhas separadas, ranking dos 10 clientes mais
  engajados e colunas independentes de status na tabela de envios recentes.
- Edge function `expire-proposals` passa a notificar o cliente quando uma
  proposta expira, com um tom de retomada da conversa em vez de simples
  aviso de fim do prazo.
- Edge function `send-ticket-opened` agora espelha o alerta de novos
  tickets no WhatsApp da equipe de suporte, além do e-mail.

### Melhoria

- Saudação do WhatsApp passa a usar Sr./Sra. + primeiro e último nome do
  destinatário, com documentos destacados em negrito e disclaimer
  automático em todas as mensagens.
- Todos os 17 fluxos de comunicação por e-mail e WhatsApp foram reescritos
  para um padrão único e mais acolhedor, com estrutura idêntica em ambos
  os canais.
- Rastreamento de cliques agora distingue corretamente origem em e-mail
  versus WhatsApp, abrindo caminho para análise por canal no dashboard.
- Audit completo de truncamento em listagens: 38 pontos passaram a expor
  o conteúdo completo via tooltip nativo no hover, eliminando perda de
  informação em nomes longos.

### Correção de bug

- A página de detalhe do cliente passa a exibir botões explícitos para
  editar dados gerais e dados de contrato. Antes a edição só era acessível
  via parâmetro `?edit=dados` na URL, o que praticamente impedia o uso.
- O gerador de PDF do aceite de termos foi reescrito como geração
  programática (jsPDF) no lugar de `window.print()`, eliminando os cortes
  de conteúdo causados por overflow do container rolante, conflitos de
  `position: fixed` e ausência de regras `page-break`. O PDF agora tem
  capa, tipografia jurídica brasileira (Times, justificado, P&B, margem
  25mm) e numeração `Página X de Y`.
- Ao concluir um projeto pela edição em linha, o campo `delivered_at` é
  preenchido automaticamente, evitando que o projeto desapareça das
  métricas operacionais.
- Rollback manual de uma cobrança previamente marcada como paga passa por
  uma confirmação explícita, deixando claro que o e-mail de agradecimento
  já enviado ao cliente não pode ser desfeito.

## [3.0.1] - 2026-05-19

Personalização e refino das comunicações.

### Melhoria

- Mensagens de WhatsApp reescritas em tom mais acolhedor, com saudação
  personalizada (Bom dia/tarde/noite + Sr./Sra. + nome do cliente, via o
  novo helper `getWhatsAppGreeting`), link em linha própria e fecho de apoio.
- Logo dos e-mails trocada para um PNG de fundo transparente, no lugar do
  arquivo com fundo que destoava do layout.

### Correção de bug

- O cadastro de cliente passa a exibir uma mensagem clara quando o e-mail já
  pertence a outra conta do portal, em vez de um erro técnico cru.

## [3.0.0] - 2026-05-19

Primeira versão sob o processo de versionamento correto: versionamento
semântico deliberado, `package.json` sincronizado com a tag e changelog
mantido. Carrega o módulo de WhatsApp e a reconstrução da confiabilidade
de comunicações e cobrança.

### Nova funcionalidade

- Espelhamento das comunicações no WhatsApp. Cada e-mail enviado pelo
  portal passa a ser espelhado por uma mensagem de WhatsApp ao cliente,
  quando há telefone, via Sonar Bot. Helper `_shared/whatsapp.ts`, em
  modo no-op seguro quando falta telefone, token ou a API está fora.
- Rastreio de abertura (pixel invisível) e clique (link encurtado) em
  todos os e-mails do sistema, consolidado no dashboard de Comunicações
  do portal administrativo.

### Correção de bug

- Cinco cron jobs estavam mortos há mais de 30 dias: `process-billing-rules`,
  `send-inadimplencia-warning`, `send-proposal-expiry-warning`,
  `expire-proposals` e `check-overdue-client-actions`. Reescritos e
  testados, todos voltaram a funcionar.
- A régua de cobrança não executava automaticamente. Restaurada.
- A confirmação de pagamento não era enviada quando a cobrança era marcada
  como paga pelo botão rápido da Visão Financeira. Corrigido.
- O encurtador `lnk.elkys.com.br` era apagado a cada deploy pelo
  clean-slate do FTP. O proxy passa a ser publicado junto com o build.
- A migration `legal_acceptance_audit` estava pendente, o que quebrava o
  registro de aceite de termos legais. Aplicada.

### Melhoria

- Versionamento corrigido: `package.json` sincronizado com a tag e
  política de bump documentada em `docs/VERSIONING.md`.

## [2.x] - até 2026-05-18

Linha histórica, da v2.0.0 à v2.98.0. Fase anterior à adoção do processo
de versionamento atual: mais de 200 tags incrementais sem changelog,
consolidadas aqui como baseline. O produto nesta fase compreende o site
público, os portais Admin e Cliente, autenticação por papéis, gestão de
leads, propostas, contratos, projetos e cobranças, e as edge functions
de e-mail transacional.
