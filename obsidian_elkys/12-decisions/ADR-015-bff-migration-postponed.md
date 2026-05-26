---
title: ADR-015 — Adiar migração para BFF (Spring Boot na VPS)
tags: [adr, architecture, bff, decision, postponed]
status: Aceito (com revisão programada Q4 2026)
date: 2026-05-26
---

# ADR-015 — Adiar migração para BFF (Spring Boot na VPS)

## Contexto

Em 2026-05-26, após a auditoria completa de modelagem do banco
([[../13-issues/_audit-2026-05-25/00-RELATORIO-FINAL|relatório]]), o time
levantou a questão arquitetural:

> "Frontend não conversa direto com banco. Pode funcionar em projetos
> como o Qualidade, que é só extração e acesso a dados. Sistemas maiores
> e robustos não. Fica muito vulnerável e excessivamente acoplado."

A observação é tecnicamente correta. O modelo atual (SPA + Supabase
Cloud + RLS direto) tem acoplamentos reais:

- Frontend conhece o schema completo (553 colunas) via `types.ts`
- RLS é o ÚNICO gate de autorização (ver [[ADR-006-domain-based-rls]])
- Schema exposto via PostgREST
- Sem rate limit / WAF na frente
- Business logic dividida entre plpgsql + edge functions + frontend
- Sem audit de aplicação (só `audit_logs` no banco)
- 25 edge functions com observabilidade limitada

A proposta avaliada: introduzir um BFF (Backend-for-Frontend) em
**Java 21 + Spring Boot 3.4** rodando na VPS própria, com jOOQ pra
acesso type-safe ao Postgres, mantendo Supabase Auth + Storage. Detalhes
da stack avaliada no histórico da sessão de 2026-05-26.

## Decisão

**Adiar a migração.** Revisar a decisão em **Q4 2026** ou quando
qualquer dos gates abaixo for acionado, o que vier primeiro.

## Por que adiar (análise de custo/benefício)

### Estado atual do produto

| Indicador           | Valor    |
| ------------------- | -------- |
| Clientes ativos     | 3        |
| Projetos            | 9        |
| Charges (cobranças) | 36       |
| Team members        | 14       |
| MRR                 | Pré-PMF  |
| Time técnico        | 1–2 devs |

O sistema ainda está em fase de **validação de product-market fit**.
"A Elkys ainda não se paga" — então qualquer investimento de
infraestrutura precisa justificar ROI em horizonte curto.

### Custo real da migração

- **Tempo:** 3–4 meses de 1 dev em tempo integral, ou 6+ meses
  em part-time. Inclui bootstrap, migrar 25 edge functions, replicar
  RLS equivalente em camada de app, observabilidade.
- **Custo financeiro:** ~R$50–150/mês adicional se subir VPS pra
  rodar JVM (mínimo 2GB RAM).
- **Custo de oportunidade:** o maior. Esses 3–4 meses **não geram
  receita** — são 3–4 meses sem novas features comerciáveis, sem
  onboarding de clientes, sem refinamento de UX.

### O que a auditoria de 2026-05-25 já entregou

A auditoria recente já endereçou ~60–70% do valor que uma BFF entregaria:

- 61% dos problemas de performance fixados (256 → 100 advisors)
- Vault para secrets de cron (não mais texto puro)
- Cleanup automático de UUIDs órfãos via trigger
- Consolidação de policies RLS (redução de 76 → 25 multiple_permissive)
- 25 enums tipados (validação em SQL)
- Remoção de ~17 colunas/tabelas mortas
- Padronização de `ON DELETE`
- CHECK exclusive-arc em poli-FKs

O que **não** está coberto e seria entregue pela BFF: rate limiting de
aplicação, validação de input centralizada server-side, audit trail de
aplicação (quem chamou? de onde? quando?), cache distribuído, swap fácil
de database. Nenhum desses é gargalo hoje.

## Alternativas consideradas e rejeitadas

### Migrar agora (Spring Boot na VPS)

**Pros:**

- Desacoplamento real frontend ↔ schema
- Camada para rate limit, validação, business logic
- Sem vendor lock-in do Supabase
- Observabilidade de aplicação (Pino/OpenTelemetry/Prometheus)

