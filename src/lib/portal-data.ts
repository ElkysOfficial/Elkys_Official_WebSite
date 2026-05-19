/**
 * Camada de dados do portal — funcoes async que encapsulam queries ao Supabase.
 *
 * Todas retornam `{ data, error }` para tratamento uniforme nos componentes.
 * Usadas pelos hooks `useAdmin*` e `useClient*` com React Query.
 *
 * @module portal-data
 */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type {
  PortalCharge,
  PortalClient,
  PortalDocument,
  PortalNextStep,
  PortalProject,
  PortalProjectContract,
  PortalProjectInstallment,
  PortalProjectSubscription,
  PortalTimelineEvent,
} from "@/lib/portal";

type PortalTicket = Database["public"]["Tables"]["support_tickets"]["Row"];

/**
 * Resolve o registro `clients` vinculado ao auth user (via user_id direto
 * ou client_contacts.auth_user_id).
 *
 * Usa o RPC get_client_for_portal_user que consolida o lookup em 1
 * round-trip. Se o RPC falhar com "function does not exist" (migration
 * ainda nao aplicada), cai no fluxo antigo de 2-3 queries sequenciais.
 * O fallback pode ser removido quando a migration estiver em producao.
 */
export async function resolveClientForUser(userId: string) {
  const rpcRes = await supabase
    .rpc("get_client_for_portal_user", { _user_id: userId })
    .maybeSingle();

  // Sucesso do RPC (inclui caso data = null = usuario nao vinculado)
  if (!rpcRes.error) {
    return { client: (rpcRes.data as PortalClient | null) ?? null, error: null };
  }

  // Fallback quando RPC nao existe: 42883 = undefined_function no Postgres.
  // Remover este bloco depois que a migration 20260419000000_get_client_for_portal_user
  // estiver aplicada em todos os ambientes (prod + staging).
  const isMissingRpc =
    rpcRes.error.code === "42883" ||
    rpcRes.error.message?.includes("function") ||
    rpcRes.error.message?.includes("does not exist");

  if (!isMissingRpc) {
    return { client: null, error: rpcRes.error };
  }

  // Fluxo legado: 3 queries sequenciais
  const directClientRes = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (directClientRes.data) {
    return { client: directClientRes.data as PortalClient, error: directClientRes.error };
  }

  if (directClientRes.error) {
    return { client: null, error: directClientRes.error };
  }

  const contactRes = await supabase
    .from("client_contacts")
    .select("client_id")
    .eq("auth_user_id", userId)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactRes.error) {
    return { client: null, error: contactRes.error };
  }

  if (!contactRes.data?.client_id) {
    return { client: null, error: null };
  }

  const clientRes = await supabase
    .from("clients")
    .select("*")
    .eq("id", contactRes.data.client_id)
    .maybeSingle();

  return { client: (clientRes.data as PortalClient | null) ?? null, error: clientRes.error };
}

/** Lista todos os projetos de um cliente, ordenados do mais recente. */
export async function loadProjectsForClient(clientId: string) {
  const projectsRes = await supabase
    .from("projects")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  return {
    projects: (projectsRes.data as PortalProject[] | null) ?? [],
    error: projectsRes.error,
  };
}

/** Carrega um projeto pelo ID (retorna null se nao encontrado). */
export async function loadProjectById(projectId: string) {
  const projectRes = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  return {
    project: (projectRes.data as PortalProject | null) ?? null,
    error: projectRes.error,
  };
}

/** Lista cobrancas de um cliente (todas, incluindo historicas). */
export async function loadChargesForClient(clientId: string) {
  const chargesRes = await supabase
    .from("charges")
    .select("*")
    .eq("client_id", clientId)
    .order("due_date", { ascending: false });

  return {
    charges: (chargesRes.data as PortalCharge[] | null) ?? [],
    error: chargesRes.error,
  };
}

