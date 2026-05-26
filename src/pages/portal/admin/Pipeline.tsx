/**
 * Pipeline Comercial (CRM) — kanban do funil de vendas.
 *
 * Colunas seguem o funil: Prospecção → Qualificado → Proposta → Ganho/Perdido.
 * Mistura leads (por status) com propostas (por status), evitando duplicar
 * quando a proposta esta vinculada a um lead.
 *
 * Cada coluna mostra inicialmente N cards (responsivo ao viewport),
 * priorizados por urgencia (prazo proximo → mais antigo).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AgileMono, ChevronRight, FileText, Target } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import StatusBadge from "@/components/portal/shared/StatusBadge";
import { Button, Card, CardContent, cn } from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatBRL } from "@/lib/masks";
import { sortPipelineItems, getVisibleCardLimit } from "@/lib/pipeline-utils";
import { formatPortalDate, getClientDisplayName } from "@/lib/portal";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ProposalRow = Pick<
  Database["public"]["Tables"]["proposals"]["Row"],
  "id" | "client_id" | "lead_id" | "title" | "status" | "total_amount" | "sent_at" | "created_at"
>;

type ClientRow = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  "id" | "full_name" | "client_type" | "nome_fantasia"
>;

type LeadRow = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  "id" | "name" | "company" | "status" | "estimated_value" | "created_at" | "updated_at"
>;

type ColumnKey = "prospeccao" | "qualificado" | "proposta" | "ganho" | "perdido";

type LeadStatus = "prospeccao" | "qualificado" | "proposta" | "ganho" | "perdido";

type PipelineItem =
  | {
      kind: "lead";
      id: string;
      name: string;
      clientLabel: string;
      column: ColumnKey;
      leadStatus: LeadStatus;
      value: number;
      dateLabel: string | null;
      sortDate?: string | null;
      createdAt?: string | null;
      link: string;
    }
  | {
      kind: "proposal";
      id: string;
      name: string;
      clientLabel: string;
      column: ColumnKey;
      proposalStatus: string;
      value: number;
      dateLabel: string | null;
      sortDate?: string | null;
      createdAt?: string | null;
      link: string;
    };

const COLUMNS: {
  key: ColumnKey;
  label: string;
}[] = [
  { key: "prospeccao", label: "Prospecção" },
  { key: "qualificado", label: "Qualificado" },
  { key: "proposta", label: "Proposta" },
  { key: "ganho", label: "Ganho" },
  { key: "perdido", label: "Perdido" },
];

const COLUMN_ACCENT: Record<ColumnKey, string> = {
  prospeccao: "border-t-secondary",
  qualificado: "border-t-accent",
  proposta: "border-t-primary",
  ganho: "border-t-success",
  perdido: "border-t-destructive",
};

const COLUMN_COUNT_BG: Record<ColumnKey, string> = {
  prospeccao: "bg-secondary/15 text-secondary-foreground",
  qualificado: "bg-accent/15 text-accent",
  proposta: "bg-primary/15 text-primary",
  ganho: "bg-success/15 text-success",
  perdido: "bg-destructive/15 text-destructive",
};

const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  prospeccao: "Prospecção",
  qualificado: "Qualificado",
  proposta: "Proposta",
  ganho: "Ganho",
  perdido: "Perdido",
};

const LEAD_STATUS_TONE: Record<
  LeadStatus,
  "secondary" | "accent" | "primary" | "success" | "destructive"
> = {
  prospeccao: "secondary",
  qualificado: "accent",
  proposta: "primary",
  ganho: "success",
  perdido: "destructive",
};

const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  enviada: "Proposta Enviada",
  aprovada: "Proposta Aprovada",
  rejeitada: "Proposta Rejeitada",
  expirada: "Proposta Expirada",
};

const PROPOSAL_STATUS_TONE: Record<string, "muted" | "accent" | "success" | "destructive"> = {
  rascunho: "muted",
  enviada: "accent",
  aprovada: "success",
  rejeitada: "destructive",
  expirada: "destructive",
};

/** Mapeia status de proposta para a coluna do funil. */
function proposalStatusToColumn(status: string): ColumnKey | null {
  if (status === "enviada") return "proposta";
  if (status === "aprovada") return "ganho";
  if (status === "rejeitada" || status === "expirada") return "perdido";
  return null;
}

/* ------------------------------------------------------------------ */
/*  Card components                                                    */
/* ------------------------------------------------------------------ */

