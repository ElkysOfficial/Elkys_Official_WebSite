# Plano — Rastreio de Comunicação (Encurtador + Pixel) e Disparo via WhatsApp

> **Status:** Parcialmente implementado (2026-05-18) — rastreio de **abertura + clique**
> entregue (encurtador, pixel, helper, refatoração das `send-*`, dashboard).
> A parte de **WhatsApp** (`dispatch-whatsapp`, Sonnar, fase 4/5) **não** foi feita.
> **Branch alvo:** `develop` (nunca direto em `main`/produção).
> **Data do plano:** 2026-05-18.
> **Repos envolvidos:**
>
> - `Elkys_Official_WebSite` (este) — Supabase, edge functions, dashboard.
> - `Sonnar_Scraping` (`C:\Users\lcvsilva\Desktop\Sonnar_Scraping`) — bot de WhatsApp.

---

## 1. Objetivo

Saber **se e quando** o cliente recebeu/abriu/clicou em qualquer comunicação enviada
pela Elkys (cobranças, propostas, documentos, notas fiscais, código-fonte, tickets, etc.),
e **espelhar todo envio de e-mail também no WhatsApp**.

Resultado final:

- Toda comunicação que hoje sai só por e-mail passa a sair **por e-mail + WhatsApp**.
- Cada envio gera métricas de **entrega**, **abertura** e **clique**.
- Dashboard no portal admin com gráficos e métricas.

---

## 2. Conceitos — dois sinais distintos

| Sinal              | Mecanismo                                     | O que prova                   |
| ------------------ | --------------------------------------------- | ----------------------------- |
| **Abriu o e-mail** | Pixel de rastreio (GIF 1×1 invisível no HTML) | Cliente abriu o e-mail        |
| **Clicou no link** | Link encurtado (redirect 302 com log)         | Cliente clicou para ver/pagar |
| **Entregue**       | Resposta do Resend / status do bot WhatsApp   | Mensagem saiu sem erro        |

Decisão confirmada: **implementar abertura + clique** (os dois).

> Ressalvas conhecidas: clientes de e-mail com proxy de imagem (Gmail/Apple Mail)
> podem inflar/atrasar a contagem de abertura. O clique é o sinal mais confiável;
> a abertura é indicativa.

---

## 3. Arquitetura geral

```
                 ┌─────────────────────────────────────────┐
                 │  Edge Functions de envio (send-*)        │
                 │  refatoradas para usar comms-tracking.ts │
                 └───────────────┬─────────────────────────┘
                                 │
              ┌──────────────────┼───────────────────┐
              ▼                  ▼                   ▼
      cria tracked_link    embute pixel no     dispatch-whatsapp
      + short link no       HTML do e-mail      (chama Sonnar)
      botão do e-mail
              │                  │                   │
              ▼                  ▼                   ▼
   ┌──────────────────┐  ┌───────────────┐  ┌──────────────────────┐
   │  Resend (e-mail) │  │ track (pixel) │  │ Sonnar_Scraping bot  │
   └──────────────────┘  └───────────────┘  └──────────────────────┘
              │                  │                   │
              └──────────────────┴───────────────────┘
                                 ▼
                    tracking_events  (Supabase)
                                 ▼
                    Dashboard admin (gráficos)
```

---

## 4. Banco de dados (Supabase)

Nova migration em `supabase/migrations/`. Tabelas:

### 4.1 `communications`

Um registro por mensagem enviada (e-mail e/ou WhatsApp).

| Coluna            | Tipo              | Notas                                                                                               |
| ----------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `id`              | uuid PK           |                                                                                                     |
| `kind`            | text              | `invoice_due`, `charge_overdue`, `proposal_sent`, `document_added`, etc. (= nome lógico do send-\*) |
| `client_id`       | uuid FK → clients | nullable (alguns envios são para team)                                                              |
| `recipient_email` | text              |                                                                                                     |
| `recipient_phone` | text              | nullable                                                                                            |
| `entity_type`     | text              | `charge`, `proposal`, `document`, `project`, `ticket`...                                            |
| `entity_id`       | uuid              | id da cobrança/proposta/etc. para cruzar no dashboard                                               |
| `email_status`    | text              | `sent` / `failed` / `skipped`                                                                       |
| `whatsapp_status` | text              | `sent` / `failed` / `skipped` / `pending`                                                           |
| `created_at`      | timestamptz       | default now()                                                                                       |

### 4.2 `tracked_links`

Um link curto por destino rastreável.

