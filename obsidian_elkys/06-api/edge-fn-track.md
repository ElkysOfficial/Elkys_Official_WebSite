---
title: Edge fn — track
tags: [edge-fn, tracking, email, public]
---

# Edge fn — `track`

## Contexto

Endpoint público do rastreio de comunicação: encurtador de link (clique) +
pixel de abertura de e-mail. Chamado pelo navegador/cliente de e-mail do
destinatário — nunca pelo portal. Ver [[../12-decisions/ADR-012-communication-tracking]].

## Spec

| Campo        | Valor                                       |
| ------------ | ------------------------------------------- |
| Path         | `supabase/functions/track/index.ts`         |
| `verify_jwt` | `false` (rota pública, sem auth)            |
| Auth         | Nenhuma — endpoint público de propósito     |
| Métodos      | `GET` / `HEAD`                              |
| Acesso       | service role internamente (escreve eventos) |

## Rotas

Identifica a ação pelos **dois últimos segmentos** da URL — funciona tanto via
domínio curto `lnk.elkys.com.br/c/<slug>` quanto via URL crua do Supabase.

- `GET .../c/<slug>` → loga `tracking_events(event_type='click')`, responde
  **302** para o `target_url` do `tracked_link`. Slug inexistente → 302 para
  `FALLBACK_URL` (`https://elkys.com.br`).
- `GET .../o/<commId>.gif` → loga `tracking_events(event_type='open')`,
  responde **GIF 1×1** transparente com headers anti-cache.

## Princípios

- **Log best-effort** — falha ao gravar o evento nunca quebra o redirect nem
  deixa de devolver o pixel.
- **Dedup de abertura** — opens repetidos da mesma `communication` dentro de
  60 s são ignorados (reduz ruído de prefetch de imagem).
- IP via `x-forwarded-for`; user-agent via header.

## Infra do domínio curto

`lnk.elkys.com.br` é um subdomínio Hostinger apontado para
`public_html/lnk`, com um proxy PHP (`docs/lnk-proxy/index.php` + `.htaccess`)
que repassa a requisição para esta function preservando o caminho. Secret
`SHORT_LINK_BASE = https://lnk.elkys.com.br` (lido por `_shared/comms-tracking.ts`).

## Helper relacionado — `_shared/comms-tracking.ts`

`createCommunication()` cria 1 linha em `communications` e devolve:

- `pixelUrl` — embutir no HTML via `buildEmail({ pixelUrl })`.
- `shorten(url)` — cria `tracked_link` e devolve a URL curta.
- `finalize(ok)` — fecha `email_status` (`sent` / `failed`).

Em falha de banco entra em modo no-op (pixel vazio, `shorten` devolve a URL
original) — o e-mail sempre sai. As 17 funções `send-*` (exceto
`send-password-reset`) usam o helper.

## Problemas Identificados

🟠 **LGPD** — `tracking_events` persiste IP + user-agent sem política de
retenção definida.
🟢 **Abertura é sinal fraco** — proxy de imagem do Gmail/Apple Mail pode
inflar/atrasar; o clique é o sinal confiável.

## Relações

- [[../12-decisions/ADR-012-communication-tracking]]
- [[../03-features/communication-tracking]]
- [[index]]

## Referências

- `supabase/functions/track/index.ts`
- `supabase/functions/_shared/comms-tracking.ts`
- `supabase/functions/_shared/email-template.ts` (opção `pixelUrl`)
- `supabase/migrations/20260518120000_communication_tracking.sql`
- `docs/lnk-proxy/`
