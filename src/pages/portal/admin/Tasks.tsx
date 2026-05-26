import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";

import { CheckCircle, Clock, ExternalLink, Target, X } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Field,
  Textarea,
  cn,
} from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import { getLocalDateIso } from "@/lib/masks";
import { getSupabaseFunctionAuthHeaders } from "@/lib/supabase-functions";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TeamTask {
  id: string;
  assigned_to: string | null;
  created_by: string | null;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  due_date: string | null;
  starts_at: string | null;
  ends_at: string | null;
  project_id: string | null;
  client_id: string | null;
  ticket_id: string | null;
  google_event_id: string | null;
  google_meet_link: string | null;
  role_visibility: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  user_id: string;
  full_name: string;
  system_role: string;
  is_active: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type ColumnKey = "pendente" | "em_progresso" | "pausada" | "validacao" | "concluida";

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "pendente", label: "Pendente" },
  { key: "em_progresso", label: "Em progresso" },
  { key: "pausada", label: "Pausada" },
  { key: "validacao", label: "Validação" },
  { key: "concluida", label: "Concluída" },
];

const COLUMN_ACCENT: Record<ColumnKey, string> = {
  pendente: "border-t-warning",
  em_progresso: "border-t-accent",
  pausada: "border-t-secondary",
  validacao: "border-t-primary",
  concluida: "border-t-success",
};

const COLUMN_COUNT_BG: Record<ColumnKey, string> = {
  pendente: "bg-warning/15 text-warning",
  em_progresso: "bg-accent/15 text-accent",
  pausada: "bg-secondary/15 text-secondary-foreground",
  validacao: "bg-primary/15 text-primary",
  concluida: "bg-success/15 text-success",
};

// Paleta de categoria via tokens DS (--elk-category-*, ver _tokens.scss).
// Dot usa `bg-[hsl(var(--...))]` — classe arbitraria reconhece tokens sem
// precisar estender tailwind.config. Responde a dark mode via override do token.
const CATEGORIES = [
  {
    value: "desenvolvimento",
    label: "Desenvolvimento",
    color: "bg-[hsl(var(--elk-category-desenvolvimento))]",
  },
  {
    value: "comercial",
    label: "Comercial",
    color: "bg-[hsl(var(--elk-category-comercial))]",
  },
  {
    value: "financeiro",
    label: "Financeiro",
    color: "bg-[hsl(var(--elk-category-financeiro))]",
  },
  { value: "juridico", label: "Jurídico", color: "bg-[hsl(var(--elk-category-juridico))]" },
  { value: "marketing", label: "Marketing", color: "bg-[hsl(var(--elk-category-marketing))]" },
  { value: "suporte", label: "Suporte", color: "bg-[hsl(var(--elk-category-suporte))]" },
  { value: "reuniao", label: "Reunião", color: "bg-[hsl(var(--elk-category-reuniao))]" },
  { value: "geral", label: "Geral", color: "bg-[hsl(var(--elk-category-geral))]" },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

// Prioridades mapeadas para tokens semanticos (destructive/warning/accent/success)
// — preserva gradiente de urgencia e dark-mode consistency do DS.
const PRIORITIES = [
  {
    value: "urgente",
    label: "Urgente",
    dot: "bg-destructive",
    badge: "border-destructive/30 bg-destructive/15 text-destructive",
    rank: 0,
  },
  {
    value: "alta",
    label: "Alta",
    dot: "bg-warning",
    badge: "border-warning/30 bg-warning/15 text-warning",
    rank: 1,
  },
  {
    value: "media",
    label: "Média",
    dot: "bg-accent",
    badge: "border-accent/30 bg-accent/15 text-accent",
    rank: 2,
  },
  {
    value: "baixa",
    label: "Baixa",
    dot: "bg-success",
    badge: "border-success/30 bg-success/15 text-success",
    rank: 3,
  },
];

const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map((p) => [p.value, p]));

