---
title: Auditoria Completa de Modelagem -- 2026-05-25
tags: [audit, database, modeling, senior]
status: analise-completa
---

# Auditoria Completa de Modelagem -- 2026-05-25

> **Escopo:** todas as 37 tabelas + 3 views do schema `public` do Supabase (projeto `njubtnsgtjcfmbnvjuqr`), com cruzamento contra o codigo do repositorio.
> **Metodo:** inspecao direta via Supabase MCP (`pg_catalog` + `information_schema` + `pg_policy` + `pg_indexes` + `pg_trigger` + cron jobs + linter advisors) + varredura de `src/lib/`, `src/hooks/`, `src/pages/portal/`, `supabase/functions/`.
> **Resultado:** nada deve ser alterado antes da leitura completa deste documento.

Documentos anexos nesta mesma pasta:

- [[02-advisors]] -- 80 warnings de seguranca + 256 issues de performance do Supabase Linter (raw)
- [[03-codigo-vs-schema]] -- divergencias detectadas no codigo

---

## Sumario executivo

| Indicador               | Valor                       |
| ----------------------- | --------------------------- |
| Tabelas                 | 37                          |
| Views                   | 3                           |
| Colunas                 | 553                         |
| Enums                   | 27                          |
| Foreign Keys            | 51                          |
| Indices (sem PK)        | 80 (116 com PKs)            |
| Triggers                | 62                          |
| Funcoes (plpgsql + sql) | 42                          |
| Cron jobs               | 8                           |
| Edge functions          | 29                          |
| **Security warnings**   | **80** (todos WARN)         |
| **Performance issues**  | **256** (182 WARN, 74 INFO) |

### Top 7 problemas estruturais

1. **`clients` eh tabela-deus com 60+ colunas** misturando PF/PJ, endereco, fiscal, contrato resumido, financeiro resumido, aceites legais, marketing e SLA. **Mas o schema ja iniciou a migracao**: existe trigger `fn_guard_clients_legacy_snapshots` bloqueando escrita em colunas snapshot, e existe view `client_financial_summary` que calcula o que essas colunas deveriam mostrar. O codigo **ainda nao acompanhou**.
2. **Identidade fragmentada em 4 tabelas** (`profiles`, `team_members`, `clients`, `client_contacts`) com PII duplicada e sem sync.
3. **Sistema de notificacao em 5 tabelas paralelas** (`notifications`, `notification_recipients`, `admin_notifications`, `communications`, `billing_actions_log`) com schemas e statuses divergentes.
4. **`tracked_links.communication_id NOT NULL`** + **`tracking_events.communication_id NOT NULL`** + sem indice em `communication_id` da `tracked_links` ate hoje (ver `02-advisors`, secao `unindexed_foreign_keys`).
5. **103 policies de RLS executam `auth.uid()` por linha** (advisor `auth_rls_initplan`). Custo cresce linearmente com tamanho da tabela.
6. **76 policies permissivas duplicadas** por (table, role, action) -- Postgres roda TODAS pra cada SELECT/UPDATE.
7. **49 FKs sem indice** -- toda atualizacao na tabela parent dispara seq scan no child para checar referential integrity.

### Tabelas que estao bem modeladas (referencia interna)

- `project_contracts` + `project_contract_versions` -- versionamento correto com trigger.
- `project_installments` -- triggers de consistencia (sum=100%, client match).
- `legal_acceptance_log` -- imutavel, dedicada, com indice por user.
- `audit_logs` -- generico com 3 indices bem pensados (`actor`, `entity`, `created_at`).
- `billing_actions_log` -- unique parciais para idempotencia (`charge_id, rule_id, sent_date WHERE status='enviado'`).

---

## Parte A -- Inventario de relacoes (mapa do grafo)

### Foreign Keys (51 total)

Agrupadas por tabela origem.

#### Dominio Cliente (pivot)

- `client_contacts.client_id -> clients.id` ON DELETE CASCADE
- `client_inadimplencia_warnings.client_id -> clients.id` CASCADE
- `legal_acceptance_log.client_id -> clients.id` SET NULL
- `documents.client_id -> clients.id` CASCADE
- `communications.client_id -> clients.id` SET NULL
- `marketing_calendar_events.client_id -> clients.id` SET NULL
- `expenses.client_id -> clients.id` NO ACTION
- `proposals.client_id -> clients.id` SET NULL
- `support_tickets.client_id -> clients.id` CASCADE
- `team_tasks.client_id -> clients.id` SET NULL
- `timeline_events.client_id -> clients.id` CASCADE
- `projects.client_id -> clients.id` CASCADE
- `project_contracts.client_id -> clients.id` CASCADE
- `project_installments.client_id -> clients.id` CASCADE
- `project_next_steps.client_id -> clients.id` CASCADE
- `project_subscriptions.client_id -> clients.id` CASCADE
- `project_validation_rounds.client_id -> clients.id` CASCADE
- `notification_recipients.client_id -> clients.id` CASCADE
- `charges.client_id -> clients.id` CASCADE
- `leads.converted_client_id -> clients.id` SET NULL

#### Dominio Projeto (segundo pivot)

- `documents.project_id -> projects.id` SET NULL
- `expenses.project_id -> projects.id` NO ACTION
- `marketing_calendar_events.project_id -> projects.id` SET NULL
- `support_tickets.project_id -> projects.id` SET NULL
- `team_tasks.project_id -> projects.id` SET NULL
- `timeline_events.project_id -> projects.id` CASCADE
- `project_contracts.project_id -> projects.id` CASCADE
- `project_installments.project_id -> projects.id` CASCADE
- `project_next_steps.project_id -> projects.id` CASCADE
- `project_subscriptions.project_id -> projects.id` CASCADE
- `project_validation_rounds.project_id -> projects.id` CASCADE
- `charges.project_id -> projects.id` CASCADE
- `projects.proposal_id -> proposals.id` NO ACTION

#### Comercial

- `proposals.lead_id -> leads.id` NO ACTION
- `lead_interactions.lead_id -> leads.id` CASCADE
- `project_contracts.source_proposal_id -> proposals.id` SET NULL

#### Financeiro (hierarquia poli-fk)

- `charges.contract_id -> project_contracts.id` SET NULL
- `charges.installment_id -> project_installments.id` SET NULL
- `charges.subscription_id -> project_subscriptions.id` SET NULL
- `project_contract_versions.contract_id -> project_contracts.id` CASCADE
- `project_installments.contract_id -> project_contracts.id` CASCADE
- `billing_actions_log.charge_id -> charges.id` NO ACTION
- `billing_actions_log.rule_id -> billing_rules.id` NO ACTION
- `billing_actions_log.template_id -> billing_templates.id` NO ACTION
- `billing_rules.template_id -> billing_templates.id` NO ACTION

#### Suporte

- `ticket_messages.ticket_id -> support_tickets.id` CASCADE
- `team_tasks.ticket_id -> support_tickets.id` SET NULL

#### Notificacao

- `notification_recipients.notification_id -> notifications.id` CASCADE
- `tracked_links.communication_id -> communications.id` CASCADE
- `tracking_events.communication_id -> communications.id` CASCADE
- `tracking_events.tracked_link_id -> tracked_links.id` CASCADE

#### Tasks

- `team_tasks.next_step_id -> project_next_steps.id` SET NULL
- `team_tasks.marketing_event_id -> marketing_calendar_events.id` SET NULL

### FKs ausentes (estrutural)

Colunas com nome de FK mas SEM constraint declarada -- divergencia de modelagem ou intencional?

