---
title: ADR-012 — Rastreio de comunicação (encurtador próprio + pixel)
tags: [adr, backend, email, tracking]
status: accepted-partial
---

# ADR-012 — Rastreio de comunicação: encurtador próprio + pixel de abertura

## Contexto

Não havia como saber se/quando um cliente recebeu, abriu ou interagiu com os
e-mails transacionais enviados pelo portal (cobranças, propostas, documentos,
tickets). O plano `docs/PLAN-EMAIL-WHATSAPP-TRACKING.md` propôs dois sinais:

1. **Abertura** — pixel 1×1 invisível embutido no HTML do e-mail.
2. **Clique** — link de ação encurtado que faz redirect 302 logando o evento.

O plano também previa espelhar tudo no WhatsApp; essa parte foi **adiada**
(ver Consequências).

## Decisão

Implementado em 2026-05-18 (escopo: **abertura + clique**, sem WhatsApp):

- **3 tabelas** (`communications`, `tracked_links`, `tracking_events`) —
  migration `20260518120000_communication_tracking.sql`. RLS de SELECT só para
  papéis admin; escrita exclusiva via service role.
- **Edge function pública `track`** (`verify_jwt = false`): `/c/<slug>` loga
  clique + 302; `/o/<commId>.gif` loga abertura + GIF 1×1. Log é best-effort —
  falha de log nunca quebra redirect/pixel.
- **Helper `_shared/comms-tracking.ts`** — `createCommunication()` devolve
  `pixelUrl` + `shorten()` + `finalize()`. Em falha de banco, entra em modo
  no-op: o e-mail sempre sai.
- **Refatoração de 17 funções `send-*`** para usar o helper.
  `send-password-reset` ficou **de fora** por segurança (link de auth não é
  encurtado nem rastreado).
- **Encurtador no domínio próprio**: subdomínio `lnk.elkys.com.br` na Hostinger
  servindo um proxy PHP que repassa `/c/...` e `/o/...` para a function `track`.
- **Dashboard** `/portal/admin/comunicacoes` com taxa de entrega/abertura/clique.

## Alternativas

| Opção                                        | Por que não                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Encurtador de terceiros (bit.ly, invertexto) | Clique sairia do domínio Elkys e os dados de clique ficariam fora do banco — perderíamos o dashboard próprio. |
| Custom domain do Supabase para o encurtador  | Add-on pago; subdomínio Hostinger + proxy PHP é grátis.                                                       |
| Webhooks de abertura do Resend               | Cobre abertura, mas não clique no link de ação específico; e prende a métrica ao provedor.                    |
| Pixel sem encurtador (só abertura)           | Abertura é sinal fraco (proxy de imagem do Gmail/Apple); o clique é o sinal confiável.                        |

## Consequências

### Positivas

- Visibilidade de entrega/abertura/clique por comunicação e por tipo (`kind`).
- Encurtador e pixel no domínio Elkys — sem dependência de terceiros.
- Helper isola a complexidade: refatorar uma nova `send-*` é trivial.

### Negativas / débito

- **WhatsApp adiado** — `dispatch-whatsapp`, rota no Sonnar e colunas
  `recipient_phone`/`whatsapp_status` existem no schema mas não são usadas.
- **LGPD** — `tracking_events` guarda IP e user-agent (dado pessoal). Falta
  definir política de retenção/expurgo.
- **Abertura é indicativa** — proxy de imagem infla/atrasa a contagem; o
  dashboard deixa isso explícito.
- Mais uma função `verify_jwt = false` — soma ao débito de [[ADR-010-edge-fn-verify-jwt-false]].

## Relações

- [[ADR-010-edge-fn-verify-jwt-false]]
- [[../03-features/communication-tracking]]
- [[../06-api/edge-fn-track]]
- [[../06-api/index]]

## Referências

- `docs/PLAN-EMAIL-WHATSAPP-TRACKING.md`
- `supabase/migrations/20260518120000_communication_tracking.sql`
- `supabase/functions/track/index.ts`
- `supabase/functions/_shared/comms-tracking.ts`
- `src/pages/portal/admin/Communications.tsx`
