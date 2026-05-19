---
title: Roadmap
tags: [roadmap, moc]
---

# Roadmap

## Contexto

Backlog priorizado por **ROI = valor × 1/esforço × 1/custoDB**, derivado da auditoria 2026-04-23 (`docs/AUDIT-2026-04-23.md`) + achados desta auditoria estrutural. Três ondas: dias, semanas, mês+.

## 🔴 Onda 1 — quick wins (dias)

### DS / UI

- [ ] Refatorar `Tasks.tsx` CATEGORIES/PRIORITIES para tokens — [[../13-issues/colors-hardcoded-tasks]]
- [ ] `BillingAutomation.tsx:346,501` `border-primary/30` → `border-border/70`
- [ ] ContactForm migrar para `<Field>`/`<Label required>`/`<ErrorText>` — [[../13-issues/contactform-no-ds]]
- [ ] Hero/Cases stats: `text-[hsl(180,75%,60%)]` → `text-accent` — [[../13-issues/hero-cores-hardcoded]]
- [ ] KPI cliente/admin: padronizar `gap-3 sm:gap-4` — [[../13-issues/client-pkpi-spacing-divergent]]
- [ ] ProposalView eyebrow `text-[10px]` → `text-[11px]` — [[../13-issues/eyebrow-typography-divergent]]
- [ ] Remover `/60` em toggle de senha de ChangePassword

### Admin QOL

- [ ] `ExportMenu` em Clientes, Contratos, Projetos, Cobranças
- [ ] Sidebar badges clicáveis → lista pré-filtrada
- [ ] Botão "Copiar link" em páginas de detalhe
- [ ] Botão "Ver histórico" contextual (apontando AuditLog filtrado)

### Cliente QOL

- [ ] SLA badge em Support ("respondemos em 24h úteis")
- [ ] CTA "Próximo passo" em Overview/Finance/Contracts
- [ ] Campo copyable de PIX + destaque vermelho em vencimento <7d
- [ ] Modal de sucesso + CTA pós-aceite de contrato

### Cross

- [ ] Skip-to-content em AdminLayout + ClientLayout — [[../13-issues/no-skip-to-content]]
- [ ] `@media (prefers-reduced-motion)` em `_utilities.scss` — [[../13-issues/no-prefers-reduced-motion]]
- [ ] `useSearchDebounce` aplicado em todos os filtros
- [ ] `width`/`height` + `loading="lazy"` em HexAvatar — [[../13-issues/hexavatar-no-loading-lazy]]
- [ ] Environment banner visível em staging/dev — [[../13-issues/no-environment-banner]]

### Data integrity

- [ ] Cron promover `agendada → pendente` — [[../13-issues/charges-status-agendada-stuck]]
- [ ] Limpar páginas órfãs (9 arquivos) — [[../13-issues/dead-pages]]

**Esforço total estimado:** 3–5 dias de dev focado.

## 🟠 Onda 2 — estruturais (1–2 semanas)

- [ ] Sentry browser + edge — [[../13-issues/no-observability]]
- [ ] Vitest para `lib/` e `hooks/`
- [ ] Custom claims `app_metadata.roles` no JWT — [[../13-issues/security-roles-in-db]]
- [ ] CSP básico no `.htaccess` — [[../13-issues/security-csp-missing]]
- [ ] Autosave em ClientCreate, LeadDetail, ContractEdit
- [ ] Inline edit de status em tabelas
- [ ] Perfil editável do cliente
- [ ] `pause_reason` visível em StatusBadge
- [ ] NPS pós-encerramento (`project_feedback`)
- [ ] JSON-LD dinâmico nas páginas públicas
- [ ] Atalhos globais (Cmd+K, "n", Esc)
- [ ] Undo em ações destrutivas (`deleted_at` em 2-3 tabelas)
- [ ] ContactForm: máscaras universais via `lib/masks.ts`
- [ ] Codemod inputs HTML crus → DS — [[../13-issues/inputs-html-crus-admin]]
- [ ] `cron_run_log` + alerting Discord — [[../13-issues/cron-observability]]
- [ ] Splittar `useAdminClients` em base + indicators — [[../13-issues/over-fetching-admin-hooks]]
- [ ] `staleTime: 30_000` global no queryClient

## 🟢 Onda 3 — features maiores (mês+)

- [ ] Busca global Cmd+K cross-entidade
- [ ] Bulk actions em listagens admin
- [ ] Timeline consolidada em ClientDetail
- [ ] Duplicar proposta/contrato como template
- [ ] Preferências de notificação do cliente
- [ ] Central de documentos do cliente
- [ ] Anexos em tickets
- [ ] Onboarding wizard do cliente
- [ ] PostHog (eventos)
- [ ] Export LGPD do cliente
- [ ] Cloudflare na frente do Hostinger
- [ ] Ambiente staging real
- [ ] 2FA admin obrigatório
- [ ] Refatorar `PortalProfilePage.tsx` (~445 LOC) em sub-componentes
- [ ] Refatorar `AdminLayout.tsx` (~450 LOC) em SidebarNav, AdminHeader, NotificationCenter
- [ ] Espelhar comunicações no WhatsApp (`dispatch-whatsapp` + Sonnar) — fases 4/5 de `docs/PLAN-EMAIL-WHATSAPP-TRACKING.md`; ver [[../03-features/communication-tracking]]
- [ ] Drill-down "abriu/clicou" por cobrança/proposta — plano §9, complementa [[../03-features/communication-tracking]]
- [ ] Política de retenção/expurgo de `tracking_events` (LGPD — IP/user-agent)

## Roadmap específicos

- [[billing-escalation]] (consolida `docs/ROADMAP-BILLING-ESCALATION.md`)
- [[admin-dashboard-roadmap]] (consolida `docs/ROADMAP.md`)
- [[backlog-pos-v2-92]] (consolida `docs/BACKLOG-POS-V2.92.md`)
