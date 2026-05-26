import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import {
  ArrowLeft,
  Building2,
  Clock,
  FileText,
  Mail,
  Phone,
  Send,
  Shield,
  Users,
} from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import ContactLinks from "@/components/portal/shared/ContactLinks";
import CopyLinkButton from "@/components/portal/shared/CopyLinkButton";
import NameAvatar from "@/components/portal/shared/NameAvatar";
import Pagination from "@/components/portal/shared/Pagination";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import StatusBadge from "@/components/portal/shared/StatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Field,
  Input,
  Label,
  Textarea,
} from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  type LeadDiagnosis,
  type LeadUrgency,
  URGENCY_OPTIONS,
  hasMinimalDiagnosis,
  isDiagnosisConcluded,
  parseLeadDiagnosis,
} from "@/lib/lead-diagnosis";
import { formatBRL, maskCurrency, unmaskCurrency, maskPhone } from "@/lib/masks";
import { formatPortalDate, formatPortalDateTime } from "@/lib/portal";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type InteractionRow = Database["public"]["Tables"]["lead_interactions"]["Row"];

type LeadStatus = "prospeccao" | "qualificado" | "proposta" | "ganho" | "perdido";
type InteractionType = "ligacao" | "email" | "reuniao" | "whatsapp" | "nota";

type StatusMeta = {
  label: string;
  tone: "secondary" | "accent" | "primary" | "warning" | "success" | "destructive";
};

const STATUS_META: Record<LeadStatus, StatusMeta> = {
  prospeccao: { label: "Prospecção", tone: "secondary" },
  qualificado: { label: "Qualificado", tone: "accent" },
  proposta: { label: "Proposta", tone: "primary" },
  ganho: { label: "Ganho", tone: "success" },
  perdido: { label: "Perdido", tone: "destructive" },
};

const INTERACTION_TYPE_LABEL: Record<InteractionType, string> = {
  ligacao: "Ligacao",
  email: "Email",
  reuniao: "Reuniao",
  whatsapp: "WhatsApp",
  nota: "Nota",
};

// PROBLEMA 13: alinhado com o CHECK constraint de leads.source
// (migration 20260416220000) que aceita 11 canais.
const SOURCE_LABEL: Record<string, string> = {
  inbound: "Inbound",
  site: "Site",
  formulario: "Formulário",
  rede_social: "Rede Social",
  whatsapp: "WhatsApp",
  reuniao: "Reunião",
  indicacao: "Indicação",
  cold: "Prospecção fria",
  prospeccao: "Prospecção",
  evento: "Evento",
  outro: "Outro",
};

const selectClass =
  "flex h-10 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/* ------------------------------------------------------------------ */
/*  Small presentational helpers                                       */
/* ------------------------------------------------------------------ */

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{value || "-"}</span>
    </div>
  );
}

function InteractionIcon({ type }: { type: string }) {
  const cls = "h-3.5 w-3.5";
  switch (type) {
    case "ligacao":
      return <Phone className={cls} />;
    case "email":
      return <Mail className={cls} />;
    case "reuniao":
      return <Users className={cls} />;
    case "whatsapp":
      return <Send className={cls} />;
    default:
      return <Clock className={cls} />;
  }
}

/* ------------------------------------------------------------------ */
/*  Form values & helpers                                              */
/* ------------------------------------------------------------------ */

type FormValues = {
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  estimated_value: string;
  probability: string;
  notes: string;
};

