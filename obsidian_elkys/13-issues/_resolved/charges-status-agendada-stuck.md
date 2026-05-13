---
title: charges.status agendada → pendente só no front-end
tags: [issue, high, data-integrity, financial]
severity: HIGH
---

# 🔴 H5 — `charges.status = 'agendada'` não promove para `pendente` no cron

## Contexto

Charges criadas com `due_date <= hoje` ficam em `agendada` (status inicial). A transição para `pendente` é feita **apenas quando alguém abre `Finance.tsx`** (sync no front-end). O cron das 02h promove `pendente → atrasado`, mas **não** `agendada → pendente`.

## Impacto

- Charges "esquecidas" em `agendada` se nenhuma sessão abrir Finance.
- Régua de cobrança (08h) busca `pendente OR agendada` em algumas regras, **mas** o email D-3 e D+0 do template depende do status mental "pendente".
- KPI de "a vencer" e "atrasados" inconsistente com realidade.

## Reprodução

1. Criar charge com `due_date = hoje - 1` e `status = 'agendada'` (via INSERT direto).
2. Aguardar cron das 02h.
3. Status permanece `agendada` (deveria ir para `atrasado`).
4. Abrir admin Finance → sync promove para `pendente` ou `atrasado`.

## Recomendação

Estender `sync_financial_blocks()` (ou criar `promote_due_charges()`):

```sql
-- Adicionar antes de mark_overdue_charges:
UPDATE charges
   SET status = 'pendente'
 WHERE status = 'agendada'
   AND due_date <= CURRENT_DATE
   AND is_historical = false;
```

Remover sync redundante do front-end de `Finance.tsx` após validar.

## Onda

- 🔴 Onda 1 — quick win SQL.

## Relações

- [[../02-domains/charges]]
- [[../04-flows/overdue-cron-flow]]
- [[../05-database/cron-jobs]]
- [[../05-database/functions]]

## Referências

- `src/pages/admin/Finance.tsx` (sync na abertura)
- `supabase/migrations/*_mark_overdue_charges*.sql`
- `docs/DATABASE.md` (charges section)
