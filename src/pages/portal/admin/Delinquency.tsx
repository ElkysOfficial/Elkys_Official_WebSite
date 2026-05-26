import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Clock, ExternalLink, Receipt, Shield } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import MetricTile from "@/components/portal/shared/MetricTile";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import ExportMenu from "@/components/portal/shared/ExportMenu";
import StatusBadge from "@/components/portal/shared/StatusBadge";
import { Button, Card, CardContent, cn } from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { exportCSV, exportPDF, type ExportColumn } from "@/lib/export";
import { AGING_BUCKET_30, AGING_BUCKET_60 } from "@/lib/finance-metrics";
import { formatBRL, getLocalDateIso, toCents } from "@/lib/masks";
import { CHARGE_STATUS_META, formatPortalDate, getClientDisplayName } from "@/lib/portal";

type ChargeRow = Pick<
  Database["public"]["Tables"]["charges"]["Row"],
  | "id"
  | "client_id"
  | "description"
  | "amount"
  | "due_date"
  | "status"
  | "payment_link"
  | "is_historical"
  | "origin_type"
  | "paid_at"
>;

type ClientRow = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  "id" | "full_name" | "client_type" | "nome_fantasia"
>;

type OverdueCharge = ChargeRow & { client: ClientRow; daysOverdue: number };

type AgingFilter = "all" | "0-30" | "30-60" | "60+";

const AGING_FILTERS: { value: AgingFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "0-30", label: "0-30 dias" },
  { value: "30-60", label: "30-60 dias" },
  { value: "60+", label: "60+ dias" },
];

