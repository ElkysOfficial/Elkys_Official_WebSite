---
title: Feature — Communication Tracking
tags: [feature, email, tracking, system]
---

# Feature — Communication Tracking

## Contexto

Rastreio dos e-mails transacionais enviados pelo portal: saber **se foi
entregue**, **quem abriu** (pixel) e **quem clicou** no link de ação (link
encurtado). Entregue em 2026-05-18. Decisão e escopo em
[[../12-decisions/ADR-012-communication-tracking]].

## Componentes

| Camada    | Artefato                                                                   |
| --------- | -------------------------------------------------------------------------- |
| Tabelas   | `communications`, `tracked_links`, `tracking_events`                       |
| Migration | `supabase/migrations/20260518120000_communication_tracking.sql`            |
| Edge fn   | [[../06-api/edge-fn-track]] (`/c/<slug>` clique, `/o/<id>.gif` pixel)      |
| Helper    | `supabase/functions/_shared/comms-tracking.ts`                             |
| Template  | `_shared/email-template.ts` — `buildEmail({ pixelUrl })`                   |
| Infra     | `lnk.elkys.com.br` (subdomínio Hostinger + proxy PHP `docs/lnk-proxy/`)    |
| Dashboard | `src/pages/portal/admin/Communications.tsx` (`/portal/admin/comunicacoes`) |
| Dados     | `loadCommunications` / `loadTrackingEvents` em `src/lib/portal-data.ts`    |

## Fluxo

```
send-* envia e-mail
  └─ createCommunication()  → INSERT communications (email_status=pending)
       ├─ shorten(botãoUrl) → INSERT tracked_links → lnk.elkys.com.br/c/<slug>
       └─ pixelUrl          → lnk.elkys.com.br/o/<commId>.gif no HTML
  └─ sendEmail() (Resend)
  └─ finalize(ok)           → UPDATE communications.email_status

destinatário abre o e-mail → carrega o pixel → track loga open
destinatário clica no botão → track loga click → 302 para a URL real
  (lnk.elkys.com.br → proxy PHP → edge fn track)

dashboard cruza communications × tracking_events → taxas de entrega/abertura/clique
```

## Cobertura

17 funções `send-*` rastreadas (cobrança, proposta, contrato, documento,
projeto, ticket, notificação, boas-vindas). **`send-password-reset` fica de
fora** — link de auth não é encurtado nem rastreado, por segurança.

## Pontos de Atenção

🟠 **WhatsApp adiado** — schema tem `recipient_phone` / `whatsapp_status` e o
plano prevê `dispatch-whatsapp`, mas nada de WhatsApp foi implementado.
🟠 **LGPD** — `tracking_events` guarda IP + user-agent; falta política de retenção.
🟢 **Abertura é indicativa** — proxy de imagem (Gmail/Apple) distorce; o clique
é o sinal confiável. O dashboard avisa isso explicitamente.
🟢 **Drill-down por entidade** (abriu/clicou dentro de cada cobrança/proposta)
previsto no plano §9 mas ainda não feito.

## Relações

- [[../12-decisions/ADR-012-communication-tracking]]
- [[../06-api/edge-fn-track]]
- [[invoice-reminders]]
- [[notifications]]

## Referências

- `docs/PLAN-EMAIL-WHATSAPP-TRACKING.md`
- `supabase/migrations/20260518120000_communication_tracking.sql`
- `src/pages/portal/admin/Communications.tsx`
