import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUrlState } from "@/hooks/useUrlState";
import { toast } from "sonner";
import { useAdminProposals } from "@/hooks/useAdminProposals";

import { FileText, Search, Shield, TrendingUp, Wallet } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import MetricTile from "@/components/portal/shared/MetricTile";
import ExportMenu from "@/components/portal/shared/ExportMenu";
import RowActionMenu from "@/components/portal/shared/RowActionMenu";
import ProposalExpiryCountdown from "@/components/portal/proposal/ProposalExpiryCountdown";
import StatusBadge from "@/components/portal/shared/StatusBadge";
import InlineStatusSelect, {
  type InlineStatusOption,
} from "@/components/portal/shared/InlineStatusSelect";
import { AlertDialog, Button, Card, CardContent, Input, cn } from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { computeProposalApprovalRate } from "@/lib/crm-metrics";
import { exportCSV, exportPDF, type ExportColumn } from "@/lib/export";
import { formatBRL, toCents } from "@/lib/masks";
import { formatPortalDate, getClientDisplayName } from "@/lib/portal";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ProposalRow = Database["public"]["Tables"]["proposals"]["Row"];
type ClientRow = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  "id" | "full_name" | "client_type" | "nome_fantasia"
>;
type LeadRow = Pick<Database["public"]["Tables"]["leads"]["Row"], "id" | "name" | "company">;

type ProposalStatus = "rascunho" | "enviada" | "aprovada" | "rejeitada" | "expirada";
type StatusFilter = "all" | ProposalStatus;

const PROPOSAL_STATUS_META: Record<
  ProposalStatus,
  { label: string; tone: "accent" | "success" | "warning" | "destructive" | "secondary" }
> = {
  rascunho: { label: "Rascunho", tone: "secondary" },
  enviada: { label: "Enviada", tone: "accent" },
  aprovada: { label: "Aprovada", tone: "success" },
  rejeitada: { label: "Rejeitada", tone: "destructive" },
  expirada: { label: "Expirada", tone: "warning" },
};

// Pattern hibrido: transicoes seguras (entre rascunho/expirada) sao aplicadas
// inline; transicoes "perigosas" (enviada/aprovada/rejeitada) redirecionam
// pro detalhe da proposta porque exigem fluxo proprio — envio de e-mail,
// approved_at + possivel contrato, ou rejection_reason. Os hints comunicam
// isso ao usuario no dropdown.
const DANGEROUS_PROPOSAL_TRANSITIONS: Record<ProposalStatus, boolean> = {
  rascunho: false,
  enviada: true,
  aprovada: true,
  rejeitada: true,
  expirada: false,
};

const PROPOSAL_STATUS_OPTIONS: InlineStatusOption<ProposalStatus>[] = [
  { value: "rascunho", label: "Rascunho", tone: "secondary" },
  {
    value: "enviada",
    label: "Enviada",
    tone: "accent",
    hint: "Abre detalhe para enviar e-mail",
  },
  {
    value: "aprovada",
    label: "Aprovada",
    tone: "success",
    hint: "Abre detalhe para confirmar",
  },
  {
    value: "rejeitada",
    label: "Rejeitada",
    tone: "destructive",
    hint: "Abre detalhe para registrar motivo",
  },
  { value: "expirada", label: "Expirada", tone: "warning" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "rascunho", label: "Rascunho" },
  { value: "enviada", label: "Enviada" },
  { value: "aprovada", label: "Aprovada" },
  { value: "rejeitada", label: "Rejeitada" },
  { value: "expirada", label: "Expirada" },
];

const PAGE_SIZE = 10;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getDestinationName(
  proposal: ProposalRow,
  clientsMap: Record<string, ClientRow>,
  leadsMap: Record<string, LeadRow>
): string {
  if (proposal.client_id) {
    const client = clientsMap[proposal.client_id];
    return client ? getClientDisplayName(client) : "Cliente removido";
  }
  if (proposal.lead_id) {
    const lead = leadsMap[proposal.lead_id];
    return lead ? (lead.company ? `${lead.name} (${lead.company})` : lead.name) : "Lead removido";
  }
  return "—";
}

/* ------------------------------------------------------------------ */
/*  Row action menu                                                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Column header                                                      */
/* ------------------------------------------------------------------ */

