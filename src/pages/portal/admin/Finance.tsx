import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useUrlState } from "@/hooks/useUrlState";
import { toast } from "sonner";
import { useAdminCharges } from "@/hooks/useAdminCharges";
import { useAdminClients } from "@/hooks/useAdminClients";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CheckCircle, Clock, FileText, Receipt, Search } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import AlertBanner from "@/components/portal/shared/AlertBanner";
import ExportMenu from "@/components/portal/shared/ExportMenu";
import MetricTile from "@/components/portal/shared/MetricTile";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import RowActionMenu from "@/components/portal/shared/RowActionMenu";
import SurfaceStat from "@/components/portal/shared/SurfaceStat";
import { exportCSV, exportPDF, type ExportColumn } from "@/lib/export";

// Lazy-load sub-tabs: only the active tab downloads its code
const AdminExpenses = lazy(() => import("@/pages/portal/admin/Expenses"));
const Delinquency = lazy(() => import("@/pages/portal/admin/Delinquency"));
const RevenueByClient = lazy(() => import("@/pages/portal/admin/RevenueByClient"));
const FinanceGoals = lazy(() => import("@/pages/portal/admin/FinanceGoals"));
import StatusBadge from "@/components/portal/shared/StatusBadge";
import InlineStatusSelect, {
  type InlineStatusOption,
} from "@/components/portal/shared/InlineStatusSelect";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Label,
  buttonVariants,
  cn,
} from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseFunctionAuthHeaders } from "@/lib/supabase-functions";
import type { Database } from "@/integrations/supabase/types";
import {
  CHARGE_STATUS_META,
  chargeStatusToInstallmentStatus,
  formatPortalDate,
  getClientDisplayName,
  isProjectOperationallyOpen,
  getProjectEffectiveBucket,
  isTicketOpen,
} from "@/lib/portal";
import {
  BURN_RATE_WINDOW_MONTHS,
  computeAgingBuckets,
  computeBurnRate,
  computeForecastRevenue,
  computeOperationalMargin,
  computePipelineSummary,
  computeRunway,
  isProjectOverdue,
  MARGIN_HEALTHY_PCT,
  MARGIN_NEUTRAL_PCT,
  OPEN_TICKETS_WARNING_THRESHOLD,
  RUNWAY_DANGER_MONTHS,
  RUNWAY_WARNING_MONTHS,
} from "@/lib/finance-metrics";
import { syncSubscriptionCharges } from "@/lib/sync-subscription-charges";
import {
  formatBRL,
  formatDateInput,
  getLocalDateIso,
  maskCurrency,
  maskDate,
  parseFormDate,
  toCents,
  unmaskCurrency,
} from "@/lib/masks";

type PortalClient = Database["public"]["Tables"]["clients"]["Row"];
type PortalCharge = Database["public"]["Tables"]["charges"]["Row"];
type FinanceTab =
  | "receitas"
  | "despesas"
  | "analise"
  | "inadimplencia"
  | "receita-clientes"
  | "metas";

const REVENUE_PAGE_SIZE = 10;

const CHARGE_STATUSES = ["pendente", "pago", "atrasado", "agendada", "cancelado"] as const;

// Opcoes do inline-edit ancoradas em CHARGE_STATUS_META — preservam label
// e tone do StatusBadge ja estabelecido. "Pago" tem hint porque abre o
// modal de confirmacao em vez de aplicar direto (preserva o fluxo seguro
// existente em setConfirmingPayCharge / handleQuickMarkPaid).
const CHARGE_STATUS_OPTIONS: InlineStatusOption<PortalCharge["status"]>[] = [
  { value: "agendada", label: "Futura", tone: "secondary" },
  { value: "pendente", label: "Em aberto", tone: "warning" },
  { value: "atrasado", label: "Em atraso", tone: "destructive" },
  { value: "pago", label: "Pago", tone: "success", hint: "Abre confirmação" },
  { value: "cancelado", label: "Cancelado", tone: "secondary" },
];

type ChargeEditor = {
  description: string;
  amount: string;
  due_date: string;
  status: string;
};

function getChargeEditorFromCharge(charge: PortalCharge): ChargeEditor {
  return {
    description: charge.description,
    amount: formatBRL(Number(charge.amount)),
    due_date: formatDateInput(charge.due_date),
    status: charge.status,
  };
}

function getRevenueMonthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function getCurrentRevenueMonthKey() {
  const now = new Date();
  return getRevenueMonthKey(now.getFullYear(), now.getMonth());
}

function formatRevenueMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/*  Row action menu                                                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Receitas tab                                                      */
/* ------------------------------------------------------------------ */

type PeriodPreset = "mes_atual" | "30d" | "90d" | "ytd" | "all" | "custom";

const PERIOD_PRESETS: { value: PeriodPreset; label: string; hint: string }[] = [
  { value: "mes_atual", label: "Mês atual", hint: "Do dia 1 até o último dia do mês" },
  { value: "30d", label: "Últimos 30d", hint: "Janela móvel dos últimos 30 dias" },
  { value: "90d", label: "Últimos 90d", hint: "Janela móvel dos últimos 90 dias" },
  { value: "ytd", label: "Ano (YTD)", hint: "1º de janeiro até hoje" },
  { value: "all", label: "Tudo", hint: "Sem filtro de período" },
  { value: "custom", label: "Customizado", hint: "Selecione o mês no dropdown" },
];

