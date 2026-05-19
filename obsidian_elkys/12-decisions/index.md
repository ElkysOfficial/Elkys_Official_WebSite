---
title: ADRs — Decisões Arquiteturais
tags: [adr, decisions, moc]
---

# ADRs — Decisões Arquiteturais

| ID                                   | Título                                                 | Status                          |
| ------------------------------------ | ------------------------------------------------------ | ------------------------------- |
| [[ADR-001-no-third-party-ui]]        | Sem libs UI de terceiros (DS 100% autoral)             | Aceito                          |
| [[ADR-002-roles-in-db-not-jwt]]      | Roles em `user_roles`, não em JWT claims               | Aceito (com debt)               |
| [[ADR-003-supabase-cloud]]           | Supabase Cloud como backend único                      | Aceito                          |
| [[ADR-004-static-spa-hostinger]]     | SPA estática + Hostinger via FTP                       | Aceito                          |
| [[ADR-005-manualchunks-pitfall]]     | manualChunks por arquivo, não por objeto               | Aceito (corretivo)              |
| [[ADR-006-domain-based-rls]]         | RLS segregada por domínio (PA10–PA19)                  | Aceito                          |
| [[ADR-007-pt-br-everywhere]]         | Português brasileiro em todo conteúdo                  | Aceito                          |
| [[ADR-008-no-state-library]]         | Apenas React Context + React Query (sem Zustand/Redux) | Aceito                          |
| [[ADR-009-css-splitting-purgecss]]   | PurgeCSS para landing CSS-split + portal lazy          | Aceito                          |
| [[ADR-010-edge-fn-verify-jwt-false]] | `verify_jwt=false` em 11 funções (cron + portal)       | Aceito (debt monitorado)        |
| [[ADR-011-pkce-intended-route]]      | PKCE + intended route via `?redirect=` + safeRedirect  | Aceito (v2.97.5)                |
| [[ADR-012-communication-tracking]]   | Rastreio de e-mail: encurtador próprio + pixel         | Aceito (parcial — sem WhatsApp) |

Padrão: cada ADR contém Contexto → Decisão → Alternativas → Consequências.