function LeadCard({ item }: { item: Extract<PipelineItem, { kind: "lead" }> }) {
  return (
    <Link
      to={item.link}
      className="block rounded-xl border border-border/60 bg-background/70 p-3 transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold leading-tight text-foreground line-clamp-2">
            {item.name}
          </h4>
          <Target size={14} className="shrink-0 text-muted-foreground" />
        </div>

        <p className="text-xs text-muted-foreground">{item.clientLabel}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge
            label={LEAD_STATUS_LABEL[item.leadStatus]}
            tone={LEAD_STATUS_TONE[item.leadStatus]}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{item.value > 0 ? formatBRL(item.value) : "Sem valor estimado"}</span>
          {item.dateLabel && <span>{item.dateLabel}</span>}
        </div>
      </div>
    </Link>
  );
}

function ProposalCard({ item }: { item: Extract<PipelineItem, { kind: "proposal" }> }) {
  const tone = PROPOSAL_STATUS_TONE[item.proposalStatus] ?? "accent";
  const statusLabel = PROPOSAL_STATUS_LABEL[item.proposalStatus] ?? item.proposalStatus;

  return (
    <Link
      to={item.link}
      className="block rounded-xl border border-primary/30 bg-primary/[0.03] p-3 transition-all hover:border-primary/50 hover:shadow-md"
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold leading-tight text-foreground line-clamp-2">
            {item.name}
          </h4>
          <FileText size={14} className="shrink-0 text-primary/60" />
        </div>

        <p className="text-xs text-muted-foreground">{item.clientLabel}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge label={statusLabel} tone={tone} />
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{formatBRL(item.value)}</span>
          {item.dateLabel && <span>{item.dateLabel}</span>}
        </div>
      </div>
    </Link>
  );
}