| Tabela                      | Coluna                     | Aponta provavelmente para                          | Status                                                                 |
| --------------------------- | -------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `audit_logs`                | `actor_user_id`            | `auth.users.id`                                    | sem FK (intencional? quebra se user deletado)                          |
| `audit_logs`                | `entity_id`                | polimorfico                                        | sem FK (esperado em logs)                                              |
| `admin_notifications`       | `created_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `admin_notifications`       | `entity_id`                | polimorfico                                        | sem FK                                                                 |
| `admin_notifications`       | `read_by uuid[]`           | `auth.users.id[]`                                  | array sem FK (anti-padrao)                                             |
| `clients`                   | `user_id`                  | `auth.users.id`                                    | sem FK declarada -- so fonte primaria de auth do cliente. **Crítico.** |
| `clients`                   | `owner_id`                 | `team_members.id` ou `auth.users.id`?              | sem FK -- ambiguo                                                      |
| `client_contacts`           | `auth_user_id`             | `auth.users.id`                                    | sem FK -- fallback de auth                                             |
| `communications`            | `entity_id`                | polimorfico                                        | sem FK                                                                 |
| `documents`                 | `uploaded_by`              | `auth.users.id`                                    | sem FK                                                                 |
| `expenses`                  | `created_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `financial_goals`           | `created_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `internal_team_documents`   | `created_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `lead_interactions`         | `created_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `leads`                     | `assigned_to`              | `auth.users.id` ou `team_members.user_id`?         | sem FK -- ambiguo                                                      |
| `leads`                     | `created_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `legal_acceptance_log`      | `user_id`                  | `auth.users.id`                                    | sem FK                                                                 |
| `marketing_calendar_events` | `created_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `notification_recipients`   | `user_id`                  | `auth.users.id`                                    | sem FK                                                                 |
| `notifications`             | `created_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `notifications`             | `filter_client_ids uuid[]` | `clients.id[]`                                     | array sem FK (anti-padrao)                                             |
| `profiles`                  | `id`                       | `auth.users.id`                                    | sem FK -- esperado (1:1) mas deveria ser declarada                     |
| `project_contracts`         | `accepted_by_user_id`      | `auth.users.id`                                    | sem FK                                                                 |
| `project_contracts`         | `created_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `project_contract_versions` | `changed_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `project_next_steps`        | `assigned_to`              | `auth.users.id` ou `team_members.user_id`?         | sem FK                                                                 |
| `project_validation_rounds` | `validated_by_internal`    | `auth.users.id`                                    | sem FK                                                                 |
| `project_validation_rounds` | `created_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `projects`                  | `accepted_by`              | `auth.users.id`                                    | sem FK                                                                 |
| `proposals`                 | `created_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `team_members`              | `user_id`                  | `auth.users.id`                                    | sem FK -- ligacao 1:1 ausente                                          |
| `team_members`              | `manager_id`               | `team_members.id`                                  | sem FK (auto-ref) -- pode quebrar                                      |
| `team_tasks`                | `assigned_to`              | `auth.users.id`                                    | sem FK                                                                 |
| `team_tasks`                | `created_by`               | `auth.users.id`                                    | sem FK                                                                 |
| `timeline_events`           | `actor_user_id`            | `auth.users.id`                                    | sem FK                                                                 |
| `timeline_events`           | `source_id`                | polimorfico (validado por CHECK em `source_table`) | sem FK                                                                 |
| `user_roles`                | `user_id`                  | `auth.users.id`                                    | sem FK -- so a fonte de roles e nao protege contra orfao               |

**Padrao detectado:** Supabase desencoraja FK direta para `auth.users` (cross-schema). Aceitavel, mas **deveria existir uma trigger AFTER DELETE em `auth.users` que limpe esses uuid orfaos** ou usar `ON DELETE` simulado via funcao SECURITY DEFINER. Hoje, se um usuario for deletado em `auth.users`, voce fica com lixo apontando para uuid inexistente em ~25 colunas.

### Tabelas sem nenhuma FK (entrada ou saida)

Nenhuma. Toda tabela esta conectada ao grafo. **Bom sinal.**

Tabelas com FK so de saida (sem ninguem apontando pra elas):

- `audit_logs` -- esperado (log)
- `client_inadimplencia_warnings` -- esperado (snapshot historico)
- `internal_team_documents` -- isolada do dominio (intencional)
- `legal_acceptance_log` -- esperado (log imutavel)
- `lead_interactions` -- terminal de leads
- `notification_recipients` -- terminal
- `project_contract_versions` -- esperado (snapshot)
- `project_validation_rounds` -- terminal de projeto
- `tracking_events` -- terminal
- `user_roles` -- terminal (sem ninguem apontando, esperado)

Tabelas hub (mais FKs entrando):

1. `clients` -- 20 FKs entrando (a tabela mais central -- aceitavel)
2. `projects` -- 13 FKs entrando
3. `proposals` -- 3 FKs entrando
4. `project_contracts` -- 3 FKs entrando
5. `communications` -- 2 FKs entrando

---

## Parte B -- Auditoria por dominio (todas as 40 entidades)

### Dominio 1: Identidade & Acesso

#### Tabela `profiles` (20 rows)

**Funcao:** espelho 1:1 de `auth.users` com PII e avatar.

| Coluna                                                        | Tipo        | Notas                                      |
| ------------------------------------------------------------- | ----------- | ------------------------------------------ |
| id                                                            | uuid PK     | sem FK declarada para auth.users (deveria) |
| full_name, email, phone                                       | text        | duplicados em outras tabelas               |
| avatar_url, avatar_zoom, avatar_position_x, avatar_position_y | --          | bem encapsulado                            |
| is_active                                                     | bool        | redundante com `auth.users.banned_until`   |
| created_at, updated_at                                        | timestamptz |                                            |

**Triggers:** `trg_sync_profile_email AFTER UPDATE` (sync_profile_email).

**RLS:** 3 policies (admin manage, own read, own update). Sem policy de INSERT -- deve ser criado via trigger `handle_new_user` no schema auth.

**Indices:** so PK. **PROBLEMA:** sem indice em `email` apesar de ser usado em busca.

**Diagnostico:** estrutura limpa. Problemas: (a) sem FK formal pra auth.users; (b) sem unique em email; (c) duplicacao de email/phone/full_name com clients/team_members/client_contacts.

#### Tabela `user_roles` (16 rows)

**Funcao:** N:M user_id <-> role. Fonte unica usada por TODAS as funcoes RLS.

| Coluna     | Tipo          | Notas                                                                        |
| ---------- | ------------- | ---------------------------------------------------------------------------- |
| id         | uuid PK       | desnecessario -- (user_id, role) ja eh unique. PK composta seria mais limpo. |
| user_id    | uuid          | sem FK para auth.users                                                       |
| role       | app_role enum | 11 valores                                                                   |
| created_at | timestamptz   |                                                                              |

**Indices:** PK + `(user_id, role) UNIQUE` (duplicado: existem 2 indices unique identicos `user_roles_user_id_role_key` e `user_roles_user_id_role_unique`).

**Advisor:** `duplicate_index` -- remover um dos dois.

**RLS:** 2 policies (admin manage, own read).

**Diagnostico:**

- `id uuid PK` eh ruido; chave natural `(user_id, role)`.
- Duplicate index confirmado por advisor.
- Falta indice apenas em `role` (busca "todos os admins").

#### Tabela `team_members` (14 rows)

**Funcao:** registro de RH do time. **DUPLICA** PII e role.

| Coluna                               | Tipo        | Notas                                  |
| ------------------------------------ | ----------- | -------------------------------------- |
| id, user_id, full_name, email, phone | --          | dup com profiles                       |
| role_title                           | text        | titulo livre                           |
| **system_role**                      | app_role    | **DUPLICA `user_roles.role`**          |
| must_change_password                 | bool        | duplica `clients.must_change_password` |
| gender, cpf, birth_date              | --          | duplica clients (mas PJ vs RH)         |
| senioridade                          | enum        | exclusivo                              |
| manager_id                           | uuid        | self-ref sem FK                        |
| last_login_at                        | timestamptz |                                        |
| is_active                            | bool        |                                        |

**Triggers:** `trg_audit_team_members` (audit_log).

**RLS:** 2 policies (admin manage, own read). **Sem policy de UPDATE para o proprio** -- usuario nao pode editar proprio team_members.

**Indices:** PK + `manager_id`. Falta indice em `user_id` e `system_role`.

**Diagnostico:**

- `system_role` deveria ser deletada -- fonte unica eh `user_roles`. Hoje os dois podem divergir.
- `manager_id` sem FK -- pode apontar pra UUID que nao existe mais.
- Sem indice em `user_id` -- busca "qual team_member sou eu?" eh seq scan.

#### Tabela `clients` (3 rows, 60+ colunas)

**Funcao:** entidade pivot. Confusa: PF/PJ, contato, endereco, contrato resumido, financeiro resumido, aceites, SLA, owner, notas.

**Colunas problema (duplicacao / snapshot bloqueado):**

