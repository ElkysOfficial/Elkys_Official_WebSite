import { cn } from "@/design-system";

export const PERIOD_OPTIONS = [3, 6, 12] as const;
export type Period = (typeof PERIOD_OPTIONS)[number];

interface PeriodToggleProps {
  value: Period;
  onChange: (value: Period) => void;
}

/** Seletor de período (3/6/12 meses) compartilhado pelos gráficos da zona Core. */
export default function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5">
      {PERIOD_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === option
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option}M
        </button>
      ))}
    </div>
  );
}
