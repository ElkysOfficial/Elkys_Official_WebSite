import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Shield, TrendingUp, Wallet } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import MetricTile from "@/components/portal/shared/MetricTile";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import { Button, Card, CardContent, Input, Label, Field, Textarea, cn } from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { computeGoalProgress } from "@/lib/finance-metrics";
import { formatBRL, getLocalDateIso, maskCurrency, toCents, unmaskCurrency } from "@/lib/masks";

type GoalRow = Database["public"]["Tables"]["financial_goals"]["Row"];
type ChargeRow = Pick<
  Database["public"]["Tables"]["charges"]["Row"],
  "id" | "amount" | "paid_at" | "status" | "is_historical"
>;

type PeriodType = "mensal" | "trimestral" | "anual";
type PeriodFilter = "all" | PeriodType;

const PERIOD_LABELS: Record<PeriodType, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
};

const PERIOD_FILTERS: { value: PeriodFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "anual", label: "Anual" },
];

function formatPeriodLabel(goal: GoalRow): string {
  const start = new Date(`${goal.period_start}T00:00:00`);
  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Marco",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  if (goal.period_type === "mensal") {
    return `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
  }
  if (goal.period_type === "trimestral") {
    const q = Math.floor(start.getMonth() / 3) + 1;
    return `Q${q} ${start.getFullYear()}`;
  }
  return `${start.getFullYear()}`;
}

function getProgressTone(percent: number): string {
  if (percent >= 100) return "bg-success";
  if (percent >= 70) return "bg-warning";
  return "bg-destructive";
}

function getProgressTextTone(percent: number): string {
  if (percent >= 100) return "text-success";
  if (percent >= 70) return "text-warning";
  return "text-destructive";
}

function computePeriodDates(
  periodType: PeriodType,
  baseDate: Date
): { start: string; end: string } {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  if (periodType === "mensal") {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return {
      start: getLocalDateIso(start),
      end: getLocalDateIso(end),
    };
  }

  if (periodType === "trimestral") {
    const qStart = Math.floor(month / 3) * 3;
    const start = new Date(year, qStart, 1);
    const end = new Date(year, qStart + 3, 0);
    return {
      start: getLocalDateIso(start),
      end: getLocalDateIso(end),
    };
  }

  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

/** Mês corrente (YYYY-MM) na timezone LOCAL. */
function getLocalMonthIso(): string {
  return getLocalDateIso().slice(0, 7);
}

export default function FinanceGoals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalRow | null>(null);

  // Form state
  const [formPeriodType, setFormPeriodType] = useState<PeriodType>("mensal");
  const [formMonth, setFormMonth] = useState(() => getLocalMonthIso());
  const [formAmount, setFormAmount] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [goalsRes, chargesRes] = await Promise.all([
      supabase.from("financial_goals").select("*").order("period_start", { ascending: false }),
      supabase
        .from("charges")
        .select("id, amount, paid_at, status, is_historical")
        .eq("status", "pago")
        .eq("is_historical", false),
    ]);

    if (goalsRes.error) {
      setError(goalsRes.error.message);
      setLoading(false);
      return;
    }

    setGoals((goalsRes.data ?? []) as GoalRow[]);
    setCharges((chargesRes.data ?? []) as ChargeRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const getActualForPeriod = useCallback(
    (start: string, end: string) => {
      return (
        charges
          .filter((c) => c.paid_at && c.paid_at >= start && c.paid_at <= end)
          .reduce((sum, c) => sum + toCents(c.amount), 0) / 100
      );
    },
    [charges]
  );

  const filteredGoals = useMemo(() => {
    if (periodFilter === "all") return goals;
    return goals.filter((g) => g.period_type === periodFilter);
  }, [goals, periodFilter]);

  const goalsWithActual = useMemo(() => {
    return filteredGoals.map((goal) => {
      const actual = getActualForPeriod(goal.period_start, goal.period_end);
      const percent = computeGoalProgress(actual, goal.target_amount);
      return { ...goal, actual, percent };
    });
  }, [filteredGoals, getActualForPeriod]);

  const totalTarget = useMemo(
    () => goalsWithActual.reduce((sum, g) => sum + g.target_amount, 0),
    [goalsWithActual]
  );
  const totalActual = useMemo(
    () => goalsWithActual.reduce((sum, g) => sum + g.actual, 0),
    [goalsWithActual]
  );
  const achievedCount = useMemo(
    () => goalsWithActual.filter((g) => g.percent >= 100).length,
    [goalsWithActual]
  );

  const resetForm = () => {
    setFormPeriodType("mensal");
    setFormMonth(getLocalMonthIso());
    setFormAmount("");
    setFormNotes("");
    setEditingGoal(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    const amountValue = unmaskCurrency(formAmount);
    if (!amountValue || amountValue <= 0) {
      toast.error("Informe um valor de meta valido.");
      return;
    }

    const baseDate = new Date(`${formMonth}-01T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) {
      toast.error("Periodo invalido.");
      return;
    }

    const { start, end } = computePeriodDates(formPeriodType, baseDate);

    setSaving(true);

    if (editingGoal) {
      const { error: updateError } = await supabase
        .from("financial_goals")
        .update({
          period_type: formPeriodType,
          period_start: start,
          period_end: end,
          target_amount: amountValue,
          notes: formNotes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingGoal.id);

      setSaving(false);
      if (updateError) {
        toast.error("Erro ao atualizar meta.", { description: updateError.message });
        return;
      }
      toast.success("Meta atualizada.");
    } else {
      const { error: insertError } = await supabase.from("financial_goals").insert({
        period_type: formPeriodType,
        period_start: start,
        period_end: end,
        target_amount: amountValue,
        notes: formNotes.trim() || null,
        created_by: user?.id ?? null,
      });

      setSaving(false);
      if (insertError) {
        toast.error("Erro ao criar meta.", { description: insertError.message });
        return;
      }
      toast.success("Meta criada.");
    }

    resetForm();
    void loadData();
  };

  const handleDelete = async (goalId: string) => {
    const { error: deleteError } = await supabase.from("financial_goals").delete().eq("id", goalId);

    if (deleteError) {
      toast.error("Erro ao remover meta.");
      return;
    }

    toast.success("Meta removida.");
    void loadData();
  };

  const startEdit = (goal: GoalRow) => {
    setEditingGoal(goal);
    setFormPeriodType(goal.period_type as PeriodType);
    setFormMonth(goal.period_start.slice(0, 7));
    setFormAmount(maskCurrency(String(Math.round(goal.target_amount * 100))));
    setFormNotes(goal.notes ?? "");
    setShowForm(true);
  };

  if (loading) return <PortalLoading />;

  if (error) {
    return (
      <AdminEmptyState
        icon={TrendingUp}
        title="Erro ao carregar metas"
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
      {/* Metrics */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile
          label="Meta total"
          value={formatBRL(totalTarget)}
          icon={TrendingUp}
          tone="primary"
          hint={`${goalsWithActual.length} meta(s)`}
        />
        <MetricTile
          label="Realizado"
          value={formatBRL(totalActual)}
          icon={Wallet}
          tone={totalActual >= totalTarget && totalTarget > 0 ? "success" : "warning"}
        />
        <MetricTile
          label="Metas atingidas"
          value={`${achievedCount}/${goalsWithActual.length}`}
          icon={Shield}
          tone="success"
        />
      </div>

      {/* Filters + Add button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tipo:
          </span>
          <div className="inline-flex rounded-full border border-border/80 bg-background/80 p-1">
            {PERIOD_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setPeriodFilter(f.value)}
                className={cn(
                  "min-h-[36px] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  periodFilter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <Button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          Nova meta
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="rounded-2xl border-primary/30 bg-card/95">
          <CardContent className="space-y-4 p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {editingGoal ? "Editar meta" : "Nova meta financeira"}
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <Label>Tipo de periodo</Label>
                <select
                  value={formPeriodType}
                  onChange={(e) => setFormPeriodType(e.target.value as PeriodType)}
                  className="flex h-10 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <Label>Periodo base</Label>
                <Input
                  type="month"
                  value={formMonth}
                  onChange={(e) => setFormMonth(e.target.value)}
                />
              </Field>
              <Field>
                <Label>Valor da meta</Label>
                <Input
                  value={formAmount}
                  onChange={(e) => setFormAmount(maskCurrency(e.target.value))}
                  placeholder="R$ 0,00"
                  inputMode="numeric"
                />
              </Field>
            </div>
            <Field>
              <Label>Observacoes (opcional)</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                placeholder="Contexto ou justificativa da meta..."
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => void handleSave()}
                loading={saving}
                loadingText="Salvando..."
              >
                {editingGoal ? "Atualizar" : "Criar meta"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Goals grid */}
      {goalsWithActual.length === 0 && !showForm ? (
        <AdminEmptyState
          icon={TrendingUp}
          title="Nenhuma meta definida"
          description="Defina metas de faturamento para acompanhar o desempenho financeiro."
          action={
            <Button type="button" onClick={() => setShowForm(true)}>
              Criar primeira meta
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {goalsWithActual.map((goal) => (
            <Card key={goal.id} className="overflow-hidden rounded-2xl border-border/70 bg-card/92">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {PERIOD_LABELS[goal.period_type as PeriodType] ?? goal.period_type}
                    </span>
                    <h4 className="mt-1 text-sm font-semibold text-foreground">
                      {formatPeriodLabel(goal)}
                    </h4>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(goal)}
                      className="rounded-md px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(goal.id)}
                      className="rounded-md px-2 py-1 text-[10px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      Remover
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Meta
                    </p>
                    <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
                      {formatBRL(goal.target_amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Realizado
                    </p>
                    <p
                      className={cn(
                        "whitespace-nowrap text-sm font-semibold tabular-nums",
                        getProgressTextTone(goal.percent)
                      )}
                    >
                      {formatBRL(goal.actual)}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        getProgressTone(goal.percent)
                      )}
                      style={{ width: `${Math.min(goal.percent, 100)}%` }}
                    />
                  </div>
                  <p
                    className={cn(
                      "text-right text-xs font-semibold tabular-nums",
                      getProgressTextTone(goal.percent)
                    )}
                  >
                    {goal.percent.toFixed(1)}%
                  </p>
                </div>

                {goal.notes && (
                  <p className="text-xs leading-relaxed text-muted-foreground">{goal.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