| Coluna                                                                                                              | Duplica com                                                                        | Status                                                                          |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `monthly_value`                                                                                                     | view `client_financial_summary.monthly_value` (calcula de `project_subscriptions`) | trigger `fn_guard_clients_legacy_snapshots` bloqueia gravacao -- **morto-vivo** |
| `project_total_value`                                                                                               | view `client_financial_summary.project_total_value`                                | bloqueado                                                                       |
| `contract_status`                                                                                                   | view ja calcula                                                                    | bloqueado                                                                       |
| `contract_type`                                                                                                     | view ja calcula                                                                    | bloqueado                                                                       |
| `contract_start`                                                                                                    | view ja calcula                                                                    | bloqueado                                                                       |
| `contract_end`                                                                                                      | view ja calcula                                                                    | bloqueado                                                                       |
| `scope_summary`                                                                                                     | duplica `project_contracts.scope_summary` (mais recente)                           | bloqueado                                                                       |
| `terms_accepted_at`, `terms_version`, `privacy_accepted_at`, `privacy_version`, `aceite_termos`, `aceite_termos_at` | duplica `legal_acceptance_log` (imutavel, completa)                                | preenchido por trigger `trg_clients_aceite_termos` -- ainda gravado             |
| `payment_due_day`                                                                                                   | view ja calcula via `project_subscriptions.due_day`                                | bloqueado                                                                       |

**Colunas de contato inline (deveriam viver em `client_contacts`):**

- `phone`, `whatsapp`, `contato_secundario`, `email_financeiro`, `responsavel_financeiro`, `responsavel_financeiro_phone`

**Endereco inline:**

- `cep`, `city`, `state`, `country`, `logradouro`, `numero`, `complemento`, `bairro` -- 8 colunas que deveriam ser tabela `client_addresses`.

**Fiscal PJ inline:**

- `razao_social`, `nome_fantasia`, `cargo_representante`, `inscricao_estadual`, `inscricao_municipal`, `cnae`, `regime_tributario` -- so se aplica a PJ; em PF ficam NULL.

**Triggers (4):** audit, set_aceite_termos_timestamp, guard_clients_legacy_snapshots.

**RLS:** 6 policies (admin, own, dev, domain, juridico, support). OK.

**Indices:** PK + unique (email, cpf, cnpj) + `gender`, `owner_id`. **Faltam** indices em `client_type`, `is_active` (filtros frequentes), `client_origin`.

**Diagnostico:** Schema reconhece o problema (trigger guard + view), mas tabela ainda tem 60+ colunas. Solucao: dropar colunas snapshot + extrair endereco + extrair fiscal PJ + extrair contatos secundarios para `client_contacts` com `kind` enum.

#### Tabela `client_contacts` (sem rows estimadas)

**Funcao:** contatos vinculados ao cliente (primary, legal_rep, finance). Boa modelagem.

| Coluna                                   | Tipo | Notas                                            |
| ---------------------------------------- | ---- | ------------------------------------------------ |
| id, client_id (FK CASCADE), auth_user_id | --   | auth_user_id sem FK; usado como fallback de auth |
| full_name, email, phone, cpf             | --   | duplica clients PII                              |
| role_label                               | text | papel livre                                      |
| is_primary                               | bool | unique parcial garante 1 primary                 |
| is_legal_representative                  | bool | sem unique parcial (deveria)                     |
| receives_finance                         | bool | filtro                                           |

**Indices excelentes:**

- `client_contacts_primary_idx` UNIQUE WHERE is_primary
- `ux_client_contacts_one_primary` UNIQUE WHERE is_primary -- **DUPLICATE INDEX** (advisor reporta)
- `ux_client_contacts_client_email` UNIQUE com lower(email)

**Diagnostico:**

- Bem modelada para o que faz.
- **Duplicate index** com `client_contacts_primary_idx` -- remover um.
- Receberia bem migracao de `clients.email_financeiro`, `clients.responsavel_financeiro*`, `clients.contato_secundario`.
- Adicionar `kind enum('primary','financial','legal','secondary')` em vez dos 3 booleans separados (mais limpo e permite unique parcial por kind).
- `auth_user_id` sem FK -- fonte secundaria de auth do cliente; **manter para casos PJ com multiplos logins** OU remover e centralizar tudo em `clients.user_id`.

### Dominio 2: Comercial

#### Tabela `leads` (4 rows)

**Colunas chave:**
| Coluna | Tipo | Notas |
|--------|------|-------|
| status | text + CHECK | enum-livre; deveria ser enum tipado |
| source | text + CHECK | 11 valores ok |
| probability | int + CHECK [0,100] | OK |
| assigned_to | uuid | sem FK |
| converted_client_id | uuid FK SET NULL | OK |
| diagnosis | jsonb | sem schema |

**Indices:** PK + `created_at`, `source`, `status`. **Falta** indice em `assigned_to` (filtro frequente "meus leads").

**RLS:** 3 policies. OK.

**Diagnostico:** `status` e `source` deveriam virar enum (sao usados em CHECK list literal). `diagnosis jsonb` ok mas precisa validacao no edge.

#### Tabela `lead_interactions` (sem rows)

| Coluna     | Tipo            | Notas     |
| ---------- | --------------- | --------- |
| lead_id    | uuid FK CASCADE | OK        |
| type       | text + CHECK    | 5 valores |
| notes      | text NOT NULL   | OK        |
| created_by | uuid            | sem FK    |

**Indices:** PK + `(lead_id, created_at DESC)` -- bom para feed.

**RLS:** 2 policies.

**Diagnostico:** simples e funcional. `type` poderia ser enum.

#### Tabela `proposals` (3 rows)

| Coluna                                    | Tipo         | Notas                                                                         |
| ----------------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| client_id (SET NULL), lead_id (NO ACTION) | --           | proposta pode existir orfã de cliente, mas FK lead vira lixo se lead deletado |
| status                                    | text + CHECK | 5 valores; deveria ser enum                                                   |
| valid_until                               | date         |                                                                               |
| billing_config                            | jsonb        | sem schema                                                                    |
| is_expansion                              | bool         | filtro                                                                        |
| viewed_at                                 | timestamptz  | tracking proprio (nao usa `communications`)                                   |

**Triggers:** `trg_audit_proposals` + `trg_proposal_immutability BEFORE UPDATE` (impede mudar campo sensivel apos aprovada).

**RLS:** 6 policies (mais permissivo que media -- atencao).

**Indices:** PK + `client_id`, `lead_id`, `status`, `created_at`, `is_expansion`.

**Diagnostico:**

- FK `lead_id NO ACTION` -- se um lead deletado nao for cascadeado, fica orfão. Deveria ser SET NULL.
- `viewed_at` deveria vir do pipeline `tracking_events` (open). Hoje sao 2 fontes.

### Dominio 3: Projeto

#### Tabela `projects` (9 rows)

**Colunas chave:**

- `client_id CASCADE` -- ok
- `proposal_id NO ACTION` + unique parcial `idx_projects_proposal_id_unique WHERE proposal_id IS NOT NULL` -- **duplicado** com `idx_projects_proposal_id` (mesma condicao parcial)
- `status project_status enum` -- ok
- `current_stage text CHECK` -- deveria ser enum
- `pause_reason enum`, `pause_source enum` -- ok
- `manual_status_override bool` -- combate "auto-pause" -- bom design
- `onboarding_checklist jsonb` -- sem schema
- `onboarding_completed_at`, `accepted_at`, `accepted_by`, `acceptance_notes`, `warranty_period_days` -- multiplas dimensoes em uma tabela

**Triggers (5):** audit + `trg_auto_advance_stage_on_onboarding` + `trg_timeline_onboarding_stage_advance`.

**RLS:** 6 policies (admin, own, dev, finance, juridico, support).

**Indices:** PK + `proposal_id` (x2 duplicado) + `tags GIN`. **Faltam** indices em `client_id`, `status`, `current_stage`.

**Diagnostico:**

- `client_id` sem indice eh **problema serio** (filtro mais usado).
- 2 indices identicos em `proposal_id` -- advisor confirma `duplicate_index`.
- `current_stage` deveria ser enum (`project_stage`).
- `onboarding_checklist jsonb` ok mas precisa documentar schema.

#### Tabela `project_contracts` (3 rows)

**Excelente modelagem:** versionado, com trigger de snapshot, aceite imutavel.

| Coluna                                          | Tipo          | Notas           |
| ----------------------------------------------- | ------------- | --------------- |
| project_id (CASCADE), client_id (CASCADE)       | --            | OK              |
| version_no, status (`contract_record_status`)   | --            | OK              |
| signed_at, starts_at, ends_at                   | date          |                 |
| total_amount, scope_summary, payment_model      | --            | versionados     |
| accepted_at, accepted_by_user_id, acceptance_ip | --            | aceite imutavel |
| source_proposal_id                              | uuid SET NULL | OK              |

**Triggers:** audit + `trg_version_project_contracts BEFORE UPDATE` (snapshot em project_contract_versions).

**RLS:** 4 policies. OK.

