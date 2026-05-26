import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { ExternalLink, FileText, Shield } from "@/assets/icons";
import CopyLinkButton from "@/components/portal/shared/CopyLinkButton";
import DraftBanner from "@/components/portal/shared/DraftBanner";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import ProposalExpiryCountdown from "@/components/portal/proposal/ProposalExpiryCountdown";
import ProposalRejectModal from "@/components/portal/proposal/ProposalRejectModal";
import StatusBadge from "@/components/portal/shared/StatusBadge";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Label,
  Textarea,
  cn,
} from "@/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useFormDraftAutoSave } from "@/hooks/useFormDraftAutoSave";
import { supabase } from "@/integrations/supabase/client";
import {
  buildScopeSummaryFromDiagnosis,
  isDiagnosisConcluded,
  parseLeadDiagnosis,
} from "@/lib/lead-diagnosis";
import { getSupabaseFunctionAuthHeaders } from "@/lib/supabase-functions";
import type { Database } from "@/integrations/supabase/types";
import { formatBRL, getLocalDateIso, maskCurrency, unmaskCurrency } from "@/lib/masks";
import {
  canTransitionProposal,
  formatPortalDate,
  formatPortalDateTime,
  getClientDisplayName,
} from "@/lib/portal";

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
type DestinationType = "client" | "lead";

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

type FormState = {
  title: string;
  destination_type: DestinationType;
  client_id: string;
  lead_id: string;
  solution_type: string;
  total_amount: string;
  valid_until: string;
  scope_summary: string;
  payment_conditions: string;
  observations: string;
  document_url: string;
  technical_document_url: string;
  // ── Billing config (preenchido na criacao, consumido na aprovacao) ──
  payment_model: "50_50" | "a_vista" | "personalizado";
  entry_percentage: string;
  entry_due_date: string;
  delivery_due_date: string;
  has_subscription: boolean;
  subscription_label: string;
  subscription_amount: string;
  subscription_due_day: string;
  subscription_starts_on: string;
  subscription_ends_on: string;
};

type BillingConfig = {
  payment_model?: "50_50" | "a_vista" | "personalizado";
  entry_percentage?: number;
  entry_due_date?: string | null;
  delivery_due_date?: string | null;
  subscription?: null | {
    label?: string;
    amount?: number;
    due_day?: number;
    starts_on?: string | null;
    ends_on?: string | null;
  };
};

const selectClass =
  "flex h-10 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function formDefaults(proposal?: ProposalRow | null): FormState {
  const billing = (proposal?.billing_config ?? {}) as BillingConfig;
  const sub = billing.subscription ?? null;
  return {
    title: proposal?.title ?? "",
    destination_type: proposal?.lead_id ? "lead" : "client",
    client_id: proposal?.client_id ?? "",
    lead_id: proposal?.lead_id ?? "",
    solution_type: proposal?.solution_type ?? "",
    total_amount: proposal ? maskCurrency(String(Math.round(proposal.total_amount * 100))) : "",
    valid_until: proposal?.valid_until ?? "",
    scope_summary: proposal?.scope_summary ?? "",
    payment_conditions: proposal?.payment_conditions ?? "",
    observations: proposal?.observations ?? "",
    document_url: proposal?.document_url ?? "",
    technical_document_url: proposal?.technical_document_url ?? "",
    payment_model: billing.payment_model ?? "50_50",
    entry_percentage: String(billing.entry_percentage ?? 50),
    entry_due_date: billing.entry_due_date ?? "",
    delivery_due_date: billing.delivery_due_date ?? "",
    has_subscription: Boolean(sub),
    subscription_label: sub?.label ?? "Manutenção mensal",
    subscription_amount:
      sub?.amount != null ? maskCurrency(String(Math.round(Number(sub.amount) * 100))) : "",
    subscription_due_day: sub?.due_day != null ? String(sub.due_day) : "10",
    subscription_starts_on: sub?.starts_on ?? "",
    subscription_ends_on: sub?.ends_on ?? "",
  };
}

function formToBillingConfig(form: FormState): BillingConfig {
  const config: BillingConfig = {
    payment_model: form.payment_model,
  };
  if (form.payment_model === "personalizado") {
    const pct = Number(form.entry_percentage);
    if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      config.entry_percentage = pct;
    }
  }
  if (form.entry_due_date) config.entry_due_date = form.entry_due_date;
  if (form.delivery_due_date) config.delivery_due_date = form.delivery_due_date;
  if (form.has_subscription) {
    const amount = unmaskCurrency(form.subscription_amount);
    const dueDay = Number(form.subscription_due_day);
    if (
      amount > 0 &&
      Number.isInteger(dueDay) &&
      dueDay >= 1 &&
      dueDay <= 31 &&
      form.subscription_starts_on
    ) {
      config.subscription = {
        label: form.subscription_label.trim() || "Mensalidade",
        amount,
        due_day: dueDay,
        starts_on: form.subscription_starts_on,
        ends_on: form.subscription_ends_on || null,
      };
    }
  }
  return config;
}

