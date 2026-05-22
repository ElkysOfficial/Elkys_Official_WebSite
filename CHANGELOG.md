# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O versionamento segue a política descrita em `docs/VERSIONING.md`.

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
