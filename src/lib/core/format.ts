/** Formatadores e helpers de exibição compartilhados pela zona Core. */
import type { EcosystemProduct } from "./contract";

/** Tokens de cor por produto, na ordem do catálogo. */
export const PRODUCT_TOKENS = ["--elk-primary", "--elk-accent"] as const;

const PRODUCT_COLOR_FALLBACKS = ["#6d28d9", "#0ea5e9"];

export const STATUS_LABEL: Record<EcosystemProduct["status"], string> = {
  ativo: "Ativo",
  em_construcao: "Em construção",
  descontinuado: "Descontinuado",
};

export function formatCompactBRL(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1).replace(".", ",")} mil`;
  return `R$ ${Math.round(value)}`;
}

export function formatFullBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatPercent(value: number, signed = false): string {
  const text = `${Math.abs(value).toFixed(1).replace(".", ",")}%`;
  if (value > 0) return signed ? `+${text}` : text;
  if (value < 0) return `-${text}`;
  return text;
}

export function monthLabel(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex - 1, 1);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
  return `${label}/${String(year).slice(-2)}`;
}

/** Classe de fundo conforme a faixa do health score (0 a 100). */
export function healthToneClass(score: number): string {
  if (score >= 75) return "bg-success";
  if (score >= 50) return "bg-warning";
  return "bg-destructive";
}

/** Cor do produto em CSS, para uso em HTML (resolve a var no navegador). */
export function productCssColor(index: number): string {
  return `hsl(var(${PRODUCT_TOKENS[index % PRODUCT_TOKENS.length]}))`;
}

/**
 * Resolve um token CSS (HSL sem wrapper) para uma cor concreta. Necessário
 * porque o canvas do ECharts não interpreta `var(--token)`.
 */
export function tokenColor(token: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return raw ? `hsl(${raw})` : fallback;
}

/** Cor do produto já resolvida, para uso no ECharts. */
export function productChartColor(index: number): string {
  return tokenColor(
    PRODUCT_TOKENS[index % PRODUCT_TOKENS.length],
    PRODUCT_COLOR_FALLBACKS[index % PRODUCT_COLOR_FALLBACKS.length]
  );
}
