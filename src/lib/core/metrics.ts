/**
 * Derivacao das metricas consolidadas do ecossistema a partir de um snapshot.
 *
 * Logica independente da fonte do snapshot (mock hoje, Hub amanha), entao
 * sobrevive a troca do loader. Ver docs/ECOSYSTEM-ARCHITECTURE.md secao 8.
 */
import type {
  EcosystemMetrics,
  EcosystemProduct,
  EcosystemSnapshot,
  InfraSummary,
} from "./contract";

/** Clientes novos do produto no mes mais recente da serie. */
function lastNewCustomers(product: EcosystemProduct): number {
  return product.mrrSeries[product.mrrSeries.length - 1]?.newCustomers ?? 0;
}

/** Clientes cancelados do produto no mes mais recente da serie. */
function lastChurnedCustomers(product: EcosystemProduct): number {
  return product.mrrSeries[product.mrrSeries.length - 1]?.churnedCustomers ?? 0;
}

export function computeEcosystemMetrics(snapshot: EcosystemSnapshot): EcosystemMetrics {
  const active = snapshot.products.filter((product) => product.status === "ativo");

  const totalMrr = active.reduce((sum, product) => sum + product.mrr, 0);
  const previousMrr = active.reduce((sum, product) => sum + product.mrrPreviousMonth, 0);
  const totalUsers = active.reduce((sum, product) => sum + product.activeUsers, 0);
  const newCustomers = active.reduce((sum, product) => sum + lastNewCustomers(product), 0);
  const churnedCustomers = active.reduce((sum, product) => sum + lastChurnedCustomers(product), 0);

  // Medias ponderadas: produtos maiores pesam mais no indicador do ecossistema.
  const weightedByMrr = (pick: (product: EcosystemProduct) => number) =>
    totalMrr > 0
      ? active.reduce((sum, product) => sum + product.mrr * pick(product), 0) / totalMrr
      : 0;

  const blendedCac =
    newCustomers > 0
      ? active.reduce((sum, product) => sum + product.cac * lastNewCustomers(product), 0) /
        newCustomers
      : 0;
  const blendedLtv =
    totalUsers > 0
      ? active.reduce((sum, product) => sum + product.ltv * product.activeUsers, 0) / totalUsers
      : 0;

  return {
    totalMrr,
    totalArr: totalMrr * 12,
    mrrGrowthMoM: previousMrr > 0 ? ((totalMrr - previousMrr) / previousMrr) * 100 : null,
    weightedChurn: weightedByMrr((product) => product.churnRate),
    totalActiveUsers: totalUsers,
    totalInfraCost: active.reduce((sum, product) => sum + product.infraCost, 0),
    activeProductCount: active.length,
    avgNrr: weightedByMrr((product) => product.nrr),
    blendedCac,
    blendedLtv,
    ltvCacRatio: blendedCac > 0 ? blendedLtv / blendedCac : 0,
    newCustomersThisMonth: newCustomers,
    churnedCustomersThisMonth: churnedCustomers,
  };
}

/** Resumo da camada de observabilidade do ecossistema. */
export function computeInfraSummary(snapshot: EcosystemSnapshot): InfraSummary {
  const { services, cronJobs, alerts } = snapshot.infra;
  return {
    totalMonthlyCost: services.reduce((sum, service) => sum + service.monthlyCost, 0),
    avgUptime:
      services.length > 0
        ? services.reduce((sum, service) => sum + service.uptime30d, 0) / services.length
        : 0,
    operationalCount: services.filter((service) => service.status === "operational").length,
    totalServices: services.length,
    openAlerts: alerts.length,
    failedJobs: cronJobs.filter((job) => !job.lastRunOk).length,
  };
}