function ColumnHeader() {
  return (
    <div className="hidden md:grid md:grid-cols-[1fr_180px_120px_120px_110px_110px_40px] gap-x-4 px-5 pb-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Cliente / Lead
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Titulo
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Valor
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Status
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Validade
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Criada em
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Proposal row                                                       */
/* ------------------------------------------------------------------ */

function ProposalRow({
  proposal,
  destinationName,
  onDelete,
  onChangeStatus,
  changingStatus,
}: {
  proposal: ProposalRow;
  destinationName: string;
  onDelete: (proposal: ProposalRow) => void;
  onChangeStatus: (proposal: ProposalRow, next: ProposalStatus) => void;
  changingStatus: boolean;
}) {
  const navigate = useNavigate();
  // meta segue util como fallback quando o status veio "fora" do enum esperado.
  const meta =
    PROPOSAL_STATUS_META[(proposal.status as ProposalStatus) ?? "rascunho"] ??
    PROPOSAL_STATUS_META.rascunho;
  const proposalStatus = (proposal.status as ProposalStatus) ?? "rascunho";
  const inSafeEnum = proposalStatus in PROPOSAL_STATUS_META;

  const actions: { label: string; onClick: () => void; destructive?: boolean }[] = [
    {
      label: "Ver detalhes",
      onClick: () => navigate(`/portal/admin/propostas/${proposal.id}`),
    },
    {
      label: "Excluir proposta",
      onClick: () => onDelete(proposal),
      destructive: true,
    },
  ];

  return (
    <div className="group grid grid-cols-1 items-center gap-x-4 gap-y-2 rounded-xl border border-border/50 bg-background/60 px-4 py-3 transition-all hover:border-primary/25 hover:bg-card sm:px-5 sm:py-4 md:grid-cols-[1fr_180px_120px_120px_110px_110px_40px] md:gap-y-3">
      {/* Col 1 — Client/Lead */}
      <div className="flex items-start justify-between gap-2 md:contents">
        <Link to={`/portal/admin/propostas/${proposal.id}`} className="min-w-0">
          <p
            className="truncate text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-[15px]"
            title={destinationName}
          >
            {destinationName}
          </p>
          <p
            className="mt-0.5 truncate text-xs text-muted-foreground md:hidden"
            title={proposal.title}
          >
            {proposal.title}
          </p>
        </Link>

        {/* Mobile actions */}
        <div className="shrink-0 md:hidden">
          <RowActionMenu actions={actions} />
        </div>
      </div>

      {/* Mobile: secondary info */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 md:hidden">
        {inSafeEnum ? (
          <InlineStatusSelect
            value={proposalStatus}
            options={PROPOSAL_STATUS_OPTIONS}
            loading={changingStatus}
            onSelect={(next) => onChangeStatus(proposal, next)}
          />
        ) : (
          <StatusBadge label={meta.label} tone={meta.tone} />
        )}
        <span className="text-xs font-medium text-foreground">
          {formatBRL(proposal.total_amount)}
        </span>
        <ProposalExpiryCountdown
          validUntil={proposal.valid_until}
          status={proposal.status}
          compact
        />
      </div>

      {/* Col 2 — Title (desktop) */}
      <p className="hidden truncate text-sm text-foreground md:block" title={proposal.title}>
        {proposal.title}
      </p>

      {/* Col 3 — Valor (desktop) */}
      <p className="hidden text-sm font-medium text-foreground md:block">
        {formatBRL(proposal.total_amount)}
      </p>

      {/* Col 4 — Status (desktop) */}
      <div className="hidden md:block">
        {inSafeEnum ? (
          <InlineStatusSelect
            value={proposalStatus}
            options={PROPOSAL_STATUS_OPTIONS}
            loading={changingStatus}
            onSelect={(next) => onChangeStatus(proposal, next)}
          />
        ) : (
          <StatusBadge label={meta.label} tone={meta.tone} />
        )}
      </div>

      {/* Col 5 — Validade (desktop) */}
      <div className="hidden md:block">
        <ProposalExpiryCountdown validUntil={proposal.valid_until} status={proposal.status} />
      </div>

      {/* Col 6 — Criada em (desktop) */}
      <p className="hidden text-sm text-muted-foreground md:block">
        {formatPortalDate(proposal.created_at?.slice(0, 10))}
      </p>

      {/* Col 7 — Actions (desktop) */}
      <div className="hidden md:block">
        <RowActionMenu actions={actions} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function Proposals() {
  const {
    data: bundle,
    isLoading: queryLoading,
    error: queryError,
    refetch: refetchData,
  } = useAdminProposals();

  const proposals = useMemo(() => (bundle?.proposals ?? []) as ProposalRow[], [bundle?.proposals]);
  const clientsMap = useMemo(
    () => Object.fromEntries(((bundle?.clients ?? []) as ClientRow[]).map((c) => [c.id, c])),
    [bundle?.clients]
  );
  const leadsMap = useMemo(
    () => Object.fromEntries(((bundle?.leads ?? []) as LeadRow[]).map((l) => [l.id, l])),
    [bundle?.leads]
  );
  const loading = queryLoading;
  const pageError = queryError?.message ?? null;
  const [page, setPage] = useState(0);
  const [search, setSearch] = useUrlState("q", "");
  const [statusFilter, setStatusFilter] = useUrlState<StatusFilter>("status", "all");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [proposalToDelete, setProposalToDelete] = useState<ProposalRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    setPage(0);
  }, [deferredSearch, statusFilter]);

  /* ── Derived data ── */

  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      const name = getDestinationName(p, clientsMap, leadsMap);
      const matchesSearch =
        deferredSearch.length === 0 ||
        name.toLowerCase().includes(deferredSearch) ||
        p.title.toLowerCase().includes(deferredSearch);

      const matchesStatus = statusFilter === "all" || p.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [proposals, clientsMap, leadsMap, deferredSearch, statusFilter]);

  const visibleProposals = filteredProposals.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filteredProposals.length / PAGE_SIZE));

  const metrics = useMemo(() => {
    const total = proposals.length;
    const emNegociacaoValue =
      proposals
        .filter((p) => p.status === "enviada" || p.status === "aprovada")
        .reduce((sum, p) => sum + toCents(p.total_amount), 0) / 100;
    // Taxa de aprovacao — fonte unica testada. Inclui expirada como rejeicao
    // implicita no denominador (auditoria 2026-05-23).
    const taxaAprovacao = computeProposalApprovalRate(proposals);

    return { total, emNegociacaoValue, taxaAprovacao };
  }, [proposals]);

  const exportColumns: ExportColumn[] = [
    { key: "destination", label: "Cliente / Lead" },
    { key: "title", label: "Titulo" },
    { key: "value", label: "Valor", align: "right" },
    { key: "status", label: "Status" },
    { key: "validUntil", label: "Validade" },
    { key: "createdAt", label: "Criada em" },
  ];

  const exportRows = filteredProposals.map((p) => ({
    destination: getDestinationName(p, clientsMap, leadsMap),
    title: p.title,
    value: formatBRL(p.total_amount),
    status: PROPOSAL_STATUS_META[(p.status as ProposalStatus) ?? "rascunho"]?.label ?? p.status,
    validUntil: formatPortalDate(p.valid_until),
    createdAt: formatPortalDate(p.created_at?.slice(0, 10)),
  }));

  const handleExportCSV = () =>
    exportCSV({
      title: "Propostas",
      filename: "propostas",
      columns: exportColumns,
      rows: exportRows,
    });
  const handleExportPDF = () =>
    exportPDF({
      title: "Relatório de Propostas",
      subtitle: `${filteredProposals.length} propostas | Em negociacao: ${formatBRL(metrics.emNegociacaoValue)}`,
      filename: "propostas",
      columns: exportColumns,
      rows: exportRows,
    });

  // Inline-edit de status. Transicoes "perigosas" (enviada/aprovada/rejeitada)
  // navegam pro detalhe pra completar o fluxo proprio com seguranca; as
  // demais (rascunho/expirada) aplicam direto + undo.
  const navigate = useNavigate();
  const [quickProposalStatusId, setQuickProposalStatusId] = useState<string | null>(null);
  const handleQuickChangeProposalStatus = async (
    proposal: ProposalRow,
    newStatus: ProposalStatus
  ) => {
    const currentStatus = (proposal.status as ProposalStatus) ?? "rascunho";
    if (newStatus === currentStatus) return;
    if (DANGEROUS_PROPOSAL_TRANSITIONS[newStatus]) {
      navigate(`/portal/admin/propostas/${proposal.id}`);
      return;
    }
    if (quickProposalStatusId) return;
    setQuickProposalStatusId(proposal.id);

    // Voltando pra rascunho: limpa marcadores de aprovacao/rejeicao
    // pra deixar a proposta "como se fosse nova" do ponto de vista do
    // workflow. expirada e o caminho de cancelamento manual; aprovada/
    // rejeitada nao chegam aqui por causa do gate acima.
    const updates: {
      status: ProposalStatus;
      approved_at?: string | null;
      rejected_at?: string | null;
      rejection_reason?: string | null;
    } = { status: newStatus };
    if (newStatus === "rascunho") {
      updates.approved_at = null;
      updates.rejected_at = null;
      updates.rejection_reason = null;
    }

    const { error } = await supabase.from("proposals").update(updates).eq("id", proposal.id);
    if (error) {
      setQuickProposalStatusId(null);
      toast.error("Erro ao atualizar status.", { description: error.message });
      return;
    }
    setQuickProposalStatusId(null);
    await refetchData();
    toast.success("Status atualizado.", {
      description: `${proposal.title} → ${PROPOSAL_STATUS_META[newStatus].label}`,
      action: {
        label: "Desfazer",
        onClick: async () => {
          const { error: undoError } = await supabase
            .from("proposals")
            .update({ status: currentStatus })
            .eq("id", proposal.id);
          if (undoError) {
            toast.error("Não foi possível desfazer.", { description: undoError.message });
            return;
          }
          await refetchData();
        },
      },
    });
  };

  const handleDeleteProposal = async () => {
    if (!proposalToDelete) return;
    setDeleteLoading(true);

    try {
      const { error } = await supabase.from("proposals").delete().eq("id", proposalToDelete.id);

      if (error) throw error;

      toast.success("Proposta excluída com sucesso.");
      void refetchData();
      setProposalToDelete(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Erro ao excluir proposta: ${message}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ── Render ── */

  const deleteDisplayName = proposalToDelete?.title ?? "";

  if (loading) return <PortalLoading />;

  return (
    <div className="space-y-8">
      <AlertDialog
        open={proposalToDelete !== null}
        title="Excluir proposta"
        description={`Tem certeza que deseja excluir "${deleteDisplayName}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        destructive
        loading={deleteLoading}
        loadingLabel="Excluindo..."
        onConfirm={() => void handleDeleteProposal()}
        onCancel={() => setProposalToDelete(null)}
      />

      {/* ── Action bar ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Propostas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {metrics.total} proposta{metrics.total !== 1 ? "s" : ""} registrada
            {metrics.total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
          <Link to="/portal/admin/propostas/nova">
            <Button type="button">Nova proposta</Button>
          </Link>
        </div>
      </div>

      {/* ── Metrics ── */}
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 xl:grid-cols-3">
        <MetricTile
          label="Total propostas"
          value={metrics.total.toString()}
          icon={FileText}
          tone="primary"
        />
        <MetricTile
          label="Valor em negociacao"
          value={formatBRL(metrics.emNegociacaoValue)}
          hint="Propostas com status enviada"
          icon={Wallet}
          tone="accent"
        />
        <MetricTile
          label="Taxa aprovacao"
          value={`${metrics.taxaAprovacao}%`}
          hint="Aprovadas / (Aprovadas + Rejeitadas)"
          icon={TrendingUp}
          tone="success"
        />
      </div>

      {/* ── Status filter pills ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              statusFilter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="relative max-w-md">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, lead ou titulo..."
          className="pl-9"
        />
      </div>

      {/* ── Proposals list ── */}
      {pageError ? (
        <AdminEmptyState
          icon={FileText}
          title="Não foi possível carregar as propostas"
          description={`${pageError} Atualize a pagina ou tente novamente em instantes.`}
          action={
            <Button type="button" onClick={() => void refetchData()}>
              Tentar novamente
            </Button>
          }
        />
      ) : filteredProposals.length === 0 ? (
        <AdminEmptyState
          icon={FileText}
          title="Nenhuma proposta encontrada"
          description="Ajuste os filtros ou crie uma nova proposta."
          action={
            <Link to="/portal/admin/propostas/nova">
              <Button type="button">Criar proposta</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          <ColumnHeader />

          {visibleProposals.map((proposal) => (
            <ProposalRow
              key={proposal.id}
              proposal={proposal}
              destinationName={getDestinationName(proposal, clientsMap, leadsMap)}
              onDelete={setProposalToDelete}
              onChangeStatus={handleQuickChangeProposalStatus}
              changingStatus={quickProposalStatusId === proposal.id}
            />
          ))}

          {/* ── Pagination ── */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                {page + 1} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((c) => c - 1)}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((c) => c + 1)}
                >
                  Proxima
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