/** Lista cobrancas de um projeto especifico, ordenadas por vencimento. */
export async function loadChargesForProject(projectId: string, clientId: string) {
  const chargesRes = await supabase
    .from("charges")
    .select("*")
    .eq("project_id", projectId)
    .eq("client_id", clientId)
    .order("due_date", { ascending: true });

  return {
    charges: (chargesRes.data as PortalCharge[] | null) ?? [],
    error: chargesRes.error,
  };
}

/** Lista contratos vinculados a um projeto. */
export async function loadContractsForProject(projectId: string) {
  const res = await supabase
    .from("project_contracts")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return { contracts: (res.data as PortalProjectContract[] | null) ?? [], error: res.error };
}

/** Lista parcelas (installments) de um projeto. */
export async function loadInstallmentsForProject(projectId: string) {
  const res = await supabase
    .from("project_installments")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  return { installments: (res.data as PortalProjectInstallment[] | null) ?? [], error: res.error };
}

/** Lista assinaturas recorrentes de um projeto. */
export async function loadSubscriptionsForProject(projectId: string) {
  const res = await supabase
    .from("project_subscriptions")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return {
    subscriptions: (res.data as PortalProjectSubscription[] | null) ?? [],
    error: res.error,
  };
}

/** Lista proximos passos (pendencias) de um projeto. Filtra por visibilidade se necessario. */
export async function loadNextStepsForProject(projectId: string, onlyClientVisible = false) {
  let query = supabase
    .from("project_next_steps")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (onlyClientVisible) query = query.eq("client_visible", true);

  const res = await query;

  return { nextSteps: (res.data as PortalNextStep[] | null) ?? [], error: res.error };
}

/** Lista eventos da timeline de um projeto (ordem decrescente). */
export async function loadTimelineForProject(projectId: string, clientVisibleOnly = false) {
  let query = supabase
    .from("timeline_events")
    .select("*")
    .eq("project_id", projectId)
    .order("occurred_at", { ascending: false });

  if (clientVisibleOnly) query = query.in("visibility", ["cliente", "ambos"]);

  const res = await query;

  return { events: (res.data as PortalTimelineEvent[] | null) ?? [], error: res.error };
}

/** Lista documentos do cliente, opcionalmente filtrados por projeto. */
export async function loadDocumentsForProject(clientId: string, projectId?: string) {
  let query = supabase
    .from("documents")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);

  const res = await query;
  return { documents: (res.data as PortalDocument[] | null) ?? [], error: res.error };
}

/** Lista tickets de suporte de um cliente. */
export async function loadSupportTicketsForClient(clientId: string) {
  const res = await supabase
    .from("support_tickets")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  return { tickets: (res.data as PortalTicket[] | null) ?? [], error: res.error };
}

/* -------------------------------------------------------------------------- */
/* Rastreio de comunicacao (encurtador + pixel de abertura)                   */
/* -------------------------------------------------------------------------- */

export type CommunicationRow = Database["public"]["Tables"]["communications"]["Row"];
export type TrackingEventRow = Pick<
  Database["public"]["Tables"]["tracking_events"]["Row"],
  "communication_id" | "event_type" | "created_at"
>;

/**
 * Carrega as comunicacoes (e-mails enviados pelo portal) criadas a partir de
 * `sinceIso`. Usado pelo dashboard de comunicacoes do portal admin.
 */
export async function loadCommunications(sinceIso: string) {
  const res = await supabase
    .from("communications")
    .select(
      "id, kind, client_id, recipient_email, entity_type, entity_id, email_status, created_at"
    )
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  return { data: (res.data as CommunicationRow[] | null) ?? [], error: res.error };
}

/**
 * Carrega os eventos brutos de abertura/clique a partir de `sinceIso`.
 * O dashboard cruza esses eventos com as comunicacoes em memoria.
 */
export async function loadTrackingEvents(sinceIso: string) {
  const res = await supabase
    .from("tracking_events")
    .select("communication_id, event_type, created_at")
    .gte("created_at", sinceIso);

  return { data: (res.data as TrackingEventRow[] | null) ?? [], error: res.error };
}
