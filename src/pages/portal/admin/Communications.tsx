/**
 * Dashboard de Comunicacoes (portal admin).
 *
 * Mostra metricas de rastreio dos e-mails enviados pelo portal:
 * total enviado, taxa de entrega, taxa de abertura (pixel) e taxa de
 * clique (link encurtado). Inclui serie temporal, desempenho por tipo
 * de comunicacao e tabela das comunicacoes recentes.
 *
 * Fonte: tabelas `communications` e `tracking_events` (migration
 * 20260518120000_communication_tracking.sql).
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { loadCommunications, loadTrackingEvents } from "@/lib/portal-data";
import { Button, Card, CardContent, cn } from "@/design-system";
import { BarChart as BarChartIcon, Eye, ExternalLink, Send } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import MetricTile from "@/components/portal/shared/MetricTile";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import StatusBadge from "@/components/portal/shared/StatusBadge";

const CHART_COLORS = {
  brand: "hsl(var(--elk-primary))",
  accent: "hsl(var(--elk-accent))",
  success: "hsl(var(--elk-success))",
  grid: "hsl(var(--elk-border))",
  muted: "hsl(var(--elk-muted-foreground))",
};

/** Rotulos em PT-BR para o campo `kind` das comunicacoes. */
const KIND_LABELS: Record<string, string> = {
  invoice_due: "Lembrete de fatura",
  charge_overdue: "Cobrança vencida",
  inadimplencia_warning: "Aviso de inadimplência",
  installment_paid: "Parcela paga",
  document_added: "Documento adicionado",
  proposal_sent: "Proposta enviada",
  proposal_expiry: "Proposta expirando",
  contract_validation: "Validação de contrato",
  project_created: "Projeto criado",
  project_stage: "Mudança de etapa",
  project_completed: "Projeto concluído",
  client_welcome: "Boas-vindas (cliente)",
  client_action: "Ação necessária",
  ticket_opened: "Ticket aberto",
  ticket_updated: "Ticket atualizado",
  notification: "Comunicado",
  team_welcome: "Boas-vindas (equipe)",
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

const PERIODS = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
] as const;

