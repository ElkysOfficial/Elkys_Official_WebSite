import { cn } from "@/design-system";

interface CoreKpiCardProps {
  label: string;
  value: string;
  hint?: string;
  hintTone?: "neutral" | "success" | "destructive";
}

/** Cartão de KPI padrão da zona Core. */
export default function CoreKpiCard({
  label,
  value,
  hint,
  hintTone = "neutral",
}: CoreKpiCardProps) {
  return (
    <div className="rounded-2xl border border-border/75 bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            hintTone === "success" && "text-success",
            hintTone === "destructive" && "text-destructive",
            hintTone === "neutral" && "text-muted-foreground"
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