| Coluna             | Tipo                     | Notas                                    |
| ------------------ | ------------------------ | ---------------------------------------- |
| `id`               | uuid PK                  |                                          |
| `slug`             | text UNIQUE              | ~7 chars, base62                         |
| `communication_id` | uuid FK → communications |                                          |
| `target_url`       | text                     | URL longa real (portal, pagamento, etc.) |
| `channel`          | text                     | `email` / `whatsapp`                     |
| `created_at`       | timestamptz              |                                          |

### 4.3 `tracking_events`

Eventos brutos de abertura/clique.

| Coluna             | Tipo        | Notas                         |
| ------------------ | ----------- | ----------------------------- |
| `id`               | uuid PK     |                               |
| `communication_id` | uuid FK     |                               |
| `tracked_link_id`  | uuid FK     | nullable (pixel não tem link) |
| `event_type`       | text        | `open` / `click`              |
| `channel`          | text        | `email` / `whatsapp`          |
| `ip`               | inet        | nullable                      |
| `user_agent`       | text        | nullable                      |
| `created_at`       | timestamptz |                               |

### 4.4 RLS

- `communications`, `tracked_links`, `tracking_events`: **SELECT** apenas para roles admin
  (seguir padrão de `obsidian_elkys/10-security/rls-model.md`).
- **INSERT/UPDATE**: apenas via service role (edge functions). Nenhum acesso anon.
- A função `track` consulta/escreve com service role — nunca expõe a tabela ao público.

### 4.5 Índices

- `tracked_links(slug)` único.
- `tracking_events(communication_id)`, `tracking_events(created_at)`.
- `communications(entity_type, entity_id)`, `communications(created_at)`, `communications(kind)`.

---

## 5. Edge Functions novas

### 5.1 `track`

Rota pública (sem JWT). Dois caminhos:

- `GET /track/c/:slug` → loga `tracking_events(event_type='click')`, responde **302** para `target_url`.
- `GET /track/o/:commId.gif` → loga `tracking_events(event_type='open')`, responde **GIF 1×1**
  com headers anti-cache (`Cache-Control: no-store`).

Cuidados:

- Idempotência leve: deduplicar abertura por `communication_id` + janela curta (ex.: 1 min)
  para reduzir ruído de pré-fetch.
- Nunca quebrar o redirect se o log falhar (log é best-effort).

### 5.2 `dispatch-whatsapp`

Chamada internamente pelas edge functions de envio. Faz `POST` para o Sonnar_Scraping
(ver §7). Recebe `{ communication_id, phone, kind, payload }`, devolve status,
atualiza `communications.whatsapp_status`.

---

## 6. Helper compartilhado — `_shared/comms-tracking.ts`

Para não duplicar lógica nas ~18 edge functions de envio, criar um helper:

```ts
// supabase/functions/_shared/comms-tracking.ts
export async function createCommunication(opts): Promise<{ commId; pixelUrl; shorten }>;
//  - insere em `communications`
//  - retorna pixelUrl  -> embutir no HTML: <img src="{pixelUrl}" width="1" height="1">
//  - retorna shorten(url) -> cria tracked_link e devolve a short URL
export async function dispatchWhatsApp(commId, phone, kind, payload): Promise<void>;
```

`_shared/email-template.ts` (`buildEmail`) ganha suporte opcional a `pixelUrl`
(injeta o `<img>` antes do `</body>`).

---

## 7. Sonnar_Scraping — rota de disparo

> Repo: `C:\Users\lcvsilva\Desktop\Sonnar_Scraping`.
> Trabalhar em branch própria seguindo **git-flow** (ex.: `feature/charge-whatsapp-dispatch`,
> a partir de `develop`).

### Rota

`POST /api/notifications/send`

**Auth:** header `X-Api-Key` com segredo compartilhado (env nos dois lados).

**Request body:**

```json
{
  "communication_id": "uuid",
  "phone": "5531999999999",
  "kind": "invoice_due",
  "client_name": "Fulano",
  "message": "texto pronto da mensagem",
  "link": "https://lnk.elkys.com.br/c/abc1234"
}
```

**Comportamento do bot:**

1. Recebe a requisição.
2. **Resolve o LID** do WhatsApp a partir do `phone` (decisão confirmada: Elkys manda
   só o telefone, o Sonnar resolve o LID internamente).
3. Dispara a mensagem para o cliente.
4. Responde `{ ok: true, whatsapp_status: "sent" }` ou erro.

**Resposta:**

```json
{ "ok": true, "lid": "...@lid", "whatsapp_status": "sent" }
```

### Itens a implementar no Sonnar_Scraping

