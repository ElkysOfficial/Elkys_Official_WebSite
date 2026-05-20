# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O versionamento segue a política descrita em `docs/VERSIONING.md`.

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
