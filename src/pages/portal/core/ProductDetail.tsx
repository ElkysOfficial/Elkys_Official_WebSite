import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { ArrowLeft } from "@/assets/icons";
import CoreChart from "@/components/portal/core/CoreChart";
import CoreKpiCard from "@/components/portal/core/CoreKpiCard";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import { cn } from "@/design-system";
import { useTheme } from "@/hooks/useDarkMode";
import {
  baseTooltip,
  dashedSplitLine,
  readChartPalette,
  solidGradient,
  verticalGradient,
} from "@/lib/core/chart-theme";
import {
  STATUS_LABEL,
  formatCompactBRL,
  formatFullBRL,
  formatPercent,
  healthToneClass,
  monthLabel,
  productChartColor,
} from "@/lib/core/format";
import { computeEcosystemMetrics } from "@/lib/core/metrics";
import { loadEcosystemSnapshot } from "@/lib/core/mock-data";

export default function CoreProductDetail() {
  const { slug } = useParams();
  const { resolvedTheme } = useTheme();
  const {
    data: snapshot,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["core-ecosystem-snapshot"],
    queryFn: loadEcosystemSnapshot,
    staleTime: 5 * 60 * 1000,
  });

  const product = snapshot?.products.find((item) => item.slug === slug);
  const productIndex = snapshot?.products.findIndex((item) => item.slug === slug) ?? 0;

  const charts = useMemo(() => {
    if (!product) return null;
    const palette = readChartPalette(resolvedTheme === "dark");
    const color = productChartColor(productIndex);
    const labels = product.mrrSeries.map((point) => monthLabel(point.month));
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
            name: "MRR",
            type: "line" as const,
            smooth: true,
            symbol: "circle" as const,
            symbolSize: 7,
            data: product.mrrSeries.map((point) => point.mrr),
            lineStyle: { width: 2.5, color },
            itemStyle: { color },
            areaStyle: { color: verticalGradient(color, 0.34, 0.02) },
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
          scale: true,
          axisLabel,
          splitLine: dashedSplitLine(palette),
        },
        series: [
          {
            name: "Usuários ativos",
            type: "line" as const,
            smooth: true,
            symbol: "none" as const,
            data: product.mrrSeries.map((point) => point.activeUsers),
            lineStyle: { width: 2.5, color },
            areaStyle: { color: verticalGradient(color, 0.3, 0.02) },
          },
        ],
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
        yAxis: { type: "value" as const, axisLabel, splitLine: dashedSplitLine(palette) },
        series: [
          {
            name: "Novos",
            type: "bar" as const,
            data: product.mrrSeries.map((point) => point.newCustomers),
            itemStyle: { color: solidGradient(palette.success), borderRadius: [4, 4, 0, 0] },
            barMaxWidth: 16,
          },
          {
            name: "Cancelados",
            type: "bar" as const,
            data: product.mrrSeries.map((point) => point.churnedCustomers),
            itemStyle: { color: solidGradient(palette.destructive), borderRadius: [4, 4, 0, 0] },
            barMaxWidth: 16,
          },
        ],
      },
    };
  }, [product, productIndex, resolvedTheme]);

  if (isLoading) return <PortalLoading />;

  if (error || !snapshot) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Não foi possível carregar o produto.
      </div>
    );
  }

  if (!product || !charts) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <p className="text-sm font-semibold text-foreground">Produto não encontrado</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Nenhum produto do ecossistema corresponde a "{slug}".
        </p>
        <Link
          to="/portal/core/produtos"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border/75 bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30"
        >
          <ArrowLeft size={14} />
          Ver todos os produtos
        </Link>
      </div>
    );
  }

  const metrics = computeEcosystemMetrics(snapshot);
  const momChange =
    product.mrrPreviousMonth > 0
      ? ((product.mrr - product.mrrPreviousMonth) / product.mrrPreviousMonth) * 100
      : null;
  const ecosystemShare = metrics.totalMrr > 0 ? (product.mrr / metrics.totalMrr) * 100 : 0;
  const arpu = product.activeUsers > 0 ? product.mrr / product.activeUsers : 0;

  return (
    <div className="space-y-6">
      <Link
        to="/portal/core/produtos"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Produtos
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{product.name}</h1>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            product.status === "ativo"
              ? "bg-success/12 text-success"
              : "bg-muted text-muted-foreground"
          )}
        >
          {STATUS_LABEL[product.status]}
        </span>
        <span className="text-sm text-muted-foreground">{product.description}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CoreKpiCard label="MRR atual" value={formatFullBRL(product.mrr)} />
        <CoreKpiCard
          label="Crescimento MoM"
          value={momChange === null ? "Sem base" : formatPercent(momChange, true)}
          hint="vs. mês anterior"
          hintTone={momChange === null ? "neutral" : momChange >= 0 ? "success" : "destructive"}
        />
        <CoreKpiCard
          label="Usuários ativos"
          value={product.activeUsers.toLocaleString("pt-BR")}
          hint={`ARPU ${formatFullBRL(arpu)}`}
        />
        <CoreKpiCard
          label="Churn"
          value={formatPercent(product.churnRate)}
          hint="Churn de receita no mês"
          hintTone={product.churnRate > 5 ? "destructive" : "neutral"}
        />
      </div>

      <div className="rounded-2xl border border-border/75 bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">MRR ao longo do tempo</h2>
        <p className="mb-3 text-xs text-muted-foreground">Últimos 12 meses, em reais</p>
        <CoreChart option={charts.mrr} height={280} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/75 bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Usuários ativos</h2>
          <p className="mb-3 text-xs text-muted-foreground">Evolução da base, 12 meses</p>
          <CoreChart option={charts.users} height={224} />
        </div>
        <div className="rounded-2xl border border-border/75 bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Novos vs. cancelados</h2>
          <p className="mb-3 text-xs text-muted-foreground">Clientes por mês</p>
          <CoreChart option={charts.customers} height={224} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CoreKpiCard label="ARR do produto" value={formatCompactBRL(product.mrr * 12)} />
        <CoreKpiCard
          label="Participação no MRR"
          value={formatPercent(ecosystemShare)}
          hint="Fatia do MRR do ecossistema"
        />
        <CoreKpiCard
          label="NRR"
          value={formatPercent(product.nrr)}
          hint="Net revenue retention"
          hintTone={product.nrr >= 100 ? "success" : "destructive"}
        />
        <CoreKpiCard
          label="Custo de infra"
          value={formatFullBRL(product.infraCost)}
          hint="Estimativa mensal"
        />
      </div>

      <div className="rounded-2xl border border-border/75 bg-card p-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wide">Health score</span>
          <span className="font-semibold text-foreground">{product.healthScore}/100</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", healthToneClass(product.healthScore))}
            style={{ width: `${product.healthScore}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Índice composto de crescimento, churn, engajamento e disponibilidade. Dados simulados.
        </p>
      </div>
    </div>
  );
}
