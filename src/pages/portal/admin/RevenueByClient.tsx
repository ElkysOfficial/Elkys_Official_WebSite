import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Shield, TrendingUp, Wallet } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import MetricTile from "@/components/portal/shared/MetricTile";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import ExportMenu from "@/components/portal/shared/ExportMenu";
import { Button, Card, cn } from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { exportCSV, exportPDF, type ExportColumn } from "@/lib/export";
import { computeTicketAverage } from "@/lib/finance-metrics";
import { formatBRL, getLocalDateIso, toCents } from "@/lib/masks";
import { getClientDisplayName } from "@/lib/portal";

type ChargeRow = Pick<
  Database["public"]["Tables"]["charges"]["Row"],
  "id" | "client_id" | "amount" | "paid_at" | "status" | "is_historical"
>;

type ClientRow = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  "id" | "full_name" | "client_type" | "nome_fantasia" | "is_active"
>;

type ClientRevenue = {
  client: ClientRow;
  totalRevenue: number;
  chargeCount: number;
  ticketMedio: number;
  percentOfTotal: number;
};

type PeriodOption = 1 | 3 | 6 | 9 | 12 | 0;

// "Mês atual" diferencia da janela rolling 3M/6M/etc:
// value=1 vai do dia 1 do mes ate hoje (calendar), nao "ultimos 30 dias".
const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: 1, label: "Mês atual" },
  { value: 3, label: "3M" },
  { value: 6, label: "6M" },
  { value: 9, label: "9M" },
  { value: 12, label: "12M" },
  { value: 0, label: "Todos" },
];

function getStartDate(months: PeriodOption): string | null {
  if (months === 0) return null;
  const d = new Date();
  if (months === 1) {
    // 1M = somente mês atual (sem projeção/regressão)
    d.setDate(1);
    return getLocalDateIso(d);
  }
  d.setMonth(d.getMonth() - months);
  d.setDate(1);
  return getLocalDateIso(d);
}

