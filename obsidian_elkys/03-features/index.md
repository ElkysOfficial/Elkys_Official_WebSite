---
title: Features — MOC
tags: [features, moc]
---

# Features — MOC

Features são _capabilities_ observáveis do produto. Cada feature corta múltiplos domínios e múltiplas camadas (DB + edge + frontend).

## Comerciais

- [[lead-pipeline]] — captação, qualificação, conversão
- [[lead-conversion]] — Lead → Cliente (com proposta opcional)
- [[proposal-lifecycle]] — rascunho → enviada → aprovada/rejeitada/expirada
- [[contract-acceptance]] — fluxo de aceite com versionamento

## Financeiras

- [[billing-rules]] — régua de cobrança automática (D-3, D, D+3, D+15)
- [[financial-blocks]] — pausa automática de projetos por inadimplência
- [[financial-goals-feature]] — metas e KPI mensal/trimestral/anual
- [[invoice-reminders]] — lembrete D-3 antes do vencimento
- [[inadimplencia-warnings]] — avisos progressivos

## Projeto

- [[onboarding-checklist]] — tasks iniciais por projeto
- [[validation-rounds]] — rodadas de QA cliente↔interno
- [[next-steps-accountability]] — próximos passos owner=cliente|elkys
- [[project-stage-journey]] — visualização de etapas
- [[timeline-feed]] — histórico unificado

## Suporte

- [[support-sla]] — `first_response_at`, `resolved_at`
- [[ticket-thread]] — mensagens admin↔cliente

## Marketing/operacional

- [[marketing-calendar]]
- [[internal-documents]] — KB interna por audience
- [[team-tasks]] — Kanban interno

## Sistema

- [[audit-log-feature]] — visualização das ações
- [[notifications]] — broadcast + scheduled
- [[legal-acceptance]] — aceite de termos com versionamento e log imutável
- [[first-access]] — must-change-password
- [[communication-tracking]] — rastreio de abertura (pixel) e clique (encurtado) de e-mails

## Cross-cutting

- [[export-csv-pdf]] — `lib/export.ts` (lazy jsPDF)
- [[deep-links-copy]] — copiar URL do registro (em onda 1 do roadmap)
- [[autosave-drafts]] — `useFormDraftAutoSave`
