/**
 * Dados MOCKADOS do Command Center.
 *
 * Protótipo: nada aqui toca o Supabase nem a producao. Quando o Elkys Hub
 * existir, `loadEcosystemSnapshot` passa a chamar a API real e este arquivo
 * inteiro pode ser descartado, sem mudar telas nem tipos.
 */
import type {
  EcosystemInfra,
  EcosystemProduct,
  EcosystemSnapshot,
  MonthlyMetricPoint,
} from "./contract";

/** Gera as chaves YYYY-MM dos ultimos `n` meses, do mais antigo ao atual. */
function lastNMonths(n: number): string[] {
  const months: string[] = [];
  const base = new Date();
  base.setDate(1);
  for (let offset = n - 1; offset >= 0; offset -= 1) {
    const date = new Date(base.getFullYear(), base.getMonth() - offset, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

/** Data ISO de `hours` horas atras. */
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/** Monta a serie mensal de um produto a partir do MRR e parametros simples. */
function buildSeries(
  mrrValues: number[],
  usersStart: number,
  usersEnd: number,
  newBase: number,
  churnBase: number
): MonthlyMetricPoint[] {
  const months = lastNMonths(mrrValues.length);
  const count = mrrValues.length;
  return mrrValues.map((mrr, index) => ({
    month: months[index],
    mrr,
    activeUsers: Math.round(usersStart + ((usersEnd - usersStart) * index) / (count - 1)),
    newCustomers: newBase + (index % 3),
    churnedCustomers: churnBase + (index % 2),
  }));
}

const SONNAR_MRR = [
  11200, 11800, 12500, 13100, 13900, 14600, 15200, 15900, 16400, 17100, 17800, 18400,
];
const DASHY_MRR = [2800, 3100, 3500, 3900, 4400, 4800, 5300, 5800, 6200, 6700, 7100, 7600];

const SONNAR_SERIES = buildSeries(SONNAR_MRR, 281, 342, 21, 14);
const DASHY_SERIES = buildSeries(DASHY_MRR, 86, 128, 14, 8);

const PRODUCTS: EcosystemProduct[] = [
  {
    id: "prod-sonnar",
    name: "Sonnar",
    slug: "sonnar",
    status: "ativo",
    description: "Produto SaaS principal do ecossistema Elkys.",
    mrr: SONNAR_MRR[SONNAR_MRR.length - 1],
    mrrPreviousMonth: SONNAR_MRR[SONNAR_MRR.length - 2],
    activeUsers: SONNAR_SERIES[SONNAR_SERIES.length - 1].activeUsers,
    churnRate: 3.2,
    healthScore: 82,
    infraCost: 1450,
    cac: 420,
    ltv: 4100,
    nrr: 108,
    mrrSeries: SONNAR_SERIES,
  },
  {
    id: "prod-dashy",
    name: "Dashy",
    slug: "dashy",
    status: "ativo",
    description: "Segundo produto SaaS, em fase de tracao.",
    mrr: DASHY_MRR[DASHY_MRR.length - 1],
    mrrPreviousMonth: DASHY_MRR[DASHY_MRR.length - 2],
    activeUsers: DASHY_SERIES[DASHY_SERIES.length - 1].activeUsers,
    churnRate: 5.8,
    healthScore: 71,
    infraCost: 720,
    cac: 295,
    ltv: 2350,
    nrr: 101,
    mrrSeries: DASHY_SERIES,
  },
];

const INFRA: EcosystemInfra = {
  services: [
    {
      id: "svc-sonnar-api",
      name: "Sonnar API",
      productSlug: "sonnar",
      kind: "api",
      status: "operational",
      uptime30d: 99.94,
      latencyP95: 180,
      monthlyCost: 620,
    },
    {
      id: "svc-sonnar-scraper",
      name: "Sonnar Scraper",
      productSlug: "sonnar",
      kind: "worker",
      status: "operational",
      uptime30d: 99.71,
      latencyP95: 0,
      monthlyCost: 480,
    },
    {
      id: "svc-sonnar-db",
      name: "Sonnar Database",
      productSlug: "sonnar",
      kind: "database",
      status: "operational",
      uptime30d: 99.99,
      latencyP95: 42,
      monthlyCost: 350,
    },
    {
      id: "svc-dashy-web",
      name: "Dashy Web",
      productSlug: "dashy",
      kind: "web",
      status: "operational",
      uptime30d: 99.9,
      latencyP95: 90,
      monthlyCost: 320,
    },
    {
      id: "svc-dashy-api",
      name: "Dashy API",
      productSlug: "dashy",
      kind: "api",
      status: "degraded",
      uptime30d: 99.21,
      latencyP95: 410,
      monthlyCost: 240,
    },
    {
      id: "svc-dashy-db",
      name: "Dashy Database",
      productSlug: "dashy",
      kind: "database",
      status: "operational",
      uptime30d: 99.98,
      latencyP95: 55,
      monthlyCost: 160,
    },
  ],
  cronJobs: [
    {
      id: "cron-sonnar-scrape",
      name: "Coleta de vagas",
      productSlug: "sonnar",
      schedule: "A cada hora",
      lastRunAt: hoursAgo(1),
      lastRunOk: true,
    },
    {
      id: "cron-sonnar-digest",
      name: "Resumo diário no Discord",
      productSlug: "sonnar",
      schedule: "Diário, 08:00",
      lastRunAt: hoursAgo(9),
      lastRunOk: true,
    },
    {
      id: "cron-dashy-billing",
      name: "Lembretes de cobrança",
      productSlug: "dashy",
      schedule: "Diário, 07:00",
      lastRunAt: hoursAgo(10),
      lastRunOk: true,
    },
    {
      id: "cron-dashy-rollup",
      name: "Consolidação de métricas",
      productSlug: "dashy",
      schedule: "A cada hora",
      lastRunAt: hoursAgo(2),
      lastRunOk: false,
    },
  ],
  alerts: [
    {
      id: "alert-dashy-latency",
      severity: "warning",
      message: "Latência p95 acima de 400ms na última hora.",
      service: "Dashy API",
      at: hoursAgo(3),
    },
    {
      id: "alert-dashy-rollup",
      severity: "critical",
      message: "Job de consolidação de métricas falhou na última execução.",
      service: "Consolidação de métricas",
      at: hoursAgo(2),
    },
    {
      id: "alert-sonnar-cost",
      severity: "info",
      message: "Custo de infraestrutura 8% acima da média dos últimos 3 meses.",
      service: "Sonnar Scraper",
      at: hoursAgo(20),
    },
  ],
};

/**
 * Carrega o snapshot do ecossistema. Hoje devolve o mock com um atraso
 * artificial para exercitar o estado de carregamento das telas. No futuro,
 * troca-se o corpo desta funcao pela chamada ao Hub.
 */
export async function loadEcosystemSnapshot(): Promise<EcosystemSnapshot> {
  await new Promise((resolve) => setTimeout(resolve, 450));
  return {
    asOf: new Date().toISOString(),
    simulated: true,
    products: PRODUCTS,
    infra: INFRA,
  };
}
