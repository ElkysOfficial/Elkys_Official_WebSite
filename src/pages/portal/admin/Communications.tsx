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
import { useAdminClients } from "@/hooks/useAdminClients";
import { getClientDisplayName } from "@/lib/portal";
import { Button, Card, CardContent, cn } from "@/design-system";
import { BarChart as BarChartIcon, Eye, ExternalLink, Send } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import MetricTile from "@/components/portal/shared/MetricTile";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import StatusBadge from "@/components/portal/shared/StatusBadge";

type Channel = "all" | "email" | "whatsapp";
const CHANNELS: { value: Channel; label: string }[] = [
  { value: "all", label: "Todos os canais" },
  { value: "email", label: "Somente e-mail" },
  { value: "whatsapp", label: "Somente WhatsApp" },
];

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
  proposal_expired: "Proposta expirada",
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
  password_reset: "Redefinição de senha",
};

/**
 * Classifica a audiencia de cada tipo de comunicacao. Sem isso, todas as
 * mensagens caem no balde "cliente" e a UI mostra "Sem cliente vinculado"
 * para envios que sao deliberadamente internos (boas-vindas de membro novo
 * ou alerta de ticket pra equipe de suporte).
 *
 *   "cliente"  → destinatario e o cliente da Elkys
 *   "equipe"   → destinatario e um membro da equipe interna
 *   "sistema"  → fluxo automatico sem alvo humano fixo (recuperacao de senha)
 */
type Audience = "cliente" | "equipe" | "sistema";

const KIND_AUDIENCE: Record<string, Audience> = {
  team_welcome: "equipe",
  ticket_opened: "equipe",
  password_reset: "sistema",
};

function audienceOf(kind: string): Audience {
  return KIND_AUDIENCE[kind] ?? "cliente";
}

function audienceLabel(aud: Audience): string {
  if (aud === "equipe") return "Equipe Elkys";
  if (aud === "sistema") return "Sistema (envio automático)";
  return "Cliente";
}

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

const PERIODS = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
] as const;

