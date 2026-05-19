---
title: Key Tables (resumo)
tags: [database, schema]
---

# Key Tables (resumo)

> Referência rápida. Detalhes completos em `docs/DATABASE.md`. Cada linha aqui linka para sua nota de domínio.

## Identidade

- [[../02-domains/profiles|profiles]] — espelho de `auth.users`
- [[../02-domains/user-roles|user_roles]] — RBAC (11 roles)
- [[../02-domains/clients|clients]] — pivot pessoas
- [[../02-domains/client-contacts|client_contacts]]
- [[../02-domains/team-members|team_members]]

## Comercial

- [[../02-domains/leads|leads]] + `lead_interactions`
- [[../02-domains/proposals|proposals]]

## Projeto

- [[../02-domains/projects|projects]]
- `project_contracts` + `project_contract_versions`
- `project_installments` (50/50)
- `project_subscriptions`
- `project_next_steps`
- `project_validation_rounds`
- `project_onboarding_checklist`

## Financeiro

- [[../02-domains/charges|charges]] (centro)
- `expenses`
- `financial_goals`
- `billing_rules`, `billing_templates`, `billing_actions_log`
- `client_inadimplencia_warnings`

## Suporte

- [[../02-domains/support-tickets|support_tickets]] + `ticket_messages`

## Conteúdo

- `documents`
- `internal_documents`
- `marketing_calendar_events`

## Comunicação

- `notifications` + `notification_recipients`
- `admin_notifications`
- `team_tasks`
- `communications` + `tracked_links` + `tracking_events` — rastreio de e-mail (abertura/clique); ver [[../03-features/communication-tracking]]

## Auditoria

- `audit_logs`
- `legal_acceptance_log` (imutável)
- `automation_settings`
- `timeline_events`
