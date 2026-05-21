import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import CoreChart from "@/components/portal/core/CoreChart";
import CoreKpiCard from "@/components/portal/core/CoreKpiCard";
import PeriodToggle, { type Period } from "@/components/portal/core/PeriodToggle";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import { cn } from "@/design-system";
import { useTheme } from "@/hooks/useDarkMode";
import {
  baseTooltip,
  dashedSplitLine,
  readChartPalette,
  solidGradient,
} from "@/lib/core/chart-theme";
import type { EcosystemProduct } from "@/lib/core/contract";
import {
  STATUS_LABEL,
  formatCompactBRL,
  formatFullBRL,
  formatPercent,
  healthToneClass,
  monthLabel,
  productChartColor,
  productCssColor,
} from "@/lib/core/format";
import { computeEcosystemMetrics } from "@/lib/core/metrics";
import { loadEcosystemSnapshot } from "@/lib/core/mock-data";

type EChartsTooltipParam = {
  axisValue?: string;
  seriesName?: string;
  value?: number;
  marker?: string;
};

function ProductCard({ product, color }: { product: EcosystemProduct; color: string }) {
  const isActive = product.status === "ativo";
  const momChange =
    product.mrrPreviousMonth > 0
      ? ((product.mrr - product.mrrPreviousMonth) / product.mrrPreviousMonth) * 100
      : null;

  return (
    <Link
      to={`/portal/core/produtos/${product.slug}`}
      className="block rounded-2xl border border-border/75 bg-card p-4 transition-colors hover:border-primary/30"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-foreground">{product.name}</span>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            isActive ? "bg-success/12 text-success" : "bg-muted text-muted-foreground"
          )}
        >
          {STATUS_LABEL[product.status]}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{product.description}</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">MRR</p>
          <p className="text-base font-semibold text-foreground">{formatFullBRL(product.mrr)}</p>
          {momChange !== null ? (
            <p
              className={cn(
                "text-xs font-medium",
                momChange >= 0 ? "text-success" : "text-destructive"
              )}
            >
              {formatPercent(momChange, true)} no mês
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Usuários ativos
          </p>
          <p className="text-base font-semibold text-foreground">
            {product.activeUsers.toLocaleString("pt-BR")}
          </p>
          <p className="text-xs font-medium text-muted-foreground">
            churn {formatPercent(product.churnRate)}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="uppercase tracking-wide">Health score</span>
          <span className="font-semibold text-foreground">{product.healthScore}/100</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", healthToneClass(product.healthScore))}
            style={{ width: `${product.healthScore}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

export default function CoreCommandCenter() {
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

  const { labels, series } = useMemo(() => {
    if (activeProducts.length === 0) return { labels: [] as string[], series: [] };
    const months = activeProducts[0].mrrSeries.map((point) => point.month).slice(-period);
    return {
      labels: months.map(monthLabel),
      series: activeProducts.map((product) => ({
        product,
        values: product.mrrSeries.slice(-period).map((point) => point.mrr),
      })),
    };
  }, [activeProducts, period]);

  const barOption = useMemo(() => {
    const palette = readChartPalette(resolvedTheme === "dark");
    return {
      grid: { top: 16, right: 14, bottom: 4, left: 4, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        ...baseTooltip(palette),
        formatter: (raw: unknown) => {
          const params = (Array.isArray(raw) ? raw : [raw]) as EChartsTooltipParam[];
          const total = params.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
          const rows = params
            .map(
              (item) =>
                `<div style="display:flex;justify-content:space-between;gap:16px">` +
                `<span>${item.marker ?? ""}${item.seriesName ?? ""}</span>` +
                `<strong>${formatCompactBRL(Number(item.value ?? 0))}</strong></div>`
            )
            .join("");
          return (
            `<div style="font-size:11px;text-transform:uppercase;opacity:0.6;margin-bottom:4px">` +
            `${params[0]?.axisValue ?? ""}</div>${rows}` +
            `<div style="display:flex;justify-content:space-between;gap:16px;` +
            `border-top:1px solid ${palette.border};margin-top:4px;padding-top:4px">` +
            `<span>Total</span><strong>${formatCompactBRL(total)}</strong></div>`
          );
        },
      },
      xAxis: {
        type: "category" as const,
        data: labels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: palette.muted, fontSize: 11 },
      },
      yAxis: {
        type: "value" as const,
        axisLabel: {
          color: palette.muted,
          fontSize: 11,
          formatter: (value: number) => formatCompactBRL(value),
        },
        splitLine: dashedSplitLine(palette),
      },
      series: series.map((entry, index) => ({
        name: entry.product.name,
        type: "bar" as const,
        stack: "mrr",
        barMaxWidth: 40,
        itemStyle: {
          color: solidGradient(productChartColor(index)),
          borderRadius: index === series.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0],
        },
        data: entry.values,
      })),
    };
  }, [labels, series, resolvedTheme]);

  const donutOption = useMemo(() => {
    const palette = readChartPalette(resolvedTheme === "dark");
    return {
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
          avoidLabelOverlap: false,
          padAngle: 2,
          itemStyle: { borderRadius: 6, borderColor: palette.card, borderWidth: 2 },
          label: { show: false },
          labelLine: { show: false },
          data: activeProducts.map((product, index) => ({
            value: product.mrr,
            name: product.name,
            itemStyle: { color: productChartColor(index) },
          })),
        },
      ],
    };
  }, [activeProducts, resolvedTheme]);

  if (isLoading) return <PortalLoading />;

  if (error || !snapshot) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Não foi possível carregar o snapshot do ecossistema.
      </div>
    );
  }

  const metrics = computeEcosystemMetrics(snapshot);
  const growthTone =
    metrics.mrrGrowthMoM === null
      ? "neutral"
      : metrics.mrrGrowthMoM >= 0
        ? "success"
        : "destructive";
  const riskiest = [...activeProducts].sort((a, b) => b.churnRate - a.churnRate)[0];
  const asOfLabel = new Date(snapshot.asOf).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Snapshot consolidado de {asOfLabel} · {metrics.activeProductCount} produtos ativos
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CoreKpiCard
          label="MRR consolidado"
          value={formatCompactBRL(metrics.totalMrr)}
          hint={
            metrics.mrrGrowthMoM === null
              ? "Sem base de comparação"
              : `${formatPercent(metrics.mrrGrowthMoM, true)} vs. mês anterior`
          }
          hintTone={growthTone}
        />
        <CoreKpiCard
          label="ARR projetado"
          value={formatCompactBRL(metrics.totalArr)}
          hint="MRR consolidado x 12"
        />
        <CoreKpiCard
          label="Churn ponderado"
          value={formatPercent(metrics.weightedChurn)}
          hint="Médio, ponderado pelo MRR"
          hintTone={metrics.weightedChurn > 5 ? "destructive" : "neutral"}
        />
        <CoreKpiCard
          label="Custo de infra"
          value={formatCompactBRL(metrics.totalInfraCost)}
          hint={`${metrics.totalActiveUsers.toLocaleString("pt-BR")} usuários ativos`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border/75 bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">MRR consolidado por produto</h2>
              <p className="text-xs text-muted-foreground">Empilhado, em reais</p>
            </div>
            <PeriodToggle value={period} onChange={setPeriod} />
          </div>
          <CoreChart option={barOption} height={288} />
        </div>

        <div className="rounded-2xl border border-border/75 bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Distribuição do MRR</h2>
          <p className="text-xs text-muted-foreground">Participação de cada produto</p>
          <CoreChart option={donutOption} height={188} />
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
                  {metrics.totalMrr > 0
                    ? formatPercent((product.mrr / metrics.totalMrr) * 100)
                    : "0%"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Produtos do ecossistema</h2>
          <Link to="/portal/core/produtos" className="text-xs font-medium text-primary">
            Ver todos
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {snapshot.products.map((product) => {
            const colorIndex = activeProducts.findIndex((item) => item.id === product.id);
            return (
              <ProductCard
                key={product.id}
                product={product}
                color={productCssColor(colorIndex < 0 ? 0 : colorIndex)}
              />
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border/75 bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Sinais do ecossistema</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
            {metrics.mrrGrowthMoM !== null && metrics.mrrGrowthMoM >= 0
              ? `MRR consolidado cresceu ${formatPercent(metrics.mrrGrowthMoM)} no último mês.`
              : "MRR consolidado recuou no último mês; vale revisar aquisição e churn."}
          </li>
          {riskiest ? (
            <li className="flex gap-2">
              <span aria-hidden className="text-muted-foreground/60">
                ·
              </span>
              {`${riskiest.name} tem o maior churn (${formatPercent(riskiest.churnRate)}) entre os produtos ativos.`}
            </li>
          ) : null}
          <li className="flex gap-2">
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
            Dados simulados: ao conectar o Elkys Hub, estes sinais passam a refletir os produtos
            reais sem alteração nas telas.
          </li>
        </ul>
      </div>
    </div>
  );
}