function pct(part: number, total: number): string {
  if (total <= 0) return "0%";
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
  const [channel, setChannel] = useState<Channel>("all");

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

  // Mapa de client_id para nome — usado no breakdown por cliente.
  const { data: clientsBundle } = useAdminClients();
  const clientNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clientsBundle?.clients ?? []) {
      map.set(c.id, getClientDisplayName(c));
    }
    return map;
  }, [clientsBundle]);

  const metrics = useMemo(() => {
    const comms = data?.communications ?? [];
    const events = data?.events ?? [];

    // Eventos por canal. tracking_events.channel separa cliques email vs
    // whatsapp (cada send-* gera 2 tracked_links, um por canal).
    const emailClickIds = new Set(
      events
        .filter((e) => e.event_type === "click" && (e.channel ?? "email") === "email")
        .map((e) => e.communication_id)
    );
    const waClickIds = new Set(
      events
        .filter((e) => e.event_type === "click" && e.channel === "whatsapp")
        .map((e) => e.communication_id)
    );
    const openIds = new Set(
      events.filter((e) => e.event_type === "open").map((e) => e.communication_id)
    );

    // "Enviou" depende do canal: email_status='sent' ou whatsapp_status='sent'.
    const emailSentComms = comms.filter((c) => c.email_status === "sent");
    const waSentComms = comms.filter((c) => c.whatsapp_status === "sent");

    // Em modo "all", uma comunicacao conta como 1 envio para cada canal
    // que efetivamente entregou — refletindo melhor o esforco total da
    // operacao (uma mensma comm pode contar nos 2 canais).
    const inScopeComms =
      channel === "email"
        ? emailSentComms
        : channel === "whatsapp"
          ? waSentComms
          : // "all": uniao dos 2 sets — sem duplicar a mesma comm
            (() => {
              const seen = new Set<string>();
              const merged: typeof comms = [];
              for (const c of [...emailSentComms, ...waSentComms]) {
                if (!seen.has(c.id)) {
                  seen.add(c.id);
                  merged.push(c);
                }
              }
              return merged;
            })();

    // Helpers de "abriu/clicou" respeitando canal selecionado.
    const didOpen = (id: string) => channel !== "whatsapp" && openIds.has(id);
    const didClick = (id: string) => {
      if (channel === "email") return emailClickIds.has(id);
      if (channel === "whatsapp") return waClickIds.has(id);
      return emailClickIds.has(id) || waClickIds.has(id);
    };

    const totalSent = inScopeComms.length;
    const opens = inScopeComms.filter((c) => didOpen(c.id)).length;
    const clicks = inScopeComms.filter((c) => didClick(c.id)).length;

    // Serie temporal com linhas separadas por canal (mais informativa
    // que somar — mostra qual canal esta tendo mais engajamento).
    const byDay = new Map<
      string,
      {
        emailSent: number;
        waSent: number;
        emailClick: number;
        waClick: number;
        open: number;
      }
    >();
    const bucket = (iso: string) => {
      const key = iso.slice(0, 10);
      if (!byDay.has(key))
        byDay.set(key, { emailSent: 0, waSent: 0, emailClick: 0, waClick: 0, open: 0 });
      return byDay.get(key)!;
    };
    for (const c of emailSentComms) bucket(c.created_at).emailSent += 1;
    for (const c of waSentComms) bucket(c.created_at).waSent += 1;
    for (const e of events) {
      const b = bucket(e.created_at);
      if (e.event_type === "open") b.open += 1;
      else if (e.event_type === "click") {
        if (e.channel === "whatsapp") b.waClick += 1;
        else b.emailClick += 1;
      }
    }
    const timeSeries = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ label: formatDayShort(key), ...v }));

    // Desempenho por tipo de comunicacao — respeita filtro de canal.
    const byKindMap = new Map<string, { sent: number; open: number; click: number }>();
    for (const c of inScopeComms) {
      if (!byKindMap.has(c.kind)) byKindMap.set(c.kind, { sent: 0, open: 0, click: 0 });
      const k = byKindMap.get(c.kind)!;
      k.sent += 1;
      if (didOpen(c.id)) k.open += 1;
      if (didClick(c.id)) k.click += 1;
    }
    const byKind = [...byKindMap.entries()]
      .map(([kind, v]) => ({ kind: kindLabel(kind), ...v }))
      .sort((a, b) => b.sent - a.sent);

    // Breakdown por cliente — apenas comms de audiencia "cliente". Envios
    // pra equipe (team_welcome, ticket_opened) e fluxos de sistema (password
    // reset) sao filtrados, evitando poluir o ranking com "Equipe Elkys"
    // ou "Sem cliente" no topo.
    const clientOnlyComms = inScopeComms.filter(
      (c) => audienceOf(c.kind) === "cliente" && c.client_id
    );
    const byClientMap = new Map<
      string,
      { clientId: string; sent: number; open: number; click: number }
    >();
    for (const c of clientOnlyComms) {
      const key = c.client_id as string;
      if (!byClientMap.has(key))
        byClientMap.set(key, { clientId: key, sent: 0, open: 0, click: 0 });
      const k = byClientMap.get(key)!;
      k.sent += 1;
      if (didOpen(c.id)) k.open += 1;
      if (didClick(c.id)) k.click += 1;
    }
    const byClient = [...byClientMap.values()]
      .map((v) => ({
        ...v,
        // Cliente que nao consta no map pode ter sido arquivado/removido
        // do CRM mas ainda tem historico de comunicacao — label honesta
        // sem alarme.
        name: clientNameById.get(v.clientId) ?? "Cliente arquivado",
      }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 10);

    // Tabela de recentes — categoriza por audiencia e exibe label claro
    // em vez de "—". Coluna "Para quem" substitui "Cliente" porque algumas
    // comms sao internas (equipe ou sistema) e seria errado rotular como
    // cliente.
    const recent = comms.slice(0, 50).map((c) => {
      const aud = audienceOf(c.kind);
      let displayTarget: string;
      if (aud === "cliente") {
        displayTarget = c.client_id
          ? (clientNameById.get(c.client_id) ?? "Cliente arquivado")
          : "Cliente não identificado";
      } else if (aud === "equipe") {
        // Para envios internos o destinatario costuma estar no campo de
        // e-mail (lista TICKET_NOTIFY_EMAILS ou e-mail do membro).
        displayTarget = "Equipe Elkys";
      } else {
        displayTarget = "Sistema";
      }
      return {
        id: c.id,
        kind: kindLabel(c.kind),
        audience: aud,
        recipientEmail: c.recipient_email ?? "Sem e-mail",
        recipientPhone: c.recipient_phone ?? null,
        displayTarget,
        createdAt: c.created_at,
        emailStatus: c.email_status,
        whatsappStatus: c.whatsapp_status,
        opened: openIds.has(c.id),
        emailClicked: emailClickIds.has(c.id),
        waClicked: waClickIds.has(c.id),
      };
    });

    return {
      total: comms.length,
      totalSent,
      opens,
      clicks,
      timeSeries,
      byKind,
      byClient,
      recent,
    };
  }, [data, channel, clientNameById]);

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
      {/* Filtros: periodo + canal */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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
        <div className="flex flex-wrap items-center gap-2 sm:ml-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Canal
          </span>
          {CHANNELS.map((ch) => (
            <Button
              key={ch.value}
              type="button"
              variant={channel === ch.value ? "default" : "outline"}
              size="sm"
              onClick={() => setChannel(ch.value)}
            >
              {ch.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Legenda explicativa — separa as 3 audiencias para deixar claro
          que esta tela mistura comunicacao com cliente, com a equipe
          interna e fluxos automaticos de sistema. */}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-5 items-center rounded-full bg-primary/10 px-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Cliente
            </span>
            <p className="text-xs text-muted-foreground">
              Mensagens enviadas para clientes da carteira — cobranças, propostas, status de
              projeto, documentos, suporte.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-5 items-center rounded-full bg-accent/10 px-2 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Equipe
            </span>
            <p className="text-xs text-muted-foreground">
              Alertas internos para a equipe Elkys — boas-vindas de novo membro e notificações de
              tickets abertos pelos clientes.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-5 items-center rounded-full bg-muted px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sistema
            </span>
            <p className="text-xs text-muted-foreground">
              Envios automáticos sem alvo humano direto, como o link de recuperação de senha.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cards de topo (adaptam ao canal selecionado) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label={
            channel === "email"
              ? "E-mails enviados"
              : channel === "whatsapp"
                ? "WhatsApp enviados"
                : "Mensagens enviadas"
          }
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
          value={channel === "whatsapp" ? "Não medido" : pct(metrics.opens, metrics.totalSent)}
          icon={Eye}
          tone="accent"
          hint={
            channel === "whatsapp"
              ? "WhatsApp não rastreia abertura"
              : `${metrics.opens} abertura(s) — sinal indicativo`
          }
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
          {/* Serie temporal — linhas por canal */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Envios e engajamento por canal
              </h2>
              <div className="h-[260px]">
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
                    {channel !== "whatsapp" ? (
                      <>
                        <Line
                          type="monotone"
                          dataKey="emailSent"
                          name="E-mail enviado"
                          stroke={CHART_COLORS.brand}
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="emailClick"
                          name="Clique e-mail"
                          stroke={CHART_COLORS.brand}
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          dot={false}
                        />
                      </>
                    ) : null}
                    {channel !== "email" ? (
                      <>
                        <Line
                          type="monotone"
                          dataKey="waSent"
                          name="WhatsApp enviado"
                          stroke={CHART_COLORS.success}
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="waClick"
                          name="Clique WhatsApp"
                          stroke={CHART_COLORS.success}
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          dot={false}
                        />
                      </>
                    ) : null}
                    {channel !== "whatsapp" ? (
                      <Line
                        type="monotone"
                        dataKey="open"
                        name="Abertura e-mail"
                        stroke={CHART_COLORS.accent}
                        strokeWidth={1.5}
                        dot={false}
                      />
                    ) : null}
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

          {/* Top 10 clientes por volume de mensagens */}
          {metrics.byClient.length > 0 ? (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 space-y-1">
                  <h2 className="text-sm font-semibold text-foreground">
                    Top 10 clientes por engajamento
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Apenas mensagens enviadas para clientes da carteira (envios para a equipe Elkys
                    e fluxos de sistema não entram neste ranking).
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 font-semibold">Cliente</th>
                        <th className="px-3 py-2 text-right font-semibold">Enviadas</th>
                        {channel !== "whatsapp" ? (
                          <th className="px-3 py-2 text-right font-semibold">Aberturas</th>
                        ) : null}
                        <th className="px-3 py-2 text-right font-semibold">Cliques</th>
                        <th className="px-3 py-2 text-right font-semibold">Taxa clique</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.byClient.map((row) => (
                        <tr
                          key={row.clientId}
                          className="border-b border-border/40 last:border-0 hover:bg-muted/40"
                        >
                          <td
                            className="max-w-[280px] truncate py-2.5 font-medium text-foreground"
                            title={row.name}
                          >
                            {row.name}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {row.sent}
                          </td>
                          {channel !== "whatsapp" ? (
                            <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                              {row.open}
                            </td>
                          ) : null}
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {row.click}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium text-foreground">
                            {pct(row.click, row.sent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Tabela de recentes — colunas separadas por canal */}
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
                      <th className="px-4 py-2 font-semibold">Para quem</th>
                      <th className="px-4 py-2 font-semibold">Contato</th>
                      <th className="px-4 py-2 font-semibold">Enviado em</th>
                      <th className="px-4 py-2 font-semibold">E-mail</th>
                      <th className="px-4 py-2 font-semibold">WhatsApp</th>
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
                        <td
                          className="max-w-[200px] px-4 py-2.5"
                          title={`${audienceLabel(row.audience)} • ${row.displayTarget}`}
                        >
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              row.audience === "cliente"
                                ? "bg-primary/10 text-primary"
                                : row.audience === "equipe"
                                  ? "bg-accent/10 text-accent"
                                  : "bg-muted text-muted-foreground"
                            )}
                          >
                            {row.audience === "cliente"
                              ? "Cliente"
                              : row.audience === "equipe"
                                ? "Equipe"
                                : "Sistema"}
                          </span>
                          <p className="mt-1 truncate text-foreground" title={row.displayTarget}>
                            {row.displayTarget}
                          </p>
                        </td>
                        <td
                          className="max-w-[220px] truncate px-4 py-2.5 text-muted-foreground"
                          title={`${row.recipientEmail}${row.recipientPhone ? ` • ${row.recipientPhone}` : ""}`}
                        >
                          <span className="block truncate">{row.recipientEmail}</span>
                          {row.recipientPhone ? (
                            <span className="block truncate text-[11px] opacity-80">
                              {row.recipientPhone}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge
                            tone={
                              row.emailStatus === "sent"
                                ? "success"
                                : row.emailStatus === "failed"
                                  ? "destructive"
                                  : "muted"
                            }
                            label={
                              row.emailStatus === "sent"
                                ? "Enviado"
                                : row.emailStatus === "failed"
                                  ? "Falhou"
                                  : row.emailStatus === "pending"
                                    ? "Pendente"
                                    : "Não enviado"
                            }
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          {row.whatsappStatus ? (
                            <StatusBadge
                              tone={
                                row.whatsappStatus === "sent"
                                  ? "success"
                                  : row.whatsappStatus === "failed"
                                    ? "destructive"
                                    : "muted"
                              }
                              label={
                                row.whatsappStatus === "sent"
                                  ? "Enviado"
                                  : row.whatsappStatus === "failed"
                                    ? "Falhou"
                                    : "Pulado"
                              }
                            />
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Não aplicável</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <DotIndicator on={row.opened} />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1">
                            <DotIndicator on={row.emailClicked || row.waClicked} />
                            {row.emailClicked && row.waClicked ? (
                              <span className="text-[10px] text-muted-foreground">e-mail + WA</span>
                            ) : row.waClicked ? (
                              <span className="text-[10px] text-muted-foreground">
                                via WhatsApp
                              </span>
                            ) : row.emailClicked ? (
                              <span className="text-[10px] text-muted-foreground">via e-mail</span>
                            ) : null}
                          </span>
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

      <div className="space-y-1.5 rounded-lg border border-border/50 bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-foreground">Como ler abertura e clique:</strong> a abertura de
          e-mail é medida por um pixel invisível e é apenas indicativa. Clientes de e-mail (Gmail,
          Outlook, Apple Mail) que usam proxy de imagem podem inflar ou atrasar a contagem. O clique
          no link encurtado é o sinal mais confiável de engajamento real.
        </p>
        <p>
          <strong className="text-foreground">WhatsApp não rastreia abertura:</strong> mensagens de
          texto no WhatsApp não carregam pixel. Por isso a taxa de abertura aparece como &quot;Não
          medido&quot; quando o filtro está em WhatsApp. O clique no link do WhatsApp é rastreado
          normalmente.
        </p>
      </div>
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