/* ------------------------------------------------------------------ */
/*  Read-only view (for sent / approved / rejected / expired)          */
/* ------------------------------------------------------------------ */

function ProposalReadOnly({
  proposal,
  destinationLabel,
  onApprove,
  approving,
  onRequestReject,
  linkedProjectId,
}: {
  proposal: ProposalRow;
  destinationLabel: string;
  onApprove: () => void;
  approving: boolean;
  onRequestReject: () => void;
  linkedProjectId: string | null;
}) {
  const meta =
    PROPOSAL_STATUS_META[proposal.status as ProposalStatus] ?? PROPOSAL_STATUS_META.rascunho;

  const canApprove =
    proposal.status === "enviada" || (proposal.status === "aprovada" && !linkedProjectId);

  // Rejeitar so faz sentido em propostas "enviadas" ainda nao decididas
  const canReject = proposal.status === "enviada";

  return (
    <div className="space-y-6">
      {/* Status header */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge label={meta.label} tone={meta.tone} />
        {proposal.sent_at ? (
          <span className="text-sm text-muted-foreground">
            Enviada em {formatPortalDateTime(proposal.sent_at)}
          </span>
        ) : null}
        {proposal.approved_at ? (
          <span className="text-sm text-success">
            Aprovada em {formatPortalDateTime(proposal.approved_at)}
          </span>
        ) : null}
        {proposal.rejected_at ? (
          <span className="text-sm text-destructive">
            Rejeitada em {formatPortalDateTime(proposal.rejected_at)}
          </span>
        ) : null}
      </div>

      {/* Warning: proposal for lead without client */}
      {canApprove && !proposal.client_id && proposal.lead_id && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <Shield size={18} className="text-warning shrink-0" />
          <span className="text-sm text-warning">
            Esta proposta e para um lead. Para criar o projeto, primeiro converta o lead em cliente
            na{" "}
            <Link to="/portal/admin/crm" className="font-medium underline">
              pagina do CRM
            </Link>
            .
          </span>
        </div>
      )}

      {/* Admin approve action */}
      {canApprove && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <Button type="button" disabled={approving} onClick={onApprove}>
            {approving
              ? "Criando projeto..."
              : proposal.status === "aprovada"
                ? "Criar projeto a partir desta proposta"
                : "Aprovar e criar projeto"}
          </Button>
          <span className="flex-1 text-xs text-muted-foreground">
            {proposal.status === "aprovada"
              ? "Cliente ja aprovou. Clique para criar o projeto e contrato vinculados."
              : "Ao aprovar, um projeto será criado automaticamente vinculado a esta proposta."}
          </span>
          {canReject ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRequestReject}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Rejeitar proposta
            </Button>
          ) : null}
        </div>
      )}

      {/* Linked project reference */}
      {linkedProjectId && (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
          <span className="text-sm text-success font-medium">
            Projeto criado a partir desta proposta:
          </span>
          <Link
            to={`/portal/admin/projetos/${linkedProjectId}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Ver projeto →
          </Link>
        </div>
      )}

      {/* Rejection reason */}
      {proposal.rejection_reason ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-destructive">Motivo da rejeicao</p>
            <p className="mt-1 text-sm text-foreground">{proposal.rejection_reason}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Details grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Titulo
          </p>
          <p className="mt-1 text-sm text-foreground">{proposal.title}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Destinatario
          </p>
          <p className="mt-1 text-sm text-foreground">{destinationLabel}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Valor total
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {formatBRL(proposal.total_amount)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Validade
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm text-foreground">{formatPortalDate(proposal.valid_until)}</p>
            <ProposalExpiryCountdown validUntil={proposal.valid_until} status={proposal.status} />
          </div>
        </div>
        {proposal.solution_type ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tipo de solucao
            </p>
            <p className="mt-1 text-sm text-foreground">{proposal.solution_type}</p>
          </div>
        ) : null}
      </div>

      {proposal.scope_summary ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Resumo do escopo
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {proposal.scope_summary}
          </p>
        </div>
      ) : null}

      {proposal.payment_conditions ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Condicoes de pagamento
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {proposal.payment_conditions}
          </p>
        </div>
      ) : null}

      {proposal.observations ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Observações
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {proposal.observations}
          </p>
        </div>
      ) : null}

      {proposal.document_url ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Documento
          </p>
          <a
            href={proposal.document_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Abrir documento
            <ExternalLink size={14} />
          </a>
        </div>
      ) : null}

      {proposal.technical_document_url ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Anexo tecnico
          </p>
          <a
            href={proposal.technical_document_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Abrir anexo tecnico
            <ExternalLink size={14} />
          </a>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function ProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const isEditing = Boolean(id);

  const [proposal, setProposal] = useState<ProposalRow | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [form, setForm] = useState<FormState>(formDefaults());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
  // PROBLEMA 8: marca proposta como expansao quando vem do botao
  // "Nova oportunidade" do ClientDetail (?source=expansion).
  const [isExpansion, setIsExpansion] = useState(false);

  /* ── Helpers ── */

  const clientsMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const leadsMap = useMemo(() => Object.fromEntries(leads.map((l) => [l.id, l])), [leads]);

  const destinationLabel = useMemo(() => {
    if (form.destination_type === "client" && form.client_id) {
      const c = clientsMap[form.client_id];
      return c ? getClientDisplayName(c) : "—";
    }
    if (form.destination_type === "lead" && form.lead_id) {
      const l = leadsMap[form.lead_id];
      return l ? (l.company ? `${l.name} (${l.company})` : l.name) : "—";
    }
    return "—";
  }, [form, clientsMap, leadsMap]);

  const isReadOnly = isEditing && proposal !== null && proposal.status !== "rascunho";

  /* ── Auto-save de rascunho local (so na criacao) ── */
  const draftKey = `elkys:admin:proposal-create:draft:${user?.id ?? "anon"}`;
  const {
    hasDraft: hasLocalDraft,
    draftSavedAt: localDraftSavedAt,
    restore: restoreLocalDraft,
    discard: discardLocalDraft,
    clearDraft: clearLocalDraft,
  } = useFormDraftAutoSave<FormState>({
    storageKey: draftKey,
    values: form,
    onRestore: (restored) => setForm(restored),
    disabled: isEditing,
    autoRestore: false,
  });

  const canSend =
    form.title.trim().length > 0 &&
    ((form.destination_type === "client" && form.client_id) ||
      (form.destination_type === "lead" && form.lead_id)) &&
    form.document_url.trim().length > 0;

  /* ── Set form field ── */

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /* ── Lead → diagnosis → scope_summary pre-population (PROBLEMA 5) ── */

  async function handleLeadChange(leadId: string) {
    setField("lead_id", leadId);
    if (!leadId) return;
    // Busca diagnostico do lead. Se concluido e scope_summary atual estiver
    // vazio, pre-popula a partir do template gerado.
    const { data: leadData } = await supabase
      .from("leads")
      .select("diagnosis")
      .eq("id", leadId)
      .maybeSingle();
    if (!leadData) return;
    const diagnosis = parseLeadDiagnosis((leadData as { diagnosis?: unknown }).diagnosis);
    if (!isDiagnosisConcluded(diagnosis)) return;
    if (form.scope_summary.trim().length > 0) return; // nao sobrescreve
    const template = buildScopeSummaryFromDiagnosis(diagnosis);
    if (template) {
      setField("scope_summary", template);
      toast.success("Escopo pré-preenchido com base no diagnóstico do lead.");
    }
  }

  /* ── Load data ── */

  const loadData = useCallback(async () => {
    setLoading(true);

    const queries: Promise<unknown>[] = [
      supabase
        .from("clients")
        .select("id, full_name, client_type, nome_fantasia")
        .eq("is_active", true),
      supabase.from("leads").select("id, name, company").neq("status", "perdido"),
    ];

    if (id) {
      queries.push(supabase.from("proposals").select("*").eq("id", id).single());
    }

    const results = await Promise.all(queries);

    const clientsRes = results[0] as {
      data: ClientRow[] | null;
      error: { message: string } | null;
    };
    const leadsRes = results[1] as { data: LeadRow[] | null; error: { message: string } | null };

    if (clientsRes.error || leadsRes.error) {
      toast.error("Erro ao carregar dados.", {
        description: (clientsRes.error ?? leadsRes.error)?.message,
      });
      setLoading(false);
      return;
    }

    setClients(clientsRes.data ?? []);
    setLeads(leadsRes.data ?? []);

    if (id && results[2]) {
      const proposalRes = results[2] as {
        data: ProposalRow | null;
        error: { message: string } | null;
      };

      if (proposalRes.error || !proposalRes.data) {
        toast.error("Proposta não encontrada.");
        navigate("/portal/admin/propostas");
        return;
      }

      setProposal(proposalRes.data);
      setForm(formDefaults(proposalRes.data));

      // Check if a project was already created from this proposal
      const { data: linkedProject } = await supabase
        .from("projects")
        .select("id")
        .eq("proposal_id", proposalRes.data.id)
        .limit(1)
        .maybeSingle();

      setLinkedProjectId(linkedProject?.id ?? null);
      setIsExpansion(Boolean(proposalRes.data.is_expansion));
    } else {
      // PROBLEMA 8: pre-popular cliente quando a proposta nasce do botao
      // "Nova oportunidade" no ClientDetail (URL ?client_id=xxx&source=expansion).
      const queryClientId = searchParams.get("client_id");
      const queryLeadId = searchParams.get("lead_id");
      const queryIsExpansion = searchParams.get("source") === "expansion";
      if (queryClientId) {
        setForm((prev) => ({
          ...prev,
          destination_type: "client" as DestinationType,
          client_id: queryClientId,
        }));
      } else if (queryLeadId) {
        setForm((prev) => ({
          ...prev,
          destination_type: "lead" as DestinationType,
          lead_id: queryLeadId,
        }));
      }
      if (queryIsExpansion) {
        setIsExpansion(true);
      }
    }

    setLoading(false);
  }, [id, navigate, searchParams]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /* ── Build payload ── */

  function buildPayload(status: string) {
    // PROBLEMA 4: garante XOR client/lead antes de montar payload.
    // O DB tem CHECK constraint, mas falhar cedo aqui evita UX ruim
    // (admin so saberia do erro depois do POST).
    const hasClient = form.destination_type === "client" && Boolean(form.client_id);
    const hasLead = form.destination_type === "lead" && Boolean(form.lead_id);
    if (hasClient === hasLead) {
      throw new Error("Selecione exatamente um destinatario: cliente OU lead.");
    }
    const payload: Database["public"]["Tables"]["proposals"]["Insert"] = {
      title: form.title.trim(),
      client_id: form.destination_type === "client" && form.client_id ? form.client_id : null,
      lead_id: form.destination_type === "lead" && form.lead_id ? form.lead_id : null,
      total_amount: unmaskCurrency(form.total_amount),
      valid_until: form.valid_until || null,
      scope_summary: form.scope_summary.trim() || null,
      payment_conditions: form.payment_conditions.trim() || null,
      observations: form.observations.trim() || null,
      document_url: form.document_url.trim() || null,
      solution_type: form.solution_type.trim() || null,
      technical_document_url: form.technical_document_url.trim() || null,
      status,
      created_by: user?.id ?? null,
      // Auditoria Sub-step C: billing_config alimenta a RPC de aprovacao
      // para criar installments + charges + opcional subscription
      // automaticamente. Vazio = aprovacao cria so project shell + contract.
      billing_config: formToBillingConfig(form) as never,
      // PROBLEMA 8: marca proposta como expansao se nasceu de cliente ativo.
      is_expansion: isExpansion,
    };

    if (status === "enviada") {
      (payload as Record<string, unknown>).sent_at = new Date().toISOString();
    }

    return payload;
  }

  /* ── Save as draft ── */

  async function handleSaveDraft() {
    if (saving || sending) return;
    if (!form.title.trim()) {
      toast.error("Informe o titulo da proposta.");
      return;
    }

    const hasOwner =
      (form.destination_type === "client" && !!form.client_id) ||
      (form.destination_type === "lead" && !!form.lead_id);

    if (!hasOwner) {
      toast.error("Selecione um cliente ou lead para a proposta.");
      return;
    }

    setSaving(true);

    try {
      const payload = buildPayload("rascunho");

      if (isEditing && proposal) {
        const { error } = await supabase.from("proposals").update(payload).eq("id", proposal.id);

        if (error) {
          toast.error("Erro ao salvar proposta.", { description: error.message });
          return;
        }

        toast.success("Rascunho salvo com sucesso.");
        void loadData();
      } else {
        const { data, error } = await supabase
          .from("proposals")
          .insert(payload)
          .select("id")
          .single();

        if (error) {
          toast.error("Erro ao criar proposta.", { description: error.message });
          return;
        }

        toast.success("Proposta criada como rascunho.");
        clearLocalDraft();
        navigate(`/portal/admin/propostas/${data.id}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado.";
      toast.error("Erro ao salvar proposta.", { description: msg });
    } finally {
      setSaving(false);
    }
  }

  /* ── Send to client ── */

  async function handleSend() {
    if (saving || sending) return;
    if (isEditing && proposal && !canTransitionProposal(proposal.status, "enviada")) {
      toast.error("Esta proposta não pode ser enviada no status atual.");
      return;
    }

    if (!form.title.trim()) {
      toast.error("Informe o titulo da proposta.");
      return;
    }

    if (!canSend) {
      toast.error("Preencha o destinatario e o link do documento antes de enviar.");
      return;
    }

    if (!form.total_amount || unmaskCurrency(form.total_amount) <= 0) {
      toast.error("Informe um valor total maior que zero.");
      return;
    }

    if (form.valid_until) {
      const today = getLocalDateIso();
      if (form.valid_until < today) {
        toast.error("A data de validade não pode estar no passado.");
        return;
      }
    }

    setSending(true);

    try {
      const payload = buildPayload("enviada");

      if (isEditing && proposal) {
        const { error } = await supabase.from("proposals").update(payload).eq("id", proposal.id);

        if (error) {
          toast.error("Erro ao enviar proposta.", { description: error.message });
          return;
        }

        toast.success("Proposta enviada com sucesso.");

        // Notify client by email (fire-and-forget)
        if (form.destination_type === "client" && form.client_id) {
          try {
            const headers = await getSupabaseFunctionAuthHeaders();
            void supabase.functions.invoke("send-proposal-sent", {
              body: { proposal_id: proposal!.id, client_id: form.client_id },
              headers,
            });
          } catch {
            // Non-blocking
          }
        }

        // Sync: update lead status to "proposta" if linked to a lead
        if (form.destination_type === "lead" && form.lead_id) {
          void supabase
            .from("leads")
            .update({ status: "proposta", updated_at: new Date().toISOString() })
            .eq("id", form.lead_id)
            .in("status", ["prospeccao", "qualificado"]);
        }

        // Timeline: record proposal sent event
        if (form.destination_type === "client" && form.client_id) {
          void supabase.from("timeline_events").insert({
            client_id: form.client_id,
            event_type: "proposta_enviada",
            title: "Proposta enviada",
            summary: `Proposta "${form.title.trim()}" enviada para avaliacao.`,
            visibility: "ambos",
            source_table: "proposals",
            source_id: proposal?.id ?? null,
            actor_user_id: user?.id ?? null,
          });
        }

        void loadData();
      } else {
        const { data, error } = await supabase
          .from("proposals")
          .insert(payload)
          .select("id")
          .single();

        if (error) {
          toast.error("Erro ao criar e enviar proposta.", { description: error.message });
          return;
        }

        toast.success("Proposta criada e enviada.");
        clearLocalDraft();

        // Notify client by email (fire-and-forget)
        if (form.destination_type === "client" && form.client_id) {
          try {
            const headers = await getSupabaseFunctionAuthHeaders();
            void supabase.functions.invoke("send-proposal-sent", {
              body: { proposal_id: data.id, client_id: form.client_id },
              headers,
            });
          } catch {
            // Non-blocking
          }
        }

        // Sync lead status
        if (form.destination_type === "lead" && form.lead_id) {
          void supabase
            .from("leads")
            .update({ status: "proposta", updated_at: new Date().toISOString() })
            .eq("id", form.lead_id)
            .in("status", ["prospeccao", "qualificado"]);
        }

        // Timeline event
        if (form.destination_type === "client" && form.client_id) {
          void supabase.from("timeline_events").insert({
            client_id: form.client_id,
            event_type: "proposta_enviada",
            title: "Proposta enviada",
            summary: `Proposta "${form.title.trim()}" enviada para avaliacao.`,
            visibility: "ambos",
            source_table: "proposals",
            source_id: data.id,
            actor_user_id: user?.id ?? null,
          });
        }

        navigate(`/portal/admin/propostas/${data.id}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado.";
      toast.error("Erro ao enviar proposta.", { description: msg });
    } finally {
      setSending(false);
    }
  }

  /* ── Approve proposal (admin) ── */

  async function handleApprove() {
    if (!proposal) return;

    // Allow if already approved (by client) — just needs project creation.
    // Otherwise validate the transition.
    if (proposal.status !== "aprovada" && !canTransitionProposal(proposal.status, "aprovada")) {
      toast.error("Esta proposta não pode ser aprovada no status atual.");
      return;
    }

    setApproving(true);

    // Auditoria P-002, P-004: aprovacao agora e atomica via RPC. Antes
    // eram 5+ operacoes (update proposal, lookup lead, insert project,
    // insert contract fire-and-forget, insert document fire-and-forget,
    // insert timeline fire-and-forget, update lead fire-and-forget). A
    // RPC tambem auto-converte lead em cliente se necessario, eliminando
    // o "converta o lead primeiro" manual.
    const { data: result, error: rpcError } = await supabase.rpc("approve_proposal_to_project", {
      p_proposal_id: proposal.id,
    });

    setApproving(false);

    if (rpcError || !result) {
      toast.error("Erro ao aprovar proposta.", {
        description: rpcError?.message ?? "Falha desconhecida.",
      });
      return;
    }

    const rpcResult = result as {
      client_id?: string;
      contract_id?: string;
      proposal_id?: string;
    };

    // Se proposta era de lead (sem client_id direto), enviar welcome email
    // ao novo cliente convertido
    if (proposal.lead_id && !proposal.client_id && rpcResult.client_id) {
      try {
        const { data: newClient } = await supabase
          .from("clients")
          .select("email, full_name, must_change_password")
          .eq("id", rpcResult.client_id)
          .single();

        if (newClient?.email && newClient?.must_change_password) {
          const headers = await getSupabaseFunctionAuthHeaders();
          void supabase.functions.invoke("send-client-welcome", {
            body: {
              email: newClient.email,
              name: newClient.full_name,
              // A senha temporária já foi gerada pela RPC convert_lead_to_client
              // e salva no auth.users. Não temos acesso a ela aqui, então
              // enviamos orientação para reset via portal
              temp_password: "Solicite a senha via 'Esqueci minha senha' no portal",
            },
            headers,
          });
        }
      } catch {
        // Fire-and-forget
      }
    }

    toast.success("Proposta aprovada! Contrato gerado para revisão do jurídico.");
    void loadData();
  }

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  async function handleReject(reasonText: string) {
    if (!proposal) return;
    if (!canTransitionProposal(proposal.status, "rejeitada")) {
      toast.error("Esta proposta não pode ser rejeitada no status atual.");
      return;
    }

    setRejecting(true);
    const nowIso = new Date().toISOString();
    const { error: rejectError } = await supabase
      .from("proposals")
      .update({
        status: "rejeitada",
        rejected_at: nowIso,
        rejection_reason: reasonText,
        updated_at: nowIso,
      })
      .eq("id", proposal.id);

    if (rejectError) {
      setRejecting(false);
      toast.error("Erro ao rejeitar proposta.", { description: rejectError.message });
      return;
    }

    // Timeline event (silencioso em falha para nao bloquear o fluxo)
    // Só insere se tem client_id (proposals de lead sem conversão não têm)
    if (proposal.client_id) {
      try {
        await supabase.from("timeline_events").insert({
          client_id: proposal.client_id,
          project_id: null,
          actor_user_id: user?.id ?? null,
          event_type: "proposta_rejeitada",
          title: "Proposta rejeitada",
          summary: `Proposta "${proposal.title}" marcada como rejeitada. Motivo: ${reasonText}`,
          visibility: "ambos",
          source_table: "proposals",
          source_id: proposal.id,
        });
      } catch {
        /* silencioso */
      }
    }

    // Se vinculada a lead, avanca status pra perdido
    if (proposal.lead_id) {
      void supabase
        .from("leads")
        .update({
          status: "perdido",
          lost_reason: reasonText,
          updated_at: nowIso,
        })
        .eq("id", proposal.lead_id);
    }

    setRejecting(false);
    setRejectModalOpen(false);
    toast.success("Proposta rejeitada.", { description: reasonText });
    void loadData();
  }

  /* ── Render ── */

  if (loading) return <PortalLoading />;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {isEditing
              ? isReadOnly
                ? "Detalhes da proposta"
                : "Editar proposta"
              : "Nova proposta"}
          </h2>
          {isEditing && proposal ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Criada em {formatPortalDateTime(proposal.created_at)}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? <CopyLinkButton /> : null}
          <Link to="/portal/admin/propostas">
            <Button type="button" variant="outline" size="sm">
              Voltar
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Rascunho salvo localmente (so na criacao) ── */}
      {!isEditing && hasLocalDraft && (
        <DraftBanner
          savedAt={localDraftSavedAt}
          onRestore={restoreLocalDraft}
          onDiscard={discardLocalDraft}
          title="Rascunho de proposta encontrado"
        />
      )}

      {/* ── Read-only mode ── */}
      {isReadOnly && proposal ? (
        <Card>
          <CardContent className="pt-6">
            <ProposalReadOnly
              proposal={proposal}
              destinationLabel={destinationLabel}
              onApprove={() => void handleApprove()}
              approving={approving}
              onRequestReject={() => setRejectModalOpen(true)}
              linkedProjectId={linkedProjectId}
            />
          </CardContent>
        </Card>
      ) : (
        /* ── Edit / Create form ── */
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da proposta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Title */}
            <Field>
              <Label htmlFor="title" required>
                Titulo
              </Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="Ex: Proposta de desenvolvimento de site institucional"
              />
            </Field>

            {/* Destination type */}
            <Field>
              <Label required>Destinatario</Label>
              <div className="mt-2 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="destination_type"
                    value="client"
                    checked={form.destination_type === "client"}
                    onChange={() => {
                      setField("destination_type", "client");
                      setField("lead_id", "");
                    }}
                    className="accent-primary"
                  />
                  Cliente existente
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="destination_type"
                    value="lead"
                    checked={form.destination_type === "lead"}
                    onChange={() => {
                      setField("destination_type", "lead");
                      setField("client_id", "");
                    }}
                    className="accent-primary"
                  />
                  Lead
                </label>
              </div>
            </Field>

            {/* Client select */}
            {form.destination_type === "client" ? (
              <Field>
                <Label htmlFor="client_id">Cliente</Label>
                <select
                  id="client_id"
                  value={form.client_id}
                  onChange={(e) => setField("client_id", e.target.value)}
                  className={selectClass}
                >
                  <option value="">Selecione um cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {getClientDisplayName(c)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field>
                <Label htmlFor="lead_id">Lead</Label>
                <select
                  id="lead_id"
                  value={form.lead_id}
                  onChange={(e) => void handleLeadChange(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Selecione um lead</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.company ? ` (${l.company})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {/* Solution type */}
            <Field>
              <Label htmlFor="solution_type">Tipo de solucao</Label>
              <Input
                id="solution_type"
                value={form.solution_type}
                onChange={(e) => setField("solution_type", e.target.value)}
                placeholder="Ex: Site institucional, E-commerce, Sistema web..."
              />
            </Field>

            {/* Value + Valid until */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="total_amount">Valor total</Label>
                <Input
                  id="total_amount"
                  value={form.total_amount}
                  onChange={(e) => setField("total_amount", maskCurrency(e.target.value))}
                  placeholder="R$ 0,00"
                  inputMode="numeric"
                />
              </Field>
              <Field>
                <Label htmlFor="valid_until">Validade</Label>
                <Input
                  id="valid_until"
                  type="date"
                  value={form.valid_until}
                  onChange={(e) => setField("valid_until", e.target.value)}
                />
              </Field>
            </div>

            {/* Scope summary */}
            <Field>
              <Label htmlFor="scope_summary">Resumo do escopo</Label>
              <Textarea
                id="scope_summary"
                value={form.scope_summary}
                onChange={(e) => setField("scope_summary", e.target.value)}
                placeholder="Descreva o escopo principal da proposta..."
                rows={4}
              />
            </Field>

            {/* Payment conditions */}
            <Field>
              <Label htmlFor="payment_conditions">Condicoes de pagamento</Label>
              <Textarea
                id="payment_conditions"
                value={form.payment_conditions}
                onChange={(e) => setField("payment_conditions", e.target.value)}
                placeholder="Ex: 50% na assinatura, 50% na entrega..."
                rows={3}
              />
            </Field>

            {/* ── Cobranca automatica (faturas) ─────────────────────── */}
            <div className="rounded-xl border border-border/80 bg-background/40 p-4">
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  Cobrança automática
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Quando a proposta for aprovada, o sistema cria as parcelas e cobranças
                  automaticamente — sem precisar configurar depois.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <Label htmlFor="payment_model">Modelo de pagamento</Label>
                  <select
                    id="payment_model"
                    value={form.payment_model}
                    onChange={(e) =>
                      setField("payment_model", e.target.value as FormState["payment_model"])
                    }
                    className={selectClass}
                  >
                    <option value="50_50">50% entrada / 50% entrega</option>
                    <option value="a_vista">100% à vista (entrada)</option>
                    <option value="personalizado">Personalizado</option>
                  </select>
                </Field>
                {form.payment_model === "personalizado" ? (
                  <Field>
                    <Label htmlFor="entry_percentage">% de entrada</Label>
                    <Input
                      id="entry_percentage"
                      type="number"
                      min={0}
                      max={100}
                      value={form.entry_percentage}
                      onChange={(e) => setField("entry_percentage", e.target.value)}
                    />
                  </Field>
                ) : null}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <Label htmlFor="entry_due_date">Vencimento da entrada</Label>
                  <Input
                    id="entry_due_date"
                    type="date"
                    value={form.entry_due_date}
                    onChange={(e) => setField("entry_due_date", e.target.value)}
                  />
                </Field>
                <Field>
                  <Label htmlFor="delivery_due_date">Vencimento da entrega</Label>
                  <Input
                    id="delivery_due_date"
                    type="date"
                    value={form.delivery_due_date}
                    onChange={(e) => setField("delivery_due_date", e.target.value)}
                  />
                </Field>
              </div>

              <label className="mt-4 flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={form.has_subscription}
                  onChange={(e) => setField("has_subscription", e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Inclui mensalidade recorrente
              </label>

              {form.has_subscription ? (
                <div className="mt-3 space-y-3 rounded-lg border border-border/60 bg-card/60 p-3">
                  <Field>
                    <Label htmlFor="subscription_label">Descrição</Label>
                    <Input
                      id="subscription_label"
                      value={form.subscription_label}
                      onChange={(e) => setField("subscription_label", e.target.value)}
                      placeholder="Ex: Manutenção mensal"
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field>
                      <Label htmlFor="subscription_amount">Valor mensal</Label>
                      <Input
                        id="subscription_amount"
                        value={form.subscription_amount}
                        onChange={(e) =>
                          setField("subscription_amount", maskCurrency(e.target.value))
                        }
                        placeholder="R$ 0,00"
                        inputMode="numeric"
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="subscription_due_day">Dia de vencimento</Label>
                      <Input
                        id="subscription_due_day"
                        type="number"
                        min={1}
                        max={31}
                        value={form.subscription_due_day}
                        onChange={(e) => setField("subscription_due_day", e.target.value)}
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="subscription_starts_on">Início</Label>
                      <Input
                        id="subscription_starts_on"
                        type="date"
                        value={form.subscription_starts_on}
                        onChange={(e) => setField("subscription_starts_on", e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field>
                    <Label htmlFor="subscription_ends_on">
                      Fim (opcional — em branco = indeterminado)
                    </Label>
                    <Input
                      id="subscription_ends_on"
                      type="date"
                      value={form.subscription_ends_on}
                      onChange={(e) => setField("subscription_ends_on", e.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            {/* Observations */}
            <Field>
              <Label htmlFor="observations">Observações</Label>
              <Textarea
                id="observations"
                value={form.observations}
                onChange={(e) => setField("observations", e.target.value)}
                placeholder="Notas internas ou comentarios adicionais..."
                rows={3}
              />
            </Field>

            {/* Document URL */}
            <Field>
              <Label htmlFor="document_url">Link do documento</Label>
              <Input
                id="document_url"
                value={form.document_url}
                onChange={(e) => setField("document_url", e.target.value)}
                placeholder="https://drive.google.com/..."
              />
              {form.document_url.trim() ? (
                <a
                  href={form.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Abrir link
                  <ExternalLink size={12} />
                </a>
              ) : null}
            </Field>

            {/* Technical Document URL */}
            <Field>
              <Label htmlFor="technical_document_url">Anexo tecnico (link)</Label>
              <Input
                id="technical_document_url"
                value={form.technical_document_url}
                onChange={(e) => setField("technical_document_url", e.target.value)}
                placeholder="https://drive.google.com/..."
              />
              {form.technical_document_url.trim() ? (
                <a
                  href={form.technical_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Abrir anexo tecnico
                  <ExternalLink size={12} />
                </a>
              ) : null}
            </Field>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleSaveDraft()}
                disabled={sending}
                loading={saving}
                loadingText="Salvando..."
              >
                Salvar rascunho
              </Button>
              <Button
                type="button"
                onClick={() => void handleSend()}
                disabled={saving || !canSend}
                loading={sending}
                loadingText="Enviando..."
                title={
                  !canSend ? "Preencha o destinatario e o link do documento para enviar" : undefined
                }
              >
                Enviar para cliente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ProposalRejectModal
        open={rejectModalOpen}
        submitting={rejecting}
        onCancel={() => {
          if (!rejecting) setRejectModalOpen(false);
        }}
        onConfirm={(reasonText) => void handleReject(reasonText)}
      />
    </div>
  );
}