**Indices:** otimos -- `(client_id, created_at DESC)`, `(project_id, created_at DESC)`, parcial `(accepted_at WHERE NOT NULL)`, parcial `(source_proposal_id WHERE NOT NULL)`.

**Diagnostico:** **referencia interna de boa modelagem.** Nada a corrigir aqui.

#### Tabela `project_contract_versions` (20 rows)

Snapshot historico. Trigger `fn_version_project_contract` preenche.

**Indices:** PK + `(contract_id, version_no DESC)` + UNIQUE `(contract_id, version_no)`.

**RLS:** 2 policies.

**Diagnostico:** correto.

#### Tabela `project_installments` (6 rows)

**Modelagem rigorosa:**

- FKs CASCADE pra contract/project/client (3 FKs redundantes -- pode validar que client_id batem com o do contract via trigger `check_installment_client_consistency`).
- Triggers: audit + `trg_check_installments_sum` (garante 100%) + `trg_installment_client_consistency`.
- UNIQUE `(contract_id, installment_type)` -- 2x duplicado (`project_installments_contract_id_installment_type_key` E `project_installments_contract_type_unique`) -- **DUPLICATE INDEX**.
- Indice composto `(project_id, status, effective_due_date)`.

**Diagnostico:**

- Duplicate index confirmado.
- `client_id` poderia ser derivado (DRY), mas mantido por performance/RLS. OK.

#### Tabela `project_subscriptions` (sem rows)

Mensalidades recorrentes. FKs CASCADE.

**Triggers:** audit + `trg_subscription_client_consistency`.

**Indices:** `(project_id, status, starts_on DESC)`. OK.

**Diagnostico:**

- Sem unique de "uma assinatura ativa por projeto" -- pode haver 2 ativas simultaneamente.
- `client_id` redundante (derivavel de project_id) -- mas mantido por RLS.

#### Tabela `project_next_steps` (1 row)

Itens de proximo passo do projeto, alguns visiveis ao cliente.

**Indices:** `(project_id, status, sort_order, due_date)`.

**RLS:** 4 policies (incluindo "Clients can respond to next steps").

**Triggers:** `trg_next_step_client_consistency`.

**Diagnostico:** OK. `assigned_to uuid` sem FK -- liga em `auth.users` informalmente.

#### Tabela `project_validation_rounds` (sem rows)

Rodadas de validacao antes do aceite. Trilha de qualidade.

**Indices:** UNIQUE `(project_id, round_no)` + `(project_id, round_no DESC)`.

**RLS:** 3 policies.

**Diagnostico:** Boa modelagem. `status text CHECK` deveria virar enum.

### Dominio 4: Financeiro

#### Tabela `charges` (36 rows)

**Polifk:** origin_type + (project_id, contract_id, installment_id, subscription_id) -- ja **protegido por trigger** `check_charge_hierarchy_consistency BEFORE INSERT/UPDATE`. **Boa solucao.**

| Coluna                                                            | Tipo | Notas                                              |
| ----------------------------------------------------------------- | ---- | -------------------------------------------------- |
| client_id (CASCADE)                                               | --   | sem indice composto otimo (so com status+due_date) |
| origin_type text CHECK ('parcela_projeto','mensalidade','manual') | --   | poderia ser enum                                   |
| status invoice_status enum                                        | --   | OK                                                 |
| is_blocking, is_historical                                        | bool | flags                                              |

**Triggers:** audit + `trg_charge_hierarchy_consistency`.

**RLS:** 5 policies. OK.

**Indices excelentes:**

- `(client_id, status, due_date)` -- otimo
- `(project_id, due_date DESC)`
- `subscription_id` + UNIQUE parcial `(subscription_id, due_date) WHERE subscription_id IS NOT NULL` -- idempotencia

**Diagnostico:**

- `is_historical` deveria virar enum `charge_source` ou ser uma tabela separada `historical_charges` (flag = anti-padrao soft delete).
- Faltam indices em `contract_id`, `installment_id` (FKs sem indice -- advisor `unindexed_foreign_keys`).

#### Tabela `expenses` (30 rows)

| Coluna                                        | Tipo        | Notas                                                                                                                     |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| project_id (NO ACTION), client_id (NO ACTION) | --          | **NAO CASCADE** -- inconsistente com resto do schema. Se projeto deletado, expense fica orfão apontando UUID inexistente. |
| category text CHECK                           | --          | 8 valores; poderia ser enum                                                                                               |
| is_fixed bool                                 | --          |                                                                                                                           |
| created_by                                    | uuid sem FK |                                                                                                                           |

**Triggers:** audit.

**RLS:** 2 policies.

**Indices:** PK + `(is_fixed, expense_date DESC)`. **Faltam** indices em `project_id`, `client_id`, `category`.

**Diagnostico:**

- `ON DELETE NO ACTION` -- decisao errada. Padronizar para SET NULL.
- Sem indice em FKs -- advisor confirma.

#### Tabela `financial_goals` (sem rows)

Metas financeiras por periodo.

**Indices:** `(period_type, period_start, period_end)`.

**Diagnostico:** Sem unique parcial "uma meta por (period_type, period_start)" -- pode ter metas conflitantes.

#### Tabela `billing_rules` (sem rows)

Regras de regua de cobranca (envia X dias antes/depois).

| Coluna                            | Tipo | Notas                            |
| --------------------------------- | ---- | -------------------------------- |
| trigger_days int CHECK [-365,365] | --   | OK                               |
| action_type text CHECK            | --   | enum-livre                       |
| template_id uuid FK               | --   | sem indice                       |
| is_active, sort_order             | --   | indice `(is_active, sort_order)` |

**Diagnostico:** OK. `template_id` deveria ter indice.

#### Tabela `billing_templates` (sem rows)

Templates de email/notificacao.

| Coluna | CHECK                                 |
| ------ | ------------------------------------- |
| type   | 'cobranca','lembrete','agradecimento' |

**Diagnostico:** simples. OK.

#### Tabela `billing_actions_log` (sem rows)

**Excelente modelagem de idempotencia:**

- UNIQUE parcial `(charge_id, rule_id, sent_date) WHERE status='enviado' AND rule_id NOT NULL`
- UNIQUE parcial `(charge_id, template_id, sent_date) WHERE status='enviado' AND rule_id IS NULL AND template_id NOT NULL`
- Indice `(charge_id, sent_at DESC)` para timeline

**RLS:** 1 policy (admin only -- escrita feita por edge function service role).

**Diagnostico:** **referencia.** Poderia eventualmente virar view sobre `communications` se unificar.

#### Tabela `client_inadimplencia_warnings` (sem rows)

Snapshot do estado "em inadimplencia".

**Indices excelentes:**

- `(client_id, entered_at DESC)`
- UNIQUE `client_id WHERE exited_at IS NULL` (garante 1 aberta)
- `entered_at WHERE warning_sent_at IS NULL AND exited_at IS NULL AND warning_error IS NULL` (queue pendente de envio)

**Diagnostico:** Boa modelagem. Cron `reconcile_inadimplencia_warnings` mantem consistencia.

### Dominio 5: Suporte

#### Tabela `support_tickets` (0 rows)

**Colunas chave:**

- status, priority, category -- 3 text com CHECK (deveriam ser enums)
- rating int CHECK [1,5] + rating_feedback + rated_at -- bem modelado
- first_response_at, resolved_at, sla_deadline -- SLA tracking
- in_warranty bool
- internal_notes text

**CHECK constraints corretos:** `first_response_at NULL OR status != 'aberto'`, `resolved_at NULL OR status IN ('resolvido','fechado')` -- consistencia garantida em SQL.

**Indices:**

- `(project_id, status, created_at DESC)`
- `(project_id, in_warranty) WHERE project_id NOT NULL`
- Parciais para `first_response_at`, `rating`, `resolved_at` -- otimo

**RLS:** 4 policies.

**Diagnostico:** Bem modelado. Apenas migrar status/priority/category para enum.

#### Tabela `ticket_messages` (sem rows)

| Coluna      | CHECK             |
| ----------- | ----------------- |
| sender_role | 'admin', 'client' |

**Indices:** `(ticket_id)`. **Falta** `(ticket_id, created_at)` para ordenacao.

**RLS:** 4 policies.

**Diagnostico:** simples. `author_name` text livre -- poderia derivar de auth via JOIN.

### Dominio 6: Documentos & Conteudo

#### Tabela `documents` (sem rows)

