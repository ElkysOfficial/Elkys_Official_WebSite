import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import CoreChart from "@/components/portal/core/CoreChart";
import PeriodToggle, { type Period } from "@/components/portal/core/PeriodToggle";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import { cn } from "@/design-system";
import { useTheme } from "@/hooks/useDarkMode";
import {
  baseTooltip,
  dashedSplitLine,
  readChartPalette,
  verticalGradient,
  withAlpha,
} from "@/lib/core/chart-theme";
import type { EcosystemProduct } from "@/lib/core/contract";
import {
  formatCompactBRL,
  formatFullBRL,
  formatPercent,
  monthLabel,
  productChartColor,
  productCssColor,
} from "@/lib/core/format";
import { loadEcosystemSnapshot } from "@/lib/core/mock-data";

function growthOf(product: EcosystemProduct): number {
  return product.mrrPreviousMonth > 0
    ? ((product.mrr - product.mrrPreviousMonth) / product.mrrPreviousMonth) * 100
    : 0;
}

function ratioLabel(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}x`;
}

/** Descritor de uma linha do comparativo. */
type MetricRow = {
  label: string;
  get: (product: EcosystemProduct) => number;
  format: (value: number) => string;
  higherIsBetter: boolean;
};

const METRIC_ROWS: MetricRow[] = [
  { label: "MRR", get: (p) => p.mrr, format: formatFullBRL, higherIsBetter: true },
  { label: "ARR", get: (p) => p.mrr * 12, format: formatCompactBRL, higherIsBetter: true },
  {
    label: "Usuários ativos",
    get: (p) => p.activeUsers,
    format: (v) => v.toLocaleString("pt-BR"),
    higherIsBetter: true,
  },
  {
    label: "Crescimento MoM",
    get: growthOf,
    format: (v) => formatPercent(v, true),
    higherIsBetter: true,
  },
  { label: "NRR", get: (p) => p.nrr, format: formatPercent, higherIsBetter: true },
  { label: "Churn", get: (p) => p.churnRate, format: formatPercent, higherIsBetter: false },
  { label: "LTV", get: (p) => p.ltv, format: formatFullBRL, higherIsBetter: true },
  { label: "CAC", get: (p) => p.cac, format: formatFullBRL, higherIsBetter: false },
  {
    label: "LTV / CAC",
    get: (p) => (p.cac > 0 ? p.ltv / p.cac : 0),
    format: ratioLabel,
    higherIsBetter: true,
  },
  {
    label: "Health score",
    get: (p) => p.healthScore,
    format: (v) => `${v}/100`,
    higherIsBetter: true,
  },
  {
    label: "Custo de infra",
    get: (p) => p.infraCost,
    format: formatFullBRL,
    higherIsBetter: false,
  },
];

export default function CoreComparison() {
  const { resolvedTheme } = useTheme();
  const [period, setPeriod] = useState<Period>(12);

  const {
    data: snapshot,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["core-ecosystem-snapshot"],
    queryFn: loadEcosystemSnapshot,
    staleTime: 5 * 60 * 1000,
  });

  const activeProducts = useMemo(
    () => snapshot?.products.filter((product) => product.status === "ativo") ?? [],
    [snapshot]
  );

  const radarOption = useMemo(() => {
    if (activeProducts.length === 0) return null;
    const palette = readChartPalette(resolvedTheme === "dark");
    return {
      tooltip: { trigger: "item" as const, ...baseTooltip(palette) },
      legend: {
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: palette.muted, fontSize: 11 },
        data: activeProducts.map((product) => product.name),
      },
      radar: {
        radius: "62%",
        center: ["50%", "46%"],
        indicator: [
          { name: "Crescimento", max: 15 },
          { name: "NRR", max: 130 },
          { name: "LTV/CAC", max: 15 },
          { name: "Health", max: 100 },
          { name: "Retenção", max: 100 },
        ],
        axisName: { color: palette.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: palette.border, opacity: 0.6 } },
        splitArea: { areaStyle: { color: ["transparent", withAlpha(palette.muted, 0.05)] } },
        axisLine: { lineStyle: { color: palette.border, opacity: 0.6 } },
      },
      series: [
        {
          type: "radar" as const,
          data: activeProducts.map((product, index) => ({
            name: product.name,
            value: [
              Number(growthOf(product).toFixed(1)),
              product.nrr,
              Number((product.cac > 0 ? product.ltv / product.cac : 0).toFixed(1)),
              product.healthScore,
              Number((100 - product.churnRate).toFixed(1)),
            ],
            symbolSize: 5,
            lineStyle: { color: productChartColor(index), width: 2 },
            itemStyle: { color: productChartColor(index) },
            areaStyle: { color: withAlpha(productChartColor(index), 0.15) },
          })),
        },
      ],
    };
  }, [activeProducts, resolvedTheme]);

  const trajectoryOption = useMemo(() => {
    if (activeProducts.length === 0) return null;
    const palette = readChartPalette(resolvedTheme === "dark");
    const axisLabel = { color: palette.muted, fontSize: 11 };
    return {
      grid: { top: 28, right: 16, bottom: 4, left: 4, containLabel: true },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: palette.muted, fontSize: 11 },
      },
      tooltip: {
        trigger: "axis" as const,
        ...baseTooltip(palette),
        valueFormatter: (value: number | string) => formatFullBRL(Number(value)),
      },
      xAxis: {
        type: "category" as const,
        data: activeProducts[0].mrrSeries.slice(-period).map((point) => monthLabel(point.month)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel,
      },
      yAxis: {
        type: "value" as const,
        scale: true,
        axisLabel: { ...axisLabel, formatter: (value: number) => formatCompactBRL(value) },
        splitLine: dashedSplitLine(palette),
      },
      series: activeProducts.map((product, index) => ({
        name: product.name,
        type: "line" as const,
        smooth: true,
        symbol: "none" as const,
        data: product.mrrSeries.slice(-period).map((point) => point.mrr),
        lineStyle: { width: 2.5, color: productChartColor(index) },
        itemStyle: { color: productChartColor(index) },
        areaStyle: { color: verticalGradient(productChartColor(index), 0.16, 0.01) },
      })),
    };
  }, [activeProducts, period, resolvedTheme]);

  if (isLoading) return <PortalLoading />;

  if (error || !snapshot || !radarOption || !trajectoryOption) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Não foi possível carregar o comparativo de produtos.
      </div>
    );
  }

  // Para cada métrica, descobre qual produto lidera.
  const leaders = METRIC_ROWS.map((row) => {
    const values = activeProducts.map((product) => row.get(product));
    const best = row.higherIsBetter ? Math.max(...values) : Math.min(...values);
    return values.map((value) => value === best);
  });

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Comparativo lado a lado dos produtos ativos do ecossistema. Dados simulados.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/75 bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            Comparativo multidimensional
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Crescimento, retenção, eficiência e saúde, lado a lado
          </p>
          <CoreChart option={radarOption} height={300} />
        </div>

        <div className="rounded-2xl border border-border/75 bg-card p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Trajetória de MRR</h2>
              <p className="text-xs text-muted-foreground">Receita recorrente por produto</p>
            </div>
            <PeriodToggle value={period} onChange={setPeriod} />
          </div>
          <CoreChart option={trajectoryOption} height={272} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/75 bg-card">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border/75 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Métrica</th>
              {activeProducts.map((product, index) => (
                <th key={product.id} className="px-4 py-2.5 text-right font-semibold">
                  <span className="flex items-center justify-end gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: productCssColor(index) }}
                    />
                    {product.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((row, rowIndex) => (
              <tr key={row.label} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2.5 font-medium text-foreground">{row.label}</td>
                {activeProducts.map((product, productIndex) => {
                  const isLeader = leaders[rowIndex][productIndex];
                  return (
                    <td
                      key={product.id}
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums",
                        isLeader ? "font-semibold text-foreground" : "text-muted-foreground"
                      )}
                    >
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {isLeader ? <span className="h-1.5 w-1.5 rounded-full bg-success" /> : null}
                        {row.format(row.get(product))}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        O ponto verde marca o produto que lidera cada métrica.
      </p>
    </div>
  );
}
