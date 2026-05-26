/**
 * Métricas financeiras centralizadas.
 *
 * Toda tela financeira (Overview, Finance, FinanceGoals, etc.) DEVE importar
 * daqui em vez de reimplementar cálculos. Isso garante que "burn rate",
 * "runway", "margem operacional", "aging" e "pipeline" tenham uma única
 * definição em todo o app.
 *
 * Auditoria 2026-04-15: antes deste módulo, Overview e Finance computavam
 * burn rate com denominadores diferentes (janela inteira vs meses-com-despesa)
 * e margem operacional em regimes diferentes (caixa vs híbrido), produzindo
 * números divergentes para o mesmo indicador na mesma sessão de uso.
 *
 * Auditoria 2026-05-23: extraidos aging buckets, pipeline summary e forecast
 * (antes duplicados linha-por-linha entre Overview.tsx e Finance.tsx — com
 * bugs sutis: forecast do Finance ignorava propostas aprovadas, pipelineCount
 * do Finance esquecia leads em proposta).
 */

export const BURN_RATE_WINDOW_MONTHS = 6;
export const AGING_BUCKET_30 = 30;
export const AGING_BUCKET_60 = 60;

/** Limiares de tonalidade da margem operacional (em pontos percentuais). */
export const MARGIN_HEALTHY_PCT = 20;
export const MARGIN_NEUTRAL_PCT = 0;

/** Limiares de runway (meses). */
export const RUNWAY_DANGER_MONTHS = 3;
export const RUNWAY_WARNING_MONTHS = 6;

/** Janelas operacionais (dias) usadas em cards de "proximas X". */
export const UPCOMING_CHARGES_WINDOW_DAYS = 7;
export const UPCOMING_DELIVERIES_WINDOW_DAYS = 14;
export const UPCOMING_LIST_LIMIT = 5;

/** Limiar de tickets abertos para tom de atencao. */
export const OPEN_TICKETS_WARNING_THRESHOLD = 5;

export type MonthlyCashPoint = {
  /** YYYY-MM */
  key: string;
  /** Caixa que entrou no mês (charges pagas, em reais) */
  cashIn: number;
  /** Caixa que saiu no mês (despesas, em reais) */
  cashOut: number;
};

/**
 * Burn rate médio mensal: média das saídas dos últimos N meses, dividindo
 * SEMPRE pela janela inteira (não apenas meses com despesa).
 *
 * Decisão: dividir pela janela inteira evita inflar o burn quando há meses
 * vazios (start de operação, gap entre contratações). Um mês sem despesa é
 * informação real — não deve ser excluído do denominador.
 */
export function computeBurnRate(
  monthlySeries: MonthlyCashPoint[],
  windowMonths: number = BURN_RATE_WINDOW_MONTHS
): number {
  if (monthlySeries.length === 0 || windowMonths <= 0) return 0;
  const window = monthlySeries.slice(-windowMonths);
  if (window.length === 0) return 0;
  const totalOut = window.reduce((sum, point) => sum + point.cashOut, 0);
  return totalOut / window.length;
}

/**
 * Runway em meses: quantos meses o caixa atual sustenta no ritmo de burn.
 *
 * Retorno:
 * - `null` quando burn ≤ 0 (operação não está queimando caixa — runway infinito)
 * - `0` quando saldo ≤ 0 (sem caixa para queimar)
 * - número positivo de meses caso contrário
 *
 * Não retornamos Infinity para não poluir UI com formatação especial.
 */
export function computeRunway(cashBalance: number, burnRate: number): number | null {
  if (burnRate <= 0) return null;
  if (cashBalance <= 0) return 0;
  return cashBalance / burnRate;
}

/**
 * Margem operacional por COMPETÊNCIA.
 *
 * `revenue` deve ser receita reconhecida no período (recorrente + projeto por due_date).
 * `expenses` deve ser despesas do período por expense_date.
 *
 * Retorna `null` quando revenue ≤ 0 (margem indefinida sem base).
 * Retorna percentual (-100 a +100, podendo estourar para baixo se despesas > receita).
 */