function FinanceRevenueTab({
  charges,
  clientsMap,
  loading,
  pageError,
  onReload,
}: {
  charges: PortalCharge[];
  clientsMap: Record<string, PortalClient>;
  loading: boolean;
  pageError: string | null;
  onReload: () => Promise<void>;
}) {
  const { isSuperAdmin } = useAuth();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useUrlState("q", "");
  const [statusFilter, setStatusFilter] = useUrlState("status", "all");
  const [monthFilter, setMonthFilter] = useUrlState("mes", getCurrentRevenueMonthKey());
  const [periodPreset, setPeriodPreset] = useUrlState<PeriodPreset>("periodo", "mes_atual");
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ChargeEditor | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [savingChargeId, setSavingChargeId] = useState<string | null>(null);
  const [deleteChargeId, setDeleteChargeId] = useState<string | null>(null);
  const [removingChargeId, setRemovingChargeId] = useState<string | null>(null);

  const deferredSearch = search.trim().toLowerCase();

  // Calcula o intervalo de datas para o preset ativo. Retorna null quando
  // o preset e "custom" (o filtro de mes abaixo assume o controle) ou
  // "all" (sem filtro de periodo, mostra tudo).
  const periodRange = useMemo<{ from: string; to: string } | null>(() => {
    if (periodPreset === "custom" || periodPreset === "all") return null;
    const today = new Date();
    const todayStr = getLocalDateIso(today);
    if (periodPreset === "mes_atual") {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: getLocalDateIso(first), to: getLocalDateIso(last) };
    }
    if (periodPreset === "30d") {
      const past = new Date(today);
      past.setDate(past.getDate() - 30);
      return { from: getLocalDateIso(past), to: todayStr };
    }
    if (periodPreset === "90d") {
      const past = new Date(today);
      past.setDate(past.getDate() - 90);
      return { from: getLocalDateIso(past), to: todayStr };
    }
    if (periodPreset === "ytd") {
      const first = new Date(today.getFullYear(), 0, 1);
      return { from: getLocalDateIso(first), to: todayStr };
    }
    return null;
  }, [periodPreset]);

  useEffect(() => {
    setPage(0);
  }, [deferredSearch, statusFilter, monthFilter, periodPreset]);

  const monthOptions = useMemo(() => {
    const allMonths = new Set([
      getCurrentRevenueMonthKey(),
      ...charges.map((c) => c.due_date.slice(0, 7)),
    ]);
    return Array.from(allMonths).sort((left, right) => right.localeCompare(left));
  }, [charges]);

  const filteredCharges = useMemo(
    () =>
      charges.filter((charge) => {
        const client = clientsMap[charge.client_id];
        const clientName = client ? getClientDisplayName(client).toLowerCase() : "";
        const matchesSearch =
          deferredSearch.length === 0 ||
          charge.description.toLowerCase().includes(deferredSearch) ||
          clientName.includes(deferredSearch);

        const matchesStatus = statusFilter === "all" || charge.status === statusFilter;
        // Logica de periodo: presets de range tem prioridade; quando o
        // preset e "custom" caimos no dropdown tradicional de mes.
        let matchesPeriod = true;
        if (periodPreset === "all") {
          matchesPeriod = true;
        } else if (periodPreset === "custom") {
          matchesPeriod = monthFilter === "all" || charge.due_date.startsWith(monthFilter);
        } else if (periodRange) {
          matchesPeriod = charge.due_date >= periodRange.from && charge.due_date <= periodRange.to;
        }

        return matchesSearch && matchesStatus && matchesPeriod;
      }),
    [charges, clientsMap, deferredSearch, statusFilter, monthFilter, periodPreset, periodRange]
  );

  const totalPages = Math.max(1, Math.ceil(filteredCharges.length / REVENUE_PAGE_SIZE));
  const visibleCharges = filteredCharges.slice(
    page * REVENUE_PAGE_SIZE,
    (page + 1) * REVENUE_PAGE_SIZE
  );

  const filteredTotal = filteredCharges.reduce((sum, c) => sum + toCents(c.amount), 0) / 100;
  const filteredPaid =
    filteredCharges
      .filter((c) => c.status === "pago")
      .reduce((sum, c) => sum + toCents(c.amount), 0) / 100;
  const filteredPending = Math.max(0, filteredTotal - filteredPaid);
  const paidPercentage = filteredTotal > 0 ? Math.round((filteredPaid / filteredTotal) * 100) : 0;
  const startEditing = (charge: PortalCharge) => {
    setEditingChargeId(charge.id);
    setEditor(getChargeEditorFromCharge(charge));
    setEditorError(null);
  };

  const stopEditing = () => {
    setEditingChargeId(null);
    setEditor(null);
    setEditorError(null);
  };

  const [quickPayingId, setQuickPayingId] = useState<string | null>(null);
  const [quickStatusChargeId, setQuickStatusChargeId] = useState<string | null>(null);
  const [confirmingPayCharge, setConfirmingPayCharge] = useState<PortalCharge | null>(null);

  /**
   * Inline-edit de status (qualquer transicao exceto "pago", que delega ao
   * fluxo de confirmacao existente). Replica os efeitos colaterais do
   * editor completo: sync de project_installments, notificacao de atraso
   * quando entra em "atrasado" e undo via toast. Sem e-mail de
   * agradecimento — esse e exclusivo da rota "pago" (handleQuickMarkPaid).
   */
  // Rollback de cobranca paga e sensivel: o e-mail de agradecimento ja foi
  // enviado ao cliente, nao da pra desfazer. Antes de aplicar, mostramos
  // AlertDialog avisando explicitamente. Decisao consciente do admin.
  const [pendingPaidRollback, setPendingPaidRollback] = useState<{
    charge: PortalCharge;
    newStatus: PortalCharge["status"];
  } | null>(null);

  const handleQuickChangeStatus = async (
    charge: PortalCharge,
    newStatus: PortalCharge["status"]
  ) => {
    if (newStatus === charge.status) return;
    if (newStatus === "pago") {
      setConfirmingPayCharge(charge);
      return;
    }
    if (quickStatusChargeId || quickPayingId) return;

    // Rollback de pago precisa de confirmacao — e-mail ja saiu.
    if (charge.status === "pago") {
      setPendingPaidRollback({ charge, newStatus });
      return;
    }

    await performQuickChangeStatus(charge, newStatus);
  };

  const performQuickChangeStatus = async (
    charge: PortalCharge,
    newStatus: PortalCharge["status"]
  ) => {
    setQuickStatusChargeId(charge.id);
    const previousStatus = charge.status;
    const previousPaidAt = charge.paid_at;

    const { error } = await supabase
      .from("charges")
      .update({ status: newStatus, paid_at: null })
      .eq("id", charge.id);

    if (error) {
      setQuickStatusChargeId(null);
      toast.error("Não foi possível atualizar o status.", { description: error.message });
      return;
    }

    if (charge.installment_id) {
      const { error: syncError } = await supabase
        .from("project_installments")
        .update({
          status: chargeStatusToInstallmentStatus(newStatus),
          paid_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", charge.installment_id);
      if (syncError) {
        console.warn("[Finance.handleQuickChangeStatus] sync de parcela falhou", syncError);
      }
    }

    if (newStatus === "atrasado" && previousStatus !== "atrasado") {
      try {
        const headers = await getSupabaseFunctionAuthHeaders();
        await supabase.functions.invoke("send-charge-overdue", {
          body: {
            client_id: charge.client_id,
            charge_description: charge.description,
            charge_amount: Number(charge.amount),
            due_date: charge.due_date,
          },
          headers,
        });
      } catch {
        // Notificacao best-effort — nao bloqueia.
      }
    }

    setQuickStatusChargeId(null);
    await onReload();

    toast.success("Status atualizado.", {
      description: `${charge.description} → ${CHARGE_STATUS_META[newStatus].label}`,
      action: {
        label: "Desfazer",
        onClick: async () => {
          const { error: undoError } = await supabase
            .from("charges")
            .update({ status: previousStatus, paid_at: previousPaidAt })
            .eq("id", charge.id);
          if (undoError) {
            toast.error("Não foi possível desfazer.", { description: undoError.message });
            return;
          }
          if (charge.installment_id) {
            await supabase
              .from("project_installments")
              .update({
                status: chargeStatusToInstallmentStatus(previousStatus),
                paid_at: previousPaidAt,
                updated_at: new Date().toISOString(),
              })
              .eq("id", charge.installment_id);
          }
          await onReload();
        },
      },
    });
  };

  /**
   * Atalho de 1 clique para marcar uma cobranca como paga sem abrir o
   * editor completo. Atualiza status + paid_at na charge, sincroniza
   * a project_installment vinculada (se houver) e oferece toast com
   * undo que reverte ambos se o admin clicar por engano.
   */
  const handleQuickMarkPaid = async (charge: PortalCharge) => {
    if (quickPayingId) return;
    if (charge.status === "pago") return;
    setQuickPayingId(charge.id);

    const paidAt = getLocalDateIso();
    const previousStatus = charge.status;
    const previousPaidAt = charge.paid_at;

    const { error } = await supabase
      .from("charges")
      .update({ status: "pago", paid_at: paidAt })
      .eq("id", charge.id);

    if (error) {
      setQuickPayingId(null);
      toast.error("Não foi possível marcar como paga.", { description: error.message });
      return;
    }

    // Sincroniza installment vinculada (mesmo bloco do handleSaveCharge)
    if (charge.installment_id) {
      const { error: installmentSyncError } = await supabase
        .from("project_installments")
        .update({
          status: "paga",
          paid_at: paidAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", charge.installment_id);
      if (installmentSyncError) {
        console.warn("[Finance.handleQuickMarkPaid] sync de parcela falhou", installmentSyncError);
      }
    }

    // Evento na timeline, sem bloquear em caso de falha
    try {
      await supabase.from("timeline_events").insert({
        client_id: charge.client_id,
        project_id: charge.project_id ?? null,
        event_type: "pagamento_recebido",
        title: "Pagamento recebido",
        summary: `Cobrança "${charge.description}" marcada como paga.`,
        visibility: "ambos",
        source_table: "charges",
        source_id: charge.id,
      });
    } catch {
      /* silencioso: falha de timeline nao bloqueia o fluxo principal */
    }

    // Confirmacao de pagamento por e-mail, com rastreio (mesmo fluxo do
    // editor completo em handleSaveCharge). Best-effort: se o envio falhar,
    // avisa mas nao reverte o pagamento nem bloqueia o fluxo.
    try {
      const headers = await getSupabaseFunctionAuthHeaders();
      const { error: billingError } = await supabase.functions.invoke("process-billing-rules", {
        body: {
          triggered_by: "manual",
          single_charge_id: charge.id,
          force_template_type: "agradecimento",
        },
        headers,
      });
      if (billingError) {
        toast.warning("Cobrança paga, mas a confirmação por e-mail não foi enviada ao cliente.");
      }
    } catch {
      toast.warning("Cobrança paga, mas a confirmação por e-mail não foi enviada ao cliente.");
    }

    setQuickPayingId(null);
    await onReload();

    toast.success("Cobrança marcada como paga.", {
      description: `${charge.description} · ${formatBRL(Number(charge.amount))}`,
      action: {
        label: "Desfazer",
        onClick: async () => {
          const { error: undoError } = await supabase
            .from("charges")
            .update({ status: previousStatus, paid_at: previousPaidAt })
            .eq("id", charge.id);
          if (undoError) {
            toast.error("Não foi possível desfazer.", { description: undoError.message });
            return;
          }
          if (charge.installment_id) {
            await supabase
              .from("project_installments")
              .update({
                status: chargeStatusToInstallmentStatus(previousStatus),
                paid_at: previousPaidAt,
                updated_at: new Date().toISOString(),
              })
              .eq("id", charge.installment_id);
          }
          await onReload();
          toast.success("Cobrança revertida ao status anterior.");
        },
      },
    });
  };

  const handleSaveCharge = async (chargeId: string) => {
    if (!editor || savingChargeId) return;

    const parsedDate = parseFormDate(editor.due_date);
    if (!parsedDate) {
      setEditorError("Informe uma data valida.");
      return;
    }

    if (editor.description.trim().length < 3) {
      setEditorError("A descrição precisa ter ao menos 3 caracteres.");
      return;
    }

    if (!editor.amount.trim() || unmaskCurrency(editor.amount) <= 0) {
      setEditorError("Informe um valor maior que zero.");
      return;
    }

    setSavingChargeId(chargeId);
    setEditorError(null);

    const isPaidNow = editor.status === "pago";
    const paidAt = isPaidNow ? getLocalDateIso() : null;
    const { error } = await supabase
      .from("charges")
      .update({
        description: editor.description.trim(),
        amount: unmaskCurrency(editor.amount),
        due_date: parsedDate,
        status: editor.status as PortalCharge["status"],
        ...(isPaidNow ? { paid_at: paidAt } : {}),
      })
      .eq("id", chargeId);

    if (error) {
      setEditorError(error.message);
      setSavingChargeId(null);
      return;
    }

    const originalCharge = charges.find((c) => c.id === chargeId);
    const sideEffectWarnings: string[] = [];

    // Sincroniza o status da parcela do projeto quando a cobrança for
    // originada de um contrato (installment_id preenchido). Antes, marcar
    // uma cobrança como "paga" em Finance deixava a project_installments
    // vinculada com status desatualizado, criando divergência entre o
    // Financeiro e o ProjectDetail. Agora o fluxo é bidirecional.
    if (originalCharge?.installment_id) {
      const nextInstallmentStatus = chargeStatusToInstallmentStatus(
        editor.status as PortalCharge["status"]
      );
      const { error: installmentSyncError } = await supabase
        .from("project_installments")
        .update({
          status: nextInstallmentStatus,
          paid_at: paidAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", originalCharge.installment_id);

      if (installmentSyncError) {
        sideEffectWarnings.push(
          "Parcela do projeto não foi sincronizada — corrija manualmente em ProjectDetail."
        );
      }
    }

    // Notify client when charge becomes overdue
    if (editor.status === "atrasado" && originalCharge && originalCharge.status !== "atrasado") {
      try {
        const overdueHeaders = await getSupabaseFunctionAuthHeaders();
        const { error: overdueError } = await supabase.functions.invoke("send-charge-overdue", {
          body: {
            client_id: originalCharge.client_id,
            charge_description: editor.description.trim(),
            charge_amount: unmaskCurrency(editor.amount),
            due_date: parsedDate,
          },
          headers: overdueHeaders,
        });
        if (overdueError) sideEffectWarnings.push("Notificação de atraso não enviada.");
      } catch {
        sideEffectWarnings.push("Notificação de atraso não enviada.");
      }
    }

    // Timeline event + payment confirmation when charge is marked as paid
    if (isPaidNow && originalCharge && originalCharge.status !== "pago") {
      try {
        const { error: timelineError } = await supabase.from("timeline_events").insert({
          client_id: originalCharge.client_id,
          project_id: originalCharge.project_id ?? null,
          event_type: "pagamento_recebido",
          title: "Pagamento recebido",
          summary: `Cobrança "${editor.description.trim()}" marcada como paga.`,
          visibility: "ambos",
          source_table: "charges",
          source_id: chargeId,
        });
        if (timelineError) sideEffectWarnings.push("Evento de timeline não registrado.");
      } catch {
        sideEffectWarnings.push("Evento de timeline não registrado.");
      }

      try {
        const headers = await getSupabaseFunctionAuthHeaders();
        const { error: billingError } = await supabase.functions.invoke("process-billing-rules", {
          body: {
            triggered_by: "manual",
            single_charge_id: chargeId,
            force_template_type: "agradecimento",
          },
          headers,
        });
        if (billingError)
          sideEffectWarnings.push("Confirmação de pagamento não enviada ao cliente.");
      } catch {
        sideEffectWarnings.push("Confirmação de pagamento não enviada ao cliente.");
      }
    }

    if (sideEffectWarnings.length > 0) {
      toast.warning("Cobrança atualizada com pendências.", {
        description: sideEffectWarnings.join(" "),
        duration: 8000,
      });
    } else {
      toast.success("Cobrança atualizada.");
    }
    await onReload();
    stopEditing();
    setSavingChargeId(null);
  };

  const handleRemoveCharge = async () => {
    if (!deleteChargeId || removingChargeId) return;
    if (!isSuperAdmin) {
      toast.error("Somente o super admin pode remover cobranças.");
      setDeleteChargeId(null);
      return;
    }

    setRemovingChargeId(deleteChargeId);

    const { error } = await supabase.from("charges").delete().eq("id", deleteChargeId);

    if (error) {
      toast.error("Não foi possível remover a cobrança.", {
        description: error.message,
      });
      setRemovingChargeId(null);
      return;
    }

    toast.success("Cobrança removida.");
    setDeleteChargeId(null);
    setRemovingChargeId(null);
    await onReload();
  };

  // Export da lista de cobrancas exibidas (respeita periodo + filtros de status
  // e busca), nao apenas a pagina visivel.
  const chargeExportColumns: ExportColumn[] = [
    { key: "due_date", label: "Vencimento" },
    { key: "client", label: "Cliente" },
    { key: "description", label: "Descrição" },
    { key: "amount", label: "Valor", align: "right" },
    { key: "status", label: "Status" },
    { key: "paid_at", label: "Pago em" },
  ];
  const chargeExportRows = filteredCharges.map((c) => {
    const client = clientsMap[c.client_id];
    return {
      due_date: formatPortalDate(c.due_date),
      client: client ? (getClientDisplayName(client) ?? "-") : "-",
      description: c.description,
      amount: formatBRL(Number(c.amount)),
      status: CHARGE_STATUS_META[c.status]?.label ?? c.status,
      paid_at: c.paid_at ? formatPortalDate(c.paid_at) : "-",
    };
  });
  const handleChargeExportCSV = () =>
    exportCSV({
      title: "Cobrancas",
      filename: "cobrancas",
      columns: chargeExportColumns,
      rows: chargeExportRows,
    });
  const handleChargeExportPDF = () =>
    exportPDF({
      title: "Relatorio de Cobrancas",
      subtitle: `${filteredCharges.length} lancamento(s) | Total: ${formatBRL(filteredTotal)} | Recebido: ${formatBRL(filteredPaid)}`,
      filename: "cobrancas",
      columns: chargeExportColumns,
      rows: chargeExportRows,
    });

  if (loading) return <PortalLoading />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Receitas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {periodPreset === "custom"
              ? monthFilter === "all"
                ? "Todos os meses"
                : formatRevenueMonthLabel(monthFilter)
              : (PERIOD_PRESETS.find((p) => p.value === periodPreset)?.label ?? "Mês atual")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu onExportCSV={handleChargeExportCSV} onExportPDF={handleChargeExportPDF} />
          <Link to="/portal/admin/projetos" className={buttonVariants({ variant: "outline" })}>
            Ver projetos
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        <MetricTile
          label="Total da competencia"
          value={formatBRL(filteredTotal)}
          icon={Clock}
          tone="warning"
        />
        <MetricTile
          label="Lancamentos"
          value={filteredCharges.length.toString()}
          icon={FileText}
          tone="accent"
        />
        <MetricTile
          label="Recebido"
          value={formatBRL(filteredPaid)}
          icon={Receipt}
          tone="success"
        />
      </div>

      <div
        className="flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Preset de período"
      >
        {PERIOD_PRESETS.map((preset) => {
          const isActive = periodPreset === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={preset.hint}
              onClick={() => setPeriodPreset(preset.value)}
              className={cn(
                "min-h-[36px] rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-background text-muted-foreground hover:border-primary/50 hover:text-primary"
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="revenue_search"
            name="revenue_search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cobrança ou cliente..."
            className="pl-9"
            aria-label="Buscar cobrança ou cliente"
          />
        </div>
        {periodPreset === "custom" ? (
          <select
            id="month_filter"
            name="month_filter"
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
            className="flex h-10 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-48"
            aria-label="Filtrar por mes"
          >
            <option value="all">Todos os meses</option>
            {monthOptions.map((monthKey) => (
              <option key={monthKey} value={monthKey}>
                {formatRevenueMonthLabel(monthKey)}
              </option>
            ))}
          </select>
        ) : null}
        <select
          id="status_filter"
          name="status_filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="flex h-10 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-48"
          aria-label="Filtrar por status"
        >
          <option value="all">Todos os status</option>
          {CHARGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CHARGE_STATUS_META[s].label}
            </option>
          ))}
        </select>
      </div>

      {pageError ? (
        <AdminEmptyState
          icon={Clock}
          title="Não foi possível carregar as cobranças"
          description={`${pageError} Atualize a pagina ou tente novamente em instantes.`}
          action={
            <Button type="button" onClick={() => void onReload()}>
              Tentar novamente
            </Button>
          }
        />
      ) : filteredCharges.length === 0 ? (
        <AdminEmptyState
          icon={Clock}
          title="Nenhuma cobrança encontrada"
          description="Ajuste os filtros ou registre uma nova cobrança para alimentar o controle financeiro."
        />
      ) : (
        <div className="space-y-4">
          {visibleCharges.map((charge) => {
            const isEditing = editingChargeId === charge.id && editor;
            const client = clientsMap[charge.client_id];
            // meta agora vive dentro do InlineStatusSelect via CHARGE_STATUS_OPTIONS.
            // CHARGE_STATUS_META segue usado em outras tabs/exports do arquivo.

            return (
              <article
                key={charge.id}
                className="rounded-xl border border-border/50 bg-background/60 px-4 py-3 transition-all hover:border-primary/25 hover:bg-card sm:px-5 sm:py-4"
              >
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field className="md:col-span-2">
                        <Label htmlFor="charge_description">Descrição</Label>
                        <Input
                          id="charge_description"
                          name="charge_description"
                          value={editor.description}
                          onChange={(event) =>
                            setEditor((current) =>
                              current ? { ...current, description: event.target.value } : current
                            )
                          }
                        />
                      </Field>

                      <Field>
                        <Label htmlFor="charge_due_date">Vencimento</Label>
                        <Input
                          id="charge_due_date"
                          name="charge_due_date"
                          value={editor.due_date}
                          onChange={(event) =>
                            setEditor((current) =>
                              current
                                ? { ...current, due_date: maskDate(event.target.value) }
                                : current
                            )
                          }
                          inputMode="numeric"
                          placeholder="DD/MM/AAAA"
                        />
                      </Field>

                      <Field>
                        <Label htmlFor="charge_amount">Valor</Label>
                        <Input
                          id="charge_amount"
                          name="charge_amount"
                          value={editor.amount}
                          onChange={(event) =>
                            setEditor((current) =>
                              current
                                ? { ...current, amount: maskCurrency(event.target.value) }
                                : current
                            )
                          }
                          placeholder="R$ 0,00"
                        />
                      </Field>

                      <Field>
                        <Label htmlFor="charge_status">Status</Label>
                        <select
                          id="charge_status"
                          name="charge_status"
                          value={editor.status}
                          onChange={(event) =>
                            setEditor((current) =>
                              current ? { ...current, status: event.target.value } : current
                            )
                          }
                          className="flex h-10 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {CHARGE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {CHARGE_STATUS_META[status].label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    {editorError ? <AlertBanner tone="destructive" title={editorError} /> : null}

                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={stopEditing}>
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void handleSaveCharge(charge.id)}
                        loading={savingChargeId === charge.id}
                        loadingText="Salvando..."
                      >
                        Salvar alterações
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.6fr)_160px_150px_150px_120px_auto] lg:items-center">
                    {/* Description + actions (mobile: same row) */}
                    <div className="flex items-start justify-between gap-2 lg:contents">
                      <div className="min-w-0">
                        <p
                          className="truncate text-sm font-semibold text-foreground sm:text-base"
                          title={charge.description}
                        >
                          {charge.description}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground sm:mt-1 sm:text-sm">
                          {client ? getClientDisplayName(client) : "Cliente não encontrado"}
                        </p>
                      </div>

                      {/* Mobile actions */}
                      <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
                        {charge.status !== "pago" && charge.status !== "cancelado" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            size="sm"
                            onClick={() => setConfirmingPayCharge(charge)}
                            loading={quickPayingId === charge.id}
                            loadingText="..."
                            className="h-8 border-success/40 px-2 text-xs text-success hover:bg-success/10 hover:text-success"
                            title="Marcar cobrança como paga"
                            aria-label={`Marcar "${charge.description}" como paga`}
                          >
                            <CheckCircle size={14} /> Pago
                          </Button>
                        ) : null}
                        <RowActionMenu
                          actions={[
                            { label: "Editar", onClick: () => startEditing(charge) },
                            ...(isSuperAdmin
                              ? [
                                  {
                                    label: "Remover",
                                    onClick: () => setDeleteChargeId(charge.id),
                                    destructive: true,
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </div>
                    </div>

                    {/* Mobile: compact secondary info */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 lg:hidden">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Venc.{" "}
                        </span>
                        <span className="text-xs font-medium text-foreground">
                          {formatPortalDate(charge.due_date)}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-success">
                        {formatBRL(Number(charge.amount))}
                      </span>
                      <InlineStatusSelect
                        value={charge.status}
                        options={CHARGE_STATUS_OPTIONS}
                        loading={quickStatusChargeId === charge.id || quickPayingId === charge.id}
                        onSelect={(next) => handleQuickChangeStatus(charge, next)}
                      />
                      <span className="text-xs text-muted-foreground">
                        {charge.is_historical ? "Histórico" : "Operacional"}
                      </span>
                    </div>

                    {/* Desktop columns */}
                    <div className="hidden lg:block">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Vencimento
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {formatPortalDate(charge.due_date)}
                      </p>
                    </div>

                    <div className="hidden lg:block">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Valor
                      </p>
                      <p className="mt-2 text-base font-semibold text-success">
                        {formatBRL(Number(charge.amount))}
                      </p>
                    </div>

                    <div className="hidden lg:block">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Status
                      </p>
                      <div className="mt-2">
                        <InlineStatusSelect
                          value={charge.status}
                          options={CHARGE_STATUS_OPTIONS}
                          loading={quickStatusChargeId === charge.id || quickPayingId === charge.id}
                          onSelect={(next) => handleQuickChangeStatus(charge, next)}
                        />
                      </div>
                    </div>

                    <div className="hidden lg:block">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Tipo
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {charge.is_historical ? "Histórico" : "Operacional"}
                      </p>
                    </div>

                    {/* Desktop actions */}
                    <div className="hidden items-center gap-1.5 lg:flex">
                      {charge.status !== "pago" && charge.status !== "cancelado" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          size="sm"
                          onClick={() => setConfirmingPayCharge(charge)}
                          loading={quickPayingId === charge.id}
                          loadingText="..."
                          className="h-9 border-success/40 px-2.5 text-xs text-success hover:bg-success/10 hover:text-success"
                          title="Marcar cobrança como paga"
                          aria-label={`Marcar "${charge.description}" como paga`}
                        >
                          <CheckCircle size={14} /> Pago
                        </Button>
                      ) : null}
                      <RowActionMenu
                        actions={[
                          { label: "Editar", onClick: () => startEditing(charge) },
                          ...(isSuperAdmin
                            ? [
                                {
                                  label: "Remover",
                                  onClick: () => setDeleteChargeId(charge.id),
                                  destructive: true,
                                },
                              ]
                            : []),
                        ]}
                      />
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {filteredCharges.length > 0 ? (
            <div className="mt-4 grid gap-3 rounded-xl border border-border/60 bg-muted/25 px-4 py-3 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center sm:gap-5">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Total filtrado
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {formatBRL(filteredTotal)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {filteredCharges.length} lançamento{filteredCharges.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recebido
                </span>
                <span className="text-sm font-semibold text-success">
                  {formatBRL(filteredPaid)}
                </span>
                <span className="text-xs text-muted-foreground">{paidPercentage}% do total</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Em aberto
                </span>
                <span className="text-sm font-semibold text-warning">
                  {formatBRL(filteredPending)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {Math.max(0, 100 - paidPercentage)}% do total
                </span>
              </div>
              <div className="hidden h-2 w-full overflow-hidden rounded-full bg-muted sm:block sm:w-32">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${paidPercentage}%` }}
                  aria-label={`${paidPercentage}% do total recebido`}
                />
              </div>
            </div>
          ) : null}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Pagina {page + 1} de {totalPages} · {filteredCharges.length} resultado(s)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Proxima
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <AlertDialog
        open={Boolean(confirmingPayCharge)}
        title="Marcar cobrança como paga?"
        description={
          confirmingPayCharge
            ? `Confirmo o recebimento de ${formatBRL(
                Number(confirmingPayCharge.amount)
              )} referente a "${confirmingPayCharge.description}". A data de pagamento sera registrada como hoje${
                confirmingPayCharge.installment_id
                  ? " e a parcela vinculada do projeto sera atualizada"
                  : ""
              }.`
            : ""
        }
        confirmLabel="Confirmar pagamento"
        cancelLabel="Cancelar"
        loading={Boolean(quickPayingId)}
        loadingLabel="Marcando..."
        onCancel={() => {
          if (quickPayingId) return;
          setConfirmingPayCharge(null);
        }}
        onConfirm={() => {
          if (!confirmingPayCharge) return;
          const charge = confirmingPayCharge;
          setConfirmingPayCharge(null);
          void handleQuickMarkPaid(charge);
        }}
      />

      <AlertDialog
        open={isSuperAdmin && Boolean(deleteChargeId)}
        title="Remover cobrança"
        description="Essa acao remove a cobrança selecionada. Você podera cadastrar novamente depois, se precisar."
        confirmLabel="Remover cobrança"
        cancelLabel="Cancelar"
        destructive
        loading={Boolean(removingChargeId)}
        loadingLabel="Removendo..."
        onCancel={() => {
          if (removingChargeId) return;
          setDeleteChargeId(null);
        }}
        onConfirm={() => void handleRemoveCharge()}
      />

      {/* Confirmacao para rollback de cobranca paga — o e-mail de
          agradecimento ja foi enviado ao cliente e nao pode ser desfeito.
          Forcamos o admin a confirmar conscientemente. */}
      <AlertDialog
        open={Boolean(pendingPaidRollback)}
        title="Reverter pagamento confirmado?"
        description={
          pendingPaidRollback
            ? `Esta cobrança ("${pendingPaidRollback.charge.description}") já estava marcada como paga. O cliente recebeu a confirmação de pagamento por e-mail/WhatsApp — não conseguimos desfazer esse envio. Tem certeza que quer alterar o status para "${CHARGE_STATUS_META[pendingPaidRollback.newStatus]?.label ?? pendingPaidRollback.newStatus}"?`
            : ""
        }
        confirmLabel="Sim, alterar mesmo assim"
        cancelLabel="Cancelar"
        destructive
        onCancel={() => setPendingPaidRollback(null)}
        onConfirm={() => {
          if (!pendingPaidRollback) return;
          const { charge, newStatus } = pendingPaidRollback;
          setPendingPaidRollback(null);
          void performQuickChangeStatus(charge, newStatus);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Analise tab — detailed financial intelligence                     */
/* ------------------------------------------------------------------ */

type AnaliseClient = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  "id" | "is_active" | "client_since"
>;
type AnaliseProject = Pick<
  Database["public"]["Tables"]["projects"]["Row"],
  | "id"
  | "client_id"
  | "status"
  | "started_at"
  | "delivered_at"
  | "expected_delivery_date"
  | "current_stage"
>;
type AnaliseCharge = Pick<
  Database["public"]["Tables"]["charges"]["Row"],
  | "id"
  | "client_id"
  | "amount"
  | "due_date"
  | "origin_type"
  | "paid_at"
  | "status"
  | "is_historical"
  | "subscription_id"
>;
type AnaliseSubscription = Pick<
  Database["public"]["Tables"]["project_subscriptions"]["Row"],
  | "id"
  | "client_id"
  | "project_id"
  | "amount"
  | "status"
  | "starts_on"
  | "due_day"
  | "ends_on"
  | "is_blocking"
  | "label"
>;
type AnaliseExpense = Pick<
  Database["public"]["Tables"]["expenses"]["Row"],
  "id" | "amount" | "expense_date"
>;
type AnaliseContract = Pick<
  Database["public"]["Tables"]["project_contracts"]["Row"],
  "id" | "project_id" | "total_amount" | "status" | "ends_at"
>;
type AnaliseTicket = Pick<
  Database["public"]["Tables"]["support_tickets"]["Row"],
  "id" | "status" | "created_at"
>;

type AgingBucket = { range: string; amount: number; count: number };
type ProjectBucket = "negociacao" | "em_andamento" | "concluido" | "pausado";
type MonthlyPoint = {
  key: string;
  label: string;
  cashIn: number;
  cashOut: number;
  net: number;
  recurringRevenue: number;
  projectRevenue: number;
};

interface AnaliseState {
  loaded: boolean;
  currentMrr: number;
  currentProjectRevenue: number;
  forecastRevenue: number;
  pendingReceivables: number;
  overdueReceivables: number;
  cashBalance: number;
  currentMonthNet: number;
  burnRate: number;
  /** Meses que o caixa atual sustenta no ritmo de burn. null = burn ≤ 0. */
  runwayMonths: number | null;
  operationalMargin: number | null;
  agingBuckets: AgingBucket[];
  activeClients: number;
  newClientsThisMonth: number;
  recurringClients: number;
  recurringRate: number;
  clientsAtRisk: number;
  healthyRecurringClients: number;
  nonRecurringClients: number;
  overdueClients: number;
  averageRecurringRevenuePerClient: number;
  openProjects: number;
  overdueProjects: number;
  completedThisMonth: number;
  avgDeliveryDays: number | null;
  projectStatusCounts: Record<ProjectBucket, number>;
  pipelineValue: number;
  pipelineCount: number;
  openTickets: number;
  resolvedTicketsThisMonth: number;
  monthlySeries: MonthlyPoint[];
}

const CHART_COLORS = {
  brand: "hsl(var(--elk-primary))",
  accent: "hsl(var(--elk-accent))",
  success: "hsl(var(--elk-success))",
  destructive: "hsl(var(--elk-destructive))",
  warning: "hsl(var(--elk-warning))",
  grid: "hsl(var(--elk-border))",
  muted: "hsl(var(--elk-muted-foreground))",
};

function formatCompactCurrency(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const S = "\u00A0";
  if (abs >= 1_000_000) {
    const c = abs >= 10_000_000 ? (abs / 1_000_000).toFixed(0) : (abs / 1_000_000).toFixed(1);
    return `${sign}R$${S}${c.replace(".0", "")}M`;
  }
  if (abs >= 1_000) {
    const c = abs >= 10_000 ? (abs / 1_000).toFixed(0) : (abs / 1_000).toFixed(1);
    return `${sign}R$${S}${c.replace(".0", "")}k`;
  }
  return `${sign}R$${S}${Math.round(abs)}`;
}

function getSignedCurrency(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatBRL(Math.abs(value))}`;
}

function parseDateValue(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function createMonthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function getMonthKeyFromDate(value?: string | null) {
  const parsed = parseDateValue(value);
  if (!parsed) return null;
  return createMonthKey(parsed.getFullYear(), parsed.getMonth());
}

/* SurfaceStat now imported from @/components/portal/shared/SurfaceStat */

type TooltipPayloadItem = {
  color?: string;
  dataKey?: string;
  name?: string;
  value?: number | string;
};

function AnaliseTooltip({
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
        {payload.map((item) => (
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
                Number(item.value ?? 0) < 0 ? "text-destructive" : "text-foreground"
              )}
            >
              {formatter(Number(item.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevenueBreakdownChart({ data }: { data: MonthlyPoint[] }) {
  const hasValue = data.some((p) => p.recurringRevenue > 0 || p.projectRevenue > 0);
  if (!hasValue) return null;

  return (
    <div className="h-[180px] sm:h-[220px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart
          data={data}
          margin={{ top: 12, right: 4, left: -8, bottom: 0 }}
          barGap={2}
          barSize={16}
        >
          <defs>
            <linearGradient id="rev-recurring" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.success} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="rev-project" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.brand} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.brand} stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeOpacity={0.15} />
          <XAxis
            dataKey="label"
            tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={62}
            tickFormatter={(v) => formatCompactCurrency(Number(v))}
            tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<AnaliseTooltip />} />
          <Bar
            dataKey="recurringRevenue"
            name="Recorrente"
            stackId="rev"
            fill="url(#rev-recurring)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="projectRevenue"
            name="Projetos"
            stackId="rev"
            fill="url(#rev-project)"
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ClientDistributionChart({
  healthyRecurring,
  nonRecurring,
  overdue,
}: {
  healthyRecurring: number;
  nonRecurring: number;
  overdue: number;
}) {
  const data = [
    {
      name: "Com recorrencia",
      value: healthyRecurring,
      color: CHART_COLORS.success,
      gradId: "fcd-success",
    },
    {
      name: "Sem recorrencia",
      value: nonRecurring,
      color: CHART_COLORS.brand,
      gradId: "fcd-brand",
    },
    { name: "Em atraso", value: overdue, color: CHART_COLORS.destructive, gradId: "fcd-destr" },
  ];
  const total = healthyRecurring + nonRecurring + overdue;
  if (total === 0) return null;

  return (
    <div className="h-[160px] sm:h-[180px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} margin={{ top: 12, right: 4, left: -4, bottom: 0 }} barSize={32}>
          <defs>
            <linearGradient id="fcd-success" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.success} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="fcd-brand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.brand} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.brand} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="fcd-destr" x1="0" y1="0" x2="0" y2="1">
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
          <Tooltip content={<AnaliseTooltip formatter={(v) => `${v} cliente(s)`} />} />
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

function ProjectStatusChart({ counts }: { counts: Record<ProjectBucket, number> }) {
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  const data = [
    {
      name: "Em desenvolvimento",
      value: counts.em_andamento,
      color: CHART_COLORS.accent,
      gradId: "fps-accent",
    },
    {
      name: "Concluído",
      value: counts.concluido,
      color: CHART_COLORS.success,
      gradId: "fps-success",
    },
    { name: "Pausado", value: counts.pausado, color: CHART_COLORS.warning, gradId: "fps-warning" },
    {
      name: "Negociacao",
      value: counts.negociacao,
      color: CHART_COLORS.brand,
      gradId: "fps-brand",
    },
  ];

  return (
    <div className="h-[160px] sm:h-[180px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} margin={{ top: 12, right: 4, left: -4, bottom: 0 }} barSize={32}>
          <defs>
            <linearGradient id="fps-accent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="fps-success" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.success} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="fps-warning" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.warning} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.warning} stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="fps-brand" x1="0" y1="0" x2="0" y2="1">
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
          <Tooltip content={<AnaliseTooltip formatter={(v) => `${v} projeto(s)`} />} />
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

function FinanceAnaliseTab() {
  const [state, setState] = useState<AnaliseState | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalise = useCallback(async () => {
    setLoading(true);

    const [
      clientsRes,
      projectsRes,
      chargesRes,
      subsRes,
      expensesRes,
      contractsRes,
      ticketsRes,
      proposalsRes,
      leadsRes,
    ] = await Promise.all([
      supabase.from("clients").select("id, is_active, client_since"),
      supabase
        .from("projects")
        .select(
          "id, client_id, status, started_at, delivered_at, expected_delivery_date, current_stage"
        ),
      supabase
        .from("charges")
        .select(
          "id, client_id, amount, due_date, origin_type, paid_at, status, is_historical, subscription_id"
        ),
      supabase
        .from("project_subscriptions")
        .select(
          "id, client_id, project_id, amount, status, starts_on, due_day, ends_on, is_blocking, label"
        ),
      supabase.from("expenses").select("id, amount, expense_date"),
      supabase
        .from("project_contracts")
        .select("id, project_id, total_amount, status, ends_at")
        .order("created_at", { ascending: false }),
      supabase.from("support_tickets").select("id, status, created_at"),
      supabase
        .from("proposals")
        .select("id, lead_id, total_amount, status")
        .in("status", ["enviada", "aprovada"]),
      supabase.from("leads").select("id, status, estimated_value").eq("status", "proposta"),
    ]);

    const err =
      clientsRes.error ??
      projectsRes.error ??
      chargesRes.error ??
      subsRes.error ??
      expensesRes.error ??
      contractsRes.error ??
      ticketsRes.error ??
      proposalsRes.error ??
      leadsRes.error;
    if (err) {
      setLoading(false);
      return;
    }

    const clients = (clientsRes.data as AnaliseClient[] | null) ?? [];
    const projects = (projectsRes.data as AnaliseProject[] | null) ?? [];
    const charges = (chargesRes.data as AnaliseCharge[] | null) ?? [];
    const subs = (subsRes.data as AnaliseSubscription[] | null) ?? [];
    const expenses = (expensesRes.data as AnaliseExpense[] | null) ?? [];
    const contracts = (contractsRes.data as AnaliseContract[] | null) ?? [];
    const tickets = (ticketsRes.data as AnaliseTicket[] | null) ?? [];

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStr = getLocalDateIso(now);
    const curKey = createMonthKey(now.getFullYear(), now.getMonth());

    // Auditoria 2026-04-15: REMOVIDO auto-sync de charges em load.
    // Sincronizacao agora e exclusivamente manual via botao "Sincronizar
    // mensalidades" (handleManualSync abaixo). Abrir a tela e operacao
    // 100% READ ONLY — sem mutacoes silenciosas no banco.

    // Monthly series (12 months)
    const monthFrames = Array.from({ length: 12 }, (_, rawIndex) => {
      const ri = 12 - rawIndex - 1;
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - ri);
      const ml = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(d).replace(".", "");
      const sy = String(d.getFullYear()).slice(-2);
      return { key: createMonthKey(d.getFullYear(), d.getMonth()), label: `${ml}/${sy}` };
    });

    const monthlyMap = new Map<string, MonthlyPoint>(
      monthFrames.map((m) => [
        m.key,
        {
          key: m.key,
          label: m.label,
          cashIn: 0,
          cashOut: 0,
          net: 0,
          recurringRevenue: 0,
          projectRevenue: 0,
        },
      ])
    );

    // Accumulate in centavos (integers) to avoid floating-point errors.
    // cashIn usa paid_at (fluxo de caixa = regime de caixa).
    // projectRevenue usa due_date (receita = regime de competencia).
    charges
      .filter((c) => c.status === "pago" && !c.is_historical)
      .forEach((c) => {
        const cashKey = getMonthKeyFromDate(c.paid_at ?? c.due_date);
        if (cashKey) {
          const cashPoint = monthlyMap.get(cashKey);
          if (cashPoint) cashPoint.cashIn += toCents(c.amount);
        }
        if (c.origin_type === "parcela_projeto") {
          const compKey = getMonthKeyFromDate(c.due_date);
          if (compKey) {
            const compPoint = monthlyMap.get(compKey);
            if (compPoint) compPoint.projectRevenue += toCents(c.amount);
          }
        }
      });

    // Receita recorrente = metrica de COMPETENCIA. Bucket por due_date
    // sempre (nunca paid_at). Usar paid_at fazia mensalidades antigas
    // pagas no mes corrente inflarem o MRR e zerarem os meses passados.
    charges
      .filter(
        (c) => c.origin_type === "mensalidade" && c.status !== "cancelado" && !c.is_historical
      )
      .forEach((c) => {
        const isPaid = c.status === "pago";
        const mk = getMonthKeyFromDate(c.due_date);
        if (!mk) return;
        const p = monthlyMap.get(mk);
        if (!p) return;
        // For past months, only count paid; for current/future, count all non-cancelled
        if (mk < curKey && !isPaid) return;
        p.recurringRevenue += toCents(c.amount);
      });

    expenses.forEach((e) => {
      const mk = getMonthKeyFromDate(e.expense_date);
      if (!mk) return;
      const p = monthlyMap.get(mk);
      if (!p) return;
      p.cashOut += toCents(e.amount);
    });

    // Auditoria 2026-04-15: removido fallback contratual silencioso.
    // MRR historico = SOMENTE realizado. Meses sem charges pagas mostrarao
    // zero — informacao verdadeira em vez de inferencia teorica que
    // mascarava churn e inflava o historico.
    const recurringSubscriptions = subs.filter((s) => ["agendada", "ativa"].includes(s.status));
    const recurringBaseCents = recurringSubscriptions.reduce(
      (sum, s) => sum + toCents(s.amount),
      0
    );

    // Convert centavos back to reais for the public series
    const recurringBase = recurringBaseCents / 100;
    const monthlySeries = monthFrames.map((f) => {
      const p = monthlyMap.get(f.key)!;
      return {
        ...p,
        cashIn: p.cashIn / 100,
        cashOut: p.cashOut / 100,
        recurringRevenue: p.recurringRevenue / 100,
        projectRevenue: p.projectRevenue / 100,
        net: (p.cashIn - p.cashOut) / 100,
      };
    });

    const activeClients = clients.filter((c) => c.is_active);
    const activeClientIds = new Set(activeClients.map((c) => c.id));

    const recurringClientIds = new Set(
      recurringSubscriptions.filter((s) => activeClientIds.has(s.client_id)).map((s) => s.client_id)
    );

    const overdueClientIds = new Set(
      charges
        .filter(
          (c) => activeClientIds.has(c.client_id) && c.status === "atrasado" && !c.is_historical
        )
        .map((c) => c.client_id)
    );

    const clientsWithoutRecurring = new Set(
      activeClients.filter((c) => !recurringClientIds.has(c.id)).map((c) => c.id)
    );

    const healthyRecurringClients = Array.from(recurringClientIds).filter(
      (id) => !overdueClientIds.has(id)
    ).length;
    const nonRecurringClients = Array.from(clientsWithoutRecurring).filter(
      (id) => !overdueClientIds.has(id)
    ).length;
    const clientsAtRisk = new Set([
      ...Array.from(overdueClientIds),
      ...Array.from(clientsWithoutRecurring),
    ]).size;

    // Aging — fonte unica em src/lib/finance-metrics.ts (testada).
    const agingBuckets = computeAgingBuckets(charges, now, todayStr);

    // Projects
    const projectStatusCounts: Record<ProjectBucket, number> = {
      negociacao: 0,
      em_andamento: 0,
      concluido: 0,
      pausado: 0,
    };
    projects.forEach((p) => {
      if (p.status === "cancelado") return;
      // Usar status real do projeto (não o bucket operacional) para o gráfico
      const bucket = p.status as ProjectBucket;
      if (bucket in projectStatusCounts) projectStatusCounts[bucket] += 1;
    });

    // Atrasado — fonte unica em src/lib/finance-metrics.ts (testada).
    const overdueProjects = projects.filter((p) => isProjectOverdue(p, todayStr)).length;

    const completedThisMonth = projects.filter((p) => {
      if (p.status !== "concluido") return false;
      const d = parseDateValue(p.delivered_at);
      return d && d >= startOfMonth;
    }).length;

    const durations = projects
      .filter((p) => p.status === "concluido" && p.started_at && p.delivered_at)
      .map((p) => {
        const s = parseDateValue(p.started_at)!;
        const e = parseDateValue(p.delivered_at)!;
        return (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
      })
      .filter((d) => d > 0);
    const avgDeliveryDays =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    // Pipeline — fonte unica em src/lib/finance-metrics.ts (testada).
    type ProposalPipeline = {
      id: string;
      lead_id: string | null;
      total_amount: number;
      status: string;
    };
    type LeadPipeline = { id: string; status: string; estimated_value: number };
    const allProposals = (proposalsRes.data ?? []) as ProposalPipeline[];
    const leadsPipeline = (leadsRes.data ?? []) as LeadPipeline[];
    const pipelineSummary = computePipelineSummary(
      allProposals,
      leadsPipeline,
      contracts.map((c) => ({
        id: c.id,
        project_id: c.project_id,
        total_amount: c.total_amount,
        status: c.status,
      })),
      projects.map((p) => ({ id: p.id, status: p.status }))
    );
    const pipelineValue = pipelineSummary.value;

    // Burn rate via lib central (mesmo numero do Overview).
    const burnRate = computeBurnRate(monthlySeries, BURN_RATE_WINDOW_MONTHS);

    // Cash, receivables, margin
    const cashBalance =
      (charges
        .filter((c) => c.status === "pago" && !c.is_historical)
        .reduce((s, c) => s + toCents(c.amount), 0) -
        expenses.reduce((s, e) => s + toCents(e.amount), 0)) /
      100;
    // "A receber" = pendente (due already) + agendada com vencimento este mês
    const currentMonthEndStr = getLocalDateIso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const pendingReceivables =
      charges
        .filter(
          (c) =>
            !c.is_historical &&
            (c.status === "pendente" ||
              (c.status === "agendada" && c.due_date <= currentMonthEndStr))
        )
        .reduce((s, c) => s + toCents(c.amount), 0) / 100;
    const overdueReceivables =
      charges
        .filter((c) => c.status === "atrasado" && !c.is_historical)
        .reduce((s, c) => s + toCents(c.amount), 0) / 100;
    // Forecast — fonte unica em src/lib/finance-metrics.ts (testada).
    const forecastRevenue = computeForecastRevenue(
      charges.map((c) => ({
        status: c.status,
        is_historical: c.is_historical,
        due_date: c.due_date,
        amount: c.amount,
      })),
      contracts.map((c) => ({
        id: c.id,
        project_id: c.project_id,
        total_amount: c.total_amount,
        status: c.status,
      })),
      todayStr
    );

    const curMonth = monthlySeries[monthlySeries.length - 1];
    const currentMonthNet = curMonth?.net ?? 0;
    const currentMrr = curMonth?.recurringRevenue ?? 0;
    const currentProjectRevenue = curMonth?.projectRevenue ?? 0;
    // Margem operacional por COMPETENCIA: receita reconhecida do mes
    // (recorrente + projeto por due_date) menos despesas do mes (caixa).
    // Lib central garante uma definicao unica em todo o app — Overview e
    // Finance produzem o mesmo numero para a mesma metrica.
    const currentMonthRevenue = currentMrr + currentProjectRevenue;
    const operationalMargin = computeOperationalMargin(currentMonthRevenue, curMonth?.cashOut ?? 0);
    const runwayMonths = computeRunway(cashBalance, burnRate);

    const newClientsThisMonth = clients.filter((c) => {
      const since = parseDateValue(c.client_since);
      return since && since >= startOfMonth && c.is_active;
    }).length;

    const openTickets = tickets.filter((t) => isTicketOpen(t.status)).length;
    const resolvedTicketsThisMonth = tickets.filter((t) => {
      if (t.status !== "resolvido" && t.status !== "fechado") return false;
      const d = parseDateValue(t.created_at);
      return d && d >= startOfMonth;
    }).length;

    setState({
      loaded: true,
      currentMrr,
      currentProjectRevenue,
      forecastRevenue,
      pendingReceivables,
      overdueReceivables,
      cashBalance,
      currentMonthNet,
      burnRate,
      runwayMonths,
      operationalMargin,
      agingBuckets,
      activeClients: activeClients.length,
      newClientsThisMonth,
      recurringClients: recurringClientIds.size,
      recurringRate:
        activeClients.length > 0
          ? Math.round((recurringClientIds.size / activeClients.length) * 100)
          : 0,
      clientsAtRisk,
      healthyRecurringClients,
      nonRecurringClients,
      overdueClients: overdueClientIds.size,
      averageRecurringRevenuePerClient:
        recurringClientIds.size > 0 ? recurringBase / recurringClientIds.size : 0,
      openProjects: projects.filter(isProjectOperationallyOpen).length,
      overdueProjects,
      completedThisMonth,
      avgDeliveryDays,
      projectStatusCounts,
      pipelineValue,
      pipelineCount: pipelineSummary.count,
      openTickets,
      resolvedTicketsThisMonth,
      monthlySeries,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAnalise();
  }, [loadAnalise]);

  const [syncing, setSyncing] = useState(false);
  const handleManualSync = useCallback(async () => {
    setSyncing(true);
    try {
      const [chargesRes, subsRes, contractsRes] = await Promise.all([
        supabase.from("charges").select("id, subscription_id, due_date, status, is_historical"),
        supabase
          .from("project_subscriptions")
          .select(
            "id, client_id, project_id, amount, status, starts_on, due_day, ends_on, is_blocking, label"
          ),
        supabase
          .from("project_contracts")
          .select("id, project_id, ends_at")
          .order("created_at", { ascending: false }),
      ]);
      if (chargesRes.error || subsRes.error || contractsRes.error) {
        toast.error("Falha ao carregar dados para sincronizacao");
        return;
      }
      const result = await syncSubscriptionCharges(supabase, {
        subscriptions: subsRes.data ?? [],
        contracts: contractsRes.data ?? [],
        existingCharges: chargesRes.data ?? [],
      });
      const parts: string[] = [];
      if (result.inserted > 0) parts.push(`${result.inserted} novas`);
      if (result.scheduledFromPendente > 0)
        parts.push(`${result.scheduledFromPendente} → agendada`);
      if (result.pendenteFromScheduled > 0)
        parts.push(`${result.pendenteFromScheduled} → pendente`);
      toast.success(parts.length > 0 ? `Sync: ${parts.join(", ")}` : "Nada para sincronizar");
      await loadAnalise();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na sincronizacao");
    } finally {
      setSyncing(false);
    }
  }, [loadAnalise]);

  if (loading || !state) return <PortalLoading />;

  return (
    <div className="space-y-6">
      {/* Revenue breakdown */}
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Composicao da receita
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={syncing}
          >
            {syncing ? "Sincronizando..." : "Sincronizar mensalidades"}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <SurfaceStat label="MRR" value={formatBRL(state.currentMrr)} tone="success" />
          <SurfaceStat
            label="Receita de projetos"
            value={
              state.currentProjectRevenue > 0
                ? formatBRL(state.currentProjectRevenue)
                : "Sem receita"
            }
            tone={state.currentProjectRevenue > 0 ? "brand" : "neutral"}
          />
          <SurfaceStat
            label="Receita prevista (agendada)"
            value={
              state.forecastRevenue > 0 ? formatBRL(state.forecastRevenue) : "Sem agendamentos"
            }
            tone="neutral"
          />
          <SurfaceStat
            label="Margem operacional"
            value={
              state.operationalMargin !== null
                ? `${Math.round(state.operationalMargin)}%`
                : "Sem receita no periodo"
            }
            tone={
              state.operationalMargin === null
                ? "neutral"
                : state.operationalMargin >= MARGIN_HEALTHY_PCT
                  ? "success"
                  : state.operationalMargin >= MARGIN_NEUTRAL_PCT
                    ? "warning"
                    : "destructive"
            }
          />
        </div>
        <Card className="mt-4 rounded-2xl border-border/80 bg-card/95">
          <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Receita recorrente vs projetos por mes
            </p>
            <RevenueBreakdownChart data={state.monthlySeries.slice(-6)} />
          </CardContent>
        </Card>
      </section>

      {/* Receivables + Aging */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recebiveis e cobrança
        </h3>
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <SurfaceStat
            label="A receber"
            value={formatBRL(state.pendingReceivables)}
            tone="warning"
          />
          <SurfaceStat
            label="Em atraso"
            value={
              state.overdueReceivables > 0
                ? `${state.overdueClients}x ${formatBRL(state.overdueReceivables)}`
                : formatBRL(0)
            }
            tone={state.overdueReceivables > 0 ? "destructive" : "neutral"}
          />
          <SurfaceStat
            label="Burn rate mensal"
            value={formatBRL(state.burnRate)}
            tone={state.burnRate > 0 ? "warning" : "neutral"}
          />
          <SurfaceStat
            label="Runway"
            value={
              state.runwayMonths === null
                ? "—"
                : state.runwayMonths === 0
                  ? "0 meses"
                  : state.runwayMonths >= 24
                    ? "24+ meses"
                    : `${state.runwayMonths.toFixed(1)} meses`
            }
            tone={
              state.runwayMonths === null
                ? "neutral"
                : state.runwayMonths < RUNWAY_DANGER_MONTHS
                  ? "destructive"
                  : state.runwayMonths < RUNWAY_WARNING_MONTHS
                    ? "warning"
                    : "success"
            }
          />
          <SurfaceStat
            label="Saldo do mes"
            value={getSignedCurrency(state.currentMonthNet)}
            tone={state.currentMonthNet >= 0 ? "success" : "destructive"}
          />
        </div>
        <Card className="mt-4 rounded-2xl border-border/80 bg-card/95">
          <CardContent className="space-y-3 p-3 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Aging de recebiveis
            </p>
            {state.agingBuckets.map((bucket) => (
              <div
                key={bucket.range}
                className="flex items-center justify-between rounded-xl border border-border/75 bg-background/70 p-3"
              >
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{bucket.range}</p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatBRL(bucket.amount)}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    bucket.count > 0
                      ? "bg-warning/10 text-warning"
                      : "bg-muted/50 text-muted-foreground"
                  )}
                >
                  {bucket.count} cobrança(s)
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Clients */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Clientes
        </h3>
        <div className="grid gap-4 xl:grid-cols-12">
          <Card className="rounded-2xl border-border/80 bg-card/95 xl:col-span-5">
            <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Distribuicao
              </p>
              <ClientDistributionChart
                healthyRecurring={state.healthyRecurringClients}
                nonRecurring={state.nonRecurringClients}
                overdue={state.overdueClients}
              />
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 xl:col-span-7 xl:grid-cols-3">
            <SurfaceStat label="Ativos" value={`${state.activeClients}`} tone="brand" />
            <SurfaceStat
              label="Novos no mes"
              value={`${state.newClientsThisMonth}`}
              tone={state.newClientsThisMonth > 0 ? "success" : "neutral"}
            />
            <SurfaceStat
              label="Em risco"
              value={`${state.clientsAtRisk}`}
              tone={state.clientsAtRisk > 0 ? "warning" : "neutral"}
            />
            <SurfaceStat
              label="Taxa de recorrencia"
              value={`${state.recurringRate}%`}
              tone="success"
            />
            <SurfaceStat
              label="Receita media/cliente"
              value={formatBRL(state.averageRecurringRevenuePerClient)}
              tone="neutral"
            />
            <SurfaceStat
              label="Pipeline"
              value={`${formatBRL(state.pipelineValue)} (${state.pipelineCount})`}
              tone="brand"
            />
          </div>
        </div>
      </section>

      {/* Projects */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Projetos
        </h3>
        <div className="grid gap-4 xl:grid-cols-12">
          <Card className="rounded-2xl border-border/80 bg-card/95 xl:col-span-7">
            <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Projetos por status
              </p>
              <ProjectStatusChart counts={state.projectStatusCounts} />
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 xl:col-span-5">
            <SurfaceStat label="Ativos" value={`${state.openProjects}`} tone="brand" />
            <SurfaceStat
              label="Concluídos no mes"
              value={`${state.completedThisMonth}`}
              tone="success"
            />
            <SurfaceStat
              label="Atrasados"
              value={`${state.overdueProjects}`}
              tone={state.overdueProjects > 0 ? "destructive" : "neutral"}
            />
            <SurfaceStat
              label="Entrega media"
              value={state.avgDeliveryDays !== null ? `${state.avgDeliveryDays} dias` : "N/A"}
              tone="neutral"
            />
          </div>
        </div>
      </section>

      {/* Support */}
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Suporte
        </h3>
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <SurfaceStat
            label="Tickets abertos"
            value={`${state.openTickets}`}
            tone={state.openTickets > OPEN_TICKETS_WARNING_THRESHOLD ? "warning" : "neutral"}
          />
          <SurfaceStat
            label="Resolvidos no mes"
            value={`${state.resolvedTicketsThisMonth}`}
            tone="success"
          />
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Finance page                                                 */
/* ------------------------------------------------------------------ */

export default function AdminFinance() {
  const location = useLocation();
  const {
    data: chargesData,
    isLoading: chargesLoading,
    error: chargesError,
    refetch: refetchCharges,
  } = useAdminCharges();
  const { data: clientsData, isLoading: clientsLoading, error: clientsError } = useAdminClients();

  const charges = useMemo(() => (chargesData ?? []) as PortalCharge[], [chargesData]);
  const clientsMap = useMemo(
    () =>
      Object.fromEntries(
        ((clientsData ?? []) as PortalClient[]).map((client) => [client.id, client])
      ),
    [clientsData]
  );
  const loading = chargesLoading || clientsLoading;
  const pageError = chargesError?.message ?? clientsError?.message ?? null;
  const loadFinance = refetchCharges;

  const requestedTab =
    (location.state as { financeTab?: FinanceTab } | null)?.financeTab ?? "receitas";
  const [activeTab, setActiveTab] = useState<FinanceTab>(
    requestedTab === "despesas" ? "despesas" : requestedTab === "analise" ? "analise" : "receitas"
  );

  useEffect(() => {
    const tab = (location.state as { financeTab?: FinanceTab } | null)?.financeTab;
    if (tab === "despesas") setActiveTab("despesas");
    else if (tab === "analise") setActiveTab("analise");
  }, [location.key, location.state]);

  return (
    <div className="space-y-6">
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border/60 bg-card p-1">
        {[
          { key: "receitas" as const, label: "Receitas" },
          { key: "despesas" as const, label: "Despesas" },
          { key: "inadimplencia" as const, label: "Inadimplencia" },
          { key: "receita-clientes" as const, label: "Receita/Cliente" },
          { key: "metas" as const, label: "Metas" },
          { key: "analise" as const, label: "Analise" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "min-h-[40px] min-w-fit whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-all",
              activeTab === tab.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div key={activeTab}>
        {activeTab === "receitas" ? (
          <FinanceRevenueTab
            charges={charges}
            clientsMap={clientsMap}
            loading={loading}
            pageError={pageError}
            onReload={loadFinance}
          />
        ) : activeTab === "despesas" ? (
          <Suspense fallback={<PortalLoading />}>
            <AdminExpenses />
          </Suspense>
        ) : activeTab === "inadimplencia" ? (
          <Suspense fallback={<PortalLoading />}>
            <Delinquency />
          </Suspense>
        ) : activeTab === "receita-clientes" ? (
          <Suspense fallback={<PortalLoading />}>
            <RevenueByClient />
          </Suspense>
        ) : activeTab === "metas" ? (
          <Suspense fallback={<PortalLoading />}>
            <FinanceGoals />
          </Suspense>
        ) : (
          <FinanceAnaliseTab />
        )}
      </div>
    </div>
  );
}
