import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import CoreChart from "@/components/portal/core/CoreChart";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import { cn } from "@/design-system";
import { useTheme } from "@/hooks/useDarkMode";
import { verticalGradient } from "@/lib/core/chart-theme";
import {
  STATUS_LABEL,
  formatFullBRL,
  formatPercent,
  healthToneClass,
  productChartColor,
  productCssColor,
} from "@/lib/core/format";
import { loadEcosystemSnapshot } from "@/lib/core/mock-data";

function buildSparkline(values: number[], color: string) {
  return {
    grid: { top: 6, right: 2, bottom: 6, left: 2 },
    xAxis: {
      type: "category" as const,
      show: false,
      data: values.map((_, index) => String(index)),
    },
    yAxis: { type: "value" as const, show: false, scale: true },
    series: [
      {
        type: "line" as const,
        data: values,
        smooth: true,
        symbol: "none" as const,
        lineStyle: { width: 2, color },
        areaStyle: { color: verticalGradient(color, 0.3, 0.02) },
      },
    ],
  };
}

export default function CoreProducts() {
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

  const cards = useMemo(() => {
    if (!snapshot) return [];
    // resolvedTheme participa das deps porque a cor do produto vem de um
    // token CSS que muda com o tema.
    void resolvedTheme;
    return snapshot.products.map((product, index) => {
      const momChange =
        product.mrrPreviousMonth > 0
          ? ((product.mrr - product.mrrPreviousMonth) / product.mrrPreviousMonth) * 100
          : null;
      return {
        product,
        index,
        momChange,
        sparkline: buildSparkline(
          product.mrrSeries.map((point) => point.mrr),
          productChartColor(index)
        ),
      };
    });
  }, [snapshot, resolvedTheme]);

  if (isLoading) return <PortalLoading />;

  if (error || !snapshot) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Não foi possível carregar os produtos do ecossistema.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        {snapshot.products.length} produtos no ecossistema. Clique em um produto para o detalhe.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ product, index, momChange, sparkline }) => {
          const isActive = product.status === "ativo";
          return (
            <Link
              key={product.id}
              to={`/portal/core/produtos/${product.slug}`}
              className="block rounded-2xl border border-border/75 bg-card p-4 transition-colors hover:border-primary/30"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: productCssColor(index) }}
                  />
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
                  <p className="text-base font-semibold text-foreground">
                    {formatFullBRL(product.mrr)}
                  </p>
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
                    Usuários · churn
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
                  <span className="uppercase tracking-wide">MRR · 12 meses</span>
                  <span className="font-semibold text-foreground">
                    health {product.healthScore}/100
                  </span>
                </div>
                <CoreChart option={sparkline} height={52} />
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", healthToneClass(product.healthScore))}
                    style={{ width: `${product.healthScore}%` }}
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