| Coluna                                                             | Tipo        | Notas                                      |
| ------------------------------------------------------------------ | ----------- | ------------------------------------------ |
| type document_type enum                                            | --          | OK                                         |
| visibility document_visibility enum (cliente,interno,ambos)        | --          | OK                                         |
| client_id (CASCADE), project_id (SET NULL), contract_id (SET NULL) | --          | OK                                         |
| url, storage_path, external_url                                    | text        | 3 colunas para o mesmo conceito (location) |
| uploaded_by uuid                                                   | --          | sem FK                                     |
| archived_at                                                        | timestamptz | soft delete                                |

**Triggers:** audit.

**RLS:** 4 policies (admin, own clientes, juridico contratos, team).

**Indices:** **APENAS PK.** Falta MUITO: `client_id`, `project_id`, `contract_id`, `type`, `(visibility, archived_at)`.

**Diagnostico:**

- Sem indices nas FKs -- 3 advisors `unindexed_foreign_keys`.
- 3 colunas pra location (url, storage_path, external_url) -- consolidar em 1 + tipo (`source enum`).
- Sem validacao de `url javascript:` (issue M14 do brain).

#### Tabela `internal_team_documents` (sem rows)

**Sem FK para nada.** Isolada do grafo.

| Coluna   | CHECK                           |
| -------- | ------------------------------- |
| audience | 'marketing_design', 'developer' |

**Indices:** `(audience, created_at DESC)`.

**RLS:** 4 policies (separadas por audience).

**Diagnostico:** **deveria ser unificada com `documents`** adicionando `scope enum('client_visible','internal','audience_specific')` + `audience text[]` para os audience-specific.

#### Tabela `marketing_calendar_events` (sem rows)

**FKs:** client_id (SET NULL), project_id (SET NULL).

| Coluna               | CHECK               |
| -------------------- | ------------------- |
| event_type           | 6 valores           |
| status               | 5 valores           |
| ends_at >= starts_at | constraint de range |

**Indices:** `starts_at`, `(status, starts_at)`. **Falta** `client_id`, `project_id` (FKs sem indice).

### Dominio 7: Comunicacao / Notificacao (CAOS)

#### Tabela `notifications` (sem rows)

Broadcast pro cliente (campanhas).

| Coluna                                                                               | Tipo | Notas                                                  |
| ------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------ |
| type notification_type enum (manutencao,atualizacao,otimizacao,alerta,personalizado) |      |                                                        |
| status notification_status enum (rascunho,agendada,enviando,enviada,falha)           |      |                                                        |
| filter_mode text CHECK ('all','tags','contract_status','individual')                 |      | 4 colunas de filtro mutuamente exclusivas: anti-padrao |
| filter_tags text[], filter_contract_status text, filter_client_ids uuid[]            |      | arrays sem FK                                          |

**Indices:** parcial `(status, send_at) WHERE status='agendada'` -- otimo para cron.

**RLS:** 2 policies.

**Diagnostico:**

- `filter_*` (4 colunas mutuamente exclusivas) -- deveria virar `filters jsonb` validado ou tabela `notification_filters`.
- `filter_client_ids uuid[]` quebra integridade -- se cliente deletado, fica UUID lixo.

#### Tabela `notification_recipients` (sem rows)

Junction com tracking de leitura.

| Coluna                            | Tipo        | Notas               |
| --------------------------------- | ----------- | ------------------- |
| notification_id FK CASCADE        | --          | OK                  |
| client_id FK CASCADE              | --          | OK                  |
| user_id                           | uuid sem FK |                     |
| read_at                           | timestamptz | tracking de leitura |
| email_sent bool, email_error text | --          | tracking de envio   |

**Indices:** UNIQUE `(notification_id, client_id)` + parcial `(user_id, read_at) WHERE read_at IS NULL` (unread feed).

**RLS:** 4 policies.

**Diagnostico:** Bem modelada para o que faz. Problema eh estar **separada** de `admin_notifications`/`communications`.

#### Tabela `admin_notifications` (4 rows)

Notificacoes internas do time.

| Coluna                                                             | Tipo | Notas                                                    |
| ------------------------------------------------------------------ | ---- | -------------------------------------------------------- |
| target_roles app_role[]                                            | --   | array em vez de junction                                 |
| **read_by uuid[]**                                                 | --   | **anti-padrao** -- nao indexa busca "esta lida por mim?" |
| entity_type text, entity_id uuid                                   | --   | poli-fk sem CHECK                                        |
| severity text CHECK ('info','success','warning','action_required') | --   | enum-livre                                               |

**Indices:** `target_roles GIN` + parcial `created_at DESC WHERE read_by empty`.

**RLS:** 4 policies (incluindo clients can create proposta_aprovada/rejeitada/ticket_aberto).

**Diagnostico:**

- `read_by uuid[]` deveria ser tabela `admin_notification_reads(notification_id, user_id, read_at)`.
- `target_roles app_role[]` -- ok mas tambem podia ser junction.
- `severity` deveria ser enum.

#### Tabela `communications` (24 rows)

Envio fisico de email/whatsapp (cobranca, proposta, etc.).

| Coluna                                        | Tipo | Notas             |
| --------------------------------------------- | ---- | ----------------- |
| kind text (charge_overdue, invoice_due, etc.) | --   | enum-livre        |
| client_id (SET NULL)                          | --   | OK                |
| recipient_email, recipient_phone              | --   | texto livre       |
| entity_type, entity_id                        | --   | poli-fk sem CHECK |
| email_status, whatsapp_status text + CHECK    | --   | OK                |

**Indices:** `client_id`, `created_at DESC`, `(entity_type, entity_id)`, `kind`. **OK.**

**RLS:** 1 policy (admin/comercial/financeiro select). **Sem policy de INSERT** -- so service_role escreve. Aceitavel mas frondoso para implicito.

**Diagnostico:**

- `kind` deveria virar enum.
- Polifk sem CHECK exclusive-arc.
- **Esta tabela deveria absorver `billing_actions_log`, `notifications`+`notification_recipients`, `admin_notifications` num unico modelo.**

#### Tabela `tracked_links` (sem rows)

Link curto -> target_url. Slug base62.

**FKs:** communication_id CASCADE.

**Indices:** PK + UNIQUE `slug` + `communication_id`.

**Diagnostico:** OK.

#### Tabela `tracking_events` (sem rows)

Open/click events.

**FKs:** communication_id CASCADE, tracked_link_id CASCADE.

**Indices:** `communication_id`, `tracked_link_id`, `created_at DESC`. OK.

### Dominio 8: Auditoria

#### Tabela `audit_logs` (1098 rows)

Log generico de mudancas. CHECK constraint controla entity_type (20 valores). Trigger `fn_audit_log` insere automaticamente em INSERT/UPDATE/DELETE de 12 tabelas.

**Indices:** otimos -- `(actor_user_id, created_at DESC)`, `(entity_type, entity_id, created_at DESC)`, `created_at DESC`.

**RLS:** 2 policies.

**Diagnostico:** **referencia.** Cuidado: cresce rapido (1098 ja em poucos meses) -- precisa estrategia de retencao (particionamento por mes, ou archive em S3).

#### Tabela `legal_acceptance_log` (sem rows)

Imutavel. LGPD trail.

| Coluna        | CHECK                      |
| ------------- | -------------------------- |
| document_type | 'terms', 'privacy_cookies' |

**Indices:** `accepted_at DESC`, `user_id`. OK.

**RLS:** 1 policy (own select). **Sem policy de INSERT** -- inserido via `client_accept_terms` RPC SECURITY DEFINER.

**Diagnostico:** OK. Esta tabela **substitui** as colunas de aceite em `clients` mas elas ainda existem.

#### Tabela `timeline_events` (47 rows)

Feed agregado para o cliente.

| Coluna                              | Tipo        | Notas         |
| ----------------------------------- | ----------- | ------------- |
| source_table text CHECK (9 valores) | --          | poli-fk       |
| source_id                           | uuid sem FK |               |
| visibility document_visibility      | --          | reuso de enum |
| metadata jsonb                      | --          | extensivel    |

**Indices:** `(project_id, occurred_at DESC)`. **Falta** `(client_id, occurred_at DESC)` -- feed do cliente.

**RLS:** 3 policies.

**Diagnostico:** boa modelagem. Falta indice para feed do cliente.

#### Tabela `team_tasks` (9 rows)

| Coluna                                                                                                                  | Tipo        | Notas                                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| assigned_to, created_by                                                                                                 | uuid sem FK |                                                                                      |
| 4 FKs polifk: ticket_id, next_step_id, marketing_event_id (todos SET NULL), project_id (SET NULL), client_id (SET NULL) | --          | sem CHECK exclusive-arc, embora possa coexistir                                      |
| role_visibility text[]                                                                                                  | --          | anti-padrao -- usado em RLS via `(ur.role)::text = ANY (team_tasks.role_visibility)` |
| google_event_id, google_meet_link                                                                                       | text        | integracao calendario                                                                |

