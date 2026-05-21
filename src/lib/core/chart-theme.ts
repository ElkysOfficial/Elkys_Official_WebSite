/**
 * Tema compartilhado dos gráficos da zona Core (ECharts).
 *
 * Centraliza a resolução de cores e os gradientes para que todos os gráficos
 * tenham a mesma qualidade visual e respondam ao tema (claro/escuro).
 */
import { tokenColor } from "./format";

export interface ChartPalette {
  border: string;
  muted: string;
  card: string;
  fg: string;
  primary: string;
  accent: string;
  success: string;
  warning: string;
  destructive: string;
}

/** Resolve os tokens CSS para cores concretas, conforme o tema atual. */
export function readChartPalette(isDark: boolean): ChartPalette {
  return {
    border: tokenColor("--elk-border", isDark ? "#27272a" : "#e5e7eb"),
    muted: tokenColor("--elk-muted-foreground", "#71717a"),
    card: tokenColor("--elk-card", isDark ? "#18181b" : "#ffffff"),
    fg: tokenColor("--elk-foreground", isDark ? "#fafafa" : "#0f172a"),
    primary: tokenColor("--elk-primary", "#6d28d9"),
    accent: tokenColor("--elk-accent", "#0ea5e9"),
    success: tokenColor("--elk-success", "#16a34a"),
    warning: tokenColor("--elk-warning", "#d97706"),
    destructive: tokenColor("--elk-destructive", "#dc2626"),
  };
}

/** Injeta alpha numa cor `hsl(...)`. Cores fora desse formato passam intactas. */
export function withAlpha(color: string, alpha: number): string {
  return color.replace(/\)\s*$/, ` / ${alpha})`);
}

/** Gradiente vertical (topo mais forte) para `areaStyle` de linhas/áreas. */
export function verticalGradient(color: string, from = 0.32, to = 0.02) {
  return {
    type: "linear" as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: withAlpha(color, from) },
      { offset: 1, color: withAlpha(color, to) },
    ],
  };
}

/** Gradiente "cheio" para preencher barras: cor forte no topo, suave na base. */
export function solidGradient(color: string, from = 1, to = 0.6) {
  return {
    type: "linear" as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: withAlpha(color, from) },
      { offset: 1, color: withAlpha(color, to) },
    ],
  };
}

/** Configuração de tooltip padrão da zona Core. */
export function baseTooltip(palette: ChartPalette) {
  return {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
    textStyle: { color: palette.fg, fontSize: 12 },
    extraCssText: "border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.12);",
  };
}

/** Linha de grade tracejada padrão (eixo Y). */
export function dashedSplitLine(palette: ChartPalette) {
  return { lineStyle: { color: palette.border, type: "dashed" as const, opacity: 0.5 } };
}