export function computeOperationalMargin(revenue: number, expenses: number): number | null {
  if (revenue <= 0) return null;
  return ((revenue - expenses) / revenue) * 100;
}

/* ------------------------------------------------------------------ */
/*  Aging buckets                                                      */
/* ------------------------------------------------------------------ */

export type AgingChargeInput = {
  status: string;
  is_historical: boolean | null;
  due_date: string | null;
  amount: number;
};

export type AgingBucket = {
  range: string;
  amount: number;
  count: number;
};

/**
 * Aging de recebiveis: agrupa charges vencidas em 0-30, 30-60 e 60+ dias.
 *
 * Inclui apenas charges com status `pendente`/`atrasado`, nao historicas e
 * com `due_date <= today`. Charges futuras pendentes nao entram (ainda nao
 * sao recebivel atrasado).
 *
 * `now` e `todayIso` sao parametros pra deixar a funcao 100% pura/testavel.
 *
 * Arredondamento: agregamos em centavos e dividimos por 100 no final pra
 * evitar erro acumulado de ponto flutuante em valores monetarios.
 */
export function computeAgingBuckets(
  charges: AgingChargeInput[],
  now: Date,
  todayIso: string
): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { range: "0-30 dias", amount: 0, count: 0 },
    { range: "30-60 dias", amount: 0, count: 0 },
    { range: "60+ dias", amount: 0, count: 0 },
  ];

  const eligible = charges.filter(
    (c) =>
      (c.status === "pendente" || c.status === "atrasado") &&
      !c.is_historical &&
      c.due_date &&
      c.due_date <= todayIso
  );

  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  for (const c of eligible) {
    const dueDate = new Date(c.due_date + "T00:00:00");
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / MS_PER_DAY);
    const amtCents = Math.round(c.amount * 100);
    if (daysOverdue <= AGING_BUCKET_30) {
      buckets[0].amount += amtCents;
      buckets[0].count += 1;
    } else if (daysOverdue <= AGING_BUCKET_60) {
      buckets[1].amount += amtCents;
      buckets[1].count += 1;
    } else {
      buckets[2].amount += amtCents;
      buckets[2].count += 1;
    }
  }

  for (const b of buckets) b.amount /= 100;
  return buckets;
}

/* ------------------------------------------------------------------ */
/*  Pipeline (funil CRM)                                               */
/* ------------------------------------------------------------------ */

export type PipelineProposal = {
  id: string;
  lead_id: string | null;
  total_amount: number;
  status: string;
};

export type PipelineLead = {
  id: string;
  status: string;
  estimated_value: number | null;
};

export type PipelineContract = {
  id: string;
  project_id: string | null;
  total_amount: number;
  status: string;
};

export type PipelineProject = {
  id: string;
  status: string;
};

export type PipelineSummary = {
  value: number;
  count: number;
};

/**
 * Pipeline comercial = "proposta em diante, excluindo ganho/perdido fechado".
 *
 * Composicao:
 *   - propostas com status='enviada' (cliente recebeu, aguardando resposta)
 *   - leads com status='proposta' (proposta em elaboracao, sem registro ainda)
 *     EXCLUI leads que ja tem proposta enviada/aprovada vinculada — o card
 *     da proposta ja representa o estagio no funil.
 *   - projetos com status='negociacao' (proposta aprovada -> contrato em
 *     elaboracao). O valor vem dos contratos vinculados, nao do projeto.
 *
 * Propostas 'aprovada' NAO entram aqui — uma vez aprovadas geram contrato
 * em rascunho que conta em `computeForecast` (forecast de receita) e o
 * projeto correspondente entra em 'negociacao' aqui.
 */