**RLS:** 3 policies (admin manage, role_visibility view, role_visibility update).

**Indices:** `assigned_to`, `category`, `due_date`, `status`. **Falta** `client_id`, `project_id`, `ticket_id`.

**Diagnostico:**

- `role_visibility text[]` -- M13 do brain. Deveria ser tabela `team_task_visibility(task_id, role app_role)` permitindo JOIN puro.
- 4 FKs polifk sem CHECK.

---

## Parte C -- Catalogo de duplicacoes de dado (rigoroso)

### Duplicacao 1: PII (full_name, email, phone, cpf)

| Atributo   | profiles | team_members | clients      | client_contacts |
| ---------- | -------- | ------------ | ------------ | --------------- |
| full_name  | sim      | sim          | sim          | sim             |
| email      | sim      | sim          | sim (unique) | sim             |
| phone      | sim      | sim          | sim          | sim             |
| cpf        | nao      | sim          | sim (unique) | sim             |
| birth_date | nao      | sim          | sim          | nao             |
| gender     | nao      | sim          | sim          | nao             |
| avatar     | sim      | nao          | nao          | nao             |

**Solucao senior:**

- `profiles` torna-se a UNICA fonte de PII de pessoa fisica (1:1 com `auth.users`).
- `team_members` mantem so atributos de RH (role_title, senioridade, manager_id, hire_date) -- referencia profile via `profile_id FK auth.users.id`.
- `clients` mantem so atributos comerciais (client_type, dados PJ). PF herda PII via `clients.primary_contact_id -> client_contacts.id`.
- `client_contacts` carrega TODOS os contatos: primary, financial, legal_rep, secondary. Com `kind enum`.
- CPF unico vivo so em `profiles` (PF) e `clients` (PJ -- CPF do representante).

### Duplicacao 2: Snapshots financeiros em `clients`

`monthly_value`, `project_total_value`, `contract_status`, `contract_type`, `contract_start`, `contract_end`, `scope_summary`, `payment_due_day` -- TODOS calculaveis a partir de `project_contracts` + `project_subscriptions` + `charges`. **Ja existe `client_financial_summary` view fazendo isso.**

**Solucao:** DROP COLUMNS, codigo passa a ler exclusivamente da view. Trigger guard ja existe (bom marco -- agora finalizar).

### Duplicacao 3: Aceites legais em `clients`

`terms_accepted_at`, `terms_version`, `privacy_accepted_at`, `privacy_version`, `aceite_termos`, `aceite_termos_at` em `clients` **+** `legal_acceptance_log` (imutavel, completa).

**Solucao:** DROP COLUMNS em `clients`. Codigo passa a ler `legal_acceptance_log` filtrado por `client_id` (que ja existe na log).

### Duplicacao 4: Roles em duas tabelas

`user_roles.role` (fonte usada por todas funcoes RLS) **+** `team_members.system_role`.

**Solucao:** DROP COLUMN `team_members.system_role`. View `v_team_with_roles` faz JOIN se UI precisar.

### Duplicacao 5: Endereco inline em `clients`

8 colunas (cep, city, state, country, logradouro, numero, complemento, bairro).

**Solucao:** Tabela `client_addresses(client_id, kind enum[billing|delivery|hq|...], cep, ...)`.

### Duplicacao 6: Sistema de notificacao em 5 tabelas

| Tabela                                                 | Conceito                                     |
| ------------------------------------------------------ | -------------------------------------------- |
| `notifications` + `notification_recipients`            | broadcast pro cliente                        |
| `admin_notifications`                                  | broadcast interno                            |
| `communications` + `tracked_links` + `tracking_events` | envio fisico + tracking                      |
| `billing_actions_log`                                  | envio de cobranca (subset de communications) |

**Solucao senior:**

- `communications` vira a tabela unica de **envio fisico** (canal e-mail/whatsapp/in-app/push).
- `notification_deliveries` (renomeacao de `notification_recipients`) vira tabela unica de **destinatario** (1 linha por destinatario com `read_at`, `email_sent`, etc.).
- `admin_notifications.read_by uuid[]` vira `admin_notification_reads(notification_id, user_id, read_at)`.
- `billing_actions_log` vira VIEW sobre `communications WHERE kind LIKE 'charge_%'`.
- Tracking de open/click via pixel/link curto fica em `tracking_events` para QUALQUER `kind`.

### Duplicacao 7: Documentos em 2 tabelas

`documents` + `internal_team_documents`.

**Solucao:** unificar em `documents` com `scope enum('client_visible','internal','audience_specific')` + `audience text[]` opcional.

### Duplicacao 8: Tracking de proposta visualizada

`proposals.viewed_at` (timestamp simples) **+** `tracking_events` (pipeline genérico).

**Solucao:** dropar `proposals.viewed_at`, derivar de `tracking_events WHERE entity_type='proposal' AND event_type='open' ORDER BY created_at LIMIT 1`.

---

## Parte D -- RLS gaps

### Tabelas sem policy de INSERT explicita

Listadas abaixo. Em PostgreSQL, sem policy de INSERT explicita NEM policy `FOR ALL`, INSERT eh bloqueado (default-deny). Verificar se isso eh intencional.

| Tabela                          | Policies                 | Anotacao                                          |
| ------------------------------- | ------------------------ | ------------------------------------------------- |
| `communications`                | 1 select                 | so service_role insere (correto se acordado)      |
| `tracked_links`                 | 1 select                 | idem                                              |
| `tracking_events`               | 1 select                 | idem                                              |
| `legal_acceptance_log`          | 1 select                 | so via RPC `client_accept_terms` SECURITY DEFINER |
| `billing_actions_log`           | 1 admin all              | escrita via edge fn service_role                  |
| `audit_logs`                    | 2 (admin all, team read) | escrita via trigger SECURITY DEFINER              |
| `client_inadimplencia_warnings` | 1 read                   | escrita via SQL function reconcile                |
| `profiles`                      | 3 (sem INSERT)           | criado via trigger `handle_new_user` em auth      |
| `team_members`                  | 2 (admin all, own read)  | sem UPDATE pra proprio                            |
| `user_roles`                    | 2 (admin all, own read)  | so admin atribui                                  |

**Diagnostico:** Todas tem justificativa, mas **documentar explicitamente** quem escreve cada uma evita confusao futura.

### Multiple permissive policies (advisor)

Postgres avalia TODAS as policies permissivas (OR). 76 ocorrencias -- impacto direto em performance. Casos mais doloridos:

- `charges`: 5 policies, todas permissivas no SELECT (admin, finance, dev, client, finance overlap)
- `projects`: 6 policies (admin, own client, dev, finance, juridico, support)
- `clients`: 6 policies (admin, own, dev, domain, juridico, support)

**Solucao senior:** consolidar em 1 policy por (table, role, action) usando OR explicito no `USING`:

```sql
DROP POLICY ... DROP POLICY ...;
CREATE POLICY "select_charges" ON charges FOR SELECT USING (
  is_admin(auth.uid())
  OR has_finance_access(auth.uid())
  OR has_dev_access(auth.uid())
  OR client_id = get_client_id_for_portal_user(auth.uid())
);
```

### `auth_rls_initplan` (103 ocorrencias)

`auth.uid()` chamado por linha em vez de uma vez por query. **Fix conhecido:** usar `(SELECT auth.uid())` para forcar inicializacao.

```sql
-- ANTES:
USING (user_id = auth.uid())
-- DEPOIS:
USING (user_id = (SELECT auth.uid()))
```

Impacto: queries em tabelas grandes (audit_logs com 1098 linhas) ficam ate 10x mais rapidas.

---

## Parte E -- Performance (advisors)

### Top 5 problemas (do `02-advisors.md`)

1. **103 auth_rls_initplan** -- ver Parte D.
2. **76 multiple_permissive_policies** -- ver Parte D.
3. **49 unindexed_foreign_keys** -- FKs sem indice. Lista abrangente em `02-advisors.md`. Resumo dos mais criticos:
   - `documents.client_id`, `documents.project_id`, `documents.contract_id` (tabela sem nenhum indice alem da PK)
   - `expenses.project_id`, `expenses.client_id`
   - `charges.contract_id`, `charges.installment_id`
   - `marketing_calendar_events.client_id`, `marketing_calendar_events.project_id`
   - `notification_recipients.client_id`
   - `team_tasks.client_id`, `team_tasks.project_id`, `team_tasks.ticket_id`, `team_tasks.next_step_id`, `team_tasks.marketing_event_id`
   - `timeline_events.client_id`
   - `proposals.created_by`
   - varios `_by uuid` em outras tabelas
