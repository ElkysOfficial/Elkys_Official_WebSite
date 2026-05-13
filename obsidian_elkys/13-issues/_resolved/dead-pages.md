---
title: 9 páginas órfãs em src/pages/
tags: [issue, high, tech-debt, dead-code]
severity: HIGH
---

# 🔴 H6 — Páginas órfãs em `src/pages/`

## Contexto

9 arquivos de página existem em `src/pages/admin/` mas **não são referenciados em `PortalRoutes.tsx`**. Algumas têm rota mas redirecionam para outro arquivo; outras são completamente _unreachable_.

## Lista

| Arquivo               | Status                                          |
| --------------------- | ----------------------------------------------- |
| `Delinquency.tsx`     | rota `/inadimplencia` redireciona               |
| `Expenses.tsx`        | rota `/despesas` redireciona para `/financeiro` |
| `FinanceGoals.tsx`    | **unreachable**                                 |
| `Leads.tsx`           | rota `/leads` redireciona                       |
| `Notifications.tsx`   | **unreachable**                                 |
| `Pipeline.tsx`        | rota `/pipeline` redireciona                    |
| `Proposals.tsx`       | rota `/propostas` redireciona                   |
| `RevenueByClient.tsx` | **unreachable**                                 |
| `Team.tsx`            | substituída por `TeamHub.tsx`                   |

## Impacto

- **Drift de mental model**: dev novo encontra `Notifications.tsx`, assume que está ativa, faz mudança em local errado.
- **Bundle bloat menor** — Vite pode ainda incluir esses módulos se importados em algum lugar; vale checar.
- **Dificulta refactor**: grep retorna múltiplos lugares.

## Recomendação

1. Mover unreachable (`FinanceGoals`, `Notifications`, `RevenueByClient`, `Team`) para `src/pages/_unused/` durante 1 sprint para validar.
2. Para os que apenas redirecionam, **consolidar** em rota canônica:
   - `/inadimplencia` → conteúdo direto na rota; remover Delinquency.tsx.
   - Idem `Leads`, `Pipeline`, `Proposals`, `Expenses`.
3. Após validar, deletar.
4. Adicionar **lint customizado** que detecta arquivos em `src/pages/` não importados em rotas.

## Onda

- 🔴 Onda 1 — limpeza barata.

## Relações

- [[../07-frontend/routing]]

## Referências

- `src/PortalRoutes.tsx` (linhas 95–429 admin)
- `src/pages/admin/`
