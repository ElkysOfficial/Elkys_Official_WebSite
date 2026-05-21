import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import CoreChart from "@/components/portal/core/CoreChart";
import CoreKpiCard from "@/components/portal/core/CoreKpiCard";
import PeriodToggle, { type Period } from "@/components/portal/core/PeriodToggle";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import { useTheme } from "@/hooks/useDarkMode";
import {
  baseTooltip,
  dashedSplitLine,
  readChartPalette,
  verticalGradient,
} from "@/lib/core/chart-theme";
import {
  formatCompactBRL,
  formatFullBRL,
  formatPercent,
  monthLabel,
  productChartColor,
  productCssColor,
} from "@/lib/core/format";
import { computeEcosystemMetrics } from "@/lib/core/metrics";
import { loadEcosystemSnapshot } from "@/lib/core/mock-data";

export default function CoreConsolidatedFinance() {
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

  const charts = useMemo(() => {
    if (activeProducts.length === 0) return null;
    const palette = readChartPalette(resolvedTheme === "dark");
    const axisLabel = { color: palette.muted, fontSize: 11 };

    return {
      revenue: {
        grid: { top: 16, right: 16, bottom: 4, left: 4, containLabel: true },
        tooltip: {
          trigger: "axis" as const,
          ...baseTooltip(palette),
          valueFormatter: (value: number | string) => formatCompactBRL(Number(value)),
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
          axisLabel: { ...axisLabel, formatter: (value: number) => formatCompactBRL(value) },
          splitLine: dashedSplitLine(palette),
        },
        series: activeProducts.map((product, index) => ({
          name: product.name,
          type: "line" as const,
          stack: "receita",
          smooth: true,
          symbol: "none" as const,
          data: product.mrrSeries.slice(-period).map((point) => point.mrr),
          lineStyle: { width: 2, color: productChartColor(index) },
          areaStyle: { color: verticalGradient(productChartColor(index), 0.4, 0.05) },
        })),
      },
      infraCost: {
        tooltip: {
          trigger: "item" as const,
          ...baseTooltip(palette),
          valueFormatter: (value: number | string) => formatFullBRL(Number(value)),
        },
        series: [
          {
            type: "pie" as const,
            radius: ["56%", "82%"],
            center: ["50%", "50%"],
            padAngle: 2,
            itemStyle: { borderRadius: 6, borderColor: palette.card, borderWidth: 2 },
            label: { show: false },
            labelLine: { show: false },
            data: activeProducts.map((product, index) => ({
              value: product.infraCost,
              name: product.name,
              itemStyle: { color: productChartColor(index) },
            })),
          },
        ],
      },
    };
  }, [activeProducts, period, resolvedTheme]);

  if (isLoading) return <PortalLoading />;

  if (error || !snapshot || !charts) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Não foi possível carregar o financeiro consolidado.
      </div>
    );
  }

  const metrics = computeEcosystemMetrics(snapshot);
  const totalMargin = metrics.totalMrr - metrics.totalInfraCost;
  const marginPct = metrics.totalMrr > 0 ? (totalMargin / metrics.totalMrr) * 100 : 0;

  const rows = activeProducts.map((product) => {
    const margin = product.mrr - product.infraCost;
    return {
      product,
      margin,
      marginPct: product.mrr > 0 ? (margin / product.mrr) * 100 : 0,
    };
  });

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Receita recorrente e custo de infraestrutura consolidados dos produtos ativos. Dados
        simulados.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CoreKpiCard
          label="Receita recorrente"
          value={formatCompactBRL(metrics.totalMrr)}
          hint="MRR consolidado"
        />
        <CoreKpiCard
          label="Custo de infra"
          value={formatCompactBRL(metrics.totalInfraCost)}
          hint="Mensal, todos os produtos"
        />
        <CoreKpiCard
          label="Margem bruta"
          value={formatCompactBRL(totalMargin)}
          hint="Receita menos infraestrutura"
          hintTone={totalMargin >= 0 ? "success" : "destructive"}
        />
        <CoreKpiCard
          label="Margem"
          value={formatPercent(marginPct)}
          hint="Margem bruta sobre a receita"
          hintTone={marginPct >= 0 ? "success" : "destructive"}
        />
      </div>

      <div className="rounded-2xl border border-border/75 bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Receita consolidada</h2>
            <p className="text-xs text-muted-foreground">Empilhada por produto</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 sm:flex">
              {activeProducts.map((product, index) => (
                <span
                  key={product.id}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span
                    className="h-2 w-2 rounded-[2px]"
                    style={{ backgroundColor: productCssColor(index) }}
                  />
                  {product.name}
                </span>
              ))}
            </div>
            <PeriodToggle value={period} onChange={setPeriod} />
          </div>
        </div>
        <CoreChart option={charts.revenue} height={280} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border/75 bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Custo de infra por produto</h2>
          <p className="text-xs text-muted-foreground">Participação no custo mensal</p>
          <CoreChart option={charts.infraCost} height={176} />
          <div className="mt-2 space-y-1.5">
            {activeProducts.map((product, index) => (
              <div key={product.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-[2px]"
                    style={{ backgroundColor: productCssColor(index) }}
                  />
                  {product.name}
                </span>
                <span className="font-semibold text-foreground">
                  {formatFullBRL(product.infraCost)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border/75 bg-card lg:col-span-2">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border/75 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Produto</th>
                <th className="px-4 py-2.5 text-right font-semibold">MRR</th>
                <th className="px-4 py-2.5 text-right font-semibold">Custo infra</th>
                <th className="px-4 py-2.5 text-right font-semibold">Margem bruta</th>
                <th className="px-4 py-2.5 text-right font-semibold">Margem %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product, margin, marginPct: productMarginPct }) => (
                <tr key={product.id} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-foreground">{product.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {formatFullBRL(product.mrr)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatFullBRL(product.infraCost)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-foreground">
                    {formatFullBRL(margin)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatPercent(productMarginPct)}
                  </td>
                </tr>
              ))}
              <tr className="bg-background/40 font-semibold">
                <td className="px-4 py-2.5 text-foreground">Consolidado</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatFullBRL(metrics.totalMrr)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatFullBRL(metrics.totalInfraCost)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatFullBRL(totalMargin)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatPercent(marginPct)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