**Cons:** 3–4 meses sem receita; sistema atual funciona; gates não
acionados; risco alto de ficar 3 meses sem entregar valor pro cliente.

**Veredito:** rejeitado por custo/oportunidade.

### Migrar incrementalmente em paralelo às features

**Pros:** zero downtime de roadmap, migração gradual.

**Cons:** dobro do trabalho (mantém 2 stacks), risco de inconsistência,
dev fragmenta atenção. Não justifica enquanto não houver dor real.

**Veredito:** rejeitado — incremental ainda custa caro sem ganho
proporcional no estado atual.

### Trocar para Node + Fastify (mais leve que Spring Boot)

**Pros:** mesma linguagem do frontend (TS), menos curva.

**Cons:** se o time decidir migrar no futuro, Spring Boot tem ecossistema
mais maduro para sistema corporativo robusto e o lead técnico já tem
preferência por Java. Manter consistência com a decisão futura.

**Veredito:** rejeitado em favor de Java + Spring Boot quando a hora
chegar.

## Gates que disparam revisão

Reavaliar **imediatamente** quando qualquer um destes for verdade:

| Gate                                                         | Por quê                                |
| ------------------------------------------------------------ | -------------------------------------- |
| 10+ clientes pagos com MRR estável                           | Justifica overhead de manutenção       |
| Receita recorrente > R$5k/mês                                | Cobre custo VPS + dev part-time        |
| Time cresce para 3+ devs                                     | Modularidade vira necessidade          |
| Compliance B2B exigida (SOC2, ISO 27001, LGPD enforcement)   | RLS sozinha não atende                 |
| Detecção de ataque/vazamento via RLS bug                     | Urgente, salto inevitável              |
| Schema do banco muda toda semana e quebra deploy do frontend | Desacoplamento vira blocker            |
| Edge functions ficam inviáveis (debug ruim, deploy lento)    | API resolve naturalmente               |
| Performance Postgres direto chega no limite                  | Cache distribuído + read replica       |
| App mobile vai reusar API                                    | Frontend deixa de ser único consumidor |

Em ausência de qualquer gate acionado, **revisar formalmente em
Q4 2026** com uma análise de tração comercial atualizada.

## Mitigações no curto prazo (sem migrar)

Para reduzir o risco do modelo atual enquanto a migração é adiada:

1. **Observabilidade** — resolver [[../13-issues/no-observability]]
   (H1 do brain): integrar Sentry/PostHog. Maior gap real hoje, mais
   urgente que BFF.
2. **Rate limiting na borda** — Cloudflare grátis na frente do Hostinger
   resolve 99% dos ataques sem custo.
3. **Revisar queries lentas semanalmente** no Supabase Dashboard.
4. **Spike de 1 semana em ~6 meses** — montar um esqueleto Spring Boot
   na VPS com 1 endpoint piloto. Valida o stack na prática sem comprometer
   3 meses. Se for descartado, perdem-se 5 dias, não 1 trimestre.
5. **Ativar HIBP password protection no painel Supabase Auth** (toggle
   manual — pendência da auditoria 2026-05-25).

## Consequências

### Positivas

- 3 meses preservados para foco em produto e tração
- Stack atual segue produtivo (auditoria recente comprovou robustez
  estrutural)
- Decisão documentada — futuro dev sabe por que NÃO migramos
- Gates objetivos disparam revisão automática

### Negativas

- Continuar com RLS como gate único de autorização
- Schema continua exposto via PostgREST
- Edge functions continuam difíceis de debugar
- Toda nova feature aumenta o débito de uma futura migração

### Neutras

- Stack escolhida (Java + Spring Boot + jOOQ) já está documentada;
  quando os gates dispararem, é só executar o plano de 3–4 meses.

## Referências

- [[../13-issues/_audit-2026-05-25/00-RELATORIO-FINAL]] — auditoria que
  motivou a discussão
- [[ADR-003-supabase-cloud]] — decisão original pelo Supabase
- [[ADR-006-domain-based-rls]] — modelo de autorização atual
- [[../13-issues/no-observability]] — gap mais urgente que BFF
- [[../13-issues/security-roles-in-db]] — relacionado (roles em DB vs JWT)

## Próxima revisão

**2026-10-31** (Q4 2026) — ou antes, se qualquer gate for acionado.
