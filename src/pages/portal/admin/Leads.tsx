import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Shield, Target, TrendingUp, Users, Search } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import NameAvatar from "@/components/portal/shared/NameAvatar";
import MetricTile from "@/components/portal/shared/MetricTile";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import ExportMenu from "@/components/portal/shared/ExportMenu";
import StatusBadge from "@/components/portal/shared/StatusBadge";
import InlineStatusSelect, {
  type InlineStatusOption,
} from "@/components/portal/shared/InlineStatusSelect";
import { Button, Card, CardContent, Input, Field, Label, Textarea, cn } from "@/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  computeLeadConversionRate,
  computeNewLeadsInWindow,
  computeTopLeadSources,
} from "@/lib/crm-metrics";
import { exportCSV, exportPDF, type ExportColumn } from "@/lib/export";
import { formatBRL, maskCurrency, unmaskCurrency, maskPhone, toCents } from "@/lib/masks";
import { formatPortalDate } from "@/lib/portal";
import { toast } from "sonner";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

type LeadStatus = "prospeccao" | "qualificado" | "proposta" | "ganho" | "perdido";

const STATUS_META: {
  key: LeadStatus;
  label: string;
  tone: "secondary" | "accent" | "primary" | "warning" | "success" | "destructive";
}[] = [
  { key: "prospeccao", label: "Prospecção", tone: "secondary" },
  { key: "qualificado", label: "Qualificado", tone: "accent" },
  { key: "proposta", label: "Proposta", tone: "primary" },
  { key: "ganho", label: "Ganho", tone: "success" },
  { key: "perdido", label: "Perdido", tone: "destructive" },
];

const STATUS_MAP = Object.fromEntries(STATUS_META.map((s) => [s.key, s])) as Record<
  LeadStatus,
  (typeof STATUS_META)[number]
>;

// Espelha STATUS_META no formato esperado pelo InlineStatusSelect — mesma
// label, mesmo tone, ordem preservada (segue o fluxo do funil).
const LEAD_STATUS_OPTIONS: InlineStatusOption<LeadStatus>[] = STATUS_META.map((s) => ({
  value: s.key,
  label: s.label,
  tone: s.tone,
}));

const COLUMN_ACCENT: Record<LeadStatus, string> = {
  prospeccao: "border-t-secondary",
  qualificado: "border-t-accent",
  proposta: "border-t-primary",
  ganho: "border-t-success",
  perdido: "border-t-destructive",
};

const COLUMN_COUNT_BG: Record<LeadStatus, string> = {
  prospeccao: "bg-secondary/15 text-secondary-foreground",
  qualificado: "bg-accent/15 text-accent",
  proposta: "bg-primary/15 text-primary",
  ganho: "bg-success/15 text-success",
  perdido: "bg-destructive/15 text-destructive",
};

const SOURCE_LABELS: Record<string, string> = {
  inbound: "Inbound",
  indicacao: "Indicacao",
  rede_social: "Rede Social",
  evento: "Evento",
  cold: "Cold",
  outro: "Outro",
};

type ViewMode = "kanban" | "lista";

function LeadCard({ lead }: { lead: LeadRow }) {
  const meta = STATUS_MAP[lead.status as LeadStatus];

  return (
    <Link
      to={`/portal/admin/leads/${lead.id}`}
      className="flex h-full flex-col rounded-xl border border-border/60 bg-background/70 p-3 transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start gap-2.5">
        <NameAvatar size="sm" name={lead.name} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold leading-tight text-foreground line-clamp-2">
            {lead.name}
          </h4>
          <p
            className="mt-1 min-h-[1.25rem] truncate text-xs text-muted-foreground"
            title={lead.company ?? undefined}
          >
            {lead.company || "\u00A0"}
          </p>
        </div>
      </div>

      <p className="mt-2 text-xs font-semibold text-foreground">
        {lead.estimated_value > 0 ? formatBRL(lead.estimated_value) : "\u00A0"}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {meta && <StatusBadge label={meta.label} tone={meta.tone} />}
        {lead.source && SOURCE_LABELS[lead.source] && (
          <StatusBadge label={SOURCE_LABELS[lead.source]} tone="muted" />
        )}
      </div>
    </Link>
  );
}

function SortableLeadCard({ lead }: { lead: LeadRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCard lead={lead} />
    </div>
  );
}

function DroppableLeadColumn({ status, children }: { status: LeadStatus; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-1 flex-col gap-2 px-2 pb-3 transition-colors",
        isOver && "bg-primary/5"
      )}
    >
      {children}
    </div>
  );
}

