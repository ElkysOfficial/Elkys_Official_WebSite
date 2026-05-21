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
  solidGradient,
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

function ratioLabel(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}x`;
}

export default function CoreMetrics() {
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

  // Série consolidada do ecossistema, mês a mês, recortada ao período.
  const consolidated = useMemo(() => {
    if (activeProducts.length === 0) return [];
    const full = activeProducts[0].mrrSeries;
    const start = Math.max(0, full.length - period);
    return full.slice(start).map((point, sliceIndex) => {
      const index = start + sliceIndex;
      return {
        label: monthLabel(point.month),
        mrr: activeProducts.reduce((sum, p) => sum + (p.mrrSeries[index]?.mrr ?? 0), 0),
        newCustomers: activeProducts.reduce(
          (sum, p) => sum + (p.mrrSeries[index]?.newCustomers ?? 0),
          0
        ),
        churnedCustomers: activeProducts.reduce(
          (sum, p) => sum + (p.mrrSeries[index]?.churnedCustomers ?? 0),
          0
        ),
      };
    });
  }, [activeProducts, period]);

  const charts = useMemo(() => {
    if (activeProducts.length === 0) return null;
    const isDark = resolvedTheme === "dark";
    const palette = readChartPalette(isDark);
    const labels = consolidated.map((point) => point.label);
    const axisLabel = { color: palette.muted, fontSize: 11 };
    const categoryAxis = {
      type: "category" as const,
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel,
    };

    return {
      mrr: {
        grid: { top: 16, right: 16, bottom: 4, left: 4, containLabel: true },
        tooltip: {
          trigger: "axis" as const,
          ...baseTooltip(palette),
          valueFormatter: (value: number | string) => formatFullBRL(Number(value)),
        },
        xAxis: categoryAxis,
        yAxis: {
          type: "value" as const,
          scale: true,
          axisLabel: { ...axisLabel, formatter: (value: number) => formatCompactBRL(value) },
          splitLine: dashedSplitLine(palette),
        },
        series: [
          {
            name: "MRR consolidado",
            type: "line" as const,
            smooth: true,
            symbol: "circle" as const,
            symbolSize: 6,
            data: consolidated.map((point) => point.mrr),
            lineStyle: { width: 2.5, color: palette.primary },
            itemStyle: { color: palette.primary },
            areaStyle: { color: verticalGradient(palette.primary, 0.34, 0.02) },
          },
        ],
      },
      users: {
        grid: { top: 16, right: 16, bottom: 4, left: 4, containLabel: true },
        tooltip: {
          trigger: "axis" as const,
          ...baseTooltip(palette),
          valueFormatter: (value: number | string) => `${value} usuários`,
        },
        xAxis: categoryAxis,
        yAxis: {
          type: "value" as const,
          axisLabel,
          splitLine: dashedSplitLine(palette),
        },
        series: activeProducts.map((product, index) => ({
          name: product.name,
          type: "line" as const,
          stack: "users",
          smooth: true,
          symbol: "none" as const,
          data: product.mrrSeries.slice(-period).map((point) => point.activeUsers),
          lineStyle: { width: 2, color: productChartColor(index) },
          areaStyle: { color: verticalGradient(productChartColor(index), 0.3, 0.04) },
        })),
      },
      customers: {
        grid: { top: 24, right: 16, bottom: 4, left: 4, containLabel: true },
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
          valueFormatter: (value: number | string) => `${value} clientes`,
        },
        xAxis: categoryAxis,
        yAxis: {
          type: "value" as const,
          axisLabel,
          splitLine: dashedSplitLine(palette),
        },
        series: [
          {
            name: "Novos",
            type: "bar" as const,
            data: consolidated.map((point) => point.newCustomers),
            itemStyle: { color: solidGradient(palette.success), borderRadius: [4, 4, 0, 0] },
            barMaxWidth: 18,
          },
          {
            name: "Cancelados",
            type: "bar" as const,
            data: consolidated.map((point) => point.churnedCustomers),
            itemStyle: { color: solidGradient(palette.destructive), borderRadius: [4, 4, 0, 0] },
            barMaxWidth: 18,
          },
        ],
      },
    };
  }, [activeProducts, consolidated, period, resolvedTheme]);

  if (isLoading) return <PortalLoading />;

  if (error || !snapshot || !charts) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Não foi possível carregar as métricas do ecossistema.
      </div>
    );
  }

  const metrics = computeEcosystemMetrics(snapshot);

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Métricas SaaS consolidadas dos produtos ativos. Dados simulados.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <CoreKpiCard
          label="MRR consolidado"
          value={formatCompactBRL(metrics.totalMrr)}
          hint={
            metrics.mrrGrowthMoM === null
              ? "Sem base"
              : `${formatPercent(metrics.mrrGrowthMoM, true)} no mês`
          }
          hintTone={
            metrics.mrrGrowthMoM !== null && metrics.mrrGrowthMoM >= 0 ? "success" : "destructive"
          }
        />
        <CoreKpiCard
          label="ARR projetado"
          value={formatCompactBRL(metrics.totalArr)}
          hint="MRR x 12"
        />
        <CoreKpiCard
          label="NRR médio"
          value={formatPercent(metrics.avgNrr)}
          hint="Acima de 100% indica expansão"
          hintTone={metrics.avgNrr >= 100 ? "success" : "destructive"}
        />
        <CoreKpiCard
          label="LTV / CAC"
          value={ratioLabel(metrics.ltvCacRatio)}
          hint="Saudável a partir de 3x"
          hintTone={metrics.ltvCacRatio >= 3 ? "success" : "destructive"}
        />
        <CoreKpiCard
          label="CAC combinado"
          value={formatFullBRL(metrics.blendedCac)}
          hint={`${metrics.newCustomersThisMonth} clientes novos no mês`}
        />
        <CoreKpiCard
          label="Churn ponderado"
          value={formatPercent(metrics.weightedChurn)}
          hint="Médio, ponderado pelo MRR"
          hintTone={metrics.weightedChurn > 5 ? "destructive" : "neutral"}
        />
      </div>

      <div className="rounded-2xl border border-border/75 bg-card p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">MRR consolidado</h2>
            <p className="text-xs text-muted-foreground">Receita recorrente do ecossistema</p>
          </div>
          <PeriodToggle value={period} onChange={setPeriod} />
        </div>
        <CoreChart option={charts.mrr} height={280} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/75 bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Base de usuários</h2>
          <p className="mb-3 text-xs text-muted-foreground">Usuários ativos por produto</p>
          <CoreChart option={charts.users} height={240} />
        </div>
        <div className="rounded-2xl border border-border/75 bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Novos vs. cancelados</h2>
          <p className="mb-3 text-xs text-muted-foreground">Clientes por mês, ecossistema</p>
          <CoreChart option={charts.customers} height={240} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/75 bg-card">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border/75 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Produto</th>
              <th className="px-4 py-2.5 text-right font-semibold">MRR</th>
              <th className="px-4 py-2.5 text-right font-semibold">NRR</th>
              <th className="px-4 py-2.5 text-right font-semibold">Churn</th>
              <th className="px-4 py-2.5 text-right font-semibold">CAC</th>
              <th className="px-4 py-2.5 text-right font-semibold">LTV</th>
              <th className="px-4 py-2.5 text-right font-semibold">LTV:CAC</th>
              <th className="px-4 py-2.5 text-right font-semibold">ARPU</th>
            </tr>
          </thead>
          <tbody>
            {activeProducts.map((product, index) => {
              const arpu = product.activeUsers > 0 ? product.mrr / product.activeUsers : 0;
              const ratio = product.cac > 0 ? product.ltv / product.cac : 0;
              return (
                <tr key={product.id} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: productCssColor(index) }}
                      />
                      {product.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                    {formatFullBRL(product.mrr)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatPercent(product.nrr)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatPercent(product.churnRate)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatFullBRL(product.cac)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatFullBRL(product.ltv)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-foreground">
                    {ratioLabel(ratio)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatFullBRL(arpu)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
