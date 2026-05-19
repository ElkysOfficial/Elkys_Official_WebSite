---
title: Routing
tags: [frontend, routing, guards]
---

# Routing

## Contexto

React Router 6.26. Definição em `src/App.tsx` (root) + `src/PortalRoutes.tsx` (porta de entrada do `/portal/*`). Total: **57 rotas** (9 públicas + 28 admin + 10 cliente + 2 auth-flow + 1 fallback + redirects).

## Mapa

### Rotas públicas (sem guard)

`/`, `/cases`, `/servicos/:slug`, `/como-trabalhamos`, `/terms-of-service`, `/privacy-policy`, `/cookie-policy`, `/login`, `/forgot-password`, `*`

> `Index.tsx` é importado de forma síncrona (não lazy) para preservar LCP do hero. Demais usam `React.lazy()`.

### Portal Admin (`/portal/admin/*`)

Guard chain: `ProtectedRoute(admin)` → `MustChangePasswordGuardAdmin` → `AdminLayout` → `PortalRoleGuard` (per-route).

28 páginas, agrupadas:

- **Dashboard**: `/portal/admin` (admin_super, admin)
- **CRM**: `/crm`, `/leads/:id`, `/propostas`, `/propostas/nova`, `/propostas/:id`, `/pipeline`
- **Clientes**: `/clientes`, `/clientes/novo`, `/clientes/:id`
- **Projetos**: `/projetos`, `/projetos/novo`, `/projetos/:id`, `/contratos`
- **Financeiro**: `/financeiro`, `/financeiro/nova-despesa`, `/inadimplencia`, `/receita-clientes`, `/metas`, `/cobranca-automatica`
- **Equipe**: `/equipe`, `/equipe/novo`, `/equipe/:id/editar`
- **Marketing**: `/calendario`, `/calendario/:domain`, `/tarefas`, `/tarefas/:domain`
- **Documentos**: `/documentos/marketing-design`, `/documentos/desenvolvedor`
- **Sistema**: `/audit-log`, `/suporte`, `/notificacoes`, `/comunicacoes`, `/perfil`, `/alterar-senha`

Lista completa com matriz de roles em [[../10-security/rls-model]] e `docs/PERMISSIONS.md`.

### Portal Cliente (`/portal/cliente/*`)

Guard chain: `ProtectedRoute(cliente)` → `MustChangePasswordGuard` → `TermsAcceptanceGuard` → `ClientLayout`.

10 páginas:

- `/`, `/propostas`, `/propostas/:id`, `/contratos`, `/projetos`, `/projetos/:id`, `/financeiro`, `/suporte`, `/perfil`, `/alterar-senha`

> `/portal/cliente/documentos` redireciona para `/portal/cliente/projetos` (legacy).

## Guards

| Guard                          | Arquivo                                 | Função                                                                         |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------ | ---- | -------- |
| `ProtectedRoute`               | `auth/ProtectedRoute.tsx`               | Verifica `user` + `requiredRole` (admin                                        | team | cliente) |
| `MustChangePasswordGuard`      | `auth/MustChangePasswordGuard.tsx`      | Cliente: `clients.must_change_password`                                        |
| `MustChangePasswordGuardAdmin` | `auth/MustChangePasswordGuardAdmin.tsx` | Equipe: `team_members.must_change_password`                                    |
| `TermsAcceptanceGuard`         | `auth/TermsAcceptanceGuard.tsx`         | Cliente: `terms_version` vs `LEGAL_VERSION` (modal bloqueante)                 |
| `PortalRoleGuard`              | `auth/PortalRoleGuard.tsx`              | Per-route: `roles.some(r ∈ allowedRoles)`; redirect via `getDefaultAdminRoute` |

Detalhe em [[../04-flows/auth-flow]].

## Páginas órfãs (dead code) — 9 arquivos

Arquivos existem em `src/pages/` mas **não são roteados**:

- `Delinquency.tsx`, `Expenses.tsx`, `FinanceGoals.tsx`, `Leads.tsx`, `Notifications.tsx`, `Pipeline.tsx`, `Proposals.tsx`, `RevenueByClient.tsx`, `Team.tsx`

Alguns têm rotas redirect (Delinquency, Expenses, Leads, Pipeline, Proposals); outros são unreachable. Ver [[../13-issues/dead-pages]].

## Problemas Identificados

🔴 **9 páginas órfãs** geram confusão em busca de código e drift entre componente e o que está em produção.
🟠 **Redirect chains** (`/despesas` → `/financeiro` com state) — 2 hops de Router. Pequeno custo, mas adiciona complexidade.
🟢 **`PortalRoleGuard` redirect silencioso** — sem trace por que usuário caiu em outra rota.

## Recomendações

1. **Deletar** páginas órfãs ou movê-las para `_unused/` durante uma sprint.
2. Substituir redirect chains por **rota canônica** quando possível.
3. Logar `console.warn('[PortalRoleGuard] redirect', { from, to, missingRoles })` em dev.

## Relações

- [[../04-flows/auth-flow]]
- [[../10-security/rls-model]]
- [[../13-issues/dead-pages]]
- [[admin-pages]]
- [[client-pages]]

## Referências

- `src/App.tsx`
- `src/PortalRoutes.tsx`
- `src/components/portal/auth/`
- `src/lib/portal-access.ts`
