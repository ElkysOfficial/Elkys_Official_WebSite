---
title: Codigo vs Schema -- Divergencias detectadas
tags: [audit, code, schema, divergence]
---

# Codigo vs Schema -- 2026-05-25

Levantamento das gravacoes e leituras reais do codigo frontend e edge functions cruzadas com o schema. Coletado por subagente em `src/lib/portal-data.ts`, `src/hooks/**`, `src/pages/portal/**` e `supabase/functions/**`.

## 1. Auth source duplicado (clients.user_id vs client_contacts.auth_user_id)

- `src/lib/portal-data.ts:35-95` `resolveClientForUser()` faz fallback nas duas tabelas:
  - linha 58-66: lookup direto via `clients.user_id`
  - linha 72-78: fallback via `client_contacts.auth_user_id + is_primary=true`
- **Risco:** duas fontes de verdade simultaneas para "qual cliente este auth.user representa". Sem sincronia automatica entre elas; se um for atualizado sem o outro, o portal cliente carrega errado.

## 2. Snapshots financeiros em `clients` ja congelados, mas ainda lidos como fallback

- `src/hooks/useAdminClients.ts:25-26` faz SELECT explicito em `clients.monthly_value`, `clients.contract_status`, `clients.contract_end` (snapshots na propria tabela).
- `src/hooks/useAdminClients.ts:59-64` ALEM disso le da view `client_financial_summary` (calculo agregado de `project_subscriptions` + `project_contracts` + `charges`).
- `src/hooks/useAdminClients.ts:147-152` sobrescreve as colunas em `clients` com o valor da view antes de devolver -- mostra que o snapshot ja nao confiavel.
- Trigger `fn_guard_clients_legacy_snapshots` BEFORE INSERT/UPDATE em `clients` bloqueia gravacao das colunas legadas (audit nivel banco).
- **Risco:** colunas legadas (`monthly_value`, `contract_status`, `contract_start`, `contract_end`, `contract_type`, `scope_summary`) permanecem no schema atraindo escritas de codigo novo. Ja existe `client_financial_summary` que retorna o calculo correto -- a remocao das colunas eh segura mas o codigo ainda referencia.

Arquivos que referenciam essas colunas: `ClientDetail.tsx`, `Finance.tsx`, `ProjectCreate.tsx`, `RevenueByClient.tsx`, `client-summary.ts`.

## 3. Filtragem inconsistente de `charges.is_historical`

- `src/lib/sync-subscription-charges.ts:137,153` filtra `is_historical = false` APENAS em correcoes de status.
- `src/lib/sync-subscription-charges.ts:171` `upsert` ignora `is_historical` na conflict resolution -- pode reanimar carga historica.
- `src/hooks/useAdminCharges.ts:17-27` carrega TODAS as charges (sem filtro de `is_historical`).
- Sincronizacao usa filtro mas a UI mostra tudo. Existe indice unico parcial `idx_charges_subscription_due_date_unique WHERE subscription_id IS NOT NULL` que ja protege duplicacao mas nao discrimina historicas.

## 4. PII espalhada em multiplas tabelas sem sync

| Campo                | `clients`    | `client_contacts` | `profiles` | `team_members` |
| -------------------- | ------------ | ----------------- | ---------- | -------------- |
| email                | sim (unique) | sim               | sim        | sim            |
| phone                | sim          | sim               | sim        | sim            |
| cpf                  | sim (unique) | sim               | nao        | sim            |
| birth_date           | sim          | nao               | nao        | sim            |
| gender               | sim          | nao               | nao        | sim            |
| full_name            | sim          | sim               | sim        | sim            |
| avatar_url           | nao          | nao               | sim        | nao            |
| must_change_password | sim          | nao               | nao        | sim            |

- `src/pages/portal/admin/ClientCreate.tsx:398-441` escreve TUDO somente em `clients`.
- Edge function `send-charge-overdue:70-76` le `full_name, email, email_financeiro, phone, whatsapp, responsavel_financeiro_phone` de `clients`.
- `client_contacts` existe mas nao recebe sync -- contatos secundarios e financeiros do cliente moram em colunas inline em `clients` em vez de linhas em `client_contacts` com kind.

## 5. Contrato/assinatura duplicada entre `clients` e tabelas filhas

- Fonte transacional: `project_contracts` (com versionamento em `project_contract_versions`) + `project_subscriptions`.
- Snapshots em `clients`: `contract_status`, `contract_type`, `contract_start`, `contract_end`, `scope_summary` -- bloqueados por trigger mas presentes.
- View `client_financial_summary` (security_invoker=on) ja calcula tudo corretamente.
- `crm_deals_view` consolida leads + proposals + projects.
- **Conclusao:** schema ja preparou a migracao (trigger guard + view) mas codigo nao foi atualizado para usar apenas a view.

