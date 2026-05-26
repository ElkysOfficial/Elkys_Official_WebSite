import { describe, expect, it } from "vitest";

import {
  computeLeadConversionRate,
  computeNewLeadsInWindow,
  computeProposalApprovalRate,
  computeTopLeadSources,
  type LeadStatusForMetrics,
} from "./crm-metrics";

/* ------------------------------------------------------------------ */
/*  computeLeadConversionRate                                          */
/* ------------------------------------------------------------------ */

describe("computeLeadConversionRate", () => {
  const l = (status: string): LeadStatusForMetrics => ({ status });

  it("vazio retorna 0", () => {
    expect(computeLeadConversionRate([])).toBe(0);
  });

  it("sem nenhum lead decidido retorna 0", () => {
    expect(computeLeadConversionRate([l("prospeccao"), l("qualificado"), l("proposta")])).toBe(0);
  });

  it("ignora leads abertos no denominador", () => {
    // 1 ganho, 0 perdido, 50 abertos -> 100%
    const abertos = Array.from({ length: 50 }, () => l("prospeccao"));
    const all = [l("ganho"), ...abertos];
    expect(computeLeadConversionRate(all)).toBe(100);
  });

  it("calcula corretamente com decididos", () => {
    // 10 ganho + 15 perdido = 25 decididos -> 40%
    const ganhos = Array.from({ length: 10 }, () => l("ganho"));
    const perdidos = Array.from({ length: 15 }, () => l("perdido"));
    expect(computeLeadConversionRate([...ganhos, ...perdidos])).toBe(40);
  });

  it("100% quando todos decididos sao ganho", () => {
    expect(computeLeadConversionRate([l("ganho"), l("ganho"), l("ganho")])).toBe(100);
  });

  it("0% quando todos decididos sao perdido", () => {
    expect(computeLeadConversionRate([l("perdido"), l("perdido")])).toBe(0);
  });

  it("ignora status desconhecidos", () => {
    expect(computeLeadConversionRate([l("ganho"), l("perdido"), l("garbage")])).toBe(50);
  });

  it("arredonda para inteiro", () => {
    // 1 ganho + 2 perdido = 33.333% -> 33
    expect(computeLeadConversionRate([l("ganho"), l("perdido"), l("perdido")])).toBe(33);
  });
});

/* ------------------------------------------------------------------ */
/*  computeProposalApprovalRate                                        */
/* ------------------------------------------------------------------ */

describe("computeProposalApprovalRate", () => {
  const p = (status: string) => ({ status });

  it("vazio retorna 0", () => {
    expect(computeProposalApprovalRate([])).toBe(0);
  });

  it("sem decididas (so rascunho/enviada) retorna 0", () => {
    expect(computeProposalApprovalRate([p("rascunho"), p("enviada"), p("enviada")])).toBe(0);
  });

  it("ignora rascunho e enviada no denominador", () => {
    // 1 aprovada + 50 enviadas -> 100%
    const enviadas = Array.from({ length: 50 }, () => p("enviada"));
    expect(computeProposalApprovalRate([p("aprovada"), ...enviadas])).toBe(100);
  });

  it("inclui expirada como rejeicao implicita no denominador", () => {
    // 1 aprovada, 1 rejeitada, 1 expirada = 3 decididas -> 33%
    expect(computeProposalApprovalRate([p("aprovada"), p("rejeitada"), p("expirada")])).toBe(33);
  });

  it("100% so com aprovada", () => {
    expect(computeProposalApprovalRate([p("aprovada"), p("aprovada")])).toBe(100);
  });

  it("0% com so rejeitada/expirada", () => {
    expect(computeProposalApprovalRate([p("rejeitada"), p("expirada")])).toBe(0);
  });

  it("arredonda para inteiro", () => {
    // 2 aprovada / (2+1+1) = 50%
    expect(
      computeProposalApprovalRate([p("aprovada"), p("aprovada"), p("rejeitada"), p("expirada")])
    ).toBe(50);
  });
});

/* ------------------------------------------------------------------ */
/*  computeNewLeadsInWindow                                            */
/* ------------------------------------------------------------------ */

describe("computeNewLeadsInWindow", () => {
  const NOW = new Date("2026-05-23T12:00:00Z");

  const l = (created_at: string | null): LeadStatusForMetrics => ({
    status: "prospeccao",
    created_at,
  });

  it("janela <= 0 retorna 0", () => {
    expect(computeNewLeadsInWindow([l("2026-05-22T10:00:00Z")], 0, NOW)).toBe(0);
    expect(computeNewLeadsInWindow([l("2026-05-22T10:00:00Z")], -3, NOW)).toBe(0);
  });

  it("vazio retorna 0", () => {
    expect(computeNewLeadsInWindow([], 7, NOW)).toBe(0);
  });

  it("ignora leads sem created_at", () => {
    expect(computeNewLeadsInWindow([l(null), l(undefined as never)], 7, NOW)).toBe(0);
  });

  it("ignora leads com created_at invalido", () => {
    expect(computeNewLeadsInWindow([l("nao-e-data")], 7, NOW)).toBe(0);
  });

  it("conta leads dentro da janela rolling", () => {
    const within = [
      l("2026-05-23T08:00:00Z"), // hoje, 4h atras
      l("2026-05-20T12:00:00Z"), // 3 dias
      l("2026-05-16T12:00:01Z"), // ~6.999 dias atras
    ];
    expect(computeNewLeadsInWindow(within, 7, NOW)).toBe(3);
  });

  it("exclui leads fora da janela (estritamente antes do cutoff)", () => {
    const fora = [
      l("2026-05-16T11:59:00Z"), // ~7d e 1m atras (fora)
      l("2026-05-01T12:00:00Z"), // 22 dias
    ];
    expect(computeNewLeadsInWindow(fora, 7, NOW)).toBe(0);
  });

  it("inclui exatamente no cutoff (>=)", () => {
    // exato 7 dias atras
    expect(computeNewLeadsInWindow([l("2026-05-16T12:00:00Z")], 7, NOW)).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  computeTopLeadSources                                              */
/* ------------------------------------------------------------------ */

describe("computeTopLeadSources", () => {
  const l = (source: string | null): LeadStatusForMetrics => ({
    status: "prospeccao",
    source,
  });

  it("vazio retorna []", () => {
    expect(computeTopLeadSources([], 3)).toEqual([]);
  });

  it("limit <= 0 retorna []", () => {
    expect(computeTopLeadSources([l("inbound")], 0)).toEqual([]);
  });

  it("source null/vazio vira 'nao_informada'", () => {
    const result = computeTopLeadSources([l(null), l(""), l("   ")], 5);
    expect(result).toEqual([["nao_informada", 3]]);
  });

  it("normaliza case e whitespace (sem dedup duplicado)", () => {
    const result = computeTopLeadSources(
      [l("Inbound"), l("inbound"), l(" INBOUND  "), l("evento")],
      5
    );
    expect(result).toEqual([
      ["inbound", 3],
      ["evento", 1],
    ]);
  });

  it("ordena desc por contagem", () => {
    const result = computeTopLeadSources(
      [
        l("evento"),
        l("inbound"),
        l("inbound"),
        l("rede_social"),
        l("rede_social"),
        l("rede_social"),
      ],
      3
    );
    expect(result).toEqual([
      ["rede_social", 3],
      ["inbound", 2],
      ["evento", 1],
    ]);
  });

  it("respeita limit", () => {
    const sources = ["a", "b", "c", "d", "e"].map((s) => l(s));
    expect(computeTopLeadSources(sources, 3)).toHaveLength(3);
  });
});
