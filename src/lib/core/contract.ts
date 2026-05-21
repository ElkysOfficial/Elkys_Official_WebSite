/**
 * Contrato de dados do Command Center (zona Core do portal).
 *
 * Esta e a FORMA que o futuro Elkys Hub vai expor. Hoje e alimentada por
 * dados mockados (ver mock-data.ts); quando o Hub existir, troca-se apenas a
 * implementacao do loader, sem mexer nas telas nem nos tipos. Ver
 * docs/ECOSYSTEM-ARCHITECTURE.md, secoes 5 e 8.
 */

export type ProductStatus = "ativo" | "em_construcao" | "descontinuado";

/** Ponto mensal de metricas de um produto. `month` no formato YYYY-MM. */
export interface MonthlyMetricPoint {
  month: string;
  mrr: number;
  activeUsers: number;
  /** Clientes novos no mes. */
  newCustomers: number;
  /** Clientes que cancelaram no mes. */
  churnedCustomers: number;
}

/** Um produto do ecossistema e suas metricas SaaS. */
export interface EcosystemProduct {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  description: string;
  /** MRR atual, em reais. */
  mrr: number;
  /** MRR do mes anterior, base da variacao MoM. */
  mrrPreviousMonth: number;
  activeUsers: number;
  /** Churn de receita no mes, em pontos percentuais (ex.: 3.2 = 3,2%). */
  churnRate: number;
  /** Indice de saude composto, de 0 a 100. */
  healthScore: number;
  /** Custo de infraestrutura mensal estimado, em reais. */
  infraCost: number;
  /** Custo de aquisicao de cliente, em reais. */
  cac: number;
  /** Lifetime value medio do cliente, em reais. */
  ltv: number;
  /** Net revenue retention, em pontos percentuais (ex.: 108 = 108%). */
  nrr: number;
  /** Serie mensal, do mais antigo ao mais recente. */
  mrrSeries: MonthlyMetricPoint[];
}

export type ServiceStatus = "operational" | "degraded" | "down";
export type ServiceKind = "api" | "web" | "worker" | "database";

/** Um servico de infraestrutura observado. */
export interface InfraService {
  id: string;
  name: string;
  /** Produto dono, ou null para servico compartilhado. */
  productSlug: string | null;
  kind: ServiceKind;
  status: ServiceStatus;
  /** Disponibilidade nos ultimos 30 dias, em %. */
  uptime30d: number;
  /** Latencia p95, em ms. */
  latencyP95: number;
  /** Custo mensal, em reais. */
  monthlyCost: number;
}

/** Um job agendado (cron) observado. */
export interface CronJob {
  id: string;
  name: string;
  productSlug: string | null;
  /** Periodicidade legivel (ex.: "a cada hora"). */
  schedule: string;
  /** Data ISO da ultima execucao. */
  lastRunAt: string;
  /** Se a ultima execucao terminou com sucesso. */
  lastRunOk: boolean;
}

/** Um alerta de infraestrutura em aberto. */
export interface InfraAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  service: string;
  /** Data ISO em que o alerta disparou. */
  at: string;
}

/** Camada de observabilidade do ecossistema. */
export interface EcosystemInfra {
  services: InfraService[];
  cronJobs: CronJob[];
  alerts: InfraAlert[];
}

/** Snapshot consolidado do ecossistema num instante. */
export interface EcosystemSnapshot {
  /** Data de referencia do snapshot (ISO). */
  asOf: string;
  /** Indica que o snapshot veio de dados simulados, nao do Hub real. */
  simulated: boolean;
  products: EcosystemProduct[];
  infra: EcosystemInfra;
}

/** Metricas consolidadas derivadas de um snapshot. */
export interface EcosystemMetrics {
  totalMrr: number;
  totalArr: number;
  /** Crescimento do MRR consolidado mes a mes, em %. null = sem base. */
  mrrGrowthMoM: number | null;
  /** Churn medio ponderado pelo MRR, em %. */
  weightedChurn: number;
  totalActiveUsers: number;
  totalInfraCost: number;
  activeProductCount: number;
  /** NRR medio ponderado pelo MRR, em %. */
  avgNrr: number;
  /** CAC combinado, ponderado pelos clientes novos do mes, em reais. */
  blendedCac: number;
  /** LTV combinado, ponderado pelos usuarios ativos, em reais. */
  blendedLtv: number;
  /** Razao LTV / CAC do ecossistema. */
  ltvCacRatio: number;
  newCustomersThisMonth: number;
  churnedCustomersThisMonth: number;
}

/** Resumo da camada de infraestrutura. */
export interface InfraSummary {
  totalMonthlyCost: number;
  /** Uptime medio dos servicos, em %. */
  avgUptime: number;
  operationalCount: number;
  totalServices: number;
  openAlerts: number;
  failedJobs: number;
}
