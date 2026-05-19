# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O versionamento segue a política descrita em `docs/VERSIONING.md`.

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