function leadToForm(lead: LeadRow): FormValues {
  return {
    name: lead.name,
    email: lead.email ?? "",
    phone: lead.phone ? maskPhone(lead.phone) : "",
    company: lead.company ?? "",
    source: lead.source,
    estimated_value: lead.estimated_value ? maskCurrency(String(lead.estimated_value)) : "",
    probability: String(lead.probability ?? 0),
    notes: lead.notes ?? "",
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [lead, setLead] = useState<LeadRow | null>(null);
  const [interactions, setInteractions] = useState<InteractionRow[]>([]);
  const [teamMap, setTeamMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormValues | null>(null);
  const [saving, setSaving] = useState(false);

  // New interaction form
  const [newType, setNewType] = useState<InteractionType>("nota");
  const [newNotes, setNewNotes] = useState("");
  const [addingInteraction, setAddingInteraction] = useState(false);

  // Lost reason
  const [showLostInput, setShowLostInput] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [markingLost, setMarkingLost] = useState(false);

  // Converting
  const [converting, setConverting] = useState(false);

  // Status change loading
  const [statusLoading, setStatusLoading] = useState(false);

  // Tabs — URL-based (mesmo padrao de ProjectDetail)
  type LeadTab = "dados" | "diagnostico" | "interacoes" | "propostas";
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs: LeadTab[] = ["dados", "diagnostico", "interacoes", "propostas"];
  const tabFromUrl = searchParams.get("tab") as LeadTab | null;
  const tab: LeadTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : "dados";
  const setTab = (next: LeadTab) => {
    if (next === "dados") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: next }, { replace: true });
    }
  };

  // Paginacao de interacoes
  const INTERACTIONS_PER_PAGE = 10;
  const [interactionsPage, setInteractionsPage] = useState(1);

  // Linked proposals
  type LinkedProposal = {
    id: string;
    title: string;
    status: string;
    total_amount: number;
    created_at: string;
  };
  const [linkedProposals, setLinkedProposals] = useState<LinkedProposal[]>([]);

  // Diagnostico estruturado (PROBLEMA 5)
  const [diagnosis, setDiagnosis] = useState<LeadDiagnosis>({});
  const [savingDiagnosis, setSavingDiagnosis] = useState(false);

  /* ---- Fetching -------------------------------------------------- */

  const fetchData = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    const [leadRes, interactionsRes, teamRes, proposalsRes] = await Promise.all([
      supabase.from("leads").select("*").eq("id", id).single(),
      supabase
        .from("lead_interactions")
        .select("*")
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("team_members").select("user_id, full_name"),
      supabase
        .from("proposals")
        .select("id, title, status, total_amount, created_at")
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (leadRes.error || !leadRes.data) {
      toast.error("Lead não encontrado.");
      navigate("/portal/admin/leads");
      return;
    }

    const teamMembers = (teamRes.data ?? []) as { user_id: string; full_name: string }[];
    const map: Record<string, string> = {};
    for (const m of teamMembers) {
      map[m.user_id] = m.full_name;
    }

    const leadData = leadRes.data as LeadRow;
    setLead(leadData);
    setDiagnosis(parseLeadDiagnosis((leadData as { diagnosis?: unknown }).diagnosis) ?? {});
    setInteractions((interactionsRes.data ?? []) as InteractionRow[]);
    setLinkedProposals((proposalsRes.data ?? []) as LinkedProposal[]);
    setTeamMap(map);
    setLoading(false);
  }, [id, navigate]);

  /* ---- Diagnostico handlers ------------------------------------- */

  function setDiagnosisField<K extends keyof LeadDiagnosis>(field: K, value: LeadDiagnosis[K]) {
    setDiagnosis((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSaveDiagnosis(opts: { concluding?: boolean } = {}) {
    if (!lead || savingDiagnosis) return;
    setSavingDiagnosis(true);
    try {
      const concluding = Boolean(opts.concluding);
      if (concluding && !hasMinimalDiagnosis(diagnosis)) {
        toast.error("Preencha contexto, problema e objetivo antes de concluir.");
        setSavingDiagnosis(false);
        return;
      }
      const payload: LeadDiagnosis = {
        ...diagnosis,
        concluded_at: concluding ? new Date().toISOString() : (diagnosis.concluded_at ?? null),
      };

      const { error: updateError } = await supabase
        .from("leads")
        .update({ diagnosis: payload as never, updated_at: new Date().toISOString() })
        .eq("id", lead.id);

      if (updateError) {
        toast.error("Erro ao salvar diagnóstico.", { description: updateError.message });
        return;
      }

      setDiagnosis(payload);

      // Ao concluir diagnostico em lead 'prospeccao', avancar para 'qualificado'.
      if (concluding && lead.status === "prospeccao") {
        const { error: statusError } = await supabase
          .from("leads")
          .update({ status: "qualificado", updated_at: new Date().toISOString() })
          .eq("id", lead.id);
        if (statusError) {
          toast.error("Diagnóstico salvo, mas falha ao avançar status.", {
            description: statusError.message,
          });
        } else {
          setLead({ ...lead, status: "qualificado", diagnosis: payload as never });
        }
      } else {
        setLead({ ...lead, diagnosis: payload as never });
      }

      // L1: Ao concluir diagnóstico, criar tarefa "Elaborar proposta"
      if (concluding) {
        void supabase.from("team_tasks").insert({
          title: `Elaborar proposta - ${lead.name}`,
          description: `Diagnóstico do lead "${lead.name}" foi concluído. Elabore e envie a proposta comercial.`,
          category: "comercial",
          status: "pendente",
          priority: "alta",
          client_id: null,
          role_visibility: ["admin_super", "admin", "comercial"],
          due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
          created_by: user?.id ?? null,
        });
      }

      toast.success(concluding ? "Diagnóstico concluído." : "Diagnóstico salvo.");
    } finally {
      setSavingDiagnosis(false);
    }
  }

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /* ---- Edit handlers --------------------------------------------- */

  function handleStartEdit() {
    if (!lead) return;
    setForm(leadToForm(lead));
    setEditing(true);
  }

  function handleCancelEdit() {
    setEditing(false);
    setForm(null);
  }

  function updateField(field: keyof FormValues, value: string) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleSave() {
    if (!lead || !form) return;

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast.error("O nome do lead e obrigatorio.");
      return;
    }

    const prob = Number(form.probability);
    if (Number.isNaN(prob) || prob < 0 || prob > 100) {
      toast.error("Probabilidade deve ser entre 0 e 100.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("leads")
      .update({
        name: trimmedName,
        email: form.email.trim() || null,
        phone: form.phone.replace(/\D/g, "") || null,
        company: form.company.trim() || null,
        source: form.source,
        estimated_value: unmaskCurrency(form.estimated_value),
        probability: prob,
        notes: form.notes.trim() || null,
      })
      .eq("id", lead.id);

    setSaving(false);

    if (error) {
      toast.error("Erro ao salvar alterações.");
      return;
    }

    toast.success("Lead atualizado com sucesso.");
    setEditing(false);
    setForm(null);
    void fetchData();
  }

  /* ---- Status change --------------------------------------------- */

  async function handleStatusChange(newStatus: LeadStatus) {
    if (!lead) return;

    setStatusLoading(true);
    const { error } = await supabase.from("leads").update({ status: newStatus }).eq("id", lead.id);

    setStatusLoading(false);

    if (error) {
      toast.error("Erro ao atualizar status.");
      return;
    }

    toast.success(`Status alterado para ${STATUS_META[newStatus].label}.`);
    void fetchData();
  }

  /* ---- Add interaction ------------------------------------------- */

  async function handleAddInteraction() {
    if (!lead || !newNotes.trim()) {
      toast.error("Preencha as notas da interacao.");
      return;
    }

    setAddingInteraction(true);
    const { error } = await supabase.from("lead_interactions").insert({
      lead_id: lead.id,
      type: newType,
      notes: newNotes.trim(),
      created_by: user?.id ?? null,
    });

    setAddingInteraction(false);

    if (error) {
      toast.error("Erro ao registrar interacao.");
      return;
    }

    toast.success("Interacao registrada.");
    setNewNotes("");
    setNewType("nota");
    void fetchData();
  }

  /* ---- Convert to client ----------------------------------------- */

  async function handleConvert() {
    if (!lead) return;

    setConverting(true);

    // Auditoria P-005: conversao agora e atomica via RPC. Antes eram 4
    // operacoes sequenciais sem transacao (insert client → update proposals
    // → update lead → insert timeline) com fire-and-forget no meio. Se
    // qualquer passo falhasse, dados parciais ficavam no banco.
    const { data: newClientId, error: rpcError } = await supabase.rpc("convert_lead_to_client", {
      p_lead_id: lead.id,
      p_overrides: {},
    });

    setConverting(false);

    if (rpcError || !newClientId) {
      toast.error("Erro ao converter lead.", {
        description: rpcError?.message ?? "Falha desconhecida.",
      });
      return;
    }

    toast.success("Lead convertido em cliente com sucesso!");
    navigate(`/portal/admin/clientes/${newClientId}`);
  }

  /* ---- Mark as lost ---------------------------------------------- */

  async function handleMarkLost() {
    if (!lead) return;

    setMarkingLost(true);
    const { error } = await supabase
      .from("leads")
      .update({ status: "perdido", lost_reason: lostReason.trim() || null })
      .eq("id", lead.id);

    setMarkingLost(false);

    if (error) {
      toast.error("Erro ao marcar como perdido.");
      return;
    }

    toast.success("Lead marcado como perdido.");
    setShowLostInput(false);
    setLostReason("");
    void fetchData();
  }

  /* ---- Render ---------------------------------------------------- */

  if (loading) return <PortalLoading />;

  if (!lead) {
    return (
      <AdminEmptyState
        icon={Users}
        title="Lead não encontrado"
        description="O lead solicitado não existe ou foi removido."
        action={
          <Link
            to="/portal/admin/leads"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Voltar para Leads
          </Link>
        }
      />
    );
  }

  const status = lead.status as LeadStatus;
  const statusMeta = STATUS_META[status] ?? STATUS_META.prospeccao;

  const canTransition = status !== "ganho" && status !== "perdido";

  // Build the quick status buttons: show statuses the lead can move to
  const statusFlow: LeadStatus[] = ["qualificado", "proposta"];
  const availableStatuses = canTransition ? statusFlow.filter((s) => s !== status) : [];

  const paginatedInteractions = interactions.slice(
    (interactionsPage - 1) * INTERACTIONS_PER_PAGE,
    interactionsPage * INTERACTIONS_PER_PAGE
  );

  const leadTabs: { key: LeadTab; label: string }[] = [
    { key: "dados", label: "Dados do Lead" },
    {
      key: "diagnostico",
      label: isDiagnosisConcluded(diagnosis) ? "Diagnóstico ✓" : "Diagnóstico",
    },
    { key: "interacoes", label: `Interações (${interactions.length})` },
    ...(linkedProposals.length > 0
      ? [{ key: "propostas" as LeadTab, label: `Propostas (${linkedProposals.length})` }]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* Header ---------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/portal/admin/crm"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9 w-9 p-0")}
            aria-label="Voltar para CRM"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <NameAvatar size="md" name={lead.name} className="shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-foreground">{lead.name}</h1>
            {lead.company && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {lead.company}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          <CopyLinkButton />
          {availableStatuses.map((s) => (
            <Button
              key={s}
              variant="outline"
              size="sm"
              disabled={statusLoading}
              onClick={() => void handleStatusChange(s)}
            >
              {STATUS_META[s].label}
            </Button>
          ))}
          {canTransition && isDiagnosisConcluded(diagnosis) && (
            <Link
              to={`/portal/admin/propostas/nova?lead_id=${id}`}
              className={buttonVariants({ size: "sm" })}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Criar proposta
            </Link>
          )}
        </div>
      </div>

      {/* Tabs ------------------------------------------------------- */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border/60 bg-card p-1">
        {leadTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "min-h-[40px] min-w-fit whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-all",
              tab === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: DADOS ═══ */}
      {tab === "dados" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-border/70 bg-card/92">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Informações</CardTitle>
              {!editing ? (
                <Button variant="outline" size="sm" onClick={handleStartEdit}>
                  Editar
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" disabled={saving} onClick={handleCancelEdit}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    loading={saving}
                    loadingText="Salvando..."
                    onClick={() => void handleSave()}
                  >
                    Salvar
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {editing && form ? (
                <div className="space-y-4">
                  <Field>
                    <Label required>Nome</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => updateField("name", e.target.value)}
                    />
                  </Field>
                  <Field>
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                    />
                  </Field>
                  <Field>
                    <Label>Telefone</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => updateField("phone", maskPhone(e.target.value))}
                    />
                  </Field>
                  <Field>
                    <Label>Empresa</Label>
                    <Input
                      value={form.company}
                      onChange={(e) => updateField("company", e.target.value)}
                    />
                  </Field>
                  <Field>
                    <Label>Origem</Label>
                    <select
                      className={selectClass}
                      value={form.source}
                      onChange={(e) => updateField("source", e.target.value)}
                    >
                      {Object.entries(SOURCE_LABEL).map(([val, lbl]) => (
                        <option key={val} value={val}>
                          {lbl}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    <Label>Valor estimado</Label>
                    <Input
                      value={form.estimated_value}
                      onChange={(e) => updateField("estimated_value", maskCurrency(e.target.value))}
                    />
                  </Field>
                  <Field>
                    <Label>Probabilidade (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={form.probability}
                      onChange={(e) => updateField("probability", e.target.value)}
                    />
                  </Field>
                  <Field>
                    <Label>Notas</Label>
                    <Textarea
                      rows={4}
                      value={form.notes}
                      onChange={(e) => updateField("notes", e.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <div className="space-y-3">
                  <InfoRow label="Nome" value={lead.name} />
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Contato
                    </span>
                    <ContactLinks
                      email={lead.email}
                      phone={lead.phone}
                      phoneDisplay={lead.phone ? maskPhone(lead.phone) : null}
                      whatsappMessage={`Olá ${lead.name.split(" ")[0]}, aqui é da Elkys. Tudo bem?`}
                    />
                  </div>
                  <InfoRow label="Empresa" value={lead.company} />
                  <InfoRow label="Origem" value={SOURCE_LABEL[lead.source] ?? lead.source} />
                  <InfoRow
                    label="Valor estimado"
                    value={lead.estimated_value ? formatBRL(lead.estimated_value) : null}
                  />
                  <InfoRow label="Probabilidade" value={`${lead.probability}%`} />
                  <InfoRow label="Notas" value={lead.notes} />
                  <InfoRow label="Criado em" value={formatPortalDateTime(lead.created_at)} />
                  {lead.lost_reason && <InfoRow label="Motivo da perda" value={lead.lost_reason} />}
                  {lead.converted_client_id && (
                    <div className="pt-2">
                      <Link
                        to={`/portal/admin/clientes/${lead.converted_client_id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Ver cliente convertido
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ações rápidas */}
          {canTransition && (
            <Card className="border-border/70 bg-card/92">
              <CardHeader>
                <CardTitle className="text-base">Ações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  variant="default"
                  size="sm"
                  disabled={converting}
                  onClick={() => void handleConvert()}
                >
                  {converting ? "Convertendo..." : "Converter em Cliente"}
                </Button>
                {!showLostInput ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setShowLostInput(true)}
                  >
                    Marcar como perdido
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <Field>
                      <Label>Motivo da perda</Label>
                      <Input
                        value={lostReason}
                        onChange={(e) => setLostReason(e.target.value)}
                        placeholder="Ex: Preco, concorrente, timing..."
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        loading={markingLost}
                        loadingText="Salvando..."
                        onClick={() => void handleMarkLost()}
                      >
                        Confirmar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowLostInput(false);
                          setLostReason("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══ TAB: DIAGNÓSTICO ═══ */}
      {tab === "diagnostico" && (
        <Card className="border-border/70 bg-card/92">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Diagnóstico</CardTitle>
              {isDiagnosisConcluded(diagnosis) ? (
                <p className="mt-1 text-xs text-success">
                  Concluído em{" "}
                  {diagnosis.concluded_at ? formatPortalDateTime(diagnosis.concluded_at) : "—"}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Consolide contexto, problema, objetivo e mais antes de criar a proposta.
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <Field>
                <Label>Contexto do cliente</Label>
                <Textarea
                  value={diagnosis.context ?? ""}
                  onChange={(e) => setDiagnosisField("context", e.target.value)}
                  placeholder="Quem é o cliente, o que faz, momento atual..."
                  rows={3}
                />
              </Field>
              <Field>
                <Label>Problema atual</Label>
                <Textarea
                  value={diagnosis.problem ?? ""}
                  onChange={(e) => setDiagnosisField("problem", e.target.value)}
                  placeholder="Qual a dor concreta que ele quer resolver?"
                  rows={3}
                />
              </Field>
              <Field>
                <Label>Objetivo</Label>
                <Textarea
                  value={diagnosis.objective ?? ""}
                  onChange={(e) => setDiagnosisField("objective", e.target.value)}
                  placeholder="Qual o resultado esperado ao final do projeto?"
                  rows={2}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <Label>Urgência</Label>
                  <select
                    className={selectClass}
                    value={diagnosis.urgency ?? ""}
                    onChange={(e) =>
                      setDiagnosisField("urgency", (e.target.value || null) as LeadUrgency | null)
                    }
                  >
                    <option value="">Não definida</option>
                    {URGENCY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <Label>Expectativa</Label>
                  <Input
                    value={diagnosis.expectation ?? ""}
                    onChange={(e) => setDiagnosisField("expectation", e.target.value)}
                    placeholder="Prazo, formato, entregáveis..."
                  />
                </Field>
              </div>
              <Field>
                <Label>Escopo inicial</Label>
                <Textarea
                  value={diagnosis.initial_scope ?? ""}
                  onChange={(e) => setDiagnosisField("initial_scope", e.target.value)}
                  placeholder="Solução preliminar discutida..."
                  rows={2}
                />
              </Field>
              <Field>
                <Label>Restrições</Label>
                <Textarea
                  value={diagnosis.constraints ?? ""}
                  onChange={(e) => setDiagnosisField("constraints", e.target.value)}
                  placeholder="Tecnologias obrigatórias, integrações, prazos rígidos..."
                  rows={2}
                />
              </Field>
              <Field>
                <Label>Impacto no negócio</Label>
                <Textarea
                  value={diagnosis.business_impact ?? ""}
                  onChange={(e) => setDiagnosisField("business_impact", e.target.value)}
                  placeholder="O que muda para o cliente quando o projeto for entregue?"
                  rows={2}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
              <Button
                variant="outline"
                size="sm"
                loading={savingDiagnosis}
                loadingText="Salvando..."
                onClick={() => void handleSaveDiagnosis()}
              >
                Salvar
              </Button>
              {!isDiagnosisConcluded(diagnosis) && (
                <Button
                  size="sm"
                  disabled={savingDiagnosis || !hasMinimalDiagnosis(diagnosis)}
                  onClick={() => void handleSaveDiagnosis({ concluding: true })}
                >
                  Concluir diagnóstico
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ TAB: INTERAÇÕES ═══ */}
      {tab === "interacoes" && (
        <Card className="border-border/70 bg-card/92">
          <CardHeader>
            <CardTitle className="text-base">Interações ({interactions.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-4">
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <Field>
                  <Label>Tipo</Label>
                  <select
                    className={selectClass}
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as InteractionType)}
                  >
                    {Object.entries(INTERACTION_TYPE_LABEL).map(([val, lbl]) => (
                      <option key={val} value={val}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <Label>Notas</Label>
                  <Textarea
                    rows={2}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Descreva a interacao..."
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={addingInteraction || !newNotes.trim()}
                  onClick={() => void handleAddInteraction()}
                >
                  {addingInteraction ? "Registrando..." : "Registrar"}
                </Button>
              </div>
            </div>

            {interactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma interacao registrada.
              </p>
            ) : (
              <>
                <div className="relative space-y-0 pl-6">
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border/60" />
                  {paginatedInteractions.map((interaction) => (
                    <div key={interaction.id} className="relative pb-4">
                      <div className="absolute -left-6 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-border bg-card">
                        <InteractionIcon type={interaction.type} />
                      </div>
                      <div className="rounded-lg border border-border/50 bg-card/92 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {INTERACTION_TYPE_LABEL[interaction.type as InteractionType] ??
                                interaction.type}
                            </span>
                            {interaction.created_by && teamMap[interaction.created_by] && (
                              <span className="text-[10px] text-muted-foreground">
                                por {teamMap[interaction.created_by]}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {formatPortalDateTime(interaction.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-foreground">
                          {interaction.notes}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {interactions.length > INTERACTIONS_PER_PAGE && (
                  <Pagination
                    page={interactionsPage}
                    totalPages={Math.ceil(interactions.length / INTERACTIONS_PER_PAGE)}
                    totalItems={interactions.length}
                    pageSize={INTERACTIONS_PER_PAGE}
                    onPageChange={setInteractionsPage}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ TAB: PROPOSTAS ═══ */}
      {tab === "propostas" && linkedProposals.length > 0 && (
        <Card className="border-border/70 bg-card/92">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Propostas vinculadas ({linkedProposals.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {linkedProposals.map((p) => (
              <Link
                key={p.id}
                to={`/portal/admin/propostas/${p.id}`}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-background/60 px-4 py-3 transition-colors hover:border-primary/30 hover:bg-card"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground" title={p.title}>
                    {p.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatPortalDate(p.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
                    {formatBRL(Number(p.total_amount))}
                  </span>
                  <StatusBadge
                    label={
                      p.status === "rascunho"
                        ? "Rascunho"
                        : p.status === "enviada"
                          ? "Enviada"
                          : p.status === "aprovada"
                            ? "Aprovada"
                            : p.status === "rejeitada"
                              ? "Rejeitada"
                              : "Expirada"
                    }
                    tone={
                      p.status === "aprovada"
                        ? "success"
                        : p.status === "rejeitada"
                          ? "destructive"
                          : p.status === "enviada"
                            ? "accent"
                            : p.status === "expirada"
                              ? "warning"
                              : "secondary"
                    }
                  />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
