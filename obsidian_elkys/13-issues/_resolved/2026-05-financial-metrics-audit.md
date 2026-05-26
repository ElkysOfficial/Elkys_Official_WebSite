---
title: Auditoria 2026-05 — 14 bugs de cálculo financeiro/CRM corrigidos
tags: [resolved, audit, financial, crm, metrics]
status: resolved
resolved_in: v3.4.0
---

# Auditoria 2026-05 — 14 bugs de cálculo financeiro/CRM corrigidos

## Resumo

Auditoria minuciosa em 5 fases sobre todos os cálculos do admin portal +
backend (RPCs/edge functions). Encontrados **14 bugs** (calculation +
data integrity), todos corrigidos. Refator de centralização criou
`src/lib/finance-metrics.ts` + `src/lib/crm-metrics.ts` com **121 testes
Vitest** (ver [[ADR-014-centralized-metrics-libs]]).

## Fases

### F1 + F1.5 — Overview + Finance (financeiro)

| #   | Bug                                        | Arquivo                      | Causa-raiz                                                                                         |
| --- | ------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `pipelineCount` esquecia leads em proposta | `Finance.tsx:2070`           | Esqueci de incluir `leadsInProposta.length` ao adicionar `leadsPipelineValue`                      |
| 2   | `Forecast` divergente Overview vs Finance  | `Overview.tsx`/`Finance.tsx` | Overview somava `proposals.aprovada` (com double-count após contrato ativar); Finance só agendadas |
| 3   | `<Button size="sm" size="sm">` duplicado   | `Finance.tsx:2110`           | Paste duplo                                                                                        |

### F2 — CRM

| #   | Bug                                                                                           | Arquivo         |
| --- | --------------------------------------------------------------------------------------------- | --------------- |
| 4   | `Conversion rate` = `ganho/total` (penalizava abertos) → trocado para `ganho/(ganho+perdido)` | `Leads.tsx`     |
| 5   | `Approval rate` ignorava `expirada` → agora inclui como rejeição implícita                    | `Proposals.tsx` |
| 6   | `Top sources` não normalizava casing/whitespace                                               | `Leads.tsx`     |
| 7   | `newLast7Days` não checava `Number.isFinite` para datas inválidas                             | `Leads.tsx`     |

### F3 — Cobranças + Inadimplência + Receita

| #   | Bug                                                                                       | Arquivo                  | Causa-raiz                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 8   | **Form de contrato em ClientDetail mostrava status legacy enquanto header mostrava view** | `ClientDetail.tsx:315`   | `deriveContractSnapshot` não recebia `clientSummary` (view). Cliente Alexandre da Silva: header=`inadimplente`, form=`ativo` |
| 9   | `Delinquency` reimplementava aging com thresholds hardcoded                               | `Delinquency.tsx:54`     | Não usava constantes da lib                                                                                                  |
| 10  | Label "1M" em RevenueByClient era "mês atual", não "30d rolling"                          | `RevenueByClient.tsx:37` | Naming confuso                                                                                                               |
| 11  | Default de RevenueByClient era `6M` quando "Mês atual" é mais relevante                   | `RevenueByClient.tsx:66` | UX                                                                                                                           |

### F4 — Projetos + Contratos

| #   | Bug                                                                                                   | Arquivo            |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------ |
| 12  | `overdueProjects` em Projects.tsx incluía `negociacao`/`pausado` (Overview/Finance só `em_andamento`) | `Projects.tsx:526` |

### F5 — Backend (RPCs + Edge Functions + Views)

| #   | Bug                                                                                                                                             | Onde         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 13  | **RPC `mark_overdue_clients_inadimplente` era código morto desde v2.89.1** (cron desagendado pq guard P-18 bloqueava UPDATE em snapshot legacy) | Postgres     |
| 14  | **`approve_proposal_to_project` não era idempotente** — duplo-clique criava 2 contratos + 2 tarefas jurídico + 2 notificações                   | Postgres RPC |

Validados **sem alteração necessária** (todos OK): `convert_lead_to_client`,
`register_contract_acceptance`, `register_project_acceptance`,
`transition_project_contract`, `close_validation_round`, `mark_overdue_charges`,
`reconcile_inadimplencia_warnings`, `sync_financial_blocks`,
`activate_contract_to_project`, view `client_financial_summary`,
edge function `process-billing-rules`.

## Migrações DB aplicadas

```
drop_dead_rpc_mark_overdue_clients_inadimplente
approve_proposal_idempotent_via_source_link
```

A segunda adicionou coluna `project_contracts.source_proposal_id` (FK para
`proposals`) + backfill via `timeline_events.metadata.contract_id` + index
parcial pra lookup eficiente.

## Mudanças de funil de leads

Aproveitando a auditoria, simplifiquei o funil de leads (conversa anterior à
auditoria, mas commitada junto):

| Antes                                                                    | Depois                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| novo → qualificado → diagnostico → proposta → negociacao → ganho/perdido | prospeccao → qualificado → proposta → ganho/perdido |

Remapeamento via migration:

- `novo` → `prospeccao`
- `diagnostico` → `qualificado`
- `negociacao` → `proposta`

Pipeline (CRM) reescrito com 5 colunas seguindo esse funil. Projetos saem
do pipeline (têm sua própria view em `/portal/admin/projetos`).

## Limitações conhecidas

- **Não rodei E2E Playwright** — `npm run test:e2e` precisa ser executado
  manualmente antes de validação real
- **3 contratos legados sem `source_proposal_id`** — backfill via
  timeline_events não cobriu (rows de antes da função emitir
  `proposta_aprovada` event). Apenas perde idempotência retroativa
- **Edge functions de email/tracking** (`send-*`, `check-*`, `track`) não
  auditadas em profundidade — out of scope desta auditoria

## Files auditados

`src/pages/portal/admin/*.tsx` (Overview, Finance, Leads, Proposals, Pipeline,
LeadDetail, ProposalDetail, Projects, ProjectDetail, ProjectCreate, Contracts,
ClientDetail, Delinquency, RevenueByClient, FinanceGoals, BillingAutomation),
todos componentes em `src/components/portal/{project,contract,proposal}/`,
~15 RPCs Postgres, view `client_financial_summary`, edge function
`process-billing-rules`, todos 8 cron jobs.

Total: ~85 cálculos mapeados, ~6.000 linhas de código revisadas.

## Próximas auditorias

- Fase 6 (planejada): Portal Cliente (todas as telas — espelho do admin)