const SORT_OPTIONS = [
  { value: "default", label: "Padrão (mais recentes)" },
  { value: "due_asc", label: "Prazo (mais próximo)" },
  { value: "due_desc", label: "Prazo (mais distante)" },
  { value: "priority", label: "Prioridade" },
  { value: "title", label: "Título (A-Z)" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["value"];

const DEADLINE_OPTIONS = [
  { value: "", label: "Sem prazo" },
  { value: "3", label: "3 dias" },
  { value: "7", label: "1 semana" },
  { value: "14", label: "2 semanas" },
  { value: "21", label: "3 semanas" },
  { value: "30", label: "1 mês" },
  { value: "custom", label: "Data específica" },
];

const ASSIGNABLE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "comercial", label: "Comercial" },
  { value: "financeiro", label: "Financeiro" },
  { value: "juridico", label: "Jurídico" },
  { value: "developer", label: "Desenvolvedor" },
  { value: "designer", label: "Designer" },
  { value: "po", label: "Product Owner" },
  { value: "marketing", label: "Marketing" },
  { value: "support", label: "Suporte" },
];

const selectClass =
  "flex h-9 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatShortDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function isOverdue(dueDate: string | null, status: string) {
  if (!dueDate || status === "concluida") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return dueDate < todayStr;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return getLocalDateIso(d);
}

function toDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function daysRemaining(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const diff = Math.ceil(
    (new Date(dueDate + "T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0)) /
      (1000 * 60 * 60 * 24)
  );
  if (diff < 0) return `${Math.abs(diff)}d atrasado`;
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return `${diff}d restantes`;
}

/* ------------------------------------------------------------------ */
/*  Sortable Task Card                                                 */
/* ------------------------------------------------------------------ */

function SortableTaskCard({
  task,
  memberMap,
  onClick,
}: {
  task: TeamTask;
  memberMap: Map<string, TeamMember>;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCardInner task={task} memberMap={memberMap} onClick={onClick} />
    </div>
  );
}

function TaskCardInner({
  task,
  memberMap,
  onClick,
}: {
  task: TeamTask;
  memberMap: Map<string, TeamMember>;
  onClick?: () => void;
}) {
  const cat = CATEGORY_MAP[task.category];
  const pri = PRIORITY_MAP[task.priority];
  const overdue = isOverdue(task.due_date, task.status);
  const assignee = task.assigned_to ? memberMap.get(task.assigned_to) : null;
  const remaining = daysRemaining(task.due_date);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full cursor-grab overflow-hidden rounded-xl border bg-background/70 p-3 text-left transition-all hover:border-primary/40 hover:shadow-md active:cursor-grabbing",
        overdue ? "border-destructive/50" : "border-border/60",
        task.status === "concluida" && "opacity-60"
      )}
    >
      {/* Left stripe */}
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] rounded-l-xl",
          cat?.color ?? "bg-[hsl(var(--elk-category-geral))]"
        )}
      />

      <div className="space-y-2 pl-1.5">
        {/* Title */}
        <h4 className="text-[13px] font-semibold leading-snug text-foreground line-clamp-2">
          {task.title}
        </h4>

        {/* Description */}
        {task.description && (
          <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {cat && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white",
                cat.color
              )}
            >
              {cat.label}
            </span>
          )}
          {pri && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                pri.badge
              )}
            >
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full", pri.dot)} />
              {pri.label}
            </span>
          )}
          {task.google_event_id && (
            <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-600 dark:text-blue-400">
              <ExternalLink size={8} />
              Agenda
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-0.5">
          {task.due_date ? (
            <span
              className={cn(
                "flex items-center gap-1 text-[11px]",
                overdue ? "font-bold text-destructive" : "text-muted-foreground"
              )}
            >
              <Clock size={10} />
              {formatShortDate(task.due_date)}
              {remaining && (
                <span className={cn("text-[9px]", overdue && "text-destructive")}>
                  ({remaining})
                </span>
              )}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground/50">Sem prazo</span>
          )}

          {assignee ? (
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary ring-1 ring-primary/20"
              title={assignee.full_name}
            >
              {getInitials(assignee.full_name)}
            </span>
          ) : task.role_visibility && task.role_visibility.length > 0 ? (
            <div className="flex gap-1">
              {task.role_visibility
                .filter((r) => r !== "admin_super" && r !== "admin")
                .slice(0, 2)
                .map((r) => (
                  <span
                    key={r}
                    className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
                  >
                    {r}
                  </span>
                ))}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Droppable Column — full dvh, grows with content                    */
/* ------------------------------------------------------------------ */

function KanbanColumn({
  colKey,
  label,
  tasks,
  memberMap,
  onTaskClick,
}: {
  colKey: ColumnKey;
  label: string;
  tasks: TeamTask[];
  memberMap: Map<string, TeamMember>;
  onTaskClick: (task: TeamTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colKey });

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-border/70 border-t-[3px] bg-card/60",
        COLUMN_ACCENT[colKey],
        isOver && "bg-primary/5 ring-1 ring-inset ring-primary/20"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</h3>
        <span
          className={cn(
            "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
            COLUMN_COUNT_BG[colKey]
          )}
        >
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2 px-2 pb-3">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl bg-muted/20 p-6">
              <p className="text-center text-xs text-muted-foreground">Nenhuma tarefa</p>
            </div>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                memberMap={memberMap}
                onClick={() => onTaskClick(task)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Task Detail/Edit Modal                                             */
/* ------------------------------------------------------------------ */

export function TaskDetailModal({
  task,
  members,
  memberMap,
  onClose,
  onUpdated,
  onDeleted,
}: {
  task: TeamTask;
  members: TeamMember[];
  memberMap: Map<string, TeamMember>;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [category, setCategory] = useState(task.category);
  const [status, setStatus] = useState(task.status);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [startsAt, setStartsAt] = useState(toDateTimeInput(task.starts_at));
  const [endsAt, setEndsAt] = useState(toDateTimeInput(task.ends_at));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const assignee = task.assigned_to ? memberMap.get(task.assigned_to) : null;
  const cat = CATEGORY_MAP[task.category];
  const pri = PRIORITY_MAP[task.priority];
  const overdue = isOverdue(task.due_date, task.status);
  const remaining = daysRemaining(task.due_date);

  const handleSave = async () => {
    if (startsAt && endsAt) {
      const s = new Date(startsAt).getTime();
      const e = new Date(endsAt).getTime();
      if (!Number.isNaN(s) && !Number.isNaN(e) && e < s) {
        toast.error("Data final não pode ser anterior à inicial.");
        return;
      }
    }

    setSaving(true);
    const { error } = await supabase
      .from("team_tasks")
      .update({
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo || null,
        priority,
        category,
        status,
        due_date: dueDate || null,
        starts_at: fromDateTimeInput(startsAt),
        ends_at: fromDateTimeInput(endsAt),
      } as never)
      .eq("id", task.id);
    setSaving(false);

    if (error) {
      toast.error("Erro ao atualizar tarefa.", { description: error.message });
      return;
    }
    toast.success("Tarefa atualizada.");
    onUpdated();
  };

  const handleDelete = async () => {
    setConfirmingDelete(false);
    setDeleting(true);

    if (task.google_event_id) {
      try {
        const headers = await getSupabaseFunctionAuthHeaders();
        await supabase.functions.invoke("google-calendar-sync", {
          body: { action: "delete", event_id: task.google_event_id },
          headers,
        });
      } catch {
        // Non-blocking
      }
    }

    const { error } = await supabase.from("team_tasks").delete().eq("id", task.id);
    setDeleting(false);

    if (error) {
      toast.error("Erro ao excluir tarefa.", { description: error.message });
      return;
    }
    toast.success("Tarefa excluída.");
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Fechar"
      />
      <div className="relative z-10 mx-4 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/60 p-4">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                COLUMN_COUNT_BG[task.status as ColumnKey] ?? "bg-muted text-muted-foreground"
              )}
            >
              {COLUMNS.find((c) => c.key === task.status)?.label ?? task.status}
            </span>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          {editing ? (
            <>
              <Field label="Título">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Descrição">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={selectClass}
                  >
                    {COLUMNS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Prioridade">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className={selectClass}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Categoria">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={selectClass}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Responsável">
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Nenhum</option>
                    {members
                      .filter((m) => m.is_active)
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.full_name}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <Field label="Prazo">
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início">
                  <Input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </Field>
                <Field label="Fim">
                  <Input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  loading={saving}
                  loadingText="Salvando..."
                  onClick={() => void handleSave()}
                >
                  Salvar
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-foreground">{task.title}</h2>
              {task.description && (
                <p className="text-sm leading-relaxed text-muted-foreground">{task.description}</p>
              )}

              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/40 bg-muted/20 p-3">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Categoria
                  </span>
                  <div className="mt-1 flex items-center gap-1.5">
                    {cat && <span className={cn("h-2 w-2 rounded-full", cat.color)} />}
                    <span className="text-sm text-foreground">{cat?.label ?? task.category}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Prioridade
                  </span>
                  <div className="mt-1 flex items-center gap-1.5">
                    {pri && <span className={cn("h-2 w-2 rounded-full", pri.dot)} />}
                    <span className="text-sm text-foreground">{pri?.label ?? task.priority}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Prazo
                  </span>
                  <div className="mt-1">
                    {task.due_date ? (
                      <span
                        className={cn(
                          "text-sm",
                          overdue ? "font-bold text-destructive" : "text-foreground"
                        )}
                      >
                        {formatShortDate(task.due_date)}{" "}
                        {remaining && (
                          <span className="text-xs text-muted-foreground">({remaining})</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Sem prazo</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Responsável
                  </span>
                  <div className="mt-1">
                    {assignee ? (
                      <span className="text-sm text-foreground">{assignee.full_name}</span>
                    ) : task.role_visibility?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {task.role_visibility.map((r) => (
                          <span
                            key={r}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Não atribuído</span>
                    )}
                  </div>
                </div>
              </div>

              {task.google_event_id && task.google_meet_link && (
                <a
                  href={task.google_meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-500/10 dark:text-blue-400"
                >
                  <ExternalLink size={14} />
                  Abrir no Google Meet
                </a>
              )}

              <div className="flex justify-between pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  loading={deleting}
                  loadingText="Excluindo..."
                  onClick={() => setConfirmingDelete(true)}
                >
                  Excluir
                </Button>
                <Button type="button" onClick={() => setEditing(true)}>
                  Editar
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <AlertDialog
        open={confirmingDelete}
        title="Excluir tarefa?"
        description={`A tarefa "${task.title}" sera removida permanentemente${
          task.google_event_id ? " e tambem do Google Agenda" : ""
        }. Esta acao nao pode ser desfeita.`}
        confirmLabel="Excluir tarefa"
        cancelLabel="Cancelar"
        destructive
        loading={deleting}
        loadingLabel="Excluindo..."
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Create Task Modal                                                  */
/* ------------------------------------------------------------------ */

type AssignMode = "person" | "role";

const INITIAL_FORM = {
  title: "",
  description: "",
  category: "geral",
  priority: "media",
  deadline_option: "7",
  custom_date: "",
  assign_mode: "person" as AssignMode,
  assigned_to: "",
  role_visibility: [] as string[],
  attendees: "",
};

export function CreateTaskModal({
  members,
  onClose,
  onCreated,
}: {
  members: TeamMember[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleRole = (role: string) => {
    setForm((prev) => ({
      ...prev,
      role_visibility: prev.role_visibility.includes(role)
        ? prev.role_visibility.filter((r) => r !== role)
        : [...prev.role_visibility, role],
    }));
  };

  const computedDueDate = useMemo(() => {
    if (form.deadline_option === "") return null;
    if (form.deadline_option === "custom") return form.custom_date || null;
    return addDays(Number(form.deadline_option));
  }, [form.deadline_option, form.custom_date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Título é obrigatório.");
      return;
    }
    if (form.assign_mode === "role" && form.role_visibility.length === 0) {
      toast.error("Selecione ao menos um papel.");
      return;
    }

    setSaving(true);

    // Build role_visibility — always include admin roles + selected roles
    const roleVis =
      form.assign_mode === "role"
        ? [...new Set(["admin_super", "admin", ...form.role_visibility])]
        : ["admin_super", "admin"];

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      status: "pendente",
      priority: form.priority,
      due_date: computedDueDate,
      starts_at: computedDueDate ? `${computedDueDate}T09:00:00-03:00` : null,
      ends_at: computedDueDate ? `${computedDueDate}T10:00:00-03:00` : null,
      assigned_to: form.assign_mode === "person" && form.assigned_to ? form.assigned_to : null,
      role_visibility: roleVis,
      created_by: user?.id ?? null,
    };

    const { data: newTask, error } = await supabase
      .from("team_tasks")
      .insert(payload as never)
      .select("id")
      .single();

    if (error || !newTask) {
      setSaving(false);
      toast.error("Erro ao criar tarefa.", { description: error?.message });
      return;
    }

    // Sync to Google Calendar
    if (computedDueDate) {
      try {
        const headers = await getSupabaseFunctionAuthHeaders();
        const attendeeEmails = form.attendees
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes("@"));

        const { data: gcalResult } = await supabase.functions.invoke("google-calendar-sync", {
          body: {
            action: "create",
            summary: `[Tarefa] ${form.title.trim()}`,
            description: [
              form.description.trim(),
              `Categoria: ${CATEGORY_MAP[form.category]?.label ?? form.category}`,
              `Prioridade: ${PRIORITY_MAP[form.priority]?.label ?? form.priority}`,
            ]
              .filter(Boolean)
              .join("\n"),
            start_time: `${computedDueDate}T09:00:00-03:00`,
            end_time: `${computedDueDate}T10:00:00-03:00`,
            ...(attendeeEmails.length > 0 ? { attendees: attendeeEmails } : {}),
          },
          headers,
        });

        if (gcalResult?.id) {
          await supabase
            .from("team_tasks")
            .update({
              google_event_id: gcalResult.id,
              google_meet_link: gcalResult.hangoutLink ?? null,
            } as never)
            .eq("id", (newTask as { id: string }).id);
        }
      } catch (err) {
        console.warn("Google Calendar sync failed (non-blocking):", err);
      }
    }

    setSaving(false);
    toast.success("Tarefa criada!", {
      description: computedDueDate
        ? `Prazo: ${formatShortDate(computedDueDate)} — adicionado ao Google Agenda.`
        : undefined,
    });
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Fechar"
      />
      <div className="relative z-10 mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">Nova tarefa</h3>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <Field label="Título" required>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="O que precisa ser feito?"
              autoFocus
            />
          </Field>

          <Field label="Descrição">
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Detalhes (opcional)"
              rows={3}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoria">
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className={selectClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prioridade">
              <select
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                className={selectClass}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Prazo de entrega">
            <select
              value={form.deadline_option}
              onChange={(e) => set("deadline_option", e.target.value)}
              className={selectClass}
            >
              {DEADLINE_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>

          {form.deadline_option === "custom" && (
            <Field label="Data específica">
              <Input
                type="date"
                value={form.custom_date}
                onChange={(e) => set("custom_date", e.target.value)}
                min={getLocalDateIso()}
              />
            </Field>
          )}

          {computedDueDate && (
            <p className="rounded-md bg-primary/5 px-3 py-2 text-xs text-primary">
              Prazo: <strong>{formatShortDate(computedDueDate)}</strong> — será adicionado ao Google
              Agenda.
            </p>
          )}

          {/* Assignment */}
          <div>
            <Label className="mb-2 block text-sm font-medium">Atribuir para</Label>
            <div className="flex rounded-lg border border-border/60 p-0.5">
              <button
                type="button"
                onClick={() => set("assign_mode", "person")}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                  form.assign_mode === "person"
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Pessoa
              </button>
              <button
                type="button"
                onClick={() => set("assign_mode", "role")}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                  form.assign_mode === "role"
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Papel (role)
              </button>
            </div>
          </div>

          {form.assign_mode === "person" ? (
            <Field label="Responsável">
              <select
                value={form.assigned_to}
                onChange={(e) => set("assigned_to", e.target.value)}
                className={selectClass}
              >
                <option value="">Selecione...</option>
                {members
                  .filter((m) => m.is_active)
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name} ({m.system_role})
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">
                Todos com este papel verão a tarefa
              </Label>
              <div className="flex flex-wrap gap-2">
                {ASSIGNABLE_ROLES.map((role) => (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => toggleRole(role.value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                      form.role_visibility.includes(role.value)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {role.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {computedDueDate && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Convidados (emails)</Label>
              <Input
                value={form.attendees}
                onChange={(e) => set("attendees", e.target.value)}
                placeholder="email@exemplo.com, outro@exemplo.com"
              />
              <p className="text-[11px] text-muted-foreground">
                Separados por virgula. Receberao convite no Google Agenda.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border/40 pt-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving} loadingText="Criando...">
              Criar tarefa
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

const DOMAIN_PRESETS: Record<string, { category: string; title: string }> = {
  comercial: { category: "comercial", title: "Tarefas — Comercial" },
  financeiro: { category: "financeiro", title: "Tarefas — Financeiro" },
  juridico: { category: "juridico", title: "Tarefas — Jurídico" },
  desenvolvimento: { category: "desenvolvimento", title: "Tarefas — Desenvolvimento" },
  suporte: { category: "suporte", title: "Tarefas — Suporte" },
  marketing: { category: "marketing", title: "Tarefas — Marketing" },
};

export default function AdminTasks() {
  const { user, roles, isAdmin } = useAuth();
  const { domain } = useParams<{ domain?: string }>();
  const domainPreset = domain ? DOMAIN_PRESETS[domain] : undefined;

  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState(domainPreset?.category ?? "todos");

  // Quando o path muda (/tarefas/comercial → /tarefas/juridico), atualiza o filtro.
  useEffect(() => {
    setCategoryFilter(domainPreset?.category ?? "todos");
  }, [domainPreset?.category]);
  const [priorityFilter, setPriorityFilter] = useState("todas");
  const [assignedFilter, setAssignedFilter] = useState("todos");
  const [scope, setScope] = useState<"minhas" | "todas">(() => {
    if (typeof window === "undefined") return "minhas";
    const saved = window.localStorage.getItem("elkys-admin-tasks-scope");
    return saved === "todas" ? "todas" : "minhas";
  });
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    if (typeof window === "undefined") return "default";
    const saved = window.localStorage.getItem("elkys-admin-tasks-sort");
    const valid = SORT_OPTIONS.some((o) => o.value === saved);
    return valid ? (saved as SortKey) : "default";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("elkys-admin-tasks-scope", scope);
    }
  }, [scope]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("elkys-admin-tasks-sort", sortKey);
    }
  }, [sortKey]);

  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TeamTask | null>(null);
  const [activeTask, setActiveTask] = useState<TeamTask | null>(null);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  /* ── Load ───────────────────────────────────────────────────────── */

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [tasksRes, membersRes] = await Promise.all([
      supabase
        .from("team_tasks")
        .select(
          "id, title, description, status, priority, category, assigned_to, role_visibility, due_date, starts_at, ends_at, google_event_id, google_meet_link, created_by, created_at"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("team_members_with_role")
        .select("id, user_id, full_name, system_role, is_active"),
    ]);

    if (tasksRes.error || membersRes.error) {
      setError((tasksRes.error ?? membersRes.error)!.message);
      setLoading(false);
      return;
    }

    const allTasks = (tasksRes.data ?? []) as unknown as TeamTask[];
    const allMembers = (membersRes.data ?? []) as unknown as TeamMember[];

    const visibleTasks = isAdmin
      ? allTasks
      : allTasks.filter((t) => {
          if (t.assigned_to === user?.id) return true;
          if (t.created_by === user?.id) return true;
          if (t.role_visibility?.length) {
            return t.role_visibility.some((r) => roles.includes(r as never));
          }
          return false;
        });

    setTasks(visibleTasks);
    setMembers(allMembers);
    setLoading(false);
  }, [isAdmin, user?.id, roles]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /* ── Filtering ──────────────────────────────────────────────────── */

  const myTasksCount = useMemo(
    () => tasks.filter((t) => t.assigned_to === user?.id || t.created_by === user?.id).length,
    [tasks, user?.id]
  );

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (scope === "minhas") {
        if (t.assigned_to !== user?.id && t.created_by !== user?.id) return false;
      }
      if (categoryFilter !== "todos" && t.category !== categoryFilter) return false;
      if (priorityFilter !== "todas" && t.priority !== priorityFilter) return false;
      if (assignedFilter !== "todos" && t.assigned_to !== assignedFilter) return false;
      return true;
    });
  }, [tasks, categoryFilter, priorityFilter, assignedFilter, scope, user?.id]);

  const grouped = useMemo(() => {
    const map: Record<ColumnKey, TeamTask[]> = {
      pendente: [],
      em_progresso: [],
      pausada: [],
      validacao: [],
      concluida: [],
    };
    for (const t of filtered) {
      const key = t.status as ColumnKey;
      if (key in map) map[key].push(t);
    }

    if (sortKey !== "default") {
      const FAR_FUTURE = "9999-12-31";
      const compare: Record<Exclude<SortKey, "default">, (a: TeamTask, b: TeamTask) => number> = {
        due_asc: (a, b) => (a.due_date ?? FAR_FUTURE).localeCompare(b.due_date ?? FAR_FUTURE),
        due_desc: (a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""),
        priority: (a, b) =>
          (PRIORITY_MAP[a.priority]?.rank ?? 99) - (PRIORITY_MAP[b.priority]?.rank ?? 99),
        title: (a, b) => a.title.localeCompare(b.title, "pt-BR"),
      };
      const fn = compare[sortKey];
      for (const k of Object.keys(map) as ColumnKey[]) {
        map[k] = [...map[k]].sort(fn);
      }
    }

    return map;
  }, [filtered, sortKey]);

  /* ── Drag ───────────────────────────────────────────────────────── */

  const handleDragStart = (event: DragStartEvent) => {
    const task = filtered.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    let targetColumn: string | null = null;
    if (COLUMNS.some((c) => c.key === over.id)) {
      targetColumn = over.id as string;
    } else {
      const overTask = tasks.find((t) => t.id === over.id);
      if (overTask) targetColumn = overTask.status;
    }

    if (!targetColumn || targetColumn === task.status) return;

    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: targetColumn } : t)));

    const { data, error: updateError } = await supabase
      .from("team_tasks")
      .update({ status: targetColumn } as never)
      .eq("id", taskId)
      .select("id");

    // RLS silencioso: Postgres retorna 0 rows sem error quando a policy bloqueia.
    // Sem esse check, o optimistic update fica na tela ate o refresh.
    if (updateError || !data || data.length === 0) {
      toast.error(
        updateError ? "Erro ao mover tarefa." : "Voce nao tem permissao pra mover essa tarefa."
      );
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: task.status } : t)));
    }
  };

  /* ── Render ─────────────────────────────────────────────────────── */

  if (loading) return <PortalLoading />;

  if (error) {
    return (
      <AdminEmptyState
        icon={Target}
        title="Erro ao carregar tarefas"
        description={error}
        action={
          <Button type="button" onClick={() => void loadData()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="rounded-2xl border-border/80 bg-card/95">
        <CardContent className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
          <div className="flex rounded-lg border border-border/60 bg-background p-0.5">
            <button
              type="button"
              onClick={() => setScope("minhas")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                scope === "minhas"
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Minhas tarefas
              <span
                className={cn(
                  "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold",
                  scope === "minhas" ? "bg-white/25 text-white" : "bg-muted text-muted-foreground"
                )}
              >
                {myTasksCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setScope("todas")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                scope === "todas"
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Todas
              <span
                className={cn(
                  "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold",
                  scope === "todas" ? "bg-white/25 text-white" : "bg-muted text-muted-foreground"
                )}
              >
                {tasks.length}
              </span>
            </button>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="todos">Todas categorias</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="todas">Todas prioridades</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="todos">Todos responsáveis</option>
            {members
              .filter((m) => m.is_active)
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name}
                </option>
              ))}
          </select>

          <span className="hidden h-4 w-px bg-border/60 sm:block" />

          {COLUMNS.map((col) => (
            <span key={col.key} className="hidden items-center gap-1.5 text-xs sm:flex">
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

          <div className="ml-auto flex items-center gap-2">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Ordenar tarefas"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
              + Nova tarefa
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Kanban board — full dvh columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={(e) => void handleDragEnd(e)}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              colKey={col.key}
              label={col.label}
              tasks={grouped[col.key]}
              memberMap={memberMap}
              onTaskClick={setSelectedTask}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="w-[260px] rotate-2 opacity-90">
              <TaskCardInner task={activeTask} memberMap={memberMap} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {showCreate && (
        <CreateTaskModal
          members={members}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void loadData();
          }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          members={members}
          memberMap={memberMap}
          onClose={() => setSelectedTask(null)}
          onUpdated={() => {
            setSelectedTask(null);
            void loadData();
          }}
          onDeleted={() => {
            setSelectedTask(null);
            void loadData();
          }}
        />
      )}
    </div>
  );
}
