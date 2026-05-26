---
title: ADR-014 — Métricas financeiras e CRM centralizadas em src/lib/*-metrics.ts
tags: [adr, frontend, financial, metrics, tests]
status: accepted
---

# ADR-014 — Métricas financeiras e CRM centralizadas em `src/lib/*-metrics.ts`

## Contexto

Auditoria 2026-05-23 (5 fases, ~85 cálculos mapeados) encontrou **14 bugs de
cálculo** em telas do admin causados por **fórmulas duplicadas e divergentes**
entre Overview, Finance, Leads, Proposals, Pipeline, Projects, Delinquency,
RevenueByClient, FinanceGoals e ClientDetail. Exemplos concretos:

- `Forecast` no Overview incluía propostas aprovadas; no Finance só agendadas
  — mesma sessão, dois números diferentes pra mesmo KPI.
- `Aging buckets` duplicado linha-por-linha entre Overview e Finance.
- `pipelineCount` no Finance esquecia leads em proposta (introduzido durante
  refactor sem teste).
- `overdueProjects` em Projects.tsx incluía status `negociacao`/`pausado`;
  Overview/Finance só `em_andamento`.
- `Taxa de conversão` em Leads usava `ganho/total` em vez do padrão de mercado
  `ganho/(ganho+perdido)`, penalizando leads abertos.
- `Approval rate` em Propostas ignorava `expirada` no denominador, inflando.
- `Top sources` não normalizava casing/whitespace ("Inbound" vs "inbound").

A causa-raiz: cada tela reimplementava sua versão dos cálculos. Sem fonte
única, qualquer evolução de regra ficava em N lugares — e era questão de
tempo até divergirem.

## Decisão

Toda fórmula compartilhada entre 2+ telas DEVE ser função pura em
`src/lib/finance-metrics.ts` (financeiro) ou `src/lib/crm-metrics.ts` (CRM),
com testes Vitest cobrindo edge cases.

Inventário consolidado:

- **`src/lib/finance-metrics.ts`** — 13 funções + 11 constantes
  - `computeBurnRate`, `computeRunway`, `computeOperationalMargin`
  - `computeAgingBuckets`
  - `computePipelineSummary`, `computeForecastRevenue`, `computeForecastProjection`
  - `computeMrrGrowth`, `computePercentChange`
  - `computeTicketAverage`, `computeGoalProgress`
  - `isProjectOverdue`, `isProjectUpcomingDelivery`
  - Constantes: `AGING_BUCKET_30/60`, `BURN_RATE_WINDOW_MONTHS`,
    `MARGIN_HEALTHY_PCT/NEUTRAL_PCT`, `RUNWAY_DANGER_MONTHS/WARNING_MONTHS`,
    `UPCOMING_CHARGES_WINDOW_DAYS/DELIVERIES_WINDOW_DAYS/LIST_LIMIT`,
    `OPEN_TICKETS_WARNING_THRESHOLD`, `DELIVERY_CRITICAL/SOON/NEAR_DAYS`

- **`src/lib/crm-metrics.ts`** — 4 funções
  - `computeLeadConversionRate` (ganho/(ganho+perdido))
  - `computeProposalApprovalRate` (inclui expirada como rejeição implícita)
  - `computeNewLeadsInWindow` (rolling N×24h)
  - `computeTopLeadSources` (normaliza trim/lowercase)

Setup Vitest mínimo (`vitest.config.ts`, separado do `vite.config.ts` pra
não carregar plugins de build), `npm test` / `npm test:watch`. Tests rodam
em ~500ms — 121 testes hoje (93 finance + 28 crm).

**Princípio geral:** se uma fórmula aparecer em 2+ lugares, ela DEVE migrar
pra lib antes da próxima PR. Reviewer rejeita PR que duplique cálculo.

## Alternativas

| Opção                         | Por que não                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Manter inline em cada tela    | Causa-raiz dos 14 bugs                                                                   |
| Centralizar via RPCs Postgres | Cálculos client-side perdem latência da query; alguns dependem de estado de UI (filtros) |
| Usar React Query selectors    | Bom pra fetch+memo, mas não força padronização das fórmulas                              |
| Jest em vez de Vitest         | Vite já é o build tool — Vitest reaproveita config, sem dupla cadeia                     |

## Consequências

**Positivas:**

- Mudar uma fórmula afeta TODAS as telas simultaneamente (impossível divergir)
- Edge cases (div/0, null, dedup, fuso) tratados num lugar só
- Tests pegam regressão em 0.5s; CI bloqueia merge
- Onboarding mais rápido — devs novos não precisam descobrir 10 implementações

**Negativas:**

- Mais um arquivo pra navegar (mas indexado em [[brain]] + Decision)
- Refactor de 17 funcs custou ~1 dia de trabalho (paga-se na próxima divergência evitada)

## Aplicado em

Auditoria F1+F1.5+F2+F3+F4 (ver [[2026-05-financial-metrics-audit]]).

## Próximas extensões previstas

- `project-metrics.ts` quando aparecer 2ª tela com cálculo de progresso/SLA de projeto
- `client-metrics.ts` se ClientDetail crescer com mais agregações (LTV, NPS, etc)