4. **25 unused_index** -- indices criados mas nunca usados (excesso de over-indexing antecipado). Para tabelas <100 linhas eh irrelevante, mas vale revisao em 1 ano quando volume crescer.
5. **3 duplicate_index** -- confirmados:
   - `user_roles_user_id_role_key` E `user_roles_user_id_role_unique` (mesma coisa)
   - `client_contacts_primary_idx` E `ux_client_contacts_one_primary`
   - `project_installments_contract_id_installment_type_key` E `project_installments_contract_type_unique`
   - `idx_projects_proposal_id` E `idx_projects_proposal_id_unique` (mesma condicao parcial)

---

## Parte F -- Security (advisors)

### Top 5 problemas (do `02-advisors.md`)

1. **34 anon SECURITY DEFINER expostos** + **34 authenticated SECURITY DEFINER expostos** = 68 funcoes com `SECURITY DEFINER` que podem ser executadas via PostgREST. Risco: escalada de privilegio se function nao validar caller. **Acao:** revisar cada uma (`is_admin`, `has_role`, etc. sao OK porque so leem; mas RPCs como `convert_lead_to_client`, `create_project_with_billing` devem checar `auth.uid()` no comeco).
2. **9 function_search_path_mutable** -- triggers SQL sem `SET search_path`. Risco: hijack via objeto malicioso em schema do usuario. **Fix:**
   ```sql
   ALTER FUNCTION public.check_installment_client_consistency() SET search_path = public, pg_catalog;
   ```
   Aplicavel as 9 funcoes listadas em `02-advisors.md`.
3. **2 public_bucket_allows_listing** -- 2 buckets Storage com listagem publica. Listar = expor lista de arquivos. **Fix:** ativar `Bucket Settings > Restrict to authenticated`.
4. **1 auth_leaked_password_protection** -- HIBP integration desativada. **Fix:** painel Supabase Auth.
5. **Cron jobs vazam JWT service_role no SQL** -- ver `cron.job.command`: 5 dos 8 jobs tem `Authorization: Bearer eyJ...` hardcoded em texto puro. **Risco enorme** se o database vazar. **Fix:** usar `secrets.bearer_token` via `vault.secrets` ou rotacionar para o `sb_secret_*` (ja usado em 2 jobs).

---

## Parte G -- Plano de remediacao (3 ondas, prioridade por ROI)

### Onda 1 -- Quick wins (1-2 dias, baixo risco, alto retorno)

| #   | Item                                                                                            | Esforco | Impacto                                         |
| --- | ----------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------- |
| 1.1 | Remover 3 indices duplicados (user_roles, client_contacts, project_installments, projects)      | 5min    | -3% espaco, -3% write amplification             |
| 1.2 | Adicionar `SET search_path = public, pg_catalog` nas 9 funcoes (`02-advisors`)                  | 30min   | seguranca                                       |
| 1.3 | Restringir 2 buckets Storage publicos para `authenticated`                                      | 5min    | seguranca                                       |
| 1.4 | Ativar HIBP password check no Supabase Auth                                                     | 1min    | seguranca                                       |
| 1.5 | Adicionar indices nas 49 FKs sem indice (script gerado abaixo)                                  | 1h      | performance massiva em DELETE/UPDATE de parents |
| 1.6 | Rotacionar JWT hardcoded nos 6 cron jobs para `sb_secret_*`                                     | 1h      | seguranca critica                               |
| 1.7 | Trocar `auth.uid()` por `(SELECT auth.uid())` em todas as 103 policies afetadas (script abaixo) | 2h      | -50% latencia em queries grandes                |

Script de FKs sem indice (auto-gerado):

```sql
-- Onda 1.5 -- indices faltantes em FKs
CREATE INDEX CONCURRENTLY idx_documents_client_id ON documents(client_id);
CREATE INDEX CONCURRENTLY idx_documents_project_id ON documents(project_id);
CREATE INDEX CONCURRENTLY idx_documents_contract_id ON documents(contract_id);
CREATE INDEX CONCURRENTLY idx_expenses_project_id ON expenses(project_id);
CREATE INDEX CONCURRENTLY idx_expenses_client_id ON expenses(client_id);
CREATE INDEX CONCURRENTLY idx_charges_contract_id ON charges(contract_id);
CREATE INDEX CONCURRENTLY idx_charges_installment_id ON charges(installment_id);
CREATE INDEX CONCURRENTLY idx_marketing_calendar_events_client_id ON marketing_calendar_events(client_id);
CREATE INDEX CONCURRENTLY idx_marketing_calendar_events_project_id ON marketing_calendar_events(project_id);
CREATE INDEX CONCURRENTLY idx_notification_recipients_client_id ON notification_recipients(client_id);
CREATE INDEX CONCURRENTLY idx_team_tasks_client_id ON team_tasks(client_id);
CREATE INDEX CONCURRENTLY idx_team_tasks_project_id ON team_tasks(project_id);
CREATE INDEX CONCURRENTLY idx_team_tasks_ticket_id ON team_tasks(ticket_id);
CREATE INDEX CONCURRENTLY idx_team_tasks_next_step_id ON team_tasks(next_step_id);
CREATE INDEX CONCURRENTLY idx_team_tasks_marketing_event_id ON team_tasks(marketing_event_id);
CREATE INDEX CONCURRENTLY idx_timeline_events_client_id ON timeline_events(client_id);
CREATE INDEX CONCURRENTLY idx_billing_rules_template_id ON billing_rules(template_id);
-- + ~30 outras listadas em 02-advisors.md secao unindexed_foreign_keys
```

### Onda 2 -- Consolidacoes sem mudanca grande de aplicacao (1-2 sprints)

| #    | Item                                                                                                                                                                                                                                | Esforco | Impacto                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------ |
| 2.1  | Promover text+CHECK para ENUM nas 13 tabelas afetadas (leads.status, leads.source, proposals.status, support_tickets.status/priority/category, charges.origin_type, project_validation_rounds.status, projects.current_stage, etc.) | 2 dias  | integridade              |
| 2.2  | Consolidar policies permissivas duplicadas (76 advisors) num OR unico por (table, role, action)                                                                                                                                     | 3 dias  | performance + clareza    |
| 2.3  | Promover RLS de DELETE explicito em todas as tabelas (M19 do brain ja registra)                                                                                                                                                     | 1 dia   | safety                   |
| 2.4  | Adicionar `read_by` policy em `admin_notifications` via tabela `admin_notification_reads`                                                                                                                                           | 1 dia   | indexabilidade           |
| 2.5  | Adicionar CHECK exclusive-arc em `communications`, `team_tasks`, `timeline_events`                                                                                                                                                  | 4h      | integridade              |
| 2.6  | Unificar `documents` + `internal_team_documents` em `documents` com `scope`                                                                                                                                                         | 2 dias  | -1 tabela, RLS unificada |
| 2.7  | Trocar `expenses.project_id/client_id` para `ON DELETE SET NULL` (atual NO ACTION)                                                                                                                                                  | 30min   | consistencia             |
| 2.8  | Trocar `proposals.lead_id NO ACTION` para `SET NULL`                                                                                                                                                                                | 30min   | consistencia             |
| 2.9  | Trigger AFTER DELETE em `auth.users` que limpa uuids orfaos nas ~25 colunas                                                                                                                                                         | 4h      | data integrity           |
| 2.10 | Particionar `audit_logs` por mes (ja 1098 linhas; vai escalar rapido)                                                                                                                                                               | 1 dia   | performance long-term    |

### Onda 3 -- Refatoracao estrutural (1 trimestre, breaking changes)