export function computePipelineSummary(
  proposals: PipelineProposal[],
  leads: PipelineLead[],
  contracts: PipelineContract[],
  projects: PipelineProject[]
): PipelineSummary {
  const pendingProposals = proposals.filter((p) => p.status === "enviada");
  const proposalCents = pendingProposals.reduce((s, p) => s + Math.round(p.total_amount * 100), 0);

  const leadIdsWithActiveProposal = new Set(
    proposals
      .filter((p) => p.status === "enviada" || p.status === "aprovada")
      .map((p) => p.lead_id)
      .filter((id): id is string => Boolean(id))
  );
  const leadsInProposta = leads.filter(
    (l) => l.status === "proposta" && !leadIdsWithActiveProposal.has(l.id)
  );
  const leadCents = leadsInProposta.reduce(
    (s, l) => s + Math.round((l.estimated_value ?? 0) * 100),
    0
  );

  const negociacaoProjectIds = new Set(
    projects.filter((p) => p.status === "negociacao").map((p) => p.id)
  );
  const negotiationContracts = contracts.filter(
    (c) => c.project_id && negociacaoProjectIds.has(c.project_id) && c.status !== "cancelado"
  );
  const contractCents = negotiationContracts.reduce(
    (s, c) => s + Math.round(c.total_amount * 100),
    0
  );

  return {
    value: (proposalCents + leadCents + contractCents) / 100,
    count: pendingProposals.length + leadsInProposta.length + negociacaoProjectIds.size,
  };
}

/* ------------------------------------------------------------------ */
/*  Forecast de receita                                                */
/* ------------------------------------------------------------------ */

export type ForecastCharge = {
  status: string;
  is_historical: boolean | null;
  due_date: string;
  amount: number;
};

/**
 * Forecast de receita esperada (regime caixa proxy):
 *   - charges futuras com status='agendada' (concretas, ja agendadas)
 *   - contratos em rascunho (proposta aprovada, contrato em revisao juridica
 *     que ainda nao foi ativado e portanto nao gerou charges).
 *
 * O uso de contratos.rascunho (em vez de propostas.aprovada) evita double-count:
 * quando o contrato e ativado vira projeto + charges agendadas. Como aqui
 * filtramos por status='rascunho' apenas, charges geradas pos-ativacao
 * ficam visiveis SOMENTE via agendadaCharges.
 */
export function computeForecastRevenue(
  charges: ForecastCharge[],
  contracts: PipelineContract[],
  todayIso: string
): number {
  const chargeCents = charges
    .filter((c) => c.status === "agendada" && !c.is_historical && c.due_date > todayIso)
    .reduce((s, c) => s + Math.round(c.amount * 100), 0);

  const draftContractCents = contracts
    .filter((c) => c.status === "rascunho")
    .reduce((s, c) => s + Math.round(c.total_amount * 100), 0);

  return (chargeCents + draftContractCents) / 100;
}

/* ------------------------------------------------------------------ */
/*  Projecao de receita N meses a frente                               */
/* ------------------------------------------------------------------ */

export type ForecastSubscription = {
  client_id: string;
  amount: number;
  starts_on: string | null;
  ends_on: string | null;
};

export type ForecastProjection = {
  /** Receita recorrente prevista (soma das bases mensais) */
  recurring: number;
  /** Receita agendada prevista (soma de charges agendada futuras) */
  scheduled: number;
  /** Total projetado: para cada mes, max(base, agendada) — evita double count */
  total: number;
};

/**
 * Projecao de receita para os proximos N meses calendario.
 *
 * Para cada mes futuro:
 *   - monthBaseCents = subscriptions ativas naquele mes (respeita starts_on/ends_on)
 *   - monthScheduledCents = charges com status='agendada' devidas naquele mes
 *   - total += max(base, scheduled)  // charges agendadas SAO a materializacao
 *                                       das subscriptions; somar os dois inflaria
 *
 * `now` parametro pra deixar a funcao 100% pura/testavel.
 */
