/**
 * Métricas do CRM (Leads + Propostas) centralizadas.
 *
 * Toda tela que calcula taxa de conversão, taxa de aprovação, top fontes ou
 * leads recentes DEVE importar daqui em vez de reimplementar — garante que
 * Leads.tsx, Proposals.tsx, Overview.tsx (quando relevante) e relatórios
 * usem a mesma definição.
 *
 * Decisões de regra de negócio (auditoria 2026-05-23):
 *   - Conversion rate = ganho / (ganho + perdido) — taxa de fechamento real,
 *     ignora leads em pipeline aberto. Padrão de mercado em CRM.
 *   - Approval rate = aprovadas / (aprovadas + rejeitadas + expiradas) —
 *     proposta que expirou sem resposta é tratada como rejeição implícita.
 *   - newLastNDays mantém janela rolling de N*24h (mais simples e estável
 *     do que calendar days, suficiente para a métrica "novos recentes").
 */

export type LeadStatusForMetrics = {
  status: string;
  /** opcional — usado em janelas temporais e top sources */
  created_at?: string | null;
  source?: string | null;
  estimated_value?: number | null;
};

export type ProposalStatusForMetrics = {
  status: string;
};

/* ------------------------------------------------------------------ */
/*  Lead conversion rate                                               */
/* ------------------------------------------------------------------ */

/**
 * Taxa de fechamento de leads: `ganho / (ganho + perdido)`.
 *
 * Por que não inclui prospeccao/qualificado/proposta no denominador?
 * Esses leads ainda não foram "decididos" — podem virar ganho ou perdido.
 * Penalizar a taxa de conversão por leads abertos confunde "ainda não
 * vendi" com "tentei vender e perdi". Padrão CRM = razão de leads
 * decididos que viraram cliente.
 *
 * Retorna inteiro 0-100 (percentual). Sem decididos -> 0.
 */
export function computeLeadConversionRate(leads: LeadStatusForMetrics[]): number {
  const won = leads.filter((l) => l.status === "ganho").length;
  const lost = leads.filter((l) => l.status === "perdido").length;
  const decided = won + lost;
  if (decided === 0) return 0;
  return Math.round((won / decided) * 100);
}

/* ------------------------------------------------------------------ */
/*  Proposal approval rate                                             */
/* ------------------------------------------------------------------ */

/**
 * Taxa de aprovação de propostas:
 *   `aprovadas / (aprovadas + rejeitadas + expiradas)`.
 *
 * `expirada` entra no denominador como rejeição implícita — proposta que
 * passou da validade sem resposta é, na prática, perda. Antes ficava em
 * limbo, inflando a taxa de aprovação artificialmente.
 *
 * `rascunho` e `enviada` (em andamento, aguardando) NAO contam — o cliente
 * ainda pode responder. Padrão = só ciclo fechado.
 *
 * Retorna inteiro 0-100. Sem decididas -> 0.
 */
export function computeProposalApprovalRate(proposals: ProposalStatusForMetrics[]): number {
  const approved = proposals.filter((p) => p.status === "aprovada").length;
  const rejected = proposals.filter((p) => p.status === "rejeitada").length;
  const expired = proposals.filter((p) => p.status === "expirada").length;
  const decided = approved + rejected + expired;
  if (decided === 0) return 0;
  return Math.round((approved / decided) * 100);
}

/* ------------------------------------------------------------------ */
/*  Leads recentes em janela                                           */
/* ------------------------------------------------------------------ */

/**
 * Conta leads criados nos últimos N dias (rolling N * 24h).
 *
 * Janela rolling (não calendar): se hoje é 23/05 14h, "últimos 7 dias" =
 * desde 16/05 14h. Mais estável que calendar days (não muda de valor à
 * meia-noite) e suficiente para métrica de "novos recentes".
 *
 * `now` parametro pra deixar a função pura/testável.
 */
export function computeNewLeadsInWindow(
  leads: LeadStatusForMetrics[],
  windowDays: number,
  now: Date
): number {
  if (windowDays <= 0) return 0;
  const cutoffMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  return leads.filter((l) => {
    if (!l.created_at) return false;
    const ts = new Date(l.created_at).getTime();
    return Number.isFinite(ts) && ts >= cutoffMs;
  }).length;
}

/* ------------------------------------------------------------------ */
/*  Top fontes de leads                                                */
/* ------------------------------------------------------------------ */

/**
 * Ranking das N fontes (`source`) mais frequentes entre os leads.
 *
 * Normaliza `source` com `trim().toLowerCase()` pra evitar contagens
 * duplicadas por casing/whitespace inconsistente vindo do DB.
 * `null`/vazio -> bucket `"nao_informada"`.
 *
 * Retorna array `[source, count][]` ordenado desc por count.
 */
export function computeTopLeadSources(
  leads: LeadStatusForMetrics[],
  limit: number
): [string, number][] {
  if (limit <= 0) return [];
  const counts: Record<string, number> = {};
  for (const l of leads) {
    const raw = (l.source ?? "").trim().toLowerCase();
    const key = raw || "nao_informada";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}