export default function RevenueByClient() {
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Default = Mes atual (value=1): visao "o que entrou ate agora" abre primeiro,
  // usuario expande pra janelas maiores se quiser comparativo.
  const [period, setPeriod] = useState<PeriodOption>(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [chargesRes, clientsRes] = await Promise.all([
      supabase
        .from("charges")
        .select("id, client_id, amount, paid_at, status, is_historical")
        .eq("status", "pago")
        .eq("is_historical", false),
      supabase.from("clients").select("id, full_name, client_type, nome_fantasia, is_active"),
    ]);

    const hardError = chargesRes.error ?? clientsRes.error;
    if (hardError) {
      setError(hardError.message);
      setLoading(false);
      return;
    }

    setCharges((chargesRes.data ?? []) as ChargeRow[]);
    setClients((clientsRes.data ?? []) as ClientRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const ranking = useMemo(() => {
    const startDate = getStartDate(period);
    const clientMap = new Map(clients.map((c) => [c.id, c]));

    const filteredCharges = charges.filter((c) => {
      if (!startDate) return true;
      return c.paid_at && c.paid_at >= startDate;
    });

    const revenueMap = new Map<string, { totalCents: number; count: number }>();
    for (const charge of filteredCharges) {
      const existing = revenueMap.get(charge.client_id) ?? { totalCents: 0, count: 0 };
      existing.totalCents += toCents(charge.amount);
      existing.count += 1;
      revenueMap.set(charge.client_id, existing);
    }

    const grandTotalCents = Array.from(revenueMap.values()).reduce(
      (sum, r) => sum + r.totalCents,
      0
    );
    const grandTotal = grandTotalCents / 100;

    const result: ClientRevenue[] = Array.from(revenueMap.entries())
      .map(([clientId, revenue]) => {
        const client = clientMap.get(clientId) ?? {
          id: clientId,
          full_name: "Cliente desconhecido",
          client_type: "pf" as const,
          nome_fantasia: null,
          is_active: false,
        };
        const total = revenue.totalCents / 100;
        return {
          client,
          totalRevenue: total,
          chargeCount: revenue.count,
          ticketMedio: computeTicketAverage(total, revenue.count),
          percentOfTotal: grandTotalCents > 0 ? (revenue.totalCents / grandTotalCents) * 100 : 0,
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    return result;
  }, [charges, clients, period]);

  const grandTotal = useMemo(() => ranking.reduce((sum, r) => sum + r.totalRevenue, 0), [ranking]);
  const avgTicket = useMemo(
    () =>
      computeTicketAverage(
        grandTotal,
        ranking.reduce((sum, r) => sum + r.chargeCount, 0)
      ),
    [ranking, grandTotal]
  );

  const exportColumns: ExportColumn[] = [
    { key: "position", label: "Posicao", align: "center" },
    { key: "client", label: "Cliente" },
    { key: "totalRevenue", label: "Receita Total", align: "right" },
    { key: "chargeCount", label: "Cobrancas", align: "right" },
    { key: "ticketMedio", label: "Ticket Medio", align: "right" },
    { key: "percentOfTotal", label: "% do Total", align: "right" },
  ];

  const exportRows = ranking.map((r, i) => ({
    position: String(i + 1),
    client: getClientDisplayName(r.client),
    totalRevenue: formatBRL(r.totalRevenue),
    chargeCount: String(r.chargeCount),
    ticketMedio: formatBRL(r.ticketMedio),
    percentOfTotal: `${r.percentOfTotal.toFixed(1)}%`,
  }));

  const handleExportCSV = () =>
    exportCSV({
      title: "Receita por Cliente",
      filename: "receita-por-cliente",
      columns: exportColumns,
      rows: exportRows,
    });
  const handleExportPDF = () =>
    exportPDF({
      title: "Relatorio de Receita por Cliente",
      subtitle: `${ranking.length} clientes | Total: ${formatBRL(grandTotal)}`,
      filename: "receita-por-cliente",
      columns: exportColumns,
      rows: exportRows,
    });

  if (loading) return <PortalLoading />;

  if (error) {
    return (
      <AdminEmptyState
        icon={TrendingUp}
        title="Erro ao carregar receita"
        description={error}
        action={
          <Button type="button" onClick={() => void loadData()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  if (ranking.length === 0) {
    return (
      <AdminEmptyState
        icon={Shield}
        title="Sem receita registrada"
        description="Quando cobranças forem pagas, o ranking de receita por cliente aparecera aqui."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Metrics */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile
          label="Receita total"
          value={formatBRL(grandTotal)}
          icon={TrendingUp}
          tone="success"
          hint={`${ranking.length} cliente(s)`}
        />
        <MetricTile
          label="Ticket medio"
          value={formatBRL(avgTicket)}
          icon={Wallet}
          tone="primary"
        />
        <MetricTile
          label="Top cliente"
          value={ranking[0] ? getClientDisplayName(ranking[0].client) : "—"}
          icon={Shield}
          tone="accent"
          hint={ranking[0] ? `${ranking[0].percentOfTotal.toFixed(1)}% da receita` : undefined}
        />
      </div>

      {/* Period filter */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Periodo:
        </span>
        <div className="inline-flex rounded-full border border-border/80 bg-background/80 p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={cn(
                "min-h-[36px] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                period === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <ExportMenu
          onExportCSV={handleExportCSV}
          onExportPDF={handleExportPDF}
          className="ml-auto"
        />
      </div>

      {/* Table */}
      <Card className="overflow-hidden rounded-2xl border-border/80 bg-card/95">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="w-12 px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  #
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Cliente
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Receita total
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Cobrancas
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Ticket medio
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  % do total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {ranking.map((row, index) => (
                <tr key={row.client.id} className="transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
                        index === 0
                          ? "bg-warning/15 text-warning"
                          : index === 1
                            ? "bg-muted text-muted-foreground"
                            : index === 2
                              ? "bg-accent/10 text-accent"
                              : "text-muted-foreground"
                      )}
                    >
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/portal/admin/clientes/${row.client.id}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {getClientDisplayName(row.client)}
                    </Link>
                    {!row.client.is_active && (
                      <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                    {formatBRL(row.totalRevenue)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {row.chargeCount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatBRL(row.ticketMedio)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min(row.percentOfTotal, 100)}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                        {row.percentOfTotal.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/60 bg-muted/20">
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
                  Total ({ranking.length} clientes)
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                  {formatBRL(grandTotal)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {ranking.reduce((sum, r) => sum + r.chargeCount, 0)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {formatBRL(avgTicket)}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                  100%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