function getDaysOverdue(dueDate: string): number {
  const due = new Date(`${dueDate}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
}

function matchesAgingFilter(days: number, filter: AgingFilter): boolean {
  if (filter === "all") return true;
  if (filter === "0-30") return days <= AGING_BUCKET_30;
  if (filter === "30-60") return days > AGING_BUCKET_30 && days <= AGING_BUCKET_60;
  return days > AGING_BUCKET_60;
}

export default function Delinquency() {
  const [charges, setCharges] = useState<OverdueCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agingFilter, setAgingFilter] = useState<AgingFilter>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const todayStr = getLocalDateIso();

    const [chargesRes, clientsRes] = await Promise.all([
      supabase
        .from("charges")
        .select(
          "id, client_id, description, amount, due_date, status, payment_link, is_historical, origin_type, paid_at"
        )
        .in("status", ["atrasado", "pendente"])
        .eq("is_historical", false)
        .is("paid_at", null)
        .lte("due_date", todayStr),
      supabase.from("clients").select("id, full_name, client_type, nome_fantasia"),
    ]);

    const hardError = chargesRes.error ?? clientsRes.error;
    if (hardError) {
      setError(hardError.message);
      setLoading(false);
      return;
    }

    const chargesData = (chargesRes.data ?? []) as ChargeRow[];
    const clientsData = (clientsRes.data ?? []) as ClientRow[];
    const clientMap = new Map(clientsData.map((c) => [c.id, c]));

    const merged: OverdueCharge[] = chargesData
      .map((charge) => ({
        ...charge,
        client: clientMap.get(charge.client_id) ?? {
          id: charge.client_id,
          full_name: "Cliente desconhecido",
          client_type: "pf" as const,
          nome_fantasia: null,
        },
        daysOverdue: getDaysOverdue(charge.due_date),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    setCharges(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const uniqueClients = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of charges) {
      map.set(c.client.id, getClientDisplayName(c.client));
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [charges]);

  const filtered = useMemo(() => {
    return charges.filter((c) => {
      if (!matchesAgingFilter(c.daysOverdue, agingFilter)) return false;
      if (clientFilter !== "all" && c.client_id !== clientFilter) return false;
      return true;
    });
  }, [charges, agingFilter, clientFilter]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, c) => sum + toCents(c.amount), 0) / 100,
    [filtered]
  );
  const affectedClients = useMemo(() => new Set(filtered.map((c) => c.client_id)).size, [filtered]);

  const exportColumns: ExportColumn[] = [
    { key: "client", label: "Cliente" },
    { key: "description", label: "Descrição" },
    { key: "amount", label: "Valor", align: "right" },
    { key: "dueDate", label: "Vencimento" },
    { key: "daysOverdue", label: "Dias em Atraso", align: "right" },
    { key: "status", label: "Status" },
  ];

  const exportRows = filtered.map((c) => ({
    client: getClientDisplayName(c.client),
    description: c.description,
    amount: formatBRL(Number(c.amount)),
    dueDate: formatPortalDate(c.due_date),
    daysOverdue: String(c.daysOverdue),
    status: CHARGE_STATUS_META[c.status as keyof typeof CHARGE_STATUS_META]?.label ?? c.status,
  }));

  const handleExportCSV = () =>
    exportCSV({
      title: "Inadimplencia",
      filename: "inadimplencia",
      columns: exportColumns,
      rows: exportRows,
    });
  const handleExportPDF = () =>
    exportPDF({
      title: "Relatório de Inadimplencia",
      subtitle: `${filtered.length} cobranças | Total: ${formatBRL(totalAmount)}`,
      filename: "inadimplencia",
      columns: exportColumns,
      rows: exportRows,
    });

  if (loading) return <PortalLoading />;

  if (error) {
    return (
      <AdminEmptyState
        icon={Receipt}
        title="Erro ao carregar inadimplencia"
        description={error}
        action={
          <Button type="button" onClick={() => void loadData()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  if (charges.length === 0) {
    return (
      <AdminEmptyState
        icon={Shield}
        title="Nenhuma cobrança em atraso"
        description="Parabens! Todas as cobranças estao em dia. Continue acompanhando para manter a saude financeira."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Metrics */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile
          label="Total em atraso"
          value={formatBRL(totalAmount)}
          icon={Receipt}
          tone="destructive"
          hint={`${filtered.length} cobrança(s)`}
        />
        <MetricTile
          label="Clientes afetados"
          value={String(affectedClients)}
          icon={Shield}
          tone="warning"
        />
        <MetricTile
          label="Atraso medio"
          value={
            filtered.length > 0
              ? `${Math.round(filtered.reduce((sum, c) => sum + c.daysOverdue, 0) / filtered.length)} dias`
              : "0 dias"
          }
          icon={Clock}
          tone="secondary"
        />
      </div>

      {/* Filters */}
      <Card className="rounded-2xl border-border/80 bg-card/95">
        <CardContent className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Faixa de atraso:
          </span>
          <div className="inline-flex rounded-full border border-border/80 bg-background/80 p-1">
            {AGING_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setAgingFilter(f.value)}
                className={cn(
                  "min-h-[36px] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  agingFilter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <ExportMenu
            onExportCSV={handleExportCSV}
            onExportPDF={handleExportPDF}
            className="ml-auto"
          />

          {uniqueClients.length > 1 && (
            <>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-2">
                Cliente:
              </span>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="min-h-[36px] rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="all">Todos</option>
                {uniqueClients.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden rounded-2xl border-border/80 bg-card/95">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Descrição
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Valor
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Vencimento
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Dias em atraso
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((charge) => {
                const statusMeta =
                  CHARGE_STATUS_META[charge.status as keyof typeof CHARGE_STATUS_META];

                return (
                  <tr key={charge.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link
                        to={`/portal/admin/clientes/${charge.client_id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {getClientDisplayName(charge.client)}
                      </Link>
                    </td>
                    <td
                      className="max-w-[200px] truncate px-4 py-3 text-muted-foreground"
                      title={charge.description}
                    >
                      {charge.description}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                      {formatBRL(Number(charge.amount))}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatPortalDate(charge.due_date)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          charge.daysOverdue > 60
                            ? "text-destructive"
                            : charge.daysOverdue > 30
                              ? "text-warning"
                              : "text-muted-foreground"
                        )}
                      >
                        {charge.daysOverdue}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {statusMeta && (
                        <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {charge.payment_link ? (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(charge.payment_link!);
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                          title="Copiar link de pagamento"
                        >
                          <ExternalLink size={12} />
                          Link
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/60 bg-muted/20">
                <td
                  className="px-4 py-3 text-xs font-semibold uppercase text-muted-foreground"
                  colSpan={2}
                >
                  Total ({filtered.length} cobranças)
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                  {formatBRL(totalAmount)}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
