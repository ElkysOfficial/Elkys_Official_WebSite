import { describe, expect, it } from "vitest";

import {
  AGING_BUCKET_30,
  AGING_BUCKET_60,
  BURN_RATE_WINDOW_MONTHS,
  computeAgingBuckets,
  computeBurnRate,
  computeForecastProjection,
  computeForecastRevenue,
  computeGoalProgress,
  computeMrrGrowth,
  computeOperationalMargin,
  computePercentChange,
  computePipelineSummary,
  computeRunway,
  computeTicketAverage,
  isProjectOverdue,
  isProjectUpcomingDelivery,
  type AgingChargeInput,
  type ForecastCharge,
  type ForecastSubscription,
  type MonthlyCashPoint,
  type MrrSeriesPoint,
  type PipelineContract,
  type PipelineLead,
  type PipelineProject,
  type PipelineProposal,
  type ProjectScheduleInput,
} from "./finance-metrics";

/* ------------------------------------------------------------------ */
/*  computeBurnRate                                                    */
/* ------------------------------------------------------------------ */

describe("computeBurnRate", () => {
  const m = (key: string, cashOut: number): MonthlyCashPoint => ({ key, cashIn: 0, cashOut });

  it("retorna 0 para serie vazia", () => {
    expect(computeBurnRate([])).toBe(0);
  });

  it("retorna 0 para janela <= 0", () => {
    expect(computeBurnRate([m("2026-01", 1000)], 0)).toBe(0);
    expect(computeBurnRate([m("2026-01", 1000)], -3)).toBe(0);
  });

  it("divide pela janela inteira, nao por meses-com-despesa", () => {
    const series = [
      m("2026-01", 0),
      m("2026-02", 0),
      m("2026-03", 3000),
      m("2026-04", 0),
      m("2026-05", 0),
      m("2026-06", 3000),
    ];
    // 6000 / 6 meses = 1000 (e nao 6000/2 = 3000)
    expect(computeBurnRate(series, 6)).toBe(1000);
  });

  it("usa apenas os ultimos N meses quando serie e maior que a janela", () => {
    const series = [
      m("2026-01", 99999), // ignorado
      m("2026-02", 100),
      m("2026-03", 200),
      m("2026-04", 300),
    ];
    // ultimos 3: (100+200+300)/3 = 200
    expect(computeBurnRate(series, 3)).toBe(200);
  });

  it("usa o default de 6 meses quando nao especificado", () => {
    expect(BURN_RATE_WINDOW_MONTHS).toBe(6);
    const series = Array.from({ length: 8 }, (_, i) => m(`2026-0${i + 1}`, 600));
    expect(computeBurnRate(series)).toBe(600);
  });
});

/* ------------------------------------------------------------------ */
/*  computeRunway                                                      */
/* ------------------------------------------------------------------ */

