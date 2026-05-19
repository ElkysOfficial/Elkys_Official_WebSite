---
title: Edge Functions — Arquitetura
tags: [backend, edge-functions]
---

# Edge Functions — Arquitetura

## Contexto

26 funções Deno hospedadas no Supabase. Substituem o que seria um backend Node tradicional.

## Categorização

| Categoria          | Funções                                                                                                                                                                                                                                                                                                                                                                                                | JWT                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| User mgmt          | create-user, delete-user, update-user, complete-first-access                                                                                                                                                                                                                                                                                                                                           | false (validação manual) |
| Email transacional | send-client-welcome, send-team-welcome, send-password-reset, send-ticket-opened, send-ticket-updated, send-invoice-due, send-installment-paid, send-document-added, send-charge-overdue, send-proposal-sent, send-proposal-expiry-warning, send-project-created, send-project-stage-changed, send-project-completed, send-contract-validation, send-client-action-required, send-inadimplencia-warning | varia                    |
| Cron / automação   | process-billing-rules, process-scheduled-notifications, expire-proposals, check-overdue-client-actions                                                                                                                                                                                                                                                                                                 | false (cron)             |
| Notificações       | send-notification                                                                                                                                                                                                                                                                                                                                                                                      | true                     |
| Integrações        | google-calendar-sync                                                                                                                                                                                                                                                                                                                                                                                   | true                     |

## Padrões shared (`_shared/`)

### `auth.ts`

- `requireAdminAccess(req, CORS)` — valida Bearer + role admin; retorna `{ adminClient }` ou Response 401/403.
- `requireAuthenticatedUser(req)` — valida Bearer (qualquer user); resolve `user.id`.
- `requireOperationalAccess` — variantes para `has_finance_access` / `has_dev_access` / `has_comercial_access`.
- `createServiceRoleClient()` — bypass RLS.
- `timingSafeEqualStr(a, b)` — comparação constant-time.
- `isServiceRoleRequest(req)` — header check para cron.

### `email-template.ts`

Visual + tooling de preview documentado em [[../06-api/shared-email-template]].

- `buildEmail({ preheader, title, greeting, body, highlight, button, note, warning, showInstitutional, showSecurityNote })` — HTML transacional Elkys (logo 110×29, roxo #472680, border-top teal, footer com copyright).
- `sendEmail({ to, subject, html, replyTo? })` — Resend; inclui header `List-Unsubscribe` RFC 8058; retorna `{ ok, error? }`.
- `CORS` — headers padrão.
- `getTimeGreeting()` — "Bom dia/Boa tarde/Boa noite".

> Preview local: `npm run preview:emails` gera `previews/<fn>.html` bit-exato a partir do template real.

### `validation.ts`

- `isValidEmail`, `isStrongPassword`, `escapeAndFormat` (escapeHtml + escapeAttr).

### `notification-sender.ts`

- `processNotification` — usado em `process-scheduled-notifications`.

### `greeting.ts`

- `getGenericGreeting` — fallback de saudação.

## Secrets

| Secret                      | Obrigatório         | Auto-injetado                                       |
| --------------------------- | ------------------- | --------------------------------------------------- |
| `SUPABASE_URL`              | sim                 | sim                                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | sim                 | sim                                                 |
| `RESEND_API_KEY`            | sim                 | não                                                 |
| `FROM_EMAIL`                | sim                 | não                                                 |
| `PORTAL_URL`                | não                 | não (default `https://elkys.com.br/portal/cliente`) |
| `TICKET_NOTIFY_EMAILS`      | não                 | csv                                                 |
| `INVOICE_DAYS_BEFORE`       | não                 | default `3`                                         |
| `GOOGLE_SERVICE_ACCOUNT_*`  | sim (calendar-sync) | não                                                 |

## Deploy

```bash
supabase functions deploy            # todas
supabase functions deploy create-user
# 11 funções precisam --no-verify-jwt:
supabase functions deploy complete-first-access --no-verify-jwt
# (config.toml já marca verify_jwt=false; flag --no-verify-jwt mantém consistência)
```

## Padrões de código

```ts
// Skeleton típico
import { CORS } from "../_shared/email-template.ts";
import { requireAdminAccess } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const guard = await requireAdminAccess(req, CORS);
  if (guard instanceof Response) return guard;
  const { adminClient } = guard;

  const body = await req.json();
  // ... lógica

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
```

## Problemas Identificados

🔴 **`verify_jwt=false` exige disciplina** — esquecer `requireAdminAccess` em uma rota mutativa abre bypass total.
🟠 **CORS permissivo (`*`)** — sem allowlist por origin.
🟠 **Secrets compartilhados (service role)** — chave monolítica.
🟢 **`google-calendar-sync` requer rotação anual** da service account key.

## Recomendações

1. **Lint customizado** ou test em CI: para cada função com `verify_jwt=false`, garantir presence de `requireAdminAccess` (ou `requireAuthenticatedUser`/`isServiceRoleRequest`) antes do primeiro `from()`.
2. **CORS allowlist por NODE_ENV**: prod = `https://elkys.com.br`, staging = futuro `staging.elkys.com.br`.
3. **Rotação de service role** quando Supabase suportar scoped keys.

## Relações

- [[../06-api/index]]
- [[../10-security/auth-model]]
- [[../05-database/cron-jobs]]
- [[../13-issues/service-role-key-monolithic]]

## Referências

- `supabase/functions/_shared/`
- `supabase/config.toml`
- `docs/EDGE-FUNCTIONS.md`
