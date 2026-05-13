---
title: Issues — MOC (Bugs estruturais, débito, riscos)
tags: [issues, debt, moc]
---

# Issues — MOC

> Achados acionáveis. Cada item é uma nota dedicada com **Contexto, Impacto, Recomendação**. Severidade: 🔴 HIGH · 🟠 MEDIUM · 🟢 LOW.

## 🔴 HIGH

| #   | Issue                                                                     | Categoria      |
| --- | ------------------------------------------------------------------------- | -------------- |
| H1  | [[no-observability]] — Sem Sentry/PostHog em prod                         | observability  |
| H2  | [[no-tests-units-integration]] — Apenas E2E, sem Vitest                   | testing        |
| H3  | [[security-roles-in-db]] — Roles em `user_roles`, não JWT (SPOF)          | auth           |
| H4  | [[security-csp-missing]] — Sem Content-Security-Policy                    | security       |
| ~~H5~~ | ✅ Resolvido — [[_resolved/charges-status-agendada-stuck]] (cron promove `agendada → pendente`) | data-integrity |
| ~~H6~~ | ✅ Resolvido — [[_resolved/dead-pages]] (páginas reorganizadas em `src/pages/portal/admin/`)    | tech-debt      |
| H7  | [[colors-hardcoded-tasks]] — Tasks.tsx com 8+ cores Tailwind cruas        | DS             |
| H8  | [[no-staging-environment]] — `develop` sem host separado                  | DX/safety      |

## 🟠 MEDIUM

| #   | Issue                                                                               | Categoria      |
| --- | ----------------------------------------------------------------------------------- | -------------- |
| M1  | [[inputs-html-crus-admin]] — 10 arquivos admin com `<input>`/`<button>`             | DS             |
| M2  | [[over-fetching-admin-hooks]] — `useAdminClients` busca tudo, refetch invalida tudo | perf           |
| M3  | [[refetch-on-window-focus]] — global `true` causa storm de requests                 | perf           |
| M4  | [[cron-observability]] — Sem `cron_run_log`, sem alerting                           | observability  |
| M5  | [[border-inconsistency]] — `/50, /60, /70, /80` sem critério                        | DS             |
| M6  | [[card-padding-inconsistency]] — p-3 vs p-4 vs p-5                                  | DS             |
| M7  | [[client-pkpi-spacing-divergent]] — gap-2 vs gap-3 entre admin e cliente            | DS             |
| M8  | [[contactform-no-ds]] — ContactForm sem Field/Label/ErrorText                       | DS             |
| M9  | [[support-tickets-status-config-ad-hoc]] — `client/Support.tsx` sem StatusBadge     | DS             |
| M10 | [[is-team-member-flag-manual-union]] — fácil esquecer ao adicionar role             | auth           |
| M11 | [[smoke-check-superficial]] — apenas curl 200; não valida bundle hash               | deploy         |
| M12 | [[service-role-key-monolithic]] — chave shared por 24+ edge fns                     | security       |
| M13 | [[role-visibility-text-array]] — `team_tasks` confia em string match                | rls            |
| M14 | [[document-url-no-validation]] — `documents.url` aceita `javascript:`               | security       |
| M15 | [[autosave-localStorage-user-leak]] — drafts não prefixam por user.id               | privacy        |
| M16 | [[hero-cores-hardcoded]] — `text-[hsl(180,75%,60%)]` em 4 lugares                   | DS             |
| M17 | [[corrupt-pause-source-on-resume]] — `manual_status_override` é única defesa        | data-integrity |
| M18 | [[recharts-bundle-size]] — 108KB gzip; usado em poucas páginas                      | perf           |
| M19 | [[delete-policies-implicit]] — Postgres default sem `CREATE POLICY ... DELETE`      | rls            |
| M20 | [[is-historical-filter-inconsistent]] — algumas queries esquecem o filtro           | data-integrity |

## 🟢 LOW

| #   | Issue                                                                | Categoria |
| --- | -------------------------------------------------------------------- | --------- |
| L1  | [[dark-mode-contrast]] — `muted-foreground/60` ~5:1 em dark          | a11y      |
| L2  | [[no-skip-to-content]] — sem link `<a href="#main">`                 | a11y      |
| L3  | [[no-prefers-reduced-motion]] — animações sem media query            | a11y      |
| L4  | [[hexavatar-no-loading-lazy]] — sem `loading="lazy"` + width/height  | perf      |
| L5  | [[date-formatters-divergent]] — sem `formatBRDate()` único           | DS        |
| L6  | [[no-environment-banner]] — sem indicação de staging/dev visual      | DX        |
| L7  | [[tasks-priorities-hardcoded]] — `bg-red-500`, `bg-orange-500`, etc. | DS        |
| L8  | [[eyebrow-typography-divergent]] — `text-[10px]` vs `text-[11px]`    | DS        |

## Convenções

- Cada issue tem **link reverso** para [[../14-roadmap/index]] indicando onda alvo.
- Issues fechadas movem para `13-issues/_resolved/`.
- Use o agent `/security-review` ou `/review` para sugerir correções concretas.