export default function Leads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("kanban");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    // Resolve target column: either dropped on the column container or on a card.
    let targetStatus: LeadStatus | null = null;
    if (STATUS_META.some((s) => s.key === over.id)) {
      targetStatus = over.id as LeadStatus;
    } else {
      const overLead = leads.find((l) => l.id === over.id);
      if (overLead) targetStatus = overLead.status as LeadStatus;
    }

    if (!targetStatus || targetStatus === lead.status) return;

    const previousStatus = lead.status as LeadStatus;

    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: targetStatus! } : l)));

    const { error: updateError } = await supabase
      .from("leads")
      .update({ status: targetStatus })
      .eq("id", leadId);

    if (updateError) {
      // Revert on failure
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: previousStatus } : l)));
      toast.error("Erro ao mover lead.", { description: updateError.message });
      return;
    }

    toast.success(`Lead movido para ${STATUS_MAP[targetStatus].label}.`);
  };

  // Inline-edit pela tabela (view de lista). Mesma logica do drag-drop do
  // kanban: optimistic update + revert em erro + toast. Sem cascata: a
  // edge function/sync (ex. conversao do lead em cliente) e disparada
  // separadamente em LeadDetail quando o time finaliza o lead.
  const [quickLeadStatusId, setQuickLeadStatusId] = useState<string | null>(null);
  const handleQuickChangeLeadStatus = async (lead: LeadRow, newStatus: LeadStatus) => {
    if (newStatus === lead.status) return;
    if (quickLeadStatusId) return;
    setQuickLeadStatusId(lead.id);
    const previousStatus = lead.status as LeadStatus;
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: newStatus } : l)));
    const { error: updateError } = await supabase
      .from("leads")
      .update({ status: newStatus })
      .eq("id", lead.id);
    if (updateError) {
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status: previousStatus } : l))
      );
      setQuickLeadStatusId(null);
      toast.error("Erro ao atualizar status.", { description: updateError.message });
      return;
    }
    setQuickLeadStatusId(null);
    toast.success("Status atualizado.", {
      description: `${lead.name} → ${STATUS_MAP[newStatus].label}`,
      action: {
        label: "Desfazer",
        onClick: async () => {
          setLeads((prev) =>
            prev.map((l) => (l.id === lead.id ? { ...l, status: previousStatus } : l))
          );
          const { error: undoError } = await supabase
            .from("leads")
            .update({ status: previousStatus })
            .eq("id", lead.id);
          if (undoError) {
            toast.error("Não foi possível desfazer.", { description: undoError.message });
          }
        },
      },
    });
  };

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formSource, setFormSource] = useState("inbound");
  const [formValue, setFormValue] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("leads")
      .select(
        "id, name, email, phone, company, source, status, estimated_value, probability, notes, created_at"
      )
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    setLeads((data ?? []) as LeadRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resetForm = () => {
    setFormName("");
    setFormEmail("");
    setFormPhone("");
    setFormCompany("");
    setFormSource("inbound");
    setFormValue("");
    setFormNotes("");
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error("Nome e obrigatorio.");
      return;
    }

    setSaving(true);

    const { error: insertError } = await supabase.from("leads").insert({
      name: formName.trim(),
      email: formEmail.trim() || null,
      phone: formPhone.trim() || null,
      company: formCompany.trim() || null,
      source: formSource,
      estimated_value: formValue ? unmaskCurrency(formValue) : 0,
      notes: formNotes.trim() || null,
      status: "prospeccao",
      probability: 0,
      created_by: user?.id ?? null,
    });

    setSaving(false);

    if (insertError) {
      toast.error("Erro ao criar lead: " + insertError.message);
      return;
    }

    toast.success("Lead criado com sucesso!");
    resetForm();
    setShowForm(false);
    void loadData();
  };

  // Metrics
  const totalLeads = leads.length;

  // Pipeline = leads em 'proposta' (mesma definicao usada em Overview/Financeiro:
  // "proposta em diante", excluindo prospeccao/qualificado/ganho/perdido).
  const pipelineValue = useMemo(
    () =>
      leads
        .filter((l) => l.status === "proposta")
        .reduce((sum, l) => sum + toCents(l.estimated_value ?? 0), 0) / 100,
    [leads]
  );

  // Taxa de conversao: ganho / (ganho + perdido) — fonte unica testada.
  // Veja docstring de computeLeadConversionRate.
  const conversionRate = useMemo(() => computeLeadConversionRate(leads), [leads]);

  // Janela rolling 7d — fonte unica testada.
  const newLast7Days = useMemo(() => computeNewLeadsInWindow(leads, 7, new Date()), [leads]);

  // Top fontes normalizadas (trim + lowercase) — fonte unica testada.
  const topSources = useMemo(() => computeTopLeadSources(leads, 3), [leads]);

  // Grouped for Kanban
  const grouped = useMemo(() => {
    const map: Record<LeadStatus, LeadRow[]> = {
      prospeccao: [],
      qualificado: [],
      proposta: [],
      ganho: [],
      perdido: [],
    };

    for (const lead of leads) {
      const key = lead.status as LeadStatus;
      if (key in map) {
        map[key].push(lead);
      }
    }

    return map;
  }, [leads]);

  const exportColumns: ExportColumn[] = [
    { key: "name", label: "Nome" },
    { key: "company", label: "Empresa" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Telefone" },
    { key: "value", label: "Valor", align: "right" },
    { key: "probability", label: "Probabilidade", align: "right" },
    { key: "source", label: "Fonte" },
    { key: "status", label: "Status" },
  ];

  const exportRows = leads.map((l) => ({
    name: l.name,
    company: l.company ?? "-",
    email: l.email ?? "-",
    phone: l.phone ?? "-",
    value: l.estimated_value > 0 ? formatBRL(l.estimated_value) : "-",
    probability: l.probability > 0 ? `${l.probability}%` : "-",
    source: SOURCE_LABELS[l.source] ?? l.source,
    status: STATUS_MAP[l.status as LeadStatus]?.label ?? l.status,
  }));

  const handleExportCSV = () =>
    exportCSV({ title: "Leads", filename: "leads", columns: exportColumns, rows: exportRows });
  const handleExportPDF = () =>
    exportPDF({
      title: "Relatorio de Leads",
      subtitle: `${leads.length} leads | Pipeline: ${formatBRL(pipelineValue)}`,
      filename: "leads",
      columns: exportColumns,
      rows: exportRows,
    });

  if (loading) return <PortalLoading />;

  if (error) {
    return (
      <AdminEmptyState
        icon={Target}
        title="Erro ao carregar leads"
        description={error}
        action={
          <Button type="button" onClick={() => void loadData()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  if (leads.length === 0 && !showForm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Button type="button" onClick={() => setShowForm(true)}>
            Novo Lead
          </Button>
        </div>

        {showForm && inlineFormJSX}

        <AdminEmptyState
          icon={Users}
          title="Nenhum lead cadastrado"
          description="Cadastre leads para acompanhar seu funil de vendas."
          action={
            <Button type="button" onClick={() => setShowForm(true)}>
              Novo Lead
            </Button>
          }
        />
      </div>
    );
  }

  const inlineFormJSX = (
    <Card className="rounded-2xl border-border/80 bg-card/95">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Novo Lead
        </h3>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <Label htmlFor="lead-name" required>
              Nome
            </Label>
            <Input
              id="lead-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Nome do lead"
            />
          </Field>

          <Field>
            <Label htmlFor="lead-email">Email</Label>
            <Input
              id="lead-email"
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </Field>

          <Field>
            <Label htmlFor="lead-phone">Telefone</Label>
            <Input
              id="lead-phone"
              value={formPhone}
              onChange={(e) => setFormPhone(maskPhone(e.target.value))}
              placeholder="(00) 00000-0000"
            />
          </Field>

          <Field>
            <Label htmlFor="lead-company">Empresa</Label>
            <Input
              id="lead-company"
              value={formCompany}
              onChange={(e) => setFormCompany(e.target.value)}
              placeholder="Nome da empresa"
            />
          </Field>

          <Field>
            <Label htmlFor="lead-source">Fonte</Label>
            <select
              id="lead-source"
              value={formSource}
              onChange={(e) => setFormSource(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <Label htmlFor="lead-value">Valor estimado</Label>
            <Input
              id="lead-value"
              value={formValue}
              onChange={(e) => setFormValue(maskCurrency(e.target.value))}
              placeholder="R$ 0,00"
            />
          </Field>
        </div>

        <Field>
          <Label htmlFor="lead-notes">Observacoes</Label>
          <Textarea
            id="lead-notes"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Anotacoes sobre o lead..."
            rows={3}
          />
        </Field>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => void handleSave()}
            loading={saving}
            loadingText="Salvando..."
          >
            Salvar Lead
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowForm(false);
              resetForm();
            }}
          >
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Metrics row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Total de Leads" value={String(totalLeads)} icon={Users} tone="primary" />
        <MetricTile
          label="Novos (7 dias)"
          value={String(newLast7Days)}
          icon={TrendingUp}
          tone={newLast7Days > 0 ? "accent" : "secondary"}
          hint="Criados na ultima semana"
        />
        <MetricTile
          label="Pipeline estimado"
          value={formatBRL(pipelineValue)}
          icon={TrendingUp}
          tone="accent"
          hint="Leads em proposta"
        />
        <MetricTile
          label="Taxa de conversao"
          value={`${conversionRate}%`}
          icon={Target}
          tone="success"
        />
      </div>

      {topSources.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/60 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Top fontes
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {topSources.map(([source, count]) => (
              <span
                key={source}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-0.5 text-xs text-foreground"
              >
                <span className="font-medium capitalize">{source.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">· {count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar: view toggle + new lead */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border/70 bg-muted/50 p-0.5">
          <button
            type="button"
            onClick={() => setView("kanban")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              view === "kanban"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setView("lista")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              view === "lista"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Lista
          </button>
        </div>

        <div className="flex items-center gap-2">
          <ExportMenu onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} />
          <Button type="button" onClick={() => setShowForm((prev) => !prev)}>
            {showForm ? "Fechar formulario" : "Novo Lead"}
          </Button>
        </div>
      </div>

      {/* Inline form */}
      {showForm && inlineFormJSX}

      {/* Kanban View */}
      {view === "kanban" && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={(e) => void handleDragEnd(e)}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {STATUS_META.map((col) => {
              const columnLeads = grouped[col.key] ?? [];
              const columnTotal = columnLeads.reduce(
                (sum, lead) => sum + (lead.estimated_value ?? 0),
                0
              );
              return (
                <div
                  key={col.key}
                  className={cn(
                    "flex flex-col rounded-2xl border border-border/70 border-t-[3px] bg-card/60",
                    COLUMN_ACCENT[col.key]
                  )}
                >
                  {/* Column header */}
                  <div className="flex flex-col gap-1.5 p-3 pb-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {col.label}
                      </h3>
                      <span
                        className={cn(
                          "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                          COLUMN_COUNT_BG[col.key]
                        )}
                      >
                        {columnLeads.length}
                      </span>
                    </div>
                    {columnTotal > 0 ? (
                      <p
                        className="text-xs font-semibold text-foreground"
                        title={`Soma de estimated_value dos ${columnLeads.length} leads nesta coluna`}
                      >
                        {formatBRL(columnTotal)}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/70">Sem valor estimado</p>
                    )}
                  </div>

                  {/* Cards — sortable + droppable column */}
                  <SortableContext
                    id={col.key}
                    items={columnLeads.map((l) => l.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <DroppableLeadColumn status={col.key}>
                      {columnLeads.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center rounded-xl bg-muted/20 p-6">
                          <p className="text-center text-xs text-muted-foreground">Nenhum lead</p>
                        </div>
                      ) : (
                        columnLeads.map((lead) => <SortableLeadCard key={lead.id} lead={lead} />)
                      )}
                    </DroppableLeadColumn>
                  </SortableContext>
                </div>
              );
            })}
          </div>
        </DndContext>
      )}

      {/* List View */}
      {view === "lista" && (
        <Card className="overflow-hidden rounded-2xl border-border/70">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Nome
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Empresa
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Valor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Probabilidade
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Fonte
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Data criacao
                  </th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const meta = STATUS_MAP[lead.status as LeadStatus];
                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-border/40 transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/portal/admin/leads/${lead.id}`}
                          className="flex items-center gap-2.5 font-medium text-foreground hover:text-primary hover:underline"
                        >
                          <NameAvatar size="sm" name={lead.name} className="shrink-0" />
                          <span>{lead.name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{lead.company ?? "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-foreground">
                        {lead.estimated_value > 0 ? formatBRL(lead.estimated_value) : "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {lead.probability > 0 ? `${lead.probability}%` : "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {SOURCE_LABELS[lead.source] ?? lead.source}
                      </td>
                      <td className="px-4 py-3">
                        {meta ? (
                          <InlineStatusSelect
                            value={lead.status as LeadStatus}
                            options={LEAD_STATUS_OPTIONS}
                            loading={quickLeadStatusId === lead.id}
                            onSelect={(next) => handleQuickChangeLeadStatus(lead, next)}
                          />
                        ) : (
                          <span className="text-muted-foreground">{lead.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatPortalDate(lead.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