- Endpoint HTTP (verificar se já há servidor Express/Fastify; se não, adicionar).
- Middleware de autenticação por API key.
- Função `resolvePhoneToLid(phone)`.
- Templates de mensagem por `kind` (espelhando os e-mails).
- Tratamento de erro/retry e log.

---

## 8. Refatoração das edge functions de envio

**Escopo confirmado: TODAS as funções `send-*` do portal.** Cada uma passa a:

1. Chamar `createCommunication(...)`.
2. Embutir o pixel no HTML do e-mail.
3. Trocar URLs longas do botão por short link via `shorten(url)`.
4. Chamar `dispatchWhatsApp(...)` em paralelo ao e-mail.

Lista de funções a cobrir (`supabase/functions/`):

| Função                         | `kind`                  | Entidade                                       |
| ------------------------------ | ----------------------- | ---------------------------------------------- |
| `send-invoice-due`             | `invoice_due`           | charge                                         |
| `send-charge-overdue`          | `charge_overdue`        | charge                                         |
| `send-inadimplencia-warning`   | `inadimplencia_warning` | charge                                         |
| `send-installment-paid`        | `installment_paid`      | charge                                         |
| `send-document-added`          | `document_added`        | document (nota fiscal, contrato, código-fonte) |
| `send-proposal-sent`           | `proposal_sent`         | proposal                                       |
| `send-proposal-expiry-warning` | `proposal_expiry`       | proposal                                       |
| `send-contract-validation`     | `contract_validation`   | contract                                       |
| `send-project-created`         | `project_created`       | project                                        |
| `send-project-stage-changed`   | `project_stage`         | project                                        |
| `send-project-completed`       | `project_completed`     | project                                        |
| `send-client-welcome`          | `client_welcome`        | client                                         |
| `send-client-action-required`  | `client_action`         | client                                         |
| `send-ticket-opened`           | `ticket_opened`         | ticket                                         |
| `send-ticket-updated`          | `ticket_updated`        | ticket                                         |
| `send-notification`            | `notification`          | notification                                   |
| `send-team-welcome`            | `team_welcome`          | team_member (sem WhatsApp? avaliar)            |
| `send-password-reset`          | `password_reset`        | — (**não** rastrear/WhatsApp por segurança)    |

> **Atenção:** `send-password-reset` e qualquer e-mail com link sensível de
> autenticação **não** devem usar short link nem WhatsApp (risco de segurança).
> Pixel também é dispensável nesses casos.

---

## 9. Dashboard (portal admin)

Nova página `src/pages/portal/admin/Communications.tsx` (rota `/portal/admin/comunicacoes`),
guardada por `PortalRoleGuard` (roles admin/comercial/financeiro).

Componentes/visões:

- **Cards de topo:** total enviado, taxa de entrega, taxa de abertura, taxa de clique (período).
- **Gráfico de linha:** envios x aberturas x cliques no tempo.
- **Gráfico de barras:** desempenho por `kind` (cobrança vs proposta vs documento...).
- **Tabela:** comunicações recentes com status e-mail/WhatsApp/abertura/clique.
- **Drill-down por cobrança/proposta:** no `ChargeDetail`/`ProposalDetail`, mostrar
  "Cliente abriu em DD/MM HH:MM" / "Clicou em ...".

Dados via `src/lib/portal-data.ts` (novas funções `loadCommunicationMetrics`, etc.)

- React Query. Gráficos: verificar lib já usada no projeto (auditar antes; não introduzir nova).

---

## 10. Fases de implementação (ordem sugerida)

| Fase | Entrega                                                                             | Repos  | Status                                                                         |
| ---- | ----------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| 1    | Migration: `communications`, `tracked_links`, `tracking_events` + RLS               | Elkys  | ✅ `20260518120000_communication_tracking.sql`                                 |
| 2    | Edge function `track` (pixel + redirect)                                            | Elkys  | ✅ `supabase/functions/track/`                                                 |
| 3    | Helper `_shared/comms-tracking.ts` + suporte a pixel no `email-template.ts`         | Elkys  | ✅                                                                             |
| 4    | Rota `POST /api/notifications/send` no Sonnar_Scraping (branch git-flow)            | Sonnar | ⏳ Não feito (WhatsApp)                                                        |
| 5    | Edge function `dispatch-whatsapp`                                                   | Elkys  | ⏳ Não feito (WhatsApp)                                                        |
| 6    | Refatorar `send-*` (começar pelas 4 de cobrança, depois o resto)                    | Elkys  | ✅ 17 funções (exceto `send-password-reset`); sem chamada de WhatsApp          |
| 7    | Dashboard `Communications.tsx` + drill-down                                         | Elkys  | ✅ Dashboard `/portal/admin/comunicacoes`; drill-down por entidade ⏳ pendente |
| 8    | Subdomínio `lnk.elkys.com.br` apontando para a function `track` (DNS/custom domain) | Infra  | ⏳ Pendente — ver §14                                                          |
| 9    | QA/E2E + validação em `develop` antes de cogitar `main`                             | Ambos  | ⏳ Pendente                                                                    |