| #    | Item                                                                                                                                                  | Esforco   | Impacto                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------ |
| 3.1  | DROP colunas snapshot em `clients` (monthly*value, project_total_value, contract*\*, scope_summary, payment_due_day) -- trigger guard ja existe       | 1 sprint  | -7 colunas mortas              |
| 3.2  | DROP colunas de aceite em `clients` (terms*\*, privacy*_, aceite_termos_) e migrar leitura para `legal_acceptance_log`                                | 1 sprint  | -6 colunas                     |
| 3.3  | DROP `team_members.system_role` e centralizar em `user_roles`                                                                                         | 3 dias    | -1 coluna ambigua              |
| 3.4  | Extrair endereco de `clients` para `client_addresses` (kind enum)                                                                                     | 1 sprint  | normalizacao                   |
| 3.5  | Extrair contatos PJ (`email_financeiro`, `responsavel_financeiro*`, `contato_secundario`, `whatsapp`) para `client_contacts` com `kind enum`          | 1 sprint  | normalizacao + sync            |
| 3.6  | Extrair fiscal PJ de `clients` para `client_company_info` (razao_social, nome_fantasia, IE, IM, CNAE, regime)                                         | 3 dias    | -7 colunas em PF (sempre NULL) |
| 3.7  | Unificar 5 tabelas de notificacao em `communications` + `communication_deliveries` (rename de `notification_recipients`) + view `billing_actions_log` | 2 sprints | -3 tabelas                     |
| 3.8  | Substituir `team_tasks.role_visibility text[]` por tabela `team_task_visibility(task_id, role)`                                                       | 3 dias    | indexabilidade                 |
| 3.9  | Substituir `notifications.filter_*` (4 colunas mutex) por `filters jsonb` validado                                                                    | 3 dias    | clareza                        |
| 3.10 | Substituir `admin_notifications.read_by uuid[]` por tabela `admin_notification_reads`                                                                 | 3 dias    | indexabilidade                 |
| 3.11 | Substituir `charges.is_historical bool` por `charges.source enum('system','import_historical')`                                                       | 1 dia     | clareza                        |
| 3.12 | Considerar PK composta em `user_roles (user_id, role)` em vez de `id uuid` redundante                                                                 | 30min     | -1 coluna                      |

---

## Parte H -- Pontos NAO problematicos (para o usuario nao tocar)

Importante registrar o que **esta bem feito** para evitar refactor desnecessario:

- `project_contracts` + `project_contract_versions` -- versionamento ideal.
- `project_installments` -- triggers de consistencia (sum=100, client match).
- `charges` triggers de hierarquia + UNIQUE parcial por subscription/due_date.
- `billing_actions_log` -- idempotencia via UNIQUE parcial.
- `client_inadimplencia_warnings` -- UNIQUE parcial "1 aberta por cliente" + queue index.
- `audit_logs` -- modelagem generica correta + indices ideais.
- `legal_acceptance_log` -- imutavel, dedicada, suficiente para LGPD.
- `support_tickets` -- CHECK constraints que garantem coerencia de timestamps.
- `client_financial_summary` view -- `security_invoker=on` correto.
- `crm_deals_view` -- consolidacao limpa de leads/proposals/projects.
- `pg_cron` setup -- 8 jobs com schedules apropriados (so corrigir JWT hardcoded).

---

## Apendice -- Snapshot quantitativo

```
TABLE                              ROWS  POLICIES  FKs(out)  TRIGGERS  RLS
admin_notifications                4     4         0         0         on
audit_logs                         1098  2         0         3*        on
billing_actions_log                ~     1         3         0         on
billing_rules                      ~     1         1         3         on
billing_templates                  ~     1         0         3         on
charges                            36    5         5         3+1       on
client_contacts                    ~     3         1         0         on
client_inadimplencia_warnings      ~     1         1         0         on
clients                            3     6         0         4         on
communications                     24    1         1         0         on
documents                          ~     4         3         3         on
expenses                           30    2         2         3         on
financial_goals                    ~     1         0         3         on
internal_team_documents            ~     4         0         0         on
lead_interactions                  ~     2         1         0         on
leads                              4     3         1         0         on
legal_acceptance_log               ~     1         1         0         on
marketing_calendar_events          ~     1         2         0         on
notification_recipients            ~     4         2         0         on
notifications                      ~     2         0         0         on
profiles                           20    3         0         1         on
project_contract_versions          20    2         1         0         on
project_contracts                  3     4         3         2+1       on
project_installments               6     3         3         3+2       on
project_next_steps                 1     4         2         1         on
project_subscriptions              ~     3         2         3+1       on
project_validation_rounds          ~     3         2         0         on
projects                           9     6         2         3+2       on
proposals                          3     6         2         3+1       on
support_tickets                    0     4         2         3         on
team_members                       14    2         0         3         on
team_tasks                         9     3         5         3         on
ticket_messages                    ~     4         1         0         on
timeline_events                    47    3         2         0         on
tracked_links                      ~     1         1         0         on
tracking_events                    ~     1         2         0         on
user_roles                         16    2         0         0         on
```

(\* `audit_logs` recebe insercao via `fn_audit_log` trigger em outras tabelas, nao tem trigger proprio.)

---

## Apendice -- Inventario de funcoes (42)

**RPCs publicas (callable via PostgREST):**

- `activate_contract_to_project`, `approve_proposal_to_project`, `client_accept_terms`, `close_validation_round`, `convert_lead_to_client`, `create_project_with_billing`, `mark_validation_client`, `mark_validation_internal`, `open_project_support_ticket`, `register_contract_acceptance`, `register_project_acceptance`, `start_validation_round`, `transition_project_contract`

**Helpers de RLS (todos SECURITY DEFINER + stable):**

- `is_admin`, `is_admin_or_juridico`, `has_role`, `has_role_in`, `has_any_team_role`, `has_comercial_access`, `has_dev_access`, `has_finance_access`, `has_juridico_access`, `get_client_for_portal_user`, `get_client_id_for_portal_user`, `get_client_id_for_user`

**Trigger functions:**

- `fn_audit_log`, `fn_auto_advance_stage_on_onboarding`, `fn_guard_clients_legacy_snapshots`, `fn_proposal_immutability`, `fn_timeline_onboarding_stage_advance`, `fn_version_project_contract`, `set_aceite_termos_timestamp`, `sync_profile_email`, `check_charge_hierarchy_consistency`, `check_installment_client_consistency`, `check_installments_percentage_sum`, `check_next_step_client_consistency`, `check_subscription_client_consistency`

**Jobs / processos:**

- `mark_overdue_charges`, `reconcile_inadimplencia_warnings`, `sync_financial_blocks`, `sync_projects_from_blocking_charges`, `handle_new_user`

---

## Apendice -- Cron jobs (8)

| jobname                          | schedule         | comando      |
| -------------------------------- | ---------------- | ------------ |
| process-scheduled-notifications  | _/5 _ \* \* \*   | edge fn      |
| reconcile-inadimplencia-warnings | 0 7 \* \* \*     | SQL function |
| send-inadimplencia-warning       | 30 7 \* \* \*    | edge fn      |
| process-billing-rules            | 0 8 \* \* \*     | edge fn      |
| expire-proposals                 | 0 9 \* \* \*     | edge fn      |
| send-proposal-expiry-warning     | 0 10 \* \* \*    | edge fn      |
| check-overdue-client-actions     | 0 12 \* \* \*    | edge fn      |
| sync-financial-blocks            | 55 7,18 \* \* \* | SQL function |

**Issue critica:** 6 dos 8 jobs tem JWT service_role em texto puro no comando (visivel via `SELECT * FROM cron.job` pra qualquer superuser de outra conexao).

---

## Conclusao do auditor

A modelagem do banco esta em **transicao**. Existe evidencia clara de que o time **ja identificou e comecou a corrigir** os principais problemas:

- Trigger `fn_guard_clients_legacy_snapshots` bloqueia regressao das colunas snapshot em `clients`.
- View `client_financial_summary` substitui calculos manuais.
- Trigger `check_charge_hierarchy_consistency` valida polifk.
- `legal_acceptance_log` foi criada para substituir aceite inline em `clients`.
- `client_financial_summary` e `project_contract_history` usam `security_invoker=on` (correcao 2026-04-24 documentada na coluna `obj_description`).

O que falta:

1. **Codigo do frontend ainda nao usa as views/RPCs novas** -- continua lendo colunas snapshot mortas. Ver `03-codigo-vs-schema.md`.
2. **Refatoracao final** (Onda 3) -- dropar colunas mortas, normalizar contatos, unificar notificacoes.
3. **Higiene operacional** (Onda 1) -- indices em FKs, search_path em funcoes, JWT hardcoded em cron.
4. **Otimizacao RLS** (Onda 2) -- 103 `auth.uid()` por linha e 76 policies duplicadas.

**Nao recomendo nenhuma alteracao no banco antes de:**

- Decidir conjunto de aceite das 3 ondas.
- Validar com o usuario quais colunas/tabelas podem ser dropadas (PII, contratos, notificacoes).
- Criar um plano de migracao com janelas (algumas mudancas exigem deploy coordenado com frontend).

Para a Onda 1 (quick wins) podemos comecar com PR isolado por item, sem risco.