export function computeForecastProjection(
  months: number,
  subscriptions: ForecastSubscription[],
  charges: ForecastCharge[],
  activeClientIds: Set<string>,
  now: Date
): ForecastProjection {
  if (months <= 0) return { recurring: 0, scheduled: 0, total: 0 };

  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  let recurringCents = 0;
  let scheduledCents = 0;
  let totalCents = 0;

  for (let i = 0; i < months; i += 1) {
    const monthDate = new Date(nextMonthStart.getFullYear(), nextMonthStart.getMonth() + i, 1);
    const y = monthDate.getFullYear();
    const m = monthDate.getMonth();
    const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
    const monthStartIso = `${monthKey}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const monthEndIso = `${monthKey}-${String(lastDay).padStart(2, "0")}`;

    const monthBaseCents = subscriptions
      .filter((sub) => activeClientIds.has(sub.client_id))
      .filter((sub) => {
        if (sub.starts_on && sub.starts_on > monthEndIso) return false;
        if (sub.ends_on && sub.ends_on < monthStartIso) return false;
        return true;
      })
      .reduce((s, sub) => s + Math.round(sub.amount * 100), 0);

    const monthScheduledCents = charges
      .filter(
        (c) =>
          !c.is_historical &&
          c.status === "agendada" &&
          c.due_date >= monthStartIso &&
          c.due_date <= monthEndIso
      )
      .reduce((s, c) => s + Math.round(c.amount * 100), 0);

    recurringCents += monthBaseCents;
    scheduledCents += monthScheduledCents;
    totalCents += Math.max(monthBaseCents, monthScheduledCents);
  }

  return {
    recurring: recurringCents / 100,
    scheduled: scheduledCents / 100,
    total: totalCents / 100,
  };
}

/* ------------------------------------------------------------------ */
/*  Crescimento MoM/3M/6M/12M do MRR                                   */
/* ------------------------------------------------------------------ */

export type MrrSeriesPoint = {
  /** YYYY-MM */
  key: string;
  /** MRR recebido naquele mes (em reais) */
  recurringRevenue: number;
};

export type MrrGrowth =
  /** Crescimento numerico em pontos percentuais (-100..+inf) */
  | { kind: "value"; value: number }
  /** startMrr=0 e endMrr>0: cliente novo, sem base de comparacao */
  | { kind: "new" }
  /** Janela inviavel: serie curta demais ou mes-base anterior a earliestDataMonth */
  | { kind: "na" };

/**
 * Crescimento do MRR entre o ultimo mes da serie e o mes `periodMonths` atras.
 *
 * Regra fundamental: nao extrapolar com base contratual. Se o mes-base
 * (endIdx - periodMonths) e anterior ao primeiro mes com dado consolidado
 * real (`earliestDataMonth` = menor due_date entre charges nao historicas),
 * retorna `na` — o numero seria fake porque o mes-base nao teve charges
 * registradas.
 *
 * Edge cases:
 *   - serie vazia ou periodMonths > serie disponivel -> na
 *   - startMrr=0 e endMrr=0 -> value=0 (sem mudanca, sem MRR)
 *   - startMrr=0 e endMrr>0 -> kind=new ("novo": nao da pra calcular % de zero)
 *   - startMrr>0 -> ((end - start) / start) * 100
 */
export function computeMrrGrowth(
  monthlySeries: MrrSeriesPoint[],
  periodMonths: number,
  earliestDataMonth: string | null
): MrrGrowth {
  const total = monthlySeries.length;
  if (total === 0 || periodMonths <= 0) return { kind: "na" };
  const endIdx = total - 1;
  const startIdx = endIdx - periodMonths;
  if (startIdx < 0) return { kind: "na" };

  const startPoint = monthlySeries[startIdx];
  const endPoint = monthlySeries[endIdx];
  if (!startPoint || !endPoint) return { kind: "na" };

  if (earliestDataMonth && startPoint.key < earliestDataMonth) {
    return { kind: "na" };
  }

  const startMrr = startPoint.recurringRevenue;
  const endMrr = endPoint.recurringRevenue;
  if (startMrr === 0) {
    return endMrr === 0 ? { kind: "value", value: 0 } : { kind: "new" };
  }
  return { kind: "value", value: ((endMrr - startMrr) / startMrr) * 100 };
}

/* ------------------------------------------------------------------ */
/*  Percent change helper                                              */
/* ------------------------------------------------------------------ */

/**
 * Variacao percentual de previous -> current.
 *
 * Regra:
 *   - previous=0 e current=0 -> 0 (sem mudanca)
 *   - previous=0 e current!=0 -> null (variacao indefinida a partir de zero)
 *   - caso geral -> ((current - previous) / |previous|) * 100
 *
 * Usa |previous| para que a direcao do sinal nao seja invertida quando
 * previous e negativo (ex: caixa indo de -1000 para -500 e melhora de +50%,
 * nao queda de -50%).
 */
export function computePercentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

/* ------------------------------------------------------------------ */
/*  Ticket medio                                                        */
/* ------------------------------------------------------------------ */

/**
 * Ticket medio = receita total / numero de transacoes.
 *
 * Retorna 0 quando count <= 0 (sem base pra dividir). Usado em ranking
 * de clientes (RevenueByClient) e relatorios de receita.
 */
export function computeTicketAverage(totalRevenue: number, count: number): number {
  if (count <= 0) return 0;
  return totalRevenue / count;
}

/* ------------------------------------------------------------------ */
/*  Progresso de meta financeira                                       */
/* ------------------------------------------------------------------ */

/**
 * Percentual atingido de uma meta financeira.
 *
 * Retorna 0 quando target <= 0 (sem meta valida).
 * Pode estourar 100 (meta superada) — caller decide se exibir 100%+ ou cap.
 */
export function computeGoalProgress(actual: number, target: number): number {
  if (target <= 0) return 0;
  return (actual / target) * 100;
}

/* ------------------------------------------------------------------ */
/*  Status operacional de projetos                                     */
/* ------------------------------------------------------------------ */

export type ProjectScheduleInput = {
  status: string;
  expected_delivery_date: string | null;
  delivered_at: string | null;
};

/**
 * Projeto atrasado: status='em_andamento', tinha prazo, prazo passou,
 * AINDA NAO foi entregue.
 *
 * Decisao explicita: 'negociacao' e 'pausado' NAO entram como atrasado.
 *   - 'negociacao' = contrato em revisao, projeto nem comecou.
 *   - 'pausado' = trabalho em hold por decisao deliberada (cliente,
 *     juridico, etc) — o atraso e circunstancial.
 * Antes (Projects.tsx tinha logica propria), pausado e negociacao
 * inflavam a metrica de "atrasados", divergindo de Overview/Finance.
 */
export function isProjectOverdue(project: ProjectScheduleInput, todayIso: string): boolean {
  return (
    project.status === "em_andamento" &&
    !!project.expected_delivery_date &&
    project.expected_delivery_date < todayIso &&
    !project.delivered_at
  );
}

/**
 * Projeto com entrega proxima: status='em_andamento', prazo entre hoje
 * e `windowEndIso` (inclusive), ainda nao entregue.
 *
 * Usado no card "Proximas entregas" do dashboard. Janela default
 * UPCOMING_DELIVERIES_WINDOW_DAYS (14d) — a determinacao da janela
 * fica fora desta funcao pra permitir override.
 */
export function isProjectUpcomingDelivery(
  project: ProjectScheduleInput,
  todayIso: string,
  windowEndIso: string
): boolean {
  return (
    project.status === "em_andamento" &&
    !!project.expected_delivery_date &&
    project.expected_delivery_date >= todayIso &&
    project.expected_delivery_date <= windowEndIso &&
    !project.delivered_at
  );
}

/* ------------------------------------------------------------------ */
/*  Thresholds de urgencia de entrega                                  */
/* ------------------------------------------------------------------ */

/** Dias restantes ate considerar critico (vermelho). */
export const DELIVERY_CRITICAL_DAYS = 3;
/** Dias restantes ate considerar urgente (warning/amarelo). */
export const DELIVERY_SOON_DAYS = 7;
/** Dias restantes ate considerar proximo (azul/atencao leve). */
export const DELIVERY_NEAR_DAYS = 14;