function PipelineCard({ item }: { item: PipelineItem }) {
  if (item.kind === "lead") return <LeadCard item={item} />;
  return <ProposalCard item={item} />;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function Pipeline() {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCols, setExpandedCols] = useState<Set<ColumnKey>>(new Set());
  const [visibleLimit, setVisibleLimit] = useState(() => getVisibleCardLimit());

  useEffect(() => {
    const onResize = () => setVisibleLimit(getVisibleCardLimit());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleColumn = useCallback((key: ColumnKey) => {
    setExpandedCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [proposalsRes, clientsRes, leadsRes] = await Promise.all([
      supabase
        .from("proposals")
        .select("id, client_id, lead_id, title, status, total_amount, sent_at, created_at")
        .in("status", ["enviada", "aprovada", "rejeitada", "expirada"]),
      supabase.from("clients").select("id, full_name, client_type, nome_fantasia"),
      supabase
        .from("leads")
        .select("id, name, company, status, estimated_value, created_at, updated_at"),
    ]);

    const hardError = proposalsRes.error ?? clientsRes.error ?? leadsRes.error;
    if (hardError) {
      setError(hardError.message);
      setLoading(false);
      return;
    }

    const proposalsData = (proposalsRes.data ?? []) as ProposalRow[];
    const clientsData = (clientsRes.data ?? []) as ClientRow[];
    const leadsData = (leadsRes.data ?? []) as LeadRow[];

    const clientMap = new Map(clientsData.map((c) => [c.id, c]));
    const leadMap = new Map(leadsData.map((l) => [l.id, l]));

    const merged: PipelineItem[] = [];

    // Leads vinculados a uma proposta ativa: o card da proposta ja representa
    // o estagio no funil, entao escondemos o lead pra nao duplicar.
    const leadsWithActiveProposal = new Set(
      proposalsData
        .filter((p) => p.status === "enviada" || p.status === "aprovada")
        .map((p) => p.lead_id)
        .filter((id): id is string => Boolean(id))
    );

    for (const lead of leadsData) {
      const status = lead.status as LeadStatus;
      if (!(status in LEAD_STATUS_LABEL)) continue;
      if (leadsWithActiveProposal.has(lead.id)) continue;

      merged.push({
        kind: "lead",
        id: lead.id,
        name: lead.name,
        clientLabel: lead.company ?? "Sem empresa",
        column: status,
        leadStatus: status,
        value: Number(lead.estimated_value ?? 0),
        dateLabel: lead.updated_at ? `Atualizado: ${formatPortalDate(lead.updated_at)}` : null,
        sortDate: lead.updated_at,
        createdAt: lead.created_at,
        link: `/portal/admin/leads/${lead.id}`,
      });
    }

    for (const proposal of proposalsData) {
      const column = proposalStatusToColumn(proposal.status);
      if (!column) continue;

      let clientLabel = "—";
      if (proposal.client_id) {
        const client = clientMap.get(proposal.client_id);
        clientLabel = client ? getClientDisplayName(client) : "Cliente removido";
      } else if (proposal.lead_id) {
        const lead = leadMap.get(proposal.lead_id);
        clientLabel = lead
          ? lead.company
            ? `${lead.name} (${lead.company})`
            : lead.name
          : "Lead removido";
      }

      merged.push({
        kind: "proposal",
        id: proposal.id,
        name: proposal.title,
        clientLabel,
        column,
        proposalStatus: proposal.status,
        value: Number(proposal.total_amount),
        dateLabel: proposal.sent_at ? `Enviada: ${formatPortalDate(proposal.sent_at)}` : null,
        sortDate: proposal.sent_at,
        createdAt: proposal.created_at,
        link: `/portal/admin/propostas/${proposal.id}`,
      });
    }

    setItems(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const grouped = useMemo(() => {
    const map: Record<ColumnKey, PipelineItem[]> = {
      prospeccao: [],
      qualificado: [],
      proposta: [],
      ganho: [],
      perdido: [],
    };

    for (const item of items) {
      map[item.column].push(item);
    }

    for (const key of Object.keys(map) as ColumnKey[]) {
      map[key] = sortPipelineItems(
        map[key].map((it) => ({ ...it, isOverdue: false }))
      ) as PipelineItem[];
    }

    return map;
  }, [items]);

  const totalCount = items.length;

  if (loading) return <PortalLoading />;

  if (error) {
    return (
      <AdminEmptyState
        icon={Target}
        title="Erro ao carregar pipeline"
        description={error}
        action={
          <Button type="button" onClick={() => void loadData()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  if (totalCount === 0) {
    return (
      <AdminEmptyState
        icon={AgileMono}
        title="Nenhum item no pipeline"
        description="Cadastre leads ou envie propostas para visualizar o funil comercial."
        action={
          <Button asChild>
            <Link to="/portal/admin/crm">Novo lead</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <Card className="rounded-2xl border-border/80 bg-card/95">
        <CardContent className="flex flex-wrap items-center gap-4 p-3 sm:p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {totalCount} item(ns) no funil
          </span>
          <span className="h-4 w-px bg-border/60" />
          {COLUMNS.map((col) => (
            <span key={col.key} className="flex items-center gap-1.5 text-xs">
              <span
                className={cn(
                  "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                  COLUMN_COUNT_BG[col.key]
                )}
              >
                {grouped[col.key].length}
              </span>
              <span className="text-muted-foreground">{col.label}</span>
            </span>
          ))}
        </CardContent>
      </Card>

      {/* Kanban board */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className={cn(
              "flex flex-col rounded-2xl border border-border/70 border-t-[3px] bg-card/60",
              COLUMN_ACCENT[col.key]
            )}
          >
            {/* Column header */}
            <div className="flex items-center justify-between p-3 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {col.label}
              </h3>
              <span
                className={cn(
                  "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                  COLUMN_COUNT_BG[col.key]
                )}
              >
                {grouped[col.key].length}
              </span>
            </div>

            {/* Cards — exibicao progressiva */}
            <div className="flex flex-1 flex-col gap-2 px-2 pb-3">
              {(() => {
                const colItems = grouped[col.key];
                if (colItems.length === 0) {
                  return (
                    <div className="flex flex-1 items-center justify-center rounded-xl bg-muted/20 p-6">
                      <p className="text-center text-xs text-muted-foreground">Vazio</p>
                    </div>
                  );
                }

                const isExpanded = expandedCols.has(col.key);
                const hiddenCount = colItems.length - visibleLimit;
                const showToggle = hiddenCount > 0;
                const visibleItems = isExpanded ? colItems : colItems.slice(0, visibleLimit);

                return (
                  <>
                    {visibleItems.map((item) => (
                      <PipelineCard key={`${item.kind}-${item.id}`} item={item} />
                    ))}
                    {showToggle && (
                      <button
                        type="button"
                        onClick={() => toggleColumn(col.key)}
                        aria-expanded={isExpanded}
                        aria-label={
                          isExpanded
                            ? `Recolher coluna ${col.label}`
                            : `Mostrar mais ${hiddenCount} itens em ${col.label}`
                        }
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 px-3 py-2.5 text-xs font-semibold transition-all",
                          "text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5"
                        )}
                      >
                        <ChevronRight
                          size={14}
                          className={cn(
                            "shrink-0 transition-transform duration-200",
                            isExpanded && "rotate-90"
                          )}
                        />
                        {isExpanded
                          ? "Recolher"
                          : `+${hiddenCount} ${hiddenCount === 1 ? "item" : "itens"}`}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