function pct(part: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function formatDayShort(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Tooltip simples reutilizado pelos dois graficos. */
interface TooltipPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
}
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-muted-foreground">
          <span
            className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: <span className="font-medium text-foreground">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function Communications() {
  const [days, setDays] = useState<number>(30);

  const sinceIso = useMemo(() => new Date(Date.now() - days * 86_400_000).toISOString(), [days]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-communications", days],
    queryFn: async () => {
      const [comms, events] = await Promise.all([
        loadCommunications(sinceIso),
        loadTrackingEvents(sinceIso),
      ]);
      if (comms.error) throw comms.error;
      if (events.error) throw events.error;
      return { communications: comms.data, events: events.data };
    },
    staleTime: 60_000,
  });

  const metrics = useMemo(() => {
    const comms = data?.communications ?? [];
    const events = data?.events ?? [];

    const openSet = new Set(
      events.filter((e) => e.event_type === "open").map((e) => e.communication_id)
    );
    const clickSet = new Set(
      events.filter((e) => e.event_type === "click").map((e) => e.communication_id)
    );

    const sentComms = comms.filter((c) => c.email_status === "sent");
    const totalSent = sentComms.length;
    const opens = sentComms.filter((c) => openSet.has(c.id)).length;
    const clicks = sentComms.filter((c) => clickSet.has(c.id)).length;

    // Serie temporal: envios por dia + eventos de abertura/clique por dia.
    const byDay = new Map<string, { sent: number; open: number; click: number }>();
    const bucket = (iso: string) => {
      const key = iso.slice(0, 10);
      if (!byDay.has(key)) byDay.set(key, { sent: 0, open: 0, click: 0 });
      return byDay.get(key)!;
    };
    for (const c of sentComms) bucket(c.created_at).sent += 1;
    for (const e of events) {
      const b = bucket(e.created_at);
      if (e.event_type === "open") b.open += 1;
      else if (e.event_type === "click") b.click += 1;
    }
    const timeSeries = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ label: formatDayShort(key), ...v }));

    // Desempenho por tipo de comunicacao.
    const byKindMap = new Map<string, { sent: number; open: number; click: number }>();
    for (const c of sentComms) {
      if (!byKindMap.has(c.kind)) byKindMap.set(c.kind, { sent: 0, open: 0, click: 0 });
      const k = byKindMap.get(c.kind)!;
      k.sent += 1;
      if (openSet.has(c.id)) k.open += 1;
      if (clickSet.has(c.id)) k.click += 1;
    }
    const byKind = [...byKindMap.entries()]
      .map(([kind, v]) => ({ kind: kindLabel(kind), ...v }))
      .sort((a, b) => b.sent - a.sent);

    // Tabela de comunicacoes recentes (ja vem ordenada desc do banco).
    const recent = comms.slice(0, 50).map((c) => ({
      id: c.id,
      kind: kindLabel(c.kind),
      recipient: c.recipient_email ?? "—",
      createdAt: c.created_at,
      emailStatus: c.email_status,
      opened: openSet.has(c.id),
      clicked: clickSet.has(c.id),
    }));

    return {
      total: comms.length,
      totalSent,
      opens,
      clicks,
      timeSeries,
      byKind,
      recent,
    };
  }, [data]);

  if (isLoading) return <PortalLoading />;

  if (isError) {
    return (
      <AdminEmptyState
        icon={BarChartIcon}
        title="Não foi possível carregar as métricas"
        description="Ocorreu um erro ao buscar os dados de comunicação. Tente novamente."
      />
    );
  }

  const hasData = metrics.total > 0;

  return (
    <div className="space-y-6">
      {/* Seletor de periodo */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Período
        </span>
        {PERIODS.map((p) => (
          <Button
            key={p.days}
            type="button"
            variant={days === p.days ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(p.days)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Cards de topo */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="E-mails enviados"
          value={String(metrics.totalSent)}
          icon={Send}
          tone="primary"
          hint={`${metrics.total} comunicações no período`}
        />
        <MetricTile
          label="Taxa de entrega"
          value={pct(metrics.totalSent, metrics.total)}
          icon={BarChartIcon}
          tone="secondary"
          hint="Enviados sem erro / total"
        />
        <MetricTile
          label="Taxa de abertura"
          value={pct(metrics.opens, metrics.totalSent)}
          icon={Eye}
          tone="accent"
          hint={`${metrics.opens} abertura(s) — sinal indicativo`}
        />
        <MetricTile
          label="Taxa de clique"
          value={pct(metrics.clicks, metrics.totalSent)}
          icon={ExternalLink}
          tone="success"
          hint={`${metrics.clicks} clique(s) — sinal mais confiável`}
        />
      </div>

      {!hasData ? (
        <AdminEmptyState
          icon={BarChartIcon}
          title="Sem comunicações no período"
          description="Quando o portal enviar e-mails, o rastreio de abertura e clique aparecerá aqui."
        />
      ) : (
        <>
          {/* Serie temporal */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Envios, aberturas e cliques no tempo
              </h2>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <LineChart
                    data={metrics.timeSeries}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke={CHART_COLORS.grid}
                      strokeOpacity={0.15}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="sent"
                      name="Enviados"
                      stroke={CHART_COLORS.brand}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="open"
                      name="Aberturas"
                      stroke={CHART_COLORS.accent}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="click"
                      name="Cliques"
                      stroke={CHART_COLORS.success}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Desempenho por tipo */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Desempenho por tipo de comunicação
              </h2>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart
                    data={metrics.byKind}
                    layout="vertical"
                    margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
                    barGap={2}
                    barSize={10}
                  >
                    <CartesianGrid
                      horizontal={false}
                      stroke={CHART_COLORS.grid}
                      strokeOpacity={0.15}
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="kind"
                      width={140}
                      tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fillOpacity: 0.06 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="sent" name="Enviados" fill={CHART_COLORS.brand} radius={2} />
                    <Bar dataKey="open" name="Aberturas" fill={CHART_COLORS.accent} radius={2} />
                    <Bar dataKey="click" name="Cliques" fill={CHART_COLORS.success} radius={2} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de recentes */}
          <Card>
            <CardContent className="p-0">
              <h2 className="border-b border-border/60 px-4 py-3 text-sm font-semibold text-foreground sm:px-5">
                Comunicações recentes
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-semibold sm:px-5">Tipo</th>
                      <th className="px-4 py-2 font-semibold">Destinatário</th>
                      <th className="px-4 py-2 font-semibold">Enviado em</th>
                      <th className="px-4 py-2 font-semibold">E-mail</th>
                      <th className="px-4 py-2 font-semibold">Abriu</th>
                      <th className="px-4 py-2 font-semibold">Clicou</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.recent.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border/40 last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-4 py-2.5 font-medium text-foreground sm:px-5">
                          {row.kind}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{row.recipient}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge
                            tone={row.emailStatus === "sent" ? "success" : "muted"}
                            label={row.emailStatus === "sent" ? "Enviado" : row.emailStatus}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <DotIndicator on={row.opened} />
                        </td>
                        <td className="px-4 py-2.5">
                          <DotIndicator on={row.clicked} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        A <strong>abertura</strong> é medida por um pixel invisível e é apenas indicativa — clientes
        de e-mail com proxy de imagem podem inflar ou atrasar a contagem. O <strong>clique</strong>{" "}
        (via link encurtado) é o sinal mais confiável.
      </p>
    </div>
  );
}

function DotIndicator({ on }: { on: boolean }) {
  return (
    <span
      className={cn("inline-flex h-2.5 w-2.5 rounded-full", on ? "bg-success" : "bg-border")}
      title={on ? "Sim" : "Não"}
      aria-label={on ? "Sim" : "Não"}
    />
  );
}