## 6. Sistema de notificacao fragmentado (4 tabelas)

- `notifications` + `notification_recipients` -- broadcast pro cliente (campanhas).
- `admin_notifications` (com `read_by uuid[]`) -- notificacoes internas pro time.
- `communications` + `tracked_links` + `tracking_events` -- envios fisicos (email/whatsapp) com tracking.
- `billing_actions_log` -- registra envios de cobranca.
- Codigo le e escreve em sistemas separados sem unificar conceito de "delivery". Tracking de abertura/clique so existe via `communications`/`tracked_links`/`tracking_events`. Notificacoes admin nunca passam por esse pipeline.

## 7. Documentos em duas tabelas separadas

- `documents` (visibilidade cliente/interno/ambos) -- vinculado a `clients`/`projects`/`project_contracts`.
- `internal_team_documents` (audience: marketing_design/developer) -- sem FK para nada.
- `src/lib/portal-data.ts:216-228` `loadDocumentsForProject()` consulta apenas `documents`.
- `src/pages/portal/admin/InternalDocuments.tsx` tem UI separada para `internal_team_documents`.
- **Risco:** Duas UIs, dois schemas paralelos para o mesmo conceito.

## 8. Autoridade de roles dividida

- `user_roles` (table de junction user_id+role) -- fonte usada por TODAS as funcoes RLS (`is_admin`, `has_role`, `has_finance_access`, etc.) e por `src/contexts/AuthContext.tsx`.
- `team_members.system_role app_role` -- coluna paralela em registro de RH.
- `src/pages/portal/admin/ClientCreate.tsx:447-449` escreve `user_roles` (role=cliente).
- `src/pages/portal/admin/TeamCreate.tsx` escreve `team_members.system_role`.
- **Sem sync**: criar um team_member nao adiciona linha em `user_roles` -- precisa fluxo separado (edge fn `create-user`).

## 9. FK polimorfica nao garantida em codigo

- `charges (origin_type, project_id, contract_id, installment_id, subscription_id)` -- ja existe trigger `check_charge_hierarchy_consistency` BEFORE INSERT/UPDATE que valida a hierarquia.
- `communications (entity_type, entity_id)` -- sem trigger, sem CHECK exclusive-arc.
- `team_tasks (ticket_id, next_step_id, marketing_event_id, project_id, client_id)` -- 4 FKs nullable, sem CHECK garantindo unicidade.
- `timeline_events (source_table, source_id)` -- ha CHECK em `source_table` validando enum mas nao FK polimorfica.

## 10. Edge functions: gravacoes nao auditadas

| Function                         | Tabelas escritas                                                  | Notas                                  |
| -------------------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| complete-first-access            | `clients`, `team_members`                                         | hardcoded `must_change_password=false` |
| create-user                      | (auth.users via admin API)                                        | nao toca tabela publica                |
| track                            | `tracking_events`, `tracked_links`                                | best-effort, falha silenciosa          |
| send-charge-overdue              | `communications`, `tracked_links`                                 | le `clients`, escreve communications   |
| send-invoice-due                 | `communications`, `tracked_links`                                 | idem                                   |
| process-billing-rules            | `charges`, `billing_actions_log`                                  | toca status + cria log idempotente     |
| expire-proposals                 | `proposals`                                                       | muda status                            |
| reconcile-inadimplencia-warnings | `client_inadimplencia_warnings`                                   | open/close pelo proprio SQL function   |
| sync-financial-blocks            | `charges`, `projects` (via `sync_projects_from_blocking_charges`) | sync de `is_blocking`                  |

## 11. Top 5 prioridades de remediacao (visao do agente)

1. Consolidar fonte auth: remover fallback em `client_contacts.auth_user_id`, usar RPC `get_client_id_for_portal_user`.
2. Remover (ou marcar deprecated com VIEW) as colunas snapshot em `clients` -- ja existe `client_financial_summary`.
3. Padronizar filtro `is_historical=false` em todas as leituras de `charges` no admin.
4. Definir `client_contacts` como fonte unica de contatos secundarios/financeiros, migrar email*financeiro/responsavel_financeiro*\* para linhas em `client_contacts`.
5. Unificar notificacoes (`notifications` + `admin_notifications` + `communications`) num modelo: `communications` para envio fisico, `*_deliveries` para destinatario.