describe("computeRunway", () => {
  it("retorna null quando burn <= 0 (operacao saudavel)", () => {
    expect(computeRunway(10000, 0)).toBeNull();
    expect(computeRunway(10000, -500)).toBeNull();
  });

  it("retorna 0 quando caixa <= 0", () => {
    expect(computeRunway(0, 1000)).toBe(0);
    expect(computeRunway(-500, 1000)).toBe(0);
  });

  it("retorna meses corretos no caso happy path", () => {
    expect(computeRunway(12000, 2000)).toBe(6);
    expect(computeRunway(7500, 2500)).toBe(3);
  });

  it("nao retorna Infinity (poluicao de UI)", () => {
    const result = computeRunway(50000, 0);
    expect(result).not.toBe(Infinity);
    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  computeOperationalMargin                                           */
/* ------------------------------------------------------------------ */

describe("computeOperationalMargin", () => {
  it("retorna null quando receita <= 0", () => {
    expect(computeOperationalMargin(0, 1000)).toBeNull();
    expect(computeOperationalMargin(-500, 100)).toBeNull();
  });

  it("calcula margem positiva", () => {
    expect(computeOperationalMargin(10000, 7000)).toBeCloseTo(30, 5);
    expect(computeOperationalMargin(1000, 200)).toBeCloseTo(80, 5);
  });

  it("permite margem negativa quando despesa > receita", () => {
    expect(computeOperationalMargin(1000, 1500)).toBeCloseTo(-50, 5);
  });

  it("retorna 100 quando despesa = 0", () => {
    expect(computeOperationalMargin(1000, 0)).toBe(100);
  });
});

/* ------------------------------------------------------------------ */
/*  computeAgingBuckets                                                */
/* ------------------------------------------------------------------ */

describe("computeAgingBuckets", () => {
  const NOW = new Date("2026-05-23T12:00:00Z");
  const TODAY = "2026-05-23";

  const c = (overrides: Partial<AgingChargeInput>): AgingChargeInput => ({
    status: "atrasado",
    is_historical: false,
    due_date: "2026-05-01",
    amount: 100,
    ...overrides,
  });

  it("retorna 3 buckets sempre, mesmo sem charges", () => {
    const result = computeAgingBuckets([], NOW, TODAY);
    expect(result).toHaveLength(3);
    expect(result.map((b) => b.range)).toEqual(["0-30 dias", "30-60 dias", "60+ dias"]);
    expect(result.every((b) => b.amount === 0 && b.count === 0)).toBe(true);
  });

  it("ignora charges historicas", () => {
    const result = computeAgingBuckets([c({ is_historical: true })], NOW, TODAY);
    expect(result[0].count).toBe(0);
  });

  it("ignora charges com status diferente de pendente/atrasado", () => {
    const result = computeAgingBuckets(
      [c({ status: "pago" }), c({ status: "cancelado" }), c({ status: "agendada" })],
      NOW,
      TODAY
    );
    expect(result.every((b) => b.count === 0)).toBe(true);
  });

  it("ignora charges futuras (due_date > today)", () => {
    const result = computeAgingBuckets([c({ due_date: "2026-06-01" })], NOW, TODAY);
    expect(result.every((b) => b.count === 0)).toBe(true);
  });

  it("inclui charges com due_date = today no bucket 0-30", () => {
    const result = computeAgingBuckets([c({ due_date: TODAY })], NOW, TODAY);
    expect(result[0].count).toBe(1);
    expect(result[0].amount).toBe(100);
  });

  it("classifica corretamente nos 3 buckets", () => {
    // hoje = 2026-05-23
    const charges = [
      c({ due_date: "2026-05-20", amount: 50 }), // 3 dias -> 0-30
      c({ due_date: "2026-04-20", amount: 200 }), // 33 dias -> 30-60
      c({ due_date: "2026-02-01", amount: 300 }), // 111 dias -> 60+
    ];
    const result = computeAgingBuckets(charges, NOW, TODAY);
    expect(result[0]).toEqual({ range: "0-30 dias", amount: 50, count: 1 });
    expect(result[1]).toEqual({ range: "30-60 dias", amount: 200, count: 1 });
    expect(result[2]).toEqual({ range: "60+ dias", amount: 300, count: 1 });
  });

  it("respeita fronteiras exatas (30 vai pra bucket 0-30, 31 pra 30-60)", () => {
    // dueDate exatamente 30 dias atras -> 0-30 (<=30)
    const date30 = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    const due30 = date30.toISOString().slice(0, 10);
    const date31 = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000);
    const due31 = date31.toISOString().slice(0, 10);

    const r30 = computeAgingBuckets([c({ due_date: due30 })], NOW, TODAY);
    expect(r30[0].count).toBe(1);
    expect(r30[1].count).toBe(0);

    const r31 = computeAgingBuckets([c({ due_date: due31 })], NOW, TODAY);
    expect(r31[0].count).toBe(0);
    expect(r31[1].count).toBe(1);
  });

  it("nao acumula erro de ponto flutuante (centavos)", () => {
    // Soma classica que dispara IEEE-754: 0.1 + 0.2 = 0.30000000000000004
    const charges = [c({ amount: 0.1 }), c({ amount: 0.2 })];
    const result = computeAgingBuckets(charges, NOW, TODAY);
    expect(result[0].amount).toBe(0.3);
  });

  it("expõe constantes de fronteira", () => {
    expect(AGING_BUCKET_30).toBe(30);
    expect(AGING_BUCKET_60).toBe(60);
  });
});

/* ------------------------------------------------------------------ */
/*  computePipelineSummary                                             */
/* ------------------------------------------------------------------ */

describe("computePipelineSummary", () => {
  const prop = (over: Partial<PipelineProposal> = {}): PipelineProposal => ({
    id: "p1",
    lead_id: null,
    total_amount: 1000,
    status: "enviada",
    ...over,
  });
  const lead = (over: Partial<PipelineLead> = {}): PipelineLead => ({
    id: "l1",
    status: "proposta",
    estimated_value: 500,
    ...over,
  });
  const proj = (over: Partial<PipelineProject> = {}): PipelineProject => ({
    id: "pr1",
    status: "negociacao",
    ...over,
  });
  const contract = (over: Partial<PipelineContract> = {}): PipelineContract => ({
    id: "c1",
    project_id: "pr1",
    total_amount: 5000,
    status: "rascunho",
    ...over,
  });

  it("vazio retorna { value: 0, count: 0 }", () => {
    expect(computePipelineSummary([], [], [], [])).toEqual({ value: 0, count: 0 });
  });

  it("soma propostas enviadas", () => {
    const r = computePipelineSummary(
      [prop({ id: "a", total_amount: 100 }), prop({ id: "b", total_amount: 200 })],
      [],
      [],
      []
    );
    expect(r).toEqual({ value: 300, count: 2 });
  });

  it("ignora propostas em outros status (rascunho/aprovada/rejeitada)", () => {
    const r = computePipelineSummary(
      [
        prop({ id: "a", status: "rascunho" }),
        prop({ id: "b", status: "aprovada" }),
        prop({ id: "c", status: "rejeitada" }),
        prop({ id: "d", status: "enviada", total_amount: 1000 }),
      ],
      [],
      [],
      []
    );
    expect(r).toEqual({ value: 1000, count: 1 });
  });

  it("soma leads em proposta", () => {
    const r = computePipelineSummary(
      [],
      [lead({ id: "l1", estimated_value: 300 }), lead({ id: "l2", estimated_value: 700 })],
      [],
      []
    );
    expect(r).toEqual({ value: 1000, count: 2 });
  });

  it("ignora leads em outros status (prospeccao/qualificado/ganho/perdido)", () => {
    const r = computePipelineSummary(
      [],
      [
        lead({ id: "l1", status: "prospeccao" }),
        lead({ id: "l2", status: "qualificado" }),
        lead({ id: "l3", status: "ganho" }),
        lead({ id: "l4", status: "perdido" }),
      ],
      [],
      []
    );
    expect(r).toEqual({ value: 0, count: 0 });
  });

  it("dedup: lead em proposta com proposta enviada vinculada conta APENAS a proposta", () => {
    const r = computePipelineSummary(
      [prop({ id: "p", lead_id: "l1", total_amount: 1000 })],
      [lead({ id: "l1", estimated_value: 5000 })], // valor ignorado
      [],
      []
    );
    expect(r).toEqual({ value: 1000, count: 1 });
  });

  it("dedup tambem para propostas aprovadas (cobre todo o ciclo)", () => {
    const r = computePipelineSummary(
      [prop({ id: "p", lead_id: "l1", status: "aprovada", total_amount: 1000 })],
      [lead({ id: "l1", estimated_value: 5000 })], // ignorado
      [],
      []
    );
    // proposta aprovada NAO conta (entra via contrato rascunho ou negociacao)
    // e o lead esta dedupado -> total 0
    expect(r).toEqual({ value: 0, count: 0 });
  });

  it("soma contratos de projetos em negociacao (exceto cancelado)", () => {
    const r = computePipelineSummary(
      [],
      [],
      [
        contract({ id: "c1", project_id: "pr1", total_amount: 5000 }),
        contract({ id: "c2", project_id: "pr2", total_amount: 3000, status: "ativo" }),
        contract({ id: "c3", project_id: "pr1", total_amount: 999, status: "cancelado" }),
      ],
      [proj({ id: "pr1" }), proj({ id: "pr2", status: "em_andamento" })]
    );
    // Conta SO o contrato c1 (pr1 esta em negociacao e contrato nao cancelado)
    // pr2 esta em_andamento (nao conta); c3 esta cancelado (nao conta)
    expect(r.value).toBe(5000);
    // count = pipelineProjects (pr1) — pr2 nao esta em negociacao
    expect(r.count).toBe(1);
  });

  it("conta total combinado corretamente", () => {
    const r = computePipelineSummary(
      [prop({ id: "p1", total_amount: 100 }), prop({ id: "p2", total_amount: 200 })],
      [lead({ id: "l1", estimated_value: 50 })],
      [contract({ id: "c1", project_id: "pr1", total_amount: 1000 })],
      [proj({ id: "pr1" })]
    );
    expect(r).toEqual({ value: 100 + 200 + 50 + 1000, count: 2 + 1 + 1 });
  });

  it("trata estimated_value null", () => {
    const r = computePipelineSummary([], [lead({ estimated_value: null })], [], []);
    expect(r.value).toBe(0);
    expect(r.count).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  computeForecastRevenue                                             */
/* ------------------------------------------------------------------ */

describe("computeForecastRevenue", () => {
  const TODAY = "2026-05-23";

  const ch = (over: Partial<ForecastCharge> = {}): ForecastCharge => ({
    status: "agendada",
    is_historical: false,
    due_date: "2026-06-15",
    amount: 1000,
    ...over,
  });

  const ct = (over: Partial<PipelineContract> = {}): PipelineContract => ({
    id: "c1",
    project_id: null,
    total_amount: 5000,
    status: "rascunho",
    ...over,
  });

  it("vazio retorna 0", () => {
    expect(computeForecastRevenue([], [], TODAY)).toBe(0);
  });

  it("soma charges agendadas futuras", () => {
    expect(
      computeForecastRevenue(
        [ch({ due_date: "2026-06-01", amount: 100 }), ch({ due_date: "2026-07-01", amount: 200 })],
        [],
        TODAY
      )
    ).toBe(300);
  });

  it("ignora charges agendadas passadas ou hoje (due_date <= today)", () => {
    expect(
      computeForecastRevenue(
        [
          ch({ due_date: "2026-05-22", amount: 100 }), // ontem
          ch({ due_date: TODAY, amount: 200 }), // hoje
          ch({ due_date: "2026-05-24", amount: 300 }), // amanha
        ],
        [],
        TODAY
      )
    ).toBe(300);
  });

  it("ignora charges historicas", () => {
    expect(computeForecastRevenue([ch({ is_historical: true, amount: 999 })], [], TODAY)).toBe(0);
  });

  it("ignora charges em outros status (pendente/pago/cancelado)", () => {
    expect(
      computeForecastRevenue(
        [
          ch({ status: "pendente", amount: 100 }),
          ch({ status: "pago", amount: 200 }),
          ch({ status: "cancelado", amount: 300 }),
          ch({ status: "agendada", amount: 400 }),
        ],
        [],
        TODAY
      )
    ).toBe(400);
  });

  it("soma contratos em rascunho", () => {
    expect(
      computeForecastRevenue(
        [],
        [ct({ id: "a", total_amount: 1000 }), ct({ id: "b", total_amount: 2000 })],
        TODAY
      )
    ).toBe(3000);
  });

  it("ignora contratos em outros status (ativo/encerrado/cancelado)", () => {
    expect(
      computeForecastRevenue(
        [],
        [
          ct({ id: "a", status: "ativo", total_amount: 1000 }),
          ct({ id: "b", status: "encerrado", total_amount: 2000 }),
          ct({ id: "c", status: "cancelado", total_amount: 3000 }),
          ct({ id: "d", status: "rascunho", total_amount: 4000 }),
        ],
        TODAY
      )
    ).toBe(4000);
  });

  it("soma charges + contratos rascunho (caso happy path)", () => {
    const result = computeForecastRevenue(
      [ch({ amount: 500 })],
      [ct({ total_amount: 2500 })],
      TODAY
    );
    expect(result).toBe(3000);
  });

  it("evita IEEE-754 em centavos", () => {
    const result = computeForecastRevenue([ch({ amount: 0.1 }), ch({ amount: 0.2 })], [], TODAY);
    expect(result).toBe(0.3);
  });
});

/* ------------------------------------------------------------------ */
/*  computeForecastProjection                                          */
/* ------------------------------------------------------------------ */

describe("computeForecastProjection", () => {
  // "now" = 2026-05-23. Proximo mes = junho/2026.
  const NOW = new Date(2026, 4, 23); // mes 0-indexed: 4 = maio

  const sub = (over: Partial<ForecastSubscription> = {}): ForecastSubscription => ({
    client_id: "c1",
    amount: 1000,
    starts_on: null,
    ends_on: null,
    ...over,
  });
  const ch = (over: Partial<ForecastCharge> = {}): ForecastCharge => ({
    status: "agendada",
    is_historical: false,
    due_date: "2026-06-15",
    amount: 1000,
    ...over,
  });

  it("retorna zero pra months <= 0", () => {
    expect(computeForecastProjection(0, [], [], new Set(), NOW)).toEqual({
      recurring: 0,
      scheduled: 0,
      total: 0,
    });
    expect(computeForecastProjection(-1, [], [], new Set(), NOW)).toEqual({
      recurring: 0,
      scheduled: 0,
      total: 0,
    });
  });

  it("vazio em vazio", () => {
    expect(computeForecastProjection(3, [], [], new Set(), NOW)).toEqual({
      recurring: 0,
      scheduled: 0,
      total: 0,
    });
  });

  it("ignora subscriptions de clientes nao ativos", () => {
    const r = computeForecastProjection(
      1,
      [sub({ client_id: "c1", amount: 1000 })],
      [],
      new Set(), // c1 nao esta ativo
      NOW
    );
    expect(r.recurring).toBe(0);
  });

  it("soma subscriptions de clientes ativos por mes", () => {
    const r = computeForecastProjection(3, [sub({ amount: 500 })], [], new Set(["c1"]), NOW);
    expect(r.recurring).toBe(1500); // 500 * 3 meses
    expect(r.scheduled).toBe(0);
    expect(r.total).toBe(1500); // max(500, 0) por mes
  });

  it("respeita starts_on (subscription comeca dentro da janela)", () => {
    // Subscription que so comeca em 2026-08-01. months=3 (jun, jul, ago)
    const r = computeForecastProjection(
      3,
      [sub({ amount: 100, starts_on: "2026-08-01" })],
      [],
      new Set(["c1"]),
      NOW
    );
    // Apenas agosto conta (starts_on <= 2026-08-31)
    expect(r.recurring).toBe(100);
  });

  it("respeita ends_on (subscription termina dentro da janela)", () => {
    const r = computeForecastProjection(
      3,
      [sub({ amount: 200, ends_on: "2026-06-30" })],
      [],
      new Set(["c1"]),
      NOW
    );
    // Apenas junho conta (ends_on >= 2026-06-01)
    expect(r.recurring).toBe(200);
  });

  it("soma charges agendadas no mes correspondente", () => {
    const r = computeForecastProjection(
      2,
      [],
      [
        ch({ due_date: "2026-06-15", amount: 300 }), // junho
        ch({ due_date: "2026-07-20", amount: 400 }), // julho
        ch({ due_date: "2026-08-10", amount: 999 }), // fora da janela (months=2)
      ],
      new Set(),
      NOW
    );
    expect(r.scheduled).toBe(700);
    expect(r.total).toBe(700);
  });

  it("ignora charges historicas e em outros status", () => {
    const r = computeForecastProjection(
      1,
      [],
      [
        ch({ amount: 100, is_historical: true }),
        ch({ amount: 200, status: "pago" }),
        ch({ amount: 300, status: "pendente" }),
        ch({ amount: 400, status: "agendada" }), // unica que conta
      ],
      new Set(),
      NOW
    );
    expect(r.scheduled).toBe(400);
  });

  it("usa max(base, scheduled) para evitar double-count", () => {
    // Subscription gera charge agendada — somar os dois inflaria.
    // base 1000 / scheduled 1500 -> total deve ser 1500 (nao 2500)
    const r = computeForecastProjection(
      1,
      [sub({ amount: 1000 })],
      [ch({ amount: 1500 })],
      new Set(["c1"]),
      NOW
    );
    expect(r.recurring).toBe(1000);
    expect(r.scheduled).toBe(1500);
    expect(r.total).toBe(1500);
  });

  it("usa max independente por mes (nao soma totais agregados)", () => {
    // Mes 1: base 1000, scheduled 500 -> contribui 1000
    // Mes 2: base 1000, scheduled 1500 -> contribui 1500
    // Total = 2500 (e nao max(2000, 2000) = 2000)
    const r = computeForecastProjection(
      2,
      [sub({ amount: 1000 })],
      [ch({ amount: 500, due_date: "2026-06-15" }), ch({ amount: 1500, due_date: "2026-07-15" })],
      new Set(["c1"]),
      NOW
    );
    expect(r.recurring).toBe(2000);
    expect(r.scheduled).toBe(2000);
    expect(r.total).toBe(2500);
  });
});

/* ------------------------------------------------------------------ */
/*  computeMrrGrowth                                                   */
/* ------------------------------------------------------------------ */

describe("computeMrrGrowth", () => {
  const pt = (key: string, mrr: number): MrrSeriesPoint => ({
    key,
    recurringRevenue: mrr,
  });

  it("serie vazia retorna na", () => {
    expect(computeMrrGrowth([], 1, null)).toEqual({ kind: "na" });
  });

  it("periodo <= 0 retorna na", () => {
    expect(computeMrrGrowth([pt("2026-01", 1000)], 0, null)).toEqual({ kind: "na" });
    expect(computeMrrGrowth([pt("2026-01", 1000)], -1, null)).toEqual({ kind: "na" });
  });

  it("periodo maior que a serie retorna na", () => {
    const series = [pt("2026-01", 1000), pt("2026-02", 1200)];
    expect(computeMrrGrowth(series, 5, null)).toEqual({ kind: "na" });
  });

  it("mes-base anterior a earliestDataMonth retorna na", () => {
    const series = [pt("2026-01", 0), pt("2026-02", 0), pt("2026-03", 1000), pt("2026-04", 1500)];
    // periodo 3 -> startIdx=0 (2026-01); earliestData=2026-03 -> 01<03 -> na
    expect(computeMrrGrowth(series, 3, "2026-03")).toEqual({ kind: "na" });
  });

  it("startMrr=0 e endMrr=0 retorna value 0", () => {
    const series = [pt("2026-01", 0), pt("2026-02", 0)];
    expect(computeMrrGrowth(series, 1, null)).toEqual({ kind: "value", value: 0 });
  });

  it("startMrr=0 e endMrr>0 retorna kind=new", () => {
    const series = [pt("2026-01", 0), pt("2026-02", 1000)];
    expect(computeMrrGrowth(series, 1, null)).toEqual({ kind: "new" });
  });

  it("crescimento positivo", () => {
    const series = [pt("2026-01", 1000), pt("2026-02", 1200)];
    expect(computeMrrGrowth(series, 1, null)).toEqual({ kind: "value", value: 20 });
  });

  it("crescimento negativo (churn)", () => {
    const series = [pt("2026-01", 1000), pt("2026-02", 800)];
    expect(computeMrrGrowth(series, 1, null)).toEqual({ kind: "value", value: -20 });
  });

  it("rolling 12M honesto: precisa de 13 meses pra calcular 12M", () => {
    // 13 meses: indices 0..12. periodo=12 -> startIdx=0, endIdx=12.
    const series = Array.from({ length: 13 }, (_, i) =>
      pt(`2026-${String(i + 1).padStart(2, "0")}`, 1000 + i * 100)
    );
    const result = computeMrrGrowth(series, 12, null);
    expect(result.kind).toBe("value");
    if (result.kind === "value") {
      // (2200 - 1000) / 1000 * 100 = 120
      expect(result.value).toBeCloseTo(120, 5);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  computePercentChange                                               */
/* ------------------------------------------------------------------ */

describe("computePercentChange", () => {
  it("ambos zero retorna 0", () => {
    expect(computePercentChange(0, 0)).toBe(0);
  });

  it("previous=0 e current>0 retorna null", () => {
    expect(computePercentChange(100, 0)).toBeNull();
  });

  it("previous=0 e current<0 retorna null", () => {
    expect(computePercentChange(-100, 0)).toBeNull();
  });

  it("happy path positivo", () => {
    expect(computePercentChange(120, 100)).toBe(20);
  });

  it("happy path negativo", () => {
    expect(computePercentChange(80, 100)).toBe(-20);
  });

  it("usa |previous| para nao inverter sinal quando previous e negativo", () => {
    // Caixa indo de -1000 -> -500 e MELHORA de 50%, nao queda de -50%.
    expect(computePercentChange(-500, -1000)).toBe(50);
  });

  it("queda partindo de previous negativo", () => {
    // -1000 -> -1500 = piora de 50%
    expect(computePercentChange(-1500, -1000)).toBe(-50);
  });
});

/* ------------------------------------------------------------------ */
/*  computeTicketAverage                                               */
/* ------------------------------------------------------------------ */

describe("computeTicketAverage", () => {
  it("count = 0 retorna 0", () => {
    expect(computeTicketAverage(1000, 0)).toBe(0);
  });

  it("count negativo retorna 0", () => {
    expect(computeTicketAverage(1000, -3)).toBe(0);
  });

  it("happy path", () => {
    expect(computeTicketAverage(1000, 4)).toBe(250);
  });

  it("receita 0 retorna 0", () => {
    expect(computeTicketAverage(0, 5)).toBe(0);
  });

  it("preserva decimais", () => {
    expect(computeTicketAverage(1000, 3)).toBeCloseTo(333.33, 1);
  });
});

/* ------------------------------------------------------------------ */
/*  computeGoalProgress                                                */
/* ------------------------------------------------------------------ */

describe("computeGoalProgress", () => {
  it("target <= 0 retorna 0", () => {
    expect(computeGoalProgress(500, 0)).toBe(0);
    expect(computeGoalProgress(500, -100)).toBe(0);
  });

  it("happy path", () => {
    expect(computeGoalProgress(500, 1000)).toBe(50);
    expect(computeGoalProgress(1000, 1000)).toBe(100);
  });

  it("permite estourar 100 (meta superada)", () => {
    expect(computeGoalProgress(1500, 1000)).toBe(150);
  });

  it("0 atingido retorna 0", () => {
    expect(computeGoalProgress(0, 1000)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  isProjectOverdue                                                   */
/* ------------------------------------------------------------------ */

describe("isProjectOverdue", () => {
  const TODAY = "2026-05-23";
  const p = (over: Partial<ProjectScheduleInput> = {}): ProjectScheduleInput => ({
    status: "em_andamento",
    expected_delivery_date: "2026-05-20",
    delivered_at: null,
    ...over,
  });

  it("em_andamento com prazo passado e sem entrega = atrasado", () => {
    expect(isProjectOverdue(p(), TODAY)).toBe(true);
  });

  it("sem expected_delivery_date nao e atrasado", () => {
    expect(isProjectOverdue(p({ expected_delivery_date: null }), TODAY)).toBe(false);
  });

  it("ja entregue nao e atrasado", () => {
    expect(isProjectOverdue(p({ delivered_at: "2026-05-22T10:00:00Z" }), TODAY)).toBe(false);
  });

  it("prazo futuro nao e atrasado", () => {
    expect(isProjectOverdue(p({ expected_delivery_date: "2026-05-30" }), TODAY)).toBe(false);
  });

  it("prazo = hoje NAO e atrasado (so depois)", () => {
    expect(isProjectOverdue(p({ expected_delivery_date: TODAY }), TODAY)).toBe(false);
  });

  it("status pausado NAO e atrasado (pausa deliberada)", () => {
    expect(isProjectOverdue(p({ status: "pausado" }), TODAY)).toBe(false);
  });

  it("status negociacao NAO e atrasado (nem comecou)", () => {
    expect(isProjectOverdue(p({ status: "negociacao" }), TODAY)).toBe(false);
  });

  it("status concluido nao e atrasado", () => {
    expect(isProjectOverdue(p({ status: "concluido" }), TODAY)).toBe(false);
  });

  it("status cancelado nao e atrasado", () => {
    expect(isProjectOverdue(p({ status: "cancelado" }), TODAY)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  isProjectUpcomingDelivery                                          */
/* ------------------------------------------------------------------ */

describe("isProjectUpcomingDelivery", () => {
  const TODAY = "2026-05-23";
  const WINDOW_END = "2026-06-06";
  const p = (over: Partial<ProjectScheduleInput> = {}): ProjectScheduleInput => ({
    status: "em_andamento",
    expected_delivery_date: "2026-06-01",
    delivered_at: null,
    ...over,
  });

  it("em_andamento com prazo dentro da janela = upcoming", () => {
    expect(isProjectUpcomingDelivery(p(), TODAY, WINDOW_END)).toBe(true);
  });

  it("prazo = hoje E upcoming (inclui >= today)", () => {
    expect(isProjectUpcomingDelivery(p({ expected_delivery_date: TODAY }), TODAY, WINDOW_END)).toBe(
      true
    );
  });

  it("prazo = fim da janela E upcoming (inclusive)", () => {
    expect(
      isProjectUpcomingDelivery(p({ expected_delivery_date: WINDOW_END }), TODAY, WINDOW_END)
    ).toBe(true);
  });

  it("prazo passado nao e upcoming", () => {
    expect(
      isProjectUpcomingDelivery(p({ expected_delivery_date: "2026-05-20" }), TODAY, WINDOW_END)
    ).toBe(false);
  });

  it("prazo apos janela nao e upcoming", () => {
    expect(
      isProjectUpcomingDelivery(p({ expected_delivery_date: "2026-07-01" }), TODAY, WINDOW_END)
    ).toBe(false);
  });

  it("ja entregue nao e upcoming", () => {
    expect(
      isProjectUpcomingDelivery(p({ delivered_at: "2026-05-22T10:00:00Z" }), TODAY, WINDOW_END)
    ).toBe(false);
  });

  it("status pausado/negociacao nao e upcoming", () => {
    expect(isProjectUpcomingDelivery(p({ status: "pausado" }), TODAY, WINDOW_END)).toBe(false);
    expect(isProjectUpcomingDelivery(p({ status: "negociacao" }), TODAY, WINDOW_END)).toBe(false);
  });

  it("sem expected_delivery_date nao e upcoming", () => {
    expect(isProjectUpcomingDelivery(p({ expected_delivery_date: null }), TODAY, WINDOW_END)).toBe(
      false
    );
  });
});
