---
title: API Surface — MOC
tags: [api, edge-functions, moc]
---

# API Surface — MOC

## Contexto

Não há REST/GraphQL próprio. A "API" é composta por:

1. **Supabase RPC + tabelas** — chamadas diretas via `@supabase/supabase-js` (filtradas por RLS).
2. **27 Edge Functions Deno** (`supabase/functions/`) — operações que precisam de privilégio elevado, integração externa (Resend) ou são acionadas por cron.
3. **Helpers TypeScript** (`src/lib/portal-data.ts`) — wrappers tipados sobre o cliente Supabase, usados pelas páginas via React Query.

## Categorias

### Gestão de usuários (verify_jwt = false; valida admin manualmente)

- [[edge-fn-create-user]]
- [[edge-fn-delete-user]]
- [[edge-fn-update-user]]
- [[edge-fn-complete-first-access]]

### Email transacional (Resend)

> Visual compartilhado e tooling de preview: [[shared-email-template]].

- [[edge-fn-send-client-welcome]]
- [[edge-fn-send-team-welcome]]
- [[edge-fn-send-password-reset]]
- [[edge-fn-send-ticket-opened]]
- [[edge-fn-send-ticket-updated]]
- [[edge-fn-send-invoice-due]]
- [[edge-fn-send-installment-paid]]
- [[edge-fn-send-document-added]]
- [[edge-fn-send-charge-overdue]]
- [[edge-fn-send-proposal-sent]]
- [[edge-fn-send-proposal-expiry-warning]]
- [[edge-fn-send-project-created]]
- [[edge-fn-send-project-stage-changed]]
- [[edge-fn-send-project-completed]]
- [[edge-fn-send-contract-validation]]
- [[edge-fn-send-client-action-required]]
- [[edge-fn-send-inadimplencia-warning]]

### Automação (cron)

- [[edge-fn-process-billing-rules]]
- [[edge-fn-process-scheduled-notifications]]
- [[edge-fn-expire-proposals]]
- [[edge-fn-check-overdue-client-actions]]

### Notificações

- [[edge-fn-send-notification]]

### Integrações

- [[edge-fn-google-calendar-sync]]

### Rastreio de comunicação

- [[edge-fn-track]] — pública (`verify_jwt=false`): encurtador de link (`/c/<slug>`) + pixel de abertura (`/o/<id>.gif`). Ver [[../03-features/communication-tracking]] e [[../12-decisions/ADR-012-communication-tracking]].
- Helper `_shared/comms-tracking.ts` — `createCommunication()` (pixel + `shorten()` + `finalize()`), usado pelas 17 funções `send-*` (exceto `send-password-reset`).

### Helpers tipados (`src/lib/portal-data.ts`)

- `resolveClientForUser(userId)` → resolve `client_id` por dois caminhos
- `loadProjectsForClient`, `loadProjectById`
- `loadChargesForClient`, `loadChargesForProject`
- `loadContractsForProject`
- `loadInstallmentsForProject`
- `loadSubscriptionsForProject`
- `loadNextStepsForProject`
- `loadTimelineForProject`
- `loadDocumentsForProject`
- `loadSupportTicketsForClient`
- `loadCommunications` / `loadTrackingEvents` → dashboard de comunicações

## Padrões transversais

- **Auth header**: `Authorization: Bearer <session_token>` via `getSupabaseFunctionAuthHeaders()`.
- **Validação de admin**: `requireAdminAccess(req, CORS)` em `_shared/auth.ts` (timing-safe via `timingSafeEqualStr`).
- **Service role client**: `createServiceRoleClient()` para bypass de RLS server-side.
- **CORS**: header padrão exportado de `_shared/email-template.ts`.
- **Email**: `buildEmail()` + `sendEmail()` (Resend); secrets `RESEND_API_KEY`, `FROM_EMAIL`, `PORTAL_URL`.

## Problemas Identificados

🔴 **`verify_jwt = false` em 11 funções** — validação de admin é manual. Risco de regressão em refator se um dev esquecer `requireAdminAccess()` em uma rota mutativa.
🟠 **Service role key compartilhada por 24+ funções** — chave monolítica, todas permissões.
🟠 **Sem rate limit** explícito em Edge Functions; depende do throttle global do Supabase.
🟢 **Helpers em `portal-data.ts` retornam `{ data, error }`** mas algumas páginas ignoram `error`.

## Recomendações

1. Test de smoke em CI que chama cada edge function com token inválido e espera 401.
2. Considerar **scoped service-role keys** quando Supabase suportar.
3. Adicionar `try/catch` obrigatório em `portal-data.ts` consumers via lint rule.

## Relações

- [[../08-backend/edge-functions-architecture]]
- [[../10-security/auth-model]]
- [[../05-database/cron-jobs]]

## Referências

- `supabase/functions/`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/email-template.ts`
- `src/lib/portal-data.ts`
- `src/integrations/supabase/client.ts`
