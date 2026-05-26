/**
 * Hook de clientes para o admin portal.
 *
 * Carrega clientes + contratos + cobrancas + projetos + propostas
 * em paralelo e calcula indicadores operacionais por cliente:
 * - hasOverdueCharges: cliente tem cobranca atrasada
 * - hasActiveProject: projeto em andamento
 * - hasPendingProposal: proposta enviada aguardando resposta
 * - contractExpiringSoon: contrato vence em menos de 30 dias
 *
 * Isso evita N+1 queries na listagem — tudo agregado em memoria.
 *
 * Usado por: Clients.tsx, ClientDetail.tsx, Finance.tsx
 * Cache: 2min stale, 10min garbage collection
 *
 * @example
 * const { data, isLoading } = useAdminClients();
 * // data.clients: ClientRow[]
 * // data.indicators: Map<string, AdminClientIndicators>
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// Auditoria 2026-05-25 (Onda 3.1): colunas snapshot removidas de clients.
// monthly_value, project_total_value, contract_status, contract_type, contract_end
// vem da view client_financial_summary (calculo real-time).
const CLIENTS_SELECT =
  "id, user_id, full_name, nome_fantasia, client_type, email, cpf, phone, is_active, client_since, client_origin, tags, created_at";

/**
 * Flags operacionais calculadas por cliente a partir de charges,
 * projects e proposals. Permitem renderizar indicadores inline na
 * listagem sem precisar fazer N+1 queries — tudo agregado em memória
 * após um único batch de leituras.
 */
export interface AdminClientIndicators {
  hasOverdueCharges: boolean;
  hasActiveProject: boolean;
  hasPendingProposal: boolean;
  contractExpiringSoon: boolean;
}

async function fetchClients() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [clientsRes, contractsRes, chargesRes, projectsRes, proposalsRes, summaryRes] =
    await Promise.all([
      supabase
        .from("clients")
        .select(CLIENTS_SELECT)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("project_contracts").select("client_id, total_amount"),
      supabase
        .from("charges")
        .select("client_id, status, due_date")
        .in("status", ["pendente", "atrasado"]),
      supabase.from("projects").select("client_id, status").eq("status", "em_andamento"),
      supabase.from("proposals").select("client_id, status").eq("status", "enviada"),
      // PA11: fonte de verdade para monthly_value e contract_status.
      // View calculada a partir de project_contracts + charges (P10/P18).
      supabase
        .from("client_financial_summary")
        .select(
          "client_id, monthly_value, contract_status_calculated, contract_type_calculated, contract_end_calculated"
        ),
    ]);

  if (clientsRes.error) throw clientsRes.error;
  if (contractsRes.error) throw contractsRes.error;
  if (chargesRes.error) throw chargesRes.error;
  if (projectsRes.error) throw projectsRes.error;
  if (proposalsRes.error) throw proposalsRes.error;
  if (summaryRes.error) throw summaryRes.error;

  // Mapa client_id -> summary calculado. Usado para sobrescrever os
  // snapshots legados de clients (monthly_value, contract_status) que
  // estao congelados em 0 / 'ativo' apos o write guard de P18.
  const summaryMap = new Map<
    string,
    {
      monthly: number;
      status: string | null;
      type: string | null;
      end: string | null;
    }
  >();
  for (const s of (summaryRes.data ?? []) as Array<{
    client_id: string | null;
    monthly_value: number | null;
    contract_status_calculated: string | null;
    contract_type_calculated: string | null;
    contract_end_calculated: string | null;
  }>) {
    if (!s.client_id) continue;
    summaryMap.set(s.client_id, {
      monthly: Number(s.monthly_value ?? 0),
      status: s.contract_status_calculated ?? null,
      type: s.contract_type_calculated ?? null,
      end: s.contract_end_calculated ?? null,
    });
  }

  const contractTotals = new Map<string, number>();
  for (const c of contractsRes.data ?? []) {
    contractTotals.set(
      c.client_id,
      (contractTotals.get(c.client_id) ?? 0) + Number(c.total_amount)
    );
  }

  const overdueClientIds = new Set<string>();
  for (const charge of chargesRes.data ?? []) {
    // "atrasado" já é explícito; "pendente" só conta se o vencimento já passou
    if (charge.status === "atrasado" || charge.due_date < todayStr) {
      overdueClientIds.add(charge.client_id);
    }
  }

  const activeProjectClientIds = new Set<string>();
  for (const project of projectsRes.data ?? []) {
    activeProjectClientIds.add(project.client_id);
  }

  const pendingProposalClientIds = new Set<string>();
  for (const proposal of proposalsRes.data ?? []) {
    if (proposal.client_id) pendingProposalClientIds.add(proposal.client_id);
  }

  // Janela de 30 dias para "contrato vencendo"
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const expiringCutoff = thirtyDaysFromNow.toISOString().slice(0, 10);

  return (clientsRes.data ?? []).map((client) => {
    const summary = summaryMap.get(client.id);
    const contractEnd = summary?.end ?? null;
    const contractExpiringSoon =
      typeof contractEnd === "string" && contractEnd >= todayStr && contractEnd <= expiringCutoff;

    const indicators: AdminClientIndicators = {
      hasOverdueCharges: overdueClientIds.has(client.id),
      hasActiveProject: activeProjectClientIds.has(client.id),
      hasPendingProposal: pendingProposalClientIds.has(client.id),
      contractExpiringSoon,
    };

    // Auditoria 2026-05-25: clients nao tem mais os snapshots; valores vem da view calculada.
    return {
      ...client,
      monthly_value: summary?.monthly ?? 0,
      contract_status: (summary?.status ?? null) as
        | Database["public"]["Enums"]["contract_status"]
        | null,
      contract_type: (summary?.type ?? null) as Database["public"]["Enums"]["contract_type"] | null,
      contract_end: summary?.end ?? null,
      project_total_value: contractTotals.get(client.id) ?? 0,
      indicators,
    };
  });
}

export function useAdminClients() {
  return useQuery({
    queryKey: ["admin-clients"],
    queryFn: fetchClients,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