> **Falta para o rastreio funcionar em produção:** aplicar a migration, fazer
> deploy da function `track`, redeploy das `send-*`, configurar o secret
> `SHORT_LINK_BASE` e apontar o subdomínio (§14).

---

## 14. Passo a passo — subdomínio `lnk.elkys.com.br`

O encurtador e o pixel usam o secret `SHORT_LINK_BASE` (default
`https://lnk.elkys.com.br`). Esse domínio precisa entregar as requisições
`/c/<slug>` e `/o/<id>.gif` na edge function `track`.

A URL crua da function é:
`https://njubtnsgtjcfmbnvjuqr.supabase.co/functions/v1/track`

### Opção A — Custom domain do Supabase (mais simples, recomendado)

1. Supabase Dashboard → **Project Settings → Custom Domains**.
2. Adicione `lnk.elkys.com.br` (o add-on de custom domain pode ser pago).
3. O Supabase mostra registros DNS (um `CNAME` e um `TXT` de verificação).
4. No painel DNS da Hostinger (**Domínios → elkys.com.br → DNS / Zona DNS**),
   crie os registros exatamente como o Supabase indicou.
5. Aguarde a propagação e a emissão do SSL (alguns minutos a algumas horas).
6. Defina o secret apontando para o domínio + caminho da function:
   `supabase secrets set SHORT_LINK_BASE="https://lnk.elkys.com.br/functions/v1/track"`

### Opção B — Proxy via Hostinger (sem add-on pago)

1. Hostinger → **Domínios → Subdomínios** → criar `lnk` → vira `lnk.elkys.com.br`.
2. Na pasta do subdomínio, suba um `index.php` que repassa a requisição para a
   function `track` (proxy server-side preservando o caminho `/c/...` e `/o/...`).
3. O subdomínio já recebe SSL grátis da Hostinger.
4. Secret: `supabase secrets set SHORT_LINK_BASE="https://lnk.elkys.com.br"`.

### Enquanto o domínio não estiver pronto (teste)

Aponte o secret direto para a URL crua da function — o código é
agnóstico ao domínio:
`supabase secrets set SHORT_LINK_BASE="https://njubtnsgtjcfmbnvjuqr.supabase.co/functions/v1/track"`

Os links sairão longos, mas o rastreio de clique e o pixel funcionam igual.

---

## 11. Decisões já confirmadas

- Branch de trabalho: `develop` (Elkys) / branch git-flow a partir de `develop` (Sonnar).
- Rastrear **abertura + clique**.
- Sonnar recebe **telefone** e resolve o **LID** internamente.
- Cobrir **todas** as comunicações de e-mail do portal, espelhando no WhatsApp.

## 12. Pendências / decisões em aberto

- [ ] Domínio do short link: subdomínio `lnk.elkys.com.br` (recomendado) vs path em `elkys.com.br`.
- [ ] De qual campo do cliente vem o telefone: `whatsapp`, `phone` ou `responsavel_financeiro_phone`?
      (Provável: priorizar `whatsapp`, fallback `phone`.)
- [ ] `send-team-welcome` e e-mails internos de equipe entram no WhatsApp? (Avaliar.)
- [ ] Lib de gráficos já existente no projeto a reutilizar no dashboard.
- [ ] Política de retenção de `tracking_events` (LGPD — IP/user-agent são dado pessoal).
- [ ] Consentimento/base legal para WhatsApp e rastreio (revisar com `juridico`).
- [ ] `send-password-reset` e links de auth: confirmados como **fora** do rastreio.

## 13. Riscos

- **Deliverability:** pixel + muitos links podem aumentar chance de spam — monitorar.
- **LGPD:** IP e user-agent são dados pessoais; definir retenção e finalidade.
- **Acoplamento com Sonnar:** se o bot cair, o e-mail não pode falhar — disparo de
  WhatsApp deve ser best-effort e assíncrono.
- **Custom domain:** o redirect precisa de SSL no subdomínio — validar com Hostinger/Supabase.
