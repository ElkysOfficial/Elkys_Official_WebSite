import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import CoreChart from "@/components/portal/core/CoreChart";
import CoreKpiCard from "@/components/portal/core/CoreKpiCard";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import { cn } from "@/design-system";
import { useTheme } from "@/hooks/useDarkMode";
import { baseTooltip, dashedSplitLine, readChartPalette } from "@/lib/core/chart-theme";
import type { CronJob, InfraAlert, InfraService } from "@/lib/core/contract";
import { formatCompactBRL, formatFullBRL, formatPercent } from "@/lib/core/format";
import { computeInfraSummary } from "@/lib/core/metrics";
import { loadEcosystemSnapshot } from "@/lib/core/mock-data";

const SERVICE_KIND_LABEL: Record<InfraService["kind"], string> = {
  api: "API",
  web: "Web",
  worker: "Worker",
  database: "Banco",
};

const STATUS_META: Record<
  InfraService["status"],
  { label: string; chip: string; chart: keyof ReturnType<typeof readChartPalette> }
> = {
  operational: { label: "Operacional", chip: "bg-success/12 text-success", chart: "success" },
  degraded: { label: "Degradado", chip: "bg-warning/15 text-warning", chart: "warning" },
  down: { label: "Fora do ar", chip: "bg-destructive/12 text-destructive", chart: "destructive" },
};

const SEVERITY_META: Record<InfraAlert["severity"], { label: string; chip: string }> = {
  info: { label: "Info", chip: "bg-muted text-muted-foreground" },
  warning: { label: "Atenção", chip: "bg-warning/15 text-warning" },
  critical: { label: "Crítico", chip: "bg-destructive/12 text-destructive" },
};

function relativeTime(iso: string): string {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "há instantes";
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.round(hours / 24)}d`;
}

export default function CoreInfrastructure() {
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

  const costChart = useMemo(() => {
    if (!snapshot) return null;
    const isDark = resolvedTheme === "dark";
    const palette = readChartPalette(isDark);
    const sorted = [...snapshot.infra.services].sort((a, b) => a.monthlyCost - b.monthlyCost);
    const axisLabel = { color: palette.muted, fontSize: 11 };

    return {
      grid: { top: 8, right: 56, bottom: 4, left: 4, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        ...baseTooltip(palette),
        valueFormatter: (value: number | string) => formatFullBRL(Number(value)),
      },
      xAxis: {
        type: "value" as const,
        axisLabel: { ...axisLabel, formatter: (value: number) => formatCompactBRL(value) },
        splitLine: dashedSplitLine(palette),
      },
      yAxis: {
        type: "category" as const,
        data: sorted.map((service) => service.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel,
      },
      series: [
        {
          name: "Custo mensal",
          type: "bar" as const,
          barMaxWidth: 22,
          data: sorted.map((service) => ({
            value: service.monthlyCost,
            itemStyle: {
              color: palette[STATUS_META[service.status].chart],
              borderRadius: [0, 4, 4, 0] as [number, number, number, number],
            },
          })),
          label: {
            show: true,
            position: "right" as const,
            color: palette.muted,
            fontSize: 11,
            formatter: (params: { value?: number | string }) =>
              formatCompactBRL(Number(params.value ?? 0)),
          },
        },
      ],
    };
  }, [snapshot, resolvedTheme]);

  if (isLoading) return <PortalLoading />;

  if (error || !snapshot || !costChart) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Não foi possível carregar a infraestrutura do ecossistema.
      </div>
    );
  }

  const summary = computeInfraSummary(snapshot);
  const { services, cronJobs, alerts } = snapshot.infra;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Observabilidade consolidada dos produtos do ecossistema. Dados simulados.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CoreKpiCard
          label="Custo de infra"
          value={formatCompactBRL(summary.totalMonthlyCost)}
          hint="Total mensal"
        />
        <CoreKpiCard
          label="Uptime médio"
          value={formatPercent(summary.avgUptime)}
          hint="Últimos 30 dias"
          hintTone={summary.avgUptime >= 99.5 ? "success" : "destructive"}
        />
        <CoreKpiCard
          label="Serviços operacionais"
          value={`${summary.operationalCount}/${summary.totalServices}`}
          hint={
            summary.operationalCount === summary.totalServices
              ? "Todos no ar"
              : "Há serviço degradado"
          }
          hintTone={summary.operationalCount === summary.totalServices ? "success" : "destructive"}
        />
        <CoreKpiCard
          label="Alertas abertos"
          value={String(summary.openAlerts)}
          hint={`${summary.failedJobs} job(s) com falha`}
          hintTone={summary.openAlerts > 0 ? "destructive" : "success"}
        />
      </div>

      <div className="rounded-2xl border border-border/75 bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Custo de infra por serviço</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Custo mensal estimado, cor pelo status do serviço
        </p>
        <CoreChart option={costChart} height={240} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/75 bg-card">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border/75 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Serviço</th>
              <th className="px-4 py-2.5 font-semibold">Tipo</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 text-right font-semibold">Uptime 30d</th>
              <th className="px-4 py-2.5 text-right font-semibold">Latência p95</th>
              <th className="px-4 py-2.5 text-right font-semibold">Custo</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2.5 font-medium text-foreground">{service.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {SERVICE_KIND_LABEL[service.kind]}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      STATUS_META[service.status].chip
                    )}
                  >
                    {STATUS_META[service.status].label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatPercent(service.uptime30d)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {service.latencyP95 > 0 ? `${service.latencyP95} ms` : "n/a"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-foreground">
                  {formatFullBRL(service.monthlyCost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/75 bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Jobs agendados</h2>
          <ul className="space-y-2.5">
            {cronJobs.map((job: CronJob) => (
              <li key={job.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{job.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.schedule} · {relativeTime(job.lastRunAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    job.lastRunOk
                      ? "bg-success/12 text-success"
                      : "bg-destructive/12 text-destructive"
                  )}
                >
                  {job.lastRunOk ? "OK" : "Falha"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border/75 bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Alertas abertos</h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum alerta aberto.</p>
          ) : (
            <ul className="space-y-2.5">
              {alerts.map((alert: InfraAlert) => (
                <li key={alert.id} className="flex gap-3">
                  <span
                    className={cn(
                      "mt-0.5 h-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      SEVERITY_META[alert.severity].chip
                    )}
                  >
                    {SEVERITY_META[alert.severity].label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.service} · {relativeTime(alert.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
