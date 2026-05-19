---
title: Shared Email Template (buildEmail)
tags: [api, edge-functions, shared, email, design-system]
---

# Shared Email Template (`buildEmail`)

## Contexto

Todas as 17 edge functions de email transacional + `notification-sender` (consumido por `send-notification`, `check-overdue-client-actions`, `process-scheduled-notifications`) renderizam HTML via `buildEmail()` em `supabase/functions/_shared/email-template.ts`. É a única fonte de visual dos emails Elkys — mudar aqui ecoa em 21 funções no próximo deploy.

## Descrição Técnica

### Assinatura

```ts
buildEmail({
  preheader: string,         // texto invisível usado como preview na inbox
  title: string,             // não renderizado no corpo (legado)
  greeting: string,          // primeira linha já com saudação ("Prezado(a) Sr...")
  body: string,              // HTML cru — chamador formata <p>, escapa
  highlight?: {              // bloco de credenciais / detalhes (cinza c/ border-radius 6)
    title: string,
    rows: { label: string; value: string }[],
  },
  button?: { label, href },  // CTA roxo (#472680, 200×42, border-radius 6, mso arcsize 14%)
  note?: string,             // parágrafo cinza abaixo do CTA — aceita HTML
  warning?: string,          // mesmo estilo do note (não é callout destacado)
  showInstitutional?: boolean, // parágrafo "A Elkys é especializada..." (welcome)
  showSecurityNote?: boolean,  // "Caso não reconheça este acesso..." (welcome, reset)
})
```

E os helpers exportados no mesmo arquivo: `sendEmail({ to, subject, html, replyTo? })` (Resend + `List-Unsubscribe` RFC 8058), `CORS`, `getTimeGreeting()`.

### Identidade visual atual (commit `aff4437`, 2026-05-15)

| Aspecto                | Valor                                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| Logo                   | `https://elkys.com.br/imgs/icons/lettering_elkys.webp` (110×29, no header roxo) |
| Roxo institucional     | `#472680` (header, footer, CTA, links)                                   |
| Acento (border-top card) | `#148f8f` (teal — usado também em callouts de feedback nos tickets/projeto-concluído) |
| Padding interno card   | `24px 24px 0 24px` (desktop) · `20px 16px 24px` (mobile)                 |
| Card                   | branco, border-top 3px teal, sem border-radius (cantos retos)            |
| Highlight (credenciais)| `bg #f7f7f7` + `border 1px #ddd` + `border-radius 6px`                   |
| Botão CTA              | `#472680`, 200×42, `border-radius 6px`, mso `arcsize 14%`                |
| Footer                 | roxo, ícones sociais (LinkedIn / Instagram / WhatsApp) + linha `© {ano} Elkys · elkys.com.br` |
| Email do `From`        | `Elkys <noreply@elkys.com.br>` (secret `FROM_EMAIL`)                     |
| Reply-To default       | `contato@elkys.com.br` (secret `REPLY_TO_EMAIL`)                         |

### Particularidades

- O `body` aceita **HTML cru** — o chamador formata `<p>` e escapa. Isso permite injetar `<strong>`, links inline, blocos de callout custom (ex: bloco de feedback NPS no `send-ticket-updated` evento `resolvido`, bloco de avaliação pós-entrega no `send-project-completed`), mas exige cuidado com `escapeHtml()` em valores dinâmicos.
- `highlight.rows` detecta automaticamente labels `/e-?mail/i` e troca a cor do valor para azul (`#1d4ed8`).
- Suporte a Outlook.com dark mode via classes `[data-ogsc] / [data-ogsb]`.
- Botão tem fallback VML/MSO para Outlook desktop.

## Preview local (dev)

`scripts/preview-emails.mjs` bundla o template real com esbuild e renderiza **21 HTMLs** em `previews/` — um por edge function — com payload representativo de produção. Roda via:

```bash
npm run preview:emails    # gera previews/ + previews/index.html
```

`previews/` e `scripts/.cache/` estão no `.gitignore`. Como o script bundla o `.ts` real, o output é **bit-exato** ao que sai em produção — não há risco de divergência preview vs prod.

## Consumidores

17 edge functions chamam `buildEmail` diretamente + 3 via `notification-sender.ts`:

- **Direto:** [[edge-fn-send-client-welcome]]‍, send-team-welcome, send-password-reset, send-proposal-sent, send-proposal-expiry-warning, send-contract-validation, send-project-created, send-project-stage-changed, send-project-completed, send-document-added, send-invoice-due, send-charge-overdue, send-installment-paid, send-inadimplencia-warning, send-client-action-required, send-ticket-opened, send-ticket-updated, [[edge-fn-process-billing-rules]]
- **Indireto** (via `_shared/notification-sender.ts`): send-notification, check-overdue-client-actions, process-scheduled-notifications

## Problemas Identificados

🟢 **Param `title` é dead code** — recebido mas nunca renderizado (legado). Pode ser removido em refactor futuro.
🟢 **`warning` não é visualmente distinto de `note`** — ambos renderizam como parágrafo cinza. O template Dashy tem callout amarelo `#FFF8E1` + border-left âmbar; portar essa diferenciação para Elkys daria UX melhor em emails de alerta (password-reset, charge-overdue).
🟢 **Body como HTML cru** — exige disciplina em escapar dados dinâmicos. Migrar para `paragraphs: string[]` + escape automático (padrão Dashy) eliminaria risco, mas é refactor invasivo nos 21 chamadores.

## Recomendações

1. Sempre que mudar o visual aqui, **rodar `npm run preview:emails` e revisar `previews/index.html`** antes do deploy — o preview é bit-exato.
2. Deploy é **manual e em lote**: cada um dos 21 consumidores precisa `supabase functions deploy <name> --project-ref njubtnsgtjcfmbnvjuqr` para que a mudança em `_shared/` seja bundlada na próxima invocação. Não há rebuild automático de funções que importam um shared modificado.
3. Quando adicionar nova edge function que envia email, **acrescentar payload no `SAMPLES` array** de `scripts/preview-emails.mjs` para preservar cobertura visual.

## Relações

- [[index|API Surface MOC]]
- [[../08-backend/edge-functions-architecture]]
- [[edge-fn-process-billing-rules]]

## Referências

- `supabase/functions/_shared/email-template.ts`
- `supabase/functions/_shared/notification-sender.ts`
- `scripts/preview-emails.mjs`
- `package.json` — script `preview:emails`
- Commit `aff4437` (2026-05-15) — refresh visual atual
