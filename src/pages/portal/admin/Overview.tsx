import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Clock, Receipt, Shield, TrendingUp } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import SurfaceStat from "@/components/portal/shared/SurfaceStat";
import { Button, Card, CardContent, cn } from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  BURN_RATE_WINDOW_MONTHS,
  computeBurnRate,
  computeOperationalMargin,
  computeRunway,
} from "@/lib/finance-metrics";
import { formatBRL, getLocalDateIso, toCents } from "@/lib/masks";
import { getClientDisplayName, isProjectOperationallyOpen, isTicketOpen } from "@/lib/portal";

type DashboardClient = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  "id" | "is_active" | "client_since" | "full_name" | "client_type" | "nome_fantasia"
>;
type DashboardProject = Pick<
  Database["public"]["Tables"]["projects"]["Row"],
  | "id"
  | "client_id"
  | "status"
  | "started_at"
  | "delivered_at"
  | "expected_delivery_date"
  | "current_stage"
>;
type DashboardSubscription = Pick<
  Database["public"]["Tables"]["project_subscriptions"]["Row"],
  "id" | "client_id" | "amount" | "status" | "ends_on" | "starts_on"
>;
type DashboardCharge = Pick<
  Database["public"]["Tables"]["charges"]["Row"],
  | "id"
  | "client_id"
  | "amount"
  | "due_date"
  | "origin_type"
  | "paid_at"
  | "status"
  | "is_historical"
  | "description"
>;
type DashboardExpense = Pick<
  Database["public"]["Tables"]["expenses"]["Row"],
  "id" | "amount" | "expense_date"
>;
type DashboardContract = Pick<
  Database["public"]["Tables"]["project_contracts"]["Row"],
  "id" | "project_id" | "total_amount" | "status" | "signed_at"
>;
type DashboardTicket = Pick<
  Database["public"]["Tables"]["support_tickets"]["Row"],
  "id" | "status" | "created_at"
>;

type ProjectBucket = "negociacao" | "em_andamento" | "concluido" | "pausado";
type PeriodOption = 1 | 3 | 6 | 9 | 12;
type Tone = "brand" | "success" | "warning" | "destructive" | "neutral";

type MonthlyPoint = {
  key: string;
  label: string;
  shortLabel: string;
  cashIn: number;
  cashOut: number;
  net: number;
  recurringRevenue: number;
  projectRevenue: number;
};

type AgingBucket = { range: string; amount: number; count: number };

type TooltipPayloadItem = {
  color?: string;
  dataKey?: string;
  name?: string;
  value?: number | string;
};

interface OverviewState {
  hasAnyData: boolean;
  activeClients: number;
  previousActiveClients: number;
  newClientsThisMonth: number;
  openProjects: number;
  previousOpenProjects: number;
  overdueProjects: number;
  completedThisMonth: number;
  avgDeliveryDays: number | null;
  recurringClients: number;
  healthyRecurringClients: number;
  nonRecurringClients: number;
  overdueClients: number;
  clientsAtRisk: number;
  recurringBase: number;
  currentMrr: number;
  previousMrr: number;
  currentProjectRevenue: number;
  cashBalance: number;
  previousCashBalance: number;
  currentMonthNet: number;
  pendingReceivables: number;
  overdueReceivables: number;
  forecastRevenue: number;
  agingBuckets: AgingBucket[];
  pipelineValue: number;
  pipelineCount: number;
  burnRate: number;
  /** Meses que o caixa atual sustenta no ritmo de burn. null = burn ≤ 0 (não queima). */
  runwayMonths: number | null;
  operationalMargin: number | null;
  openTickets: number;
  resolvedTicketsThisMonth: number;
  monthlySeries: MonthlyPoint[];
  // Primeiro mes (YYYY-MM) com dado consolidado real — derivado do
  // menor due_date entre as charges nao historicas. Usado pelo
  // calculo de MRR Growth para retornar N/A quando a janela rolling
  // exige um mes-base anterior a essa fronteira (nao extrapolar
  // apenas com fallback contratual).
  earliestDataMonth: string | null;
  projectStatusCounts: Record<ProjectBucket, number>;
  averageRecurringRevenuePerClient: number;
  upcomingCharges: UpcomingCharge[];
  upcomingDeliveries: {
    id: string;
    name: string;
    clientName: string;
    dueDate: string;
    daysUntil: number;
  }[];
  forecast: {
    months1: { recurring: number; scheduled: number; total: number };
    months3: { recurring: number; scheduled: number; total: number };
    months6: { recurring: number; scheduled: number; total: number };
    months9: { recurring: number; scheduled: number; total: number };
    months12: { recurring: number; scheduled: number; total: number };
  };
}

type UpcomingCharge = {
  id: string;
  clientName: string;
  clientId: string;
  description: string;
  amount: number;
  dueDate: string;
  daysUntilDue: number;
};

const PERIOD_OPTIONS: PeriodOption[] = [1, 3, 6, 9, 12];
const CHART_COLORS = {
  brand: "hsl(var(--elk-primary))",
  accent: "hsl(var(--elk-accent))",
  success: "hsl(var(--elk-success))",
  destructive: "hsl(var(--elk-destructive))",
  warning: "hsl(var(--elk-warning))",
  grid: "hsl(var(--elk-border))",
  card: "hsl(var(--elk-card))",
  muted: "hsl(var(--elk-muted-foreground))",
};

const initialState: OverviewState = {
  hasAnyData: false,
  activeClients: 0,
  previousActiveClients: 0,
  newClientsThisMonth: 0,
  openProjects: 0,
  previousOpenProjects: 0,
  overdueProjects: 0,
  completedThisMonth: 0,
  avgDeliveryDays: null,
  recurringClients: 0,
  healthyRecurringClients: 0,
  nonRecurringClients: 0,
  overdueClients: 0,
  clientsAtRisk: 0,
  recurringBase: 0,
  currentMrr: 0,
  previousMrr: 0,
  currentProjectRevenue: 0,
  cashBalance: 0,
  previousCashBalance: 0,
  currentMonthNet: 0,
  pendingReceivables: 0,
  overdueReceivables: 0,
  forecastRevenue: 0,
  agingBuckets: [],
  pipelineValue: 0,
  pipelineCount: 0,
  burnRate: 0,
  runwayMonths: null,
  operationalMargin: null,
  openTickets: 0,
  resolvedTicketsThisMonth: 0,
  monthlySeries: [],
  earliestDataMonth: null,
  projectStatusCounts: {
    negociacao: 0,
    em_andamento: 0,
    concluido: 0,
    pausado: 0,
  },
  averageRecurringRevenuePerClient: 0,
  upcomingCharges: [],
  upcomingDeliveries: [],
  forecast: {
    months1: { recurring: 0, scheduled: 0, total: 0 },
    months3: { recurring: 0, scheduled: 0, total: 0 },
    months6: { recurring: 0, scheduled: 0, total: 0 },
    months9: { recurring: 0, scheduled: 0, total: 0 },
    months12: { recurring: 0, scheduled: 0, total: 0 },
  },
};

function createMonthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function parseDateValue(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateEndOfDay(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRecentMonths(count: number) {
  return Array.from({ length: count }, (_, rawIndex) => {
    const reverseIndex = count - rawIndex - 1;
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - reverseIndex);

    const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "short" })
      .format(date)
      .replace(".", "");
    const shortYear = String(date.getFullYear()).slice(-2);

    return {
      key: createMonthKey(date.getFullYear(), date.getMonth()),
      label: `${monthLabel}/${shortYear}`,
      shortLabel: monthLabel,
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59),
    };
  });
}

function getMonthKeyFromDate(value?: string | null) {
  const parsed = parseDateValue(value);
  if (!parsed) return null;
  return createMonthKey(parsed.getFullYear(), parsed.getMonth());
}

function getPercentChange(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function getSignedCurrency(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatBRL(Math.abs(value))}`;
}

function formatCompactCurrency(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const S = "\u00A0"; // non-breaking space

  if (abs >= 1_000_000) {
    const compact = abs >= 10_000_000 ? (abs / 1_000_000).toFixed(0) : (abs / 1_000_000).toFixed(1);
    return `${sign}R$${S}${compact.replace(".0", "")}M`;
  }

  if (abs >= 1_000) {
    const compact = abs >= 10_000 ? (abs / 1_000).toFixed(0) : (abs / 1_000).toFixed(1);
    return `${sign}R$${S}${compact.replace(".0", "")}k`;
  }

  return `${sign}R$${S}${Math.round(abs)}`;
}

function roundPercentage(value: number | null) {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function getTrendTone(change: number | null): Tone {
  if (change === null) return "neutral";
  if (change > 0) return "success";
  if (change < 0) return "destructive";
  return "neutral";
}

const isProjectOpen = isProjectOperationallyOpen;

function wasProjectOpenAt(project: DashboardProject, snapshotDate: Date) {
  const startedAt = parseDateValue(project.started_at);
  if (!startedAt || startedAt > snapshotDate) return false;
  if (isProjectOpen(project)) return true;
  if (project.status !== "concluido") return false;

  const deliveredAt = parseDateEndOfDay(project.delivered_at);
  return deliveredAt ? deliveredAt > snapshotDate : false;
}

function TrendPill({ change, className }: { change: number | null; className?: string }) {
  const rounded = roundPercentage(change);
  const tone = getTrendTone(change);

  const toneStyles: Record<Tone, string> = {
    brand: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    neutral: "text-muted-foreground",
  };

  const text =
    rounded === null
      ? "Sem base"
      : rounded > 0
        ? `↑ ${rounded}%`
        : rounded < 0
          ? `↓ ${Math.abs(rounded)}%`
          : "0%";

  return (
    <span
      className={cn("inline-flex items-center text-xs font-semibold", toneStyles[tone], className)}
    >
      {text}
    </span>
  );
}

function ChartEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-[220px] flex-col items-center justify-center rounded-2xl bg-muted/30 px-6 text-center">
      <div className="mb-3 flex items-center gap-1 opacity-20">
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-primary"
        >
          <path d="M9 2L14.2 5v6L9 14l-5.2-3V5z" />
        </svg>
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-primary"
        >
          <path d="M9 2L14.2 5v6L9 14l-5.2-3V5z" />
        </svg>
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-primary"
        >
          <path d="M9 2L14.2 5v6L9 14l-5.2-3V5z" />
        </svg>
      </div>
      <p className="text-[13px] font-semibold tracking-tight text-foreground">{title}</p>
      <p className="mt-1.5 max-w-[260px] text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function DashboardTooltip({
  active,
  label,
  payload,
  formatter = formatBRL,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="min-w-[180px] rounded-xl border border-border/60 bg-card/98 px-3 py-2.5 shadow-xl backdrop-blur"
      style={{ borderLeftWidth: 2, borderLeftColor: payload[0]?.color }}
    >
      {label ? (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
      ) : null}

      <div className="space-y-1.5">
        {payload.map((item) => {
          const numericValue = Number(item.value ?? 0);

          return (
            <div
              key={`${item.dataKey}-${item.name}`}
              className="flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-muted-foreground">{item.name}</span>
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-xs font-semibold tabular-nums",
                  numericValue < 0 ? "text-destructive" : "text-foreground"
                )}
              >
                {formatter(numericValue)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* SurfaceStat & SurfaceStat now imported from @/components/portal/shared/SurfaceStat */

function CashFlowGroupedBarChart({ data }: { data: MonthlyPoint[] }) {
  const hasValue = data.some((item) => item.cashIn > 0 || item.cashOut > 0);

  if (!hasValue) {
    return (
      <ChartEmptyState
        title="Sem movimentacao financeira no periodo"
        description="Mantenha cobranças pagas e despesas registradas para visualizar entradas e saidas lado a lado."
      />
    );
  }

  return (
    <div className="h-[200px] sm:h-[240px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart
          data={data}
          margin={{ top: 12, right: 4, left: -8, bottom: 0 }}
          barGap={2}
          barSize={16}
        >
          <defs>
            <linearGradient id="cf-cashIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.success} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="cf-cashOut" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.destructive} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.destructive} stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeOpacity={0.15} />
          <XAxis
            dataKey="shortLabel"
            tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={62}
            tickCount={4}
            tickFormatter={(value) => formatCompactCurrency(Number(value))}
            tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<DashboardTooltip />} />
          <Bar
            dataKey="cashIn"
            name="Entradas pagas"
            fill="url(#cf-cashIn)"
            radius={[10, 10, 0, 0]}
          />
          <Bar dataKey="cashOut" name="Saidas" fill="url(#cf-cashOut)" radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ResultBarChart({ data }: { data: MonthlyPoint[] }) {
  const hasValue = data.some((item) => item.net !== 0);

  if (!hasValue) {
    return (
      <ChartEmptyState
        title="Sem resultado consolidado no periodo"
        description="Os meses selecionados ainda não possuem entradas pagas ou despesas lançadas suficientes para comparar resultado."
      />
    );
  }

  return (
    <div className="h-[180px] sm:h-[220px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barSize={20}>
          <defs>
            <linearGradient id="res-pos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.success} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="res-neg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.destructive} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.destructive} stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeOpacity={0.15} />
          <XAxis
            dataKey="shortLabel"
            tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={62}
            tickCount={4}
            tickFormatter={(value) => formatCompactCurrency(Number(value))}
            tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<DashboardTooltip formatter={(value) => getSignedCurrency(value)} />} />
          <ReferenceLine y={0} stroke={CHART_COLORS.grid} strokeOpacity={0.42} />
          <Bar dataKey="net" name="Resultado" radius={[10, 10, 10, 10]}>
            {data.map((item) => (
              <Cell key={item.key} fill={item.net >= 0 ? "url(#res-pos)" : "url(#res-neg)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ClientDistributionBarChart({
  healthyRecurringClients,
  nonRecurringClients,
  overdueClients,
}: {
  healthyRecurringClients: number;
  nonRecurringClients: number;
  overdueClients: number;
}) {
  const data = [
    {
      name: "Com recorrencia",
      value: healthyRecurringClients,
      color: CHART_COLORS.success,
      gradId: "cd-success",
    },
    {
      name: "Sem recorrencia",
      value: nonRecurringClients,
      color: CHART_COLORS.brand,
      gradId: "cd-brand",
    },
    {
      name: "Em atraso",
      value: overdueClients,
      color: CHART_COLORS.destructive,
      gradId: "cd-destr",
    },
  ];

  const total = healthyRecurringClients + nonRecurringClients + overdueClients;

  if (total === 0) {
    return (
      <ChartEmptyState
        title="Base de clientes ainda sem distribuicao"
        description="Quando houver clientes ativos, a proporcao entre recorrencia, risco e atraso aparece aqui."
      />
    );
  }

  return (
    <div className="h-[170px] sm:h-[200px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} margin={{ top: 12, right: 4, left: -4, bottom: 0 }} barSize={32}>
          <defs>
            <linearGradient id="cd-success" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.success} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="cd-brand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.brand} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.brand} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="cd-destr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.destructive} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.destructive} stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeOpacity={0.15} />
          <XAxis
            dataKey="name"
            tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={24}
          />
          <Tooltip content={<DashboardTooltip formatter={(v) => `${v} cliente(s)`} />} />
          <Bar dataKey="value" name="Clientes" radius={[12, 12, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={`url(#${entry.gradId})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProjectStatusBarChart({ counts }: { counts: Record<ProjectBucket, number> }) {
  const total = Object.values(counts).reduce((sum, v) => sum + v, 0);

  if (total === 0) {
    return (
      <ChartEmptyState
        title="Sem carteira de projetos para distribuir"
        description="Assim que houver projetos registrados, o painel destaca execucao, entregas e pausa operacional."
      />
    );
  }

  const data = [
    {
      name: "Em desenvolvimento",
      value: counts.em_andamento,
      color: CHART_COLORS.accent,
      gradId: "ps-accent",
    },
    {
      name: "Concluído",
      value: counts.concluido,
      color: CHART_COLORS.success,
      gradId: "ps-success",
    },
    { name: "Pausado", value: counts.pausado, color: CHART_COLORS.warning, gradId: "ps-warning" },
    { name: "Negociacao", value: counts.negociacao, color: CHART_COLORS.brand, gradId: "ps-brand" },
  ];

  return (
    <div className="h-[160px] sm:h-[180px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} margin={{ top: 12, right: 4, left: -4, bottom: 0 }} barSize={32}>
          <defs>
            <linearGradient id="ps-accent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="ps-success" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.success} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="ps-warning" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.warning} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.warning} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="ps-brand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.brand} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.brand} stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeOpacity={0.15} />
          <XAxis
            dataKey="name"
            tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={24}
          />
          <Tooltip content={<DashboardTooltip formatter={(v) => `${v} projeto(s)`} />} />
          <Bar dataKey="value" name="Projetos" radius={[12, 12, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={`url(#${entry.gradId})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

async function fetchDashboard(): Promise<OverviewState> {
  const [
    clientsRes,
    projectsRes,
    chargesRes,
    subscriptionsRes,
    expensesRes,
    contractsRes,
    ticketsRes,
    proposalsRes,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, is_active, client_since, full_name, client_type, nome_fantasia"),
    supabase
      .from("projects")
      .select(
        "id, client_id, status, started_at, delivered_at, expected_delivery_date, current_stage"
      ),
    supabase
      .from("charges")
      .select(
        "id, client_id, amount, due_date, origin_type, paid_at, status, is_historical, description"
      ),
    supabase
      .from("project_subscriptions")
      .select("id, client_id, amount, status, ends_on, starts_on"),
    supabase.from("expenses").select("id, amount, expense_date"),
    supabase.from("project_contracts").select("id, project_id, total_amount, status, signed_at"),
    supabase.from("support_tickets").select("id, status, created_at"),
    supabase
      .from("proposals")
      .select("id, total_amount, status")
      .in("status", ["enviada", "aprovada"]),
  ]);

  const hardError =
    clientsRes.error ??
    projectsRes.error ??
    chargesRes.error ??
    subscriptionsRes.error ??
    expensesRes.error ??
    contractsRes.error ??
    ticketsRes.error;

  if (hardError) {
    throw new Error(hardError.message);
  }

  const clients = (clientsRes.data as DashboardClient[] | null) ?? [];
  const projects = (projectsRes.data as DashboardProject[] | null) ?? [];
  const charges = (chargesRes.data as DashboardCharge[] | null) ?? [];
  const subscriptions = (subscriptionsRes.data as DashboardSubscription[] | null) ?? [];
  const expenses = (expensesRes.data as DashboardExpense[] | null) ?? [];
  const contracts = (contractsRes.data as DashboardContract[] | null) ?? [];
  const tickets = (ticketsRes.data as DashboardTicket[] | null) ?? [];

  const hasAnyData =
    clients.length > 0 ||
    projects.length > 0 ||
    charges.length > 0 ||
    subscriptions.length > 0 ||
    expenses.length > 0;

  const now = new Date();
  const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  // 13 meses: 12 meses passados + mes corrente. Necessario para
  // rolling 12M honesto (comparar MRR_t com MRR_{t-12}); com 12
  // meses o start index ficava clampado em 0 e gerava valor
  // extrapolado em vez de N/A.
  const monthFrames = getRecentMonths(13);
  const monthlyMap = new Map(
    monthFrames.map((month) => [
      month.key,
      {
        key: month.key,
        label: month.label,
        shortLabel: month.shortLabel,
        cashIn: 0,
        cashOut: 0,
        net: 0,
        recurringRevenue: 0,
        projectRevenue: 0,
      },
    ])
  );

  const activeClients = clients.filter((client) => client.is_active);
  const activeClientIds = new Set(activeClients.map((client) => client.id));
  const previousActiveClients = activeClients.filter((client) => {
    const clientSince = parseDateEndOfDay(client.client_since);
    return clientSince ? clientSince <= endOfPreviousMonth : false;
  }).length;

  const recurringSubscriptions = subscriptions.filter((subscription) =>
    ["agendada", "ativa"].includes(subscription.status)
  );
  const recurringBaseCents = recurringSubscriptions.reduce(
    (sum, subscription) => sum + toCents(subscription.amount),
    0
  );
  const recurringBase = recurringBaseCents / 100;
  const recurringClientIds = new Set(
    recurringSubscriptions
      .filter((subscription) => activeClientIds.has(subscription.client_id))
      .map((subscription) => subscription.client_id)
  );

  // Accumulate in centavos (integers) to avoid floating-point errors
  charges
    .filter((charge) => charge.status === "pago" && !charge.is_historical)
    .forEach((charge) => {
      const monthKey = getMonthKeyFromDate(charge.paid_at ?? charge.due_date);
      if (!monthKey) return;
      const point = monthlyMap.get(monthKey);
      if (!point) return;
      point.cashIn += toCents(charge.amount);
      if (charge.origin_type === "parcela_projeto") {
        point.projectRevenue += toCents(charge.amount);
      }
    });

  expenses.forEach((expense) => {
    const monthKey = getMonthKeyFromDate(expense.expense_date);
    if (!monthKey) return;
    const point = monthlyMap.get(monthKey);
    if (!point) return;
    point.cashOut += toCents(expense.amount);
  });

  const currentMonthKey = createMonthKey(now.getFullYear(), now.getMonth());

  charges
    .filter(
      (charge) =>
        charge.origin_type === "mensalidade" &&
        charge.status !== "cancelado" &&
        !charge.is_historical
    )
    .forEach((charge) => {
      const isPaid = charge.status === "pago";
      // MRR e receita recorrente sao metricas de COMPETENCIA:
      // o mes de referencia e sempre o due_date (mes em que a
      // receita foi devida), nunca o paid_at. Usar paid_at aqui
      // fazia mensalidades antigas pagas no mes corrente inflarem
      // o MRR do mes atual e zerarem os meses passados, gerando
      // MoM/3M/6M/12M completamente distorcidos. Fluxo de caixa
      // (cashIn) continua por paid_at mais acima, como deve ser.
      const monthKey = getMonthKeyFromDate(charge.due_date);
      if (!monthKey) return;
      const point = monthlyMap.get(monthKey);
      if (!point) return;
      // For past months, only count paid; for current/future, count all non-cancelled
      if (monthKey < currentMonthKey && !isPaid) return;
      point.recurringRevenue += toCents(charge.amount);
    });
  // Auditoria 2026-04-15: removido fallback contratual silencioso.
  // Antes, meses passados onde o admin nao tinha marcado as charges
  // como "pago" eram preenchidos com a base contratual ativa, criando
  // uma serie hibrida (parte realizada, parte teorica) que mascarava
  // churn e inflava o MRR historico. Agora MRR historico = SOMENTE
  // realizado. Meses sem charges pagas mostrarao zero — informacao
  // verdadeira em vez de inferencia. Quem quiser ver a base contratual
  // deve olhar o forecast (computeForecast) ou a soma de subscriptions
  // ativas em dado momento.

  // Primeiro mes com dado consolidado real = menor due_date entre
  // as charges nao historicas, truncado para YYYY-MM. Qualquer
  // janela rolling de MRR Growth que exija mes-base anterior a
  // isso vai retornar N/A (regra do feedback financeiro).
  let earliestDataMonth: string | null = null;
  for (const charge of charges) {
    if (charge.is_historical || !charge.due_date) continue;
    const mk = getMonthKeyFromDate(charge.due_date);
    if (!mk) continue;
    if (!earliestDataMonth || mk < earliestDataMonth) {
      earliestDataMonth = mk;
    }
  }

  // Convert centavos back to reais for the public series
  const monthlySeries = monthFrames.map((frame) => {
    const point = monthlyMap.get(frame.key) ?? {
      key: frame.key,
      label: frame.label,
      shortLabel: frame.shortLabel,
      cashIn: 0,
      cashOut: 0,
      net: 0,
      recurringRevenue: 0,
      projectRevenue: 0,
    };

    return {
      ...point,
      cashIn: point.cashIn / 100,
      cashOut: point.cashOut / 100,
      recurringRevenue: point.recurringRevenue / 100,
      projectRevenue: point.projectRevenue / 100,
      net: (point.cashIn - point.cashOut) / 100,
    };
  });

  const previousMonthPoint = monthlySeries[monthlySeries.length - 2];
  const openProjects = projects.filter((project) => isProjectOpen(project)).length;
  const previousOpenProjects = projects.filter((project) =>
    wasProjectOpenAt(project, endOfPreviousMonth)
  ).length;

  const projectStatusCounts: Record<ProjectBucket, number> = {
    negociacao: 0,
    em_andamento: 0,
    concluido: 0,
    pausado: 0,
  };

  projects.forEach((project) => {
    if (project.status === "cancelado") return;
    // Usar status real do projeto (não o bucket operacional) para o gráfico
    const bucket = project.status as ProjectBucket;
    if (bucket in projectStatusCounts) {
      projectStatusCounts[bucket] += 1;
    }
  });

  // Overdue clients: trust the DB status field exclusively (no client-side date logic)
  const overdueClientIds = new Set(
    charges
      .filter(
        (charge) =>
          activeClientIds.has(charge.client_id) &&
          charge.status === "atrasado" &&
          !charge.is_historical
      )
      .map((charge) => charge.client_id)
  );

  const clientsWithoutRecurringIds = new Set(
    activeClients.filter((client) => !recurringClientIds.has(client.id)).map((client) => client.id)
  );

  const healthyRecurringClients = Array.from(recurringClientIds).filter(
    (clientId) => !overdueClientIds.has(clientId)
  ).length;
  const nonRecurringClients = Array.from(clientsWithoutRecurringIds).filter(
    (clientId) => !overdueClientIds.has(clientId)
  ).length;
  const clientsAtRisk = new Set([
    ...Array.from(overdueClientIds),
    ...Array.from(clientsWithoutRecurringIds),
  ]).size;

  // Cash balance: only operational (non-historical) paid charges
  const cashBalance =
    (charges
      .filter((charge) => charge.status === "pago" && !charge.is_historical)
      .reduce((sum, charge) => sum + toCents(charge.amount), 0) -
      expenses.reduce((sum, expense) => sum + toCents(expense.amount), 0)) /
    100;

  // "A receber" = pendente (já vencido) + agendada com vencimento este mês
  const currentMonthEndStr = getLocalDateIso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const pendingReceivables =
    charges
      .filter(
        (c) =>
          !c.is_historical &&
          (c.status === "pendente" || (c.status === "agendada" && c.due_date <= currentMonthEndStr))
      )
      .reduce((sum, c) => sum + toCents(c.amount), 0) / 100;

  const overdueReceivables =
    charges
      .filter((c) => c.status === "atrasado" && !c.is_historical)
      .reduce((sum, c) => sum + toCents(c.amount), 0) / 100;

  const currentMonthNet = monthlySeries[monthlySeries.length - 1]?.net ?? 0;
  const previousCashBalance = cashBalance - currentMonthNet;
  const currentMrr = monthlySeries[monthlySeries.length - 1]?.recurringRevenue ?? recurringBase;
  const previousMrr = previousMonthPoint?.recurringRevenue ?? 0;
  const currentProjectRevenue = monthlySeries[monthlySeries.length - 1]?.projectRevenue ?? 0;

  // New clients this month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const newClientsThisMonth = clients.filter((c) => {
    const since = parseDateValue(c.client_since);
    return since && since >= startOfMonth && c.is_active;
  }).length;

  // Overdue projects: em_andamento with expected_delivery_date in the past
  const todayStr = getLocalDateIso(now);
  const overdueProjects = projects.filter(
    (p) =>
      p.status === "em_andamento" &&
      p.expected_delivery_date &&
      p.expected_delivery_date < todayStr &&
      !p.delivered_at
  ).length;

  // Completed this month
  const completedThisMonth = projects.filter((p) => {
    if (p.status !== "concluido") return false;
    const delivered = parseDateValue(p.delivered_at);
    return delivered && delivered >= startOfMonth;
  }).length;

  // Average delivery time (days) for completed projects
  const deliveryDurations = projects
    .filter((p) => p.status === "concluido" && p.started_at && p.delivered_at)
    .map((p) => {
      const start = parseDateValue(p.started_at)!;
      const end = parseDateValue(p.delivered_at)!;
      return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    })
    .filter((d) => d > 0);
  const avgDeliveryDays =
    deliveryDurations.length > 0
      ? Math.round(deliveryDurations.reduce((a, b) => a + b, 0) / deliveryDurations.length)
      : null;

  // Aging analysis — only charges already past due (future pending are not yet receivable)
  const agingCharges = charges.filter(
    (c) =>
      (c.status === "pendente" || c.status === "atrasado") &&
      !c.is_historical &&
      c.due_date &&
      c.due_date <= todayStr
  );
  const agingBuckets: AgingBucket[] = [
    { range: "0-30 dias", amount: 0, count: 0 },
    { range: "30-60 dias", amount: 0, count: 0 },
    { range: "60+ dias", amount: 0, count: 0 },
  ];
  agingCharges.forEach((c) => {
    const dueDate = new Date(c.due_date + "T00:00:00");
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const amtCents = toCents(c.amount);
    if (daysOverdue <= 30) {
      agingBuckets[0].amount += amtCents;
      agingBuckets[0].count += 1;
    } else if (daysOverdue <= 60) {
      agingBuckets[1].amount += amtCents;
      agingBuckets[1].count += 1;
    } else {
      agingBuckets[2].amount += amtCents;
      agingBuckets[2].count += 1;
    }
  });
  // Convert centavos back to reais
  for (const bucket of agingBuckets) bucket.amount /= 100;

  // Forecast: future agendada charges + approved proposals (expected future revenue)
  const chargesForecast =
    charges
      .filter((c) => c.status === "agendada" && !c.is_historical && c.due_date > todayStr)
      .reduce((sum, c) => sum + toCents(c.amount), 0) / 100;

  type ProposalForecast = { id: string; total_amount: number; status: string };
  const approvedProposalsForecast =
    ((proposalsRes.data ?? []) as ProposalForecast[])
      .filter((p) => p.status === "aprovada")
      .reduce((sum, p) => sum + toCents(p.total_amount), 0) / 100;

  const forecastRevenue = chargesForecast + approvedProposalsForecast;

  // Pipeline: projects in negociacao (contracts) + active proposals (enviadas/aprovadas)
  const negociacaoProjectIds = new Set(
    projects.filter((p) => p.status === "negociacao").map((p) => p.id)
  );
  const pipelineContracts = contracts.filter(
    (c) => negociacaoProjectIds.has(c.project_id) && c.status !== "cancelado"
  );
  const projectPipelineValue =
    pipelineContracts.reduce((sum, c) => sum + toCents(c.total_amount), 0) / 100;

  type ProposalPipeline = { id: string; total_amount: number; status: string };
  const allProposals = (proposalsRes.data ?? []) as ProposalPipeline[];
  // Only "enviada" proposals count toward pipeline — "aprovada" already have a project+contract
  const pendingProposals = allProposals.filter((p) => p.status === "enviada");
  const proposalPipelineValue =
    pendingProposals.reduce((sum, p) => sum + toCents(p.total_amount), 0) / 100;

  const pipelineValue = projectPipelineValue + proposalPipelineValue;
  const pipelineCount = negociacaoProjectIds.size + pendingProposals.length;

  // Burn rate e margem: lib central garante que Overview e Finance
  // produzam exatamente o mesmo numero para a mesma metrica.
  const burnRate = computeBurnRate(monthlySeries, BURN_RATE_WINDOW_MONTHS);
  const runwayMonths = computeRunway(cashBalance, burnRate);

  const currentMonthPoint = monthlySeries[monthlySeries.length - 1];
  const operationalMargin = computeOperationalMargin(
    currentMonthPoint?.cashIn ?? 0,
    currentMonthPoint?.cashOut ?? 0
  );

  // Support tickets
  const openTickets = tickets.filter((t) => isTicketOpen(t.status)).length;
  const resolvedTicketsThisMonth = tickets.filter((t) => {
    if (t.status !== "resolvido" && t.status !== "fechado") return false;
    const created = parseDateValue(t.created_at);
    return created && created >= startOfMonth;
  }).length;

  // Upcoming charges (due in next 7 days)
  const clientNameMap = new Map(clients.map((c) => [c.id, getClientDisplayName(c)]));
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const sevenDaysStr = getLocalDateIso(sevenDaysFromNow);

  const upcomingCharges: UpcomingCharge[] = charges
    .filter(
      (c) =>
        !c.is_historical &&
        (c.status === "pendente" || c.status === "agendada") &&
        c.due_date >= todayStr &&
        c.due_date <= sevenDaysStr
    )
    .map((c) => {
      const dueDate = new Date(`${c.due_date}T00:00:00`);
      const daysUntil = Math.max(
        0,
        Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );
      return {
        id: c.id,
        clientName: clientNameMap.get(c.client_id) ?? "—",
        clientId: c.client_id,
        description: c.description,
        amount: Number(c.amount),
        dueDate: c.due_date,
        daysUntilDue: daysUntil,
      };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    .slice(0, 5);

  // Upcoming deliveries (projects due in next 14 days)
  const fourteenDaysFromNow = new Date();
  fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);
  const fourteenDaysStr = getLocalDateIso(fourteenDaysFromNow);

  const upcomingDeliveries = projects
    .filter(
      (p) =>
        p.status === "em_andamento" &&
        p.expected_delivery_date &&
        p.expected_delivery_date >= todayStr &&
        p.expected_delivery_date <= fourteenDaysStr &&
        !p.delivered_at
    )
    .map((p) => {
      const dueDate = new Date(`${p.expected_delivery_date}T00:00:00`);
      return {
        id: p.id,
        name: p.name ?? "Projeto",
        clientName: clientNameMap.get(p.client_id) ?? "—",
        dueDate: p.expected_delivery_date!,
        daysUntil: Math.max(
          0,
          Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        ),
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5);

  // Forecast computation — por mes calendario dentro do horizonte.
  // Para cada mes futuro: receita prevista = max(agendada charges
  // do mes, base contratual ativa no mes). Nao soma os dois (era
  // double counting: charges agendada JA sao a materializacao
  // das subscriptions). A base contratual cobre meses em que o
  // gerador de charges ainda nao rodou.
  const computeForecast = (months: number) => {
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    let recurringCents = 0;
    let scheduledCents = 0;
    let totalCents = 0;

    for (let i = 0; i < months; i += 1) {
      const monthDate = new Date(nextMonthStart.getFullYear(), nextMonthStart.getMonth() + i, 1);
      const y = monthDate.getFullYear();
      const m = monthDate.getMonth();
      const monthKey = createMonthKey(y, m);
      const monthStartIso = `${monthKey}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const monthEndIso = `${monthKey}-${String(lastDay).padStart(2, "0")}`;

      // Base contratual ativa naquele mes (respeita starts_on/ends_on)
      const monthBaseCents = recurringSubscriptions
        .filter((sub) => activeClientIds.has(sub.client_id))
        .filter((sub) => {
          if (sub.starts_on && sub.starts_on > monthEndIso) return false;
          if (sub.ends_on && sub.ends_on < monthStartIso) return false;
          return true;
        })
        .reduce((sum, sub) => sum + toCents(sub.amount), 0);

      // Agendada charges devidas naquele mes
      const monthScheduledCents = charges
        .filter(
          (c) =>
            !c.is_historical &&
            c.status === "agendada" &&
            c.due_date >= monthStartIso &&
            c.due_date <= monthEndIso
        )
        .reduce((sum, c) => sum + toCents(c.amount), 0);

      recurringCents += monthBaseCents;
      scheduledCents += monthScheduledCents;
      // Union: usa o maior dos dois para cada mes, evitando double counting
      totalCents += Math.max(monthBaseCents, monthScheduledCents);
    }

    return {
      recurring: recurringCents / 100,
      scheduled: scheduledCents / 100,
      total: totalCents / 100,
    };
  };

  const forecast = {
    months1: computeForecast(1),
    months3: computeForecast(3),
    months6: computeForecast(6),
    months9: computeForecast(9),
    months12: computeForecast(12),
  };

  return {
    hasAnyData,
    activeClients: activeClients.length,
    previousActiveClients,
    newClientsThisMonth,
    openProjects,
    previousOpenProjects,
    overdueProjects,
    completedThisMonth,
    avgDeliveryDays,
    recurringClients: recurringClientIds.size,
    healthyRecurringClients,
    nonRecurringClients,
    overdueClients: overdueClientIds.size,
    clientsAtRisk,
    recurringBase,
    currentMrr,
    previousMrr,
    currentProjectRevenue,
    cashBalance,
    previousCashBalance,
    currentMonthNet,
    pendingReceivables,
    overdueReceivables,
    forecastRevenue,
    agingBuckets,
    pipelineValue,
    pipelineCount,
    burnRate,
    runwayMonths,
    operationalMargin,
    openTickets,
    resolvedTicketsThisMonth,
    monthlySeries,
    earliestDataMonth,
    projectStatusCounts,
    averageRecurringRevenuePerClient:
      recurringClientIds.size > 0 ? recurringBase / recurringClientIds.size : 0,
    upcomingCharges,
    upcomingDeliveries,
    forecast,
  };
}

export default function AdminOverview() {
  const {
    data: summary = initialState,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: fetchDashboard,
    // Politica de refetch: foco da janela nao dispara refetch (evita
    // triple-fetch quando o usuario alterna abas). Atualizacao periodica
    // de 2min cobre o caso de painel aberto em segundo plano. Caso o
    // usuario precise de dado fresco imediato, usar o botao "atualizar".
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60 * 1000,
    retry: 1,
  });

  const queryClient = useQueryClient();
  const refetchDashboard = () =>
    void queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
  const error =
    queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;
  const hasLoaded = !loading && !error;

  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(6);
  const [forecastPeriod, setForecastPeriod] = useState<PeriodOption>(6);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const handleQuickMarkPaid = useCallback(
    async (chargeId: string) => {
      setMarkingPaidId(chargeId);
      const now = new Date().toISOString();
      const todayStr = getLocalDateIso(new Date());
      const { error: updateError } = await supabase
        .from("charges")
        .update({ status: "pago", paid_at: todayStr, updated_at: now })
        .eq("id", chargeId);
      setMarkingPaidId(null);
      if (updateError) {
        toast.error("Erro ao marcar como pago.");
        return;
      }
      toast.success("Cobrança marcada como paga.");
      refetchDashboard();
    },
    [refetchDashboard]
  );

  const currentForecast = useMemo(() => {
    if (forecastPeriod === 1) return summary.forecast.months1;
    if (forecastPeriod === 3) return summary.forecast.months3;
    if (forecastPeriod === 6) return summary.forecast.months6;
    if (forecastPeriod === 9) return summary.forecast.months9;
    return summary.forecast.months12;
  }, [forecastPeriod, summary.forecast]);

  const periodSeries = useMemo(
    () => summary.monthlySeries.slice(-selectedPeriod),
    [selectedPeriod, summary.monthlySeries]
  );

  const periodReceived = useMemo(
    () => periodSeries.reduce((sum, point) => sum + point.cashIn, 0),
    [periodSeries]
  );
  const periodExpenses = useMemo(
    () => periodSeries.reduce((sum, point) => sum + point.cashOut, 0),
    [periodSeries]
  );
  const periodNet = useMemo(
    () => periodSeries.reduce((sum, point) => sum + point.net, 0),
    [periodSeries]
  );

  // Rolling n-month MRR Growth: compara MRR_t (mes atual) com
  // MRR_{t-n} (n meses atras, dois pontos exatos no tempo).
  // - kind='na'    -> mes-base fora da janela disponivel -> tile N/A
  // - kind='new'   -> mes-base existe mas MRR=0 (nasceu do zero) -> tile "Novo"
  // - kind='value' -> valor numerico calculado
  // Antes usava `totalMonths - selectedPeriod` (off-by-one) e retornava
  // apenas null, sem diferenciar N/A real de "Novo". Ver
  // memory/feedback_financial_metrics.md.
  const periodMrrChange = useMemo(():
    | { kind: "value"; value: number }
    | { kind: "new" }
    | { kind: "na" } => {
    const totalMonths = summary.monthlySeries.length;
    if (totalMonths === 0) return { kind: "na" };
    const endIdx = totalMonths - 1;
    const startIdx = endIdx - selectedPeriod;
    if (startIdx < 0) return { kind: "na" };
    const startPoint = summary.monthlySeries[startIdx];
    const endPoint = summary.monthlySeries[endIdx];
    if (!startPoint || !endPoint) return { kind: "na" };
    // Se o mes-base precede o primeiro mes com dado consolidado real
    // (primeiro due_date registrado), retorna N/A. Nao extrapola o
    // crescimento apenas com fallback contratual de subscription.
    if (summary.earliestDataMonth && startPoint.key < summary.earliestDataMonth) {
      return { kind: "na" };
    }
    const startMrr = startPoint.recurringRevenue;
    const endMrr = endPoint.recurringRevenue;
    if (startMrr === 0) {
      return endMrr === 0 ? { kind: "value", value: 0 } : { kind: "new" };
    }
    return { kind: "value", value: ((endMrr - startMrr) / startMrr) * 100 };
  }, [selectedPeriod, summary.monthlySeries, summary.earliestDataMonth]);

  // Label dinamico usado tanto no headline quanto no card de MRR.
  const periodLabel = useMemo(
    () => (selectedPeriod === 1 ? "neste mês" : `nos últimos ${selectedPeriod} meses`),
    [selectedPeriod]
  );

  const recurringRate = useMemo(() => {
    if (summary.activeClients === 0) return 0;
    return Math.round((summary.recurringClients / summary.activeClients) * 100);
  }, [summary.activeClients, summary.recurringClients]);

  const insightHeadline = useMemo(() => {
    const rounded =
      periodMrrChange.kind === "value" ? roundPercentage(periodMrrChange.value) : null;

    if (rounded !== null && rounded <= -5) {
      return `MRR caiu ${Math.abs(rounded)}% ${periodLabel}`;
    }

    if (rounded !== null && rounded >= 5) {
      return `MRR subiu ${rounded}% ${periodLabel}`;
    }

    if (summary.overdueReceivables > 0) {
      return `${formatBRL(summary.overdueReceivables)} em cobranças atrasadas`;
    }

    if (periodNet < 0) {
      return (
        <>
          Saldo {periodLabel} em{" "}
          <span className="text-destructive">{getSignedCurrency(periodNet)}</span>
        </>
      );
    }

    if (summary.clientsAtRisk > 0) {
      return `${summary.clientsAtRisk} cliente(s) pedem atenção`;
    }

    return `Operação estável ${periodLabel}`;
  }, [periodMrrChange, periodLabel, periodNet, summary.clientsAtRisk, summary.overdueReceivables]);

  if (loading) return <PortalLoading />;

  return (
    <div className="space-y-4">
      {error ? (
        <AdminEmptyState
          icon={TrendingUp}
          title="Não foi possível montar o painel"
          description={`${error} Verifique a conexão com o Supabase e tente carregar novamente.`}
          action={
            <Button type="button" onClick={() => refetchDashboard()}>
              Tentar novamente
            </Button>
          }
        />
      ) : !summary.hasAnyData ? (
        <AdminEmptyState
          icon={Shield}
          title="Dashboard pronto para receber operação"
          description="Cadastre clientes, projetos, cobranças e despesas para transformar esta tela em um resumo executivo com leitura imediata."
          action={
            <Button type="button" onClick={() => refetchDashboard()}>
              Atualizar painel
            </Button>
          }
        />
      ) : (
        <>
          {/* Summary card */}
          <Card className="overflow-hidden rounded-2xl border-border/80 bg-gradient-subtle">
            <CardContent className="space-y-3 p-4 sm:space-y-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-1 sm:space-y-2">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-3xl">
                    {insightHeadline}
                  </h2>
                </div>

                <div className="inline-flex shrink-0 self-start rounded-full border border-border/80 bg-background/80 p-1">
                  {PERIOD_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSelectedPeriod(option)}
                      className={cn(
                        "min-h-[36px] rounded-full px-3 py-2 text-xs font-semibold tracking-wide transition-colors",
                        selectedPeriod === option
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {option}M
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 xl:max-w-[520px]">
                <SurfaceStat
                  label="Saldo no periodo"
                  value={getSignedCurrency(periodNet)}
                  tone={periodNet >= 0 ? "success" : "destructive"}
                />
                <SurfaceStat
                  label={`Crescimento do MRR (${selectedPeriod}M)`}
                  value={
                    periodMrrChange.kind === "na"
                      ? "N/A"
                      : periodMrrChange.kind === "new"
                        ? "Novo"
                        : `${roundPercentage(periodMrrChange.value)}%`
                  }
                  tone={
                    periodMrrChange.kind !== "value"
                      ? "neutral"
                      : periodMrrChange.value > 0
                        ? "success"
                        : periodMrrChange.value < 0
                          ? "destructive"
                          : "neutral"
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* KPI cards — essentials only */}
          <section className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            <SurfaceStat
              label="MRR"
              value={formatBRL(summary.currentMrr)}
              subInfo={`${summary.recurringClients} com recorrencia`}
              tone="success"
            />

            <SurfaceStat
              label="Resultado acumulado"
              value={formatBRL(summary.cashBalance)}
              subInfo={`Mes em ${getSignedCurrency(summary.currentMonthNet)}`}
              tone={summary.cashBalance >= 0 ? "success" : "destructive"}
            />

            <SurfaceStat
              label="Em atraso"
              value={
                summary.overdueReceivables > 0
                  ? `${summary.overdueClients}x ${formatBRL(summary.overdueReceivables)}`
                  : formatBRL(0)
              }
              subInfo={
                summary.overdueClients > 0
                  ? `${summary.overdueClients} cliente(s) com atraso`
                  : "Nenhum atraso registrado"
              }
              tone={summary.overdueReceivables > 0 ? "destructive" : "neutral"}
            />

            <SurfaceStat
              label="Clientes ativos"
              value={String(summary.activeClients)}
              subInfo={`${summary.newClientsThisMonth} novo(s) | ${summary.clientsAtRisk} em risco`}
              tone="brand"
            />

            <SurfaceStat
              label="Projetos ativos"
              value={String(summary.openProjects)}
              subInfo={`${summary.overdueProjects} atrasado(s) | ${summary.projectStatusCounts.pausado} pausados`}
              tone={summary.overdueProjects > 0 ? "warning" : "neutral"}
            />

            <SurfaceStat
              label="Pipeline"
              value={formatBRL(summary.pipelineValue)}
              subInfo={`${summary.pipelineCount} oportunidade(s) ativas`}
              tone="brand"
            />
          </section>

          {/* Quick alerts */}
          {(summary.upcomingCharges.length > 0 || summary.overdueReceivables > 0) && (
            <section className="grid gap-4 xl:grid-cols-2">
              {/* Upcoming charges */}
              {summary.upcomingCharges.length > 0 && (
                <Card className="rounded-2xl border-border/80 bg-card/95 xl:col-span-2">
                  <CardContent className="space-y-3 p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-warning/15 text-warning">
                          <Clock size={14} />
                        </div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px]">
                          Vencem em ate 7 dias
                        </p>
                      </div>
                      <Link
                        to="/portal/admin/financeiro"
                        className="text-[11px] font-semibold text-primary hover:underline"
                      >
                        Ver todas
                      </Link>
                    </div>
                    <div className="space-y-1.5">
                      {summary.upcomingCharges.map((charge) => (
                        <div
                          key={charge.id}
                          className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-xs font-medium text-foreground"
                              title={charge.clientName}
                            >
                              {charge.clientName}
                            </p>
                            <p
                              className="truncate text-[11px] text-muted-foreground"
                              title={charge.description}
                            >
                              {charge.description}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="whitespace-nowrap text-xs font-semibold tabular-nums text-foreground">
                              {formatBRL(charge.amount)}
                            </p>
                            <p className="text-[10px] tabular-nums text-muted-foreground">
                              {charge.daysUntilDue === 0
                                ? "Hoje"
                                : charge.daysUntilDue === 1
                                  ? "Amanha"
                                  : `em ${charge.daysUntilDue}d`}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={markingPaidId === charge.id}
                            onClick={() => void handleQuickMarkPaid(charge.id)}
                            className="shrink-0 rounded-md bg-success/10 px-2 py-1 text-[10px] font-semibold text-success transition-colors hover:bg-success/20 disabled:opacity-50"
                          >
                            {markingPaidId === charge.id ? "..." : "Pago"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Overdue summary */}
              {summary.overdueReceivables > 0 && (
                <Card className="rounded-2xl border-border/80 bg-card/95 xl:col-span-2">
                  <CardContent className="space-y-3 p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/15 text-destructive">
                          <Receipt size={14} />
                        </div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px]">
                          Inadimplencia
                        </p>
                      </div>
                      <Link
                        to="/portal/admin/inadimplencia"
                        className="text-[11px] font-semibold text-primary hover:underline"
                      >
                        Ver relatorio
                      </Link>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                        <p className="whitespace-nowrap text-xl font-semibold tabular-nums text-destructive sm:text-2xl">
                          {formatBRL(summary.overdueReceivables)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {summary.overdueClients} cliente(s) com cobrança(s) em atraso
                        </p>
                      </div>
                      {summary.agingBuckets.some((b) => b.count > 0) && (
                        <div className="grid grid-cols-3 gap-2">
                          {summary.agingBuckets.map((bucket) => (
                            <div
                              key={bucket.range}
                              className="rounded-lg border border-border/50 bg-background/60 p-2 text-center"
                            >
                              <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                                {bucket.range}
                              </p>
                              <p className="mt-0.5 whitespace-nowrap text-xs font-semibold tabular-nums text-foreground">
                                {formatBRL(bucket.amount)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {bucket.count} cobr.
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>
          )}

          {/* Upcoming deliveries */}
          {summary.upcomingDeliveries.length > 0 && (
            <section className="grid gap-4 xl:grid-cols-2">
              <Card className="rounded-2xl border-border/80 bg-card/95">
                <CardContent className="space-y-3 p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
                        <TrendingUp size={14} />
                      </div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px]">
                        Entregas proximas (14 dias)
                      </p>
                    </div>
                    <Link
                      to="/portal/admin/pipeline"
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      Ver pipeline
                    </Link>
                  </div>
                  <div className="space-y-1.5">
                    {summary.upcomingDeliveries.map((delivery) => (
                      <Link
                        key={delivery.id}
                        to={`/portal/admin/projetos/${delivery.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/60 px-3 py-2 transition-colors hover:border-primary/30"
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-xs font-medium text-foreground"
                            title={delivery.name}
                          >
                            {delivery.name}
                          </p>
                          <p
                            className="truncate text-[11px] text-muted-foreground"
                            title={delivery.clientName}
                          >
                            {delivery.clientName}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-accent">
                          {delivery.daysUntil === 0
                            ? "Hoje"
                            : delivery.daysUntil === 1
                              ? "Amanha"
                              : `em ${delivery.daysUntil}d`}
                        </span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>
          )}

          {/* Forecast */}
          {currentForecast.total > 0 && (
            <section>
              <Card className="rounded-2xl border-border/80 bg-card/95">
                <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:text-[11px]">
                      Previsao de receita
                    </p>
                    <div className="inline-flex shrink-0 self-start rounded-full border border-border/80 bg-background/80 p-1">
                      {([1, 3, 6, 9, 12] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setForecastPeriod(m)}
                          className={cn(
                            "min-h-[32px] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                            forecastPeriod === m
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {m}M
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
                    <SurfaceStat
                      label="Receita recorrente"
                      value={formatBRL(currentForecast.recurring)}
                      tone="success"
                    />
                    <SurfaceStat
                      label="Parcelas agendadas"
                      value={formatBRL(currentForecast.scheduled)}
                      tone="brand"
                    />
                    <SurfaceStat
                      label="Total projetado"
                      value={formatBRL(currentForecast.total)}
                      tone={currentForecast.total > 0 ? "success" : "neutral"}
                    />
                  </div>
                </CardContent>
              </Card>
            </section>
          )}

          {/* Cash flow + Result charts */}
          <section className="grid gap-4 lg:grid-cols-12">
            <Card className="rounded-2xl border-border/80 bg-card/95 lg:col-span-8">
              <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:text-[11px]">
                  Entradas e saidas por mes
                </p>
                <CashFlowGroupedBarChart data={periodSeries} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
                  <SurfaceStat
                    label="Total entradas"
                    value={formatBRL(periodReceived)}
                    tone="success"
                  />
                  <SurfaceStat
                    label="Total saidas"
                    value={formatBRL(periodExpenses)}
                    tone={periodExpenses > 0 ? "destructive" : "neutral"}
                  />
                  <SurfaceStat
                    label="Saldo acumulado"
                    value={getSignedCurrency(periodNet)}
                    tone={periodNet >= 0 ? "success" : "destructive"}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 bg-card/95 lg:col-span-4">
              <CardContent className="flex h-full flex-col gap-3 p-3 sm:gap-4 sm:p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:text-[11px]">
                  Resultado por mes
                </p>
                <ResultBarChart data={periodSeries} />
                <div className="mt-auto">
                  <SurfaceStat
                    label="Saldo do mes"
                    value={getSignedCurrency(summary.currentMonthNet)}
                    tone={summary.currentMonthNet >= 0 ? "success" : "destructive"}
                  />
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
