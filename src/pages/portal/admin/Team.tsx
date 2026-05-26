import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";

import { CheckCircle, Phone, Search, Users, Wrench, X, Zap } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import MetricTile from "@/components/portal/shared/MetricTile";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import RowActionMenu from "@/components/portal/shared/RowActionMenu";
import { buttonVariants, AlertDialog, Button, Input, cn } from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { maskPhone } from "@/lib/masks";
import { getSupabaseFunctionAuthHeaders } from "@/lib/supabase-functions";
import { useAuth } from "@/contexts/AuthContext";
import {
  getProfileInitials,
  getProfileAvatarImageStyle,
  resolveProfileAvatarTransform,
} from "@/lib/profile";

const PAGE_SIZE = 9;

type TeamMember = Database["public"]["Tables"]["team_members"]["Row"];
type StatusFilter = "all" | "active" | "inactive";

interface AvatarInfo {
  avatar_url: string | null;
  avatar_zoom: number | null;
  avatar_position_x: number | null;
  avatar_position_y: number | null;
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function AdminTeam() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [avatarMap, setAvatarMap] = useState<Record<string, AvatarInfo>>({});

  const loadMembers = useCallback(async (background = false) => {
    if (!background || !hasLoadedRef.current) {
      setLoading(true);
      setPageError(null);
    }

    const { data, error } = await supabase
      .from("team_members_with_role")
      .select("*")
      .neq("system_role", "cliente")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      if (!hasLoadedRef.current) {
        setPageError(error.message);
        setMembers([]);
        setLoading(false);
      }
      return;
    }

    setMembers(data ?? []);
    hasLoadedRef.current = true;
    setHasLoaded(true);
    setLoading(false);

    // Fetch avatar data from profiles
    const userIds = (data ?? []).map((m) => m.user_id).filter(Boolean) as string[];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, avatar_url, avatar_zoom, avatar_position_x, avatar_position_y")
        .in("id", userIds);
      if (profiles) {
        const map: Record<string, AvatarInfo> = {};
        for (const p of profiles) {
          map[p.id] = {
            avatar_url: p.avatar_url,
            avatar_zoom: p.avatar_zoom,
            avatar_position_x: p.avatar_position_x,
            avatar_position_y: p.avatar_position_y,
          };
        }
        setAvatarMap(map);
      }
    }
  }, []);

  useEffect(() => {
    const refreshMembers = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadMembers(true);
    };

    void loadMembers();

    const interval = window.setInterval(refreshMembers, 60000);
    window.addEventListener("focus", refreshMembers);
    document.addEventListener("visibilitychange", refreshMembers);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshMembers);
      document.removeEventListener("visibilitychange", refreshMembers);
    };
  }, [loadMembers]);

  useEffect(() => {
    setPage(0);
  }, [deferredSearch, statusFilter]);

  const filteredMembers = useMemo(
    () =>
      members.filter((member) => {
        if (member.system_role === "cliente") return false;

        const matchesSearch =
          deferredSearch.length === 0 ||
          member.full_name.toLowerCase().includes(deferredSearch) ||
          member.email.toLowerCase().includes(deferredSearch) ||
          member.role_title.toLowerCase().includes(deferredSearch);

        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && member.is_active) ||
          (statusFilter === "inactive" && !member.is_active);

        return matchesSearch && matchesStatus;
      }),
    [members, deferredSearch, statusFilter]
  );

  const handleToggleActive = async (member: TeamMember) => {
    setActionLoadingId(member.id);
    const { error } = await supabase
      .from("team_members")
      .update({ is_active: !member.is_active })
      .eq("id", member.id);
    setActionLoadingId(null);
    if (error) {
      toast.error("Erro ao atualizar status.", { description: error.message });
      return;
    }
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, is_active: !m.is_active } : m))
    );
    toast.success(member.is_active ? "Membro desativado." : "Membro reativado.");
  };

  const handleDelete = async (id: string) => {
    setActionLoadingId(id);
    const member = members.find((m) => m.id === id);

    try {
      // 1. Delete from team_members first so we can restore it if later steps fail.
      const { error: memberDeleteError } = await supabase
        .from("team_members")
        .delete()
        .eq("id", id);
      if (memberDeleteError) {
        toast.error("Erro ao remover membro.", { description: memberDeleteError.message });
        return;
      }

      // 2. Delete user_roles so the user has no active permissions.
      let deletedRole: string | null = null;
      if (member?.user_id) {
        deletedRole = member.system_role;
        const { error: roleDeleteError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", member.user_id);
        if (roleDeleteError) {
          console.warn("[team-delete] role cleanup:", roleDeleteError.message);
          // Continue — role cleanup is best-effort; auth delete will remove the user anyway
        }
      }

      // 3. Remove from Supabase Auth. Rollback team_members + user_roles if this fails.
      if (member?.user_id) {
        const authHeaders = await getSupabaseFunctionAuthHeaders();
        const { error: authDeleteError } = await supabase.functions.invoke("delete-user", {
          body: { user_id: member.user_id },
          headers: authHeaders,
        });

        if (authDeleteError) {
          // Rollback: restore user_roles first, then team_members
          if (deletedRole) {
            const { error: roleRollback } = await supabase
              .from("user_roles")
              .upsert(
                { user_id: member.user_id, role: deletedRole },
                { onConflict: "user_id,role" }
              );
            if (roleRollback) {
              console.warn("[team-delete] role rollback:", roleRollback.message);
            }
          }

          const rollbackPayload: Database["public"]["Tables"]["team_members"]["Insert"] = {
            id: member.id,
            user_id: member.user_id,
            full_name: member.full_name,
            email: member.email,
            phone: member.phone,
            role_title: member.role_title,
            is_active: member.is_active,
            must_change_password: member.must_change_password,
            created_at: member.created_at,
            updated_at: member.updated_at,
          };

          const { error: rollbackError } = await supabase
            .from("team_members")
            .insert(rollbackPayload);

          if (rollbackError) {
            toast.error("Erro ao remover acesso do membro.", {
              description: `${authDeleteError.message} O registro da equipe não pode ser restaurado automáticamente.`,
            });
            return;
          }

          toast.error("Erro ao remover acesso do membro.", {
            description: "O cadastro foi restaurado porque a exclusao no Auth falhou.",
          });
          return;
        }
      }

      setMembers((prev) => prev.filter((m) => m.id !== id));
      toast.success("Membro removido.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível remover o membro.";
      toast.error("Erro ao remover membro.", { description: message });
    } finally {
      setActionLoadingId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleForcePasswordReset = async (member: TeamMember) => {
    if (!member.email) return;
    setActionLoadingId(member.id);
    try {
      const authHeaders = await getSupabaseFunctionAuthHeaders();
      const { error } = await supabase.functions.invoke("send-password-reset", {
        body: { email: member.email },
        headers: authHeaders,
      });
      if (error) throw error;

      // Mark must_change_password so they're forced to set a new one
      await supabase
        .from("team_members")
        .update({ must_change_password: true })
        .eq("id", member.id);

      toast.success("Link de redefinição enviado.", {
        description: `Um e-mail foi enviado para ${member.email}.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível enviar o e-mail.";
      toast.error("Erro ao redefinir senha.", { description: message });
    } finally {
      setActionLoadingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const visibleMembers = filteredMembers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const { activeMembers, uniqueRoles } = useMemo(
    () => ({
      activeMembers: members.filter((member) => member.is_active).length,
      uniqueRoles: new Set(members.map((member) => member.role_title)).size,
    }),
    [members]
  );

  const memberToDelete = members.find((m) => m.id === confirmDeleteId);

  if (loading && !hasLoaded) return <PortalLoading />;

  return (
    <div className="space-y-8">
      {/* AlertDialog (modal - unchanged) */}
      <AlertDialog
        open={confirmDeleteId !== null}
        title="Remover membro"
        description={
          memberToDelete
            ? `Tem certeza que deseja remover ${memberToDelete.full_name}? Esta ação também removerá o acesso ao painel e não pode ser desfeita.`
            : "Tem certeza que deseja remover este membro?"
        }
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        destructive
        loading={actionLoadingId === confirmDeleteId}
        onConfirm={() => (confirmDeleteId ? void handleDelete(confirmDeleteId) : undefined)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Equipe</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie os membros e acompanhe a estrutura do time.
          </p>
        </div>
        {isAdmin ? (
          <Link to="/portal/admin/equipe/novo" className={buttonVariants({ variant: "default" })}>
            Novo membro
          </Link>
        ) : null}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:gap-3 xl:grid-cols-3">
        <MetricTile
          label="Membros cadastrados"
          value={members.length.toString()}
          icon={Users}
          tone="secondary"
        />
        <MetricTile
          label="Equipe ativa"
          value={activeMembers.toString()}
          icon={CheckCircle}
          tone="success"
        />
        <MetricTile
          label="Funções mapeadas"
          value={uniqueRoles.toString()}
          icon={Zap}
          tone="accent"
        />
      </div>

      {/* Filters (standalone, no Card wrapper) */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar membro"
            className="pl-9"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="flex h-10 min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-48"
        >
          <option value="all">Todos os status</option>
          <option value="active">Apenas ativos</option>
          <option value="inactive">Apenas inativos</option>
        </select>
      </div>

      {/* List */}
      {pageError ? (
        <AdminEmptyState
          icon={Wrench}
          title="Não foi possível carregar a equipe"
          description={`${pageError} Atualize a página ou tente novamente em instantes.`}
          action={
            <Button type="button" onClick={() => void loadMembers()}>
              Tentar novamente
            </Button>
          }
        />
      ) : filteredMembers.length === 0 ? (
        <AdminEmptyState
          icon={Wrench}
          title="Nenhum membro encontrado"
          description="Ajuste os filtros ou registre um novo integrante para alimentar a estrutura do time."
          action={
            isAdmin ? (
              <Link
                to="/portal/admin/equipe/novo"
                className={buttonVariants({ variant: "default" })}
              >
                Cadastrar membro
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Column headers (visible md+) */}
          <div className="hidden xl:grid xl:grid-cols-[minmax(0,1.6fr)_200px_180px_120px_auto] xl:items-center xl:px-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Membro
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Cargo
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Contato
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Status
            </p>
            <p className="text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Ações
            </p>
          </div>

          <div className="space-y-2">
            {visibleMembers.map((member) => (
              <article
                key={member.id}
                className="group rounded-xl border border-border/50 bg-background/60 px-4 py-3 transition-all hover:border-primary/25 hover:bg-card sm:px-5 sm:py-4"
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_200px_180px_120px_auto] xl:items-center">
                  {/* Name + email + actions (mobile: same row) */}
                  <div className="flex items-center justify-between gap-2 xl:contents">
                    <div className="flex min-w-0 items-center gap-3">
                      {(() => {
                        const av = member.user_id ? avatarMap[member.user_id] : undefined;
                        const hasPhoto = av?.avatar_url;
                        if (hasPhoto) {
                          const transform = resolveProfileAvatarTransform({
                            zoom: av.avatar_zoom ?? undefined,
                            positionX: av.avatar_position_x ?? undefined,
                            positionY: av.avatar_position_y ?? undefined,
                          });
                          return (
                            <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
                              <img
                                src={av.avatar_url!}
                                alt={member.full_name}
                                className="h-full w-full object-cover"
                                style={getProfileAvatarImageStyle(transform)}
                              />
                            </span>
                          );
                        }
                        return (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary dark:bg-primary/15">
                            {getProfileInitials(member.full_name)}
                          </span>
                        );
                      })()}
                      <div className="min-w-0">
                        <p
                          className="truncate text-base font-semibold text-foreground"
                          title={member.full_name}
                        >
                          {member.full_name}
                        </p>
                        <p className="truncate text-sm text-muted-foreground" title={member.email}>
                          {member.email}
                        </p>
                      </div>
                    </div>

                    {/* Mobile actions */}
                    <div className="shrink-0 xl:hidden">
                      <RowActionMenu
                        actions={[
                          {
                            label: "Editar",
                            onClick: () => navigate(`/portal/admin/equipe/${member.id}/editar`),
                          },
                          {
                            label: member.is_active ? "Desativar" : "Reativar",
                            onClick: () => void handleToggleActive(member),
                          },
                          {
                            label: "Redefinir senha",
                            onClick: () => void handleForcePasswordReset(member),
                          },
                          ...(isSuperAdmin
                            ? [
                                {
                                  label: "Remover",
                                  onClick: () => setConfirmDeleteId(member.id),
                                  destructive: true,
                                },
                              ]
                            : []),
                        ]}
                      />
                    </div>
                  </div>

                  {/* Role */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:hidden">
                      Cargo
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground xl:mt-0">
                      {member.role_title}
                    </p>
                  </div>

                  {/* Phone */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:hidden">
                      Contato
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground xl:mt-0">
                      <Phone size={14} className="text-muted-foreground" />
                      <span>{member.phone ? maskPhone(member.phone) : "Não informado"}</span>
                    </p>
                  </div>

                  {/* Status */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:hidden">
                      Status
                    </p>
                    <span
                      className={cn(
                        "mt-1 inline-flex min-h-[28px] items-center rounded-full px-3 text-xs font-semibold tracking-wide xl:mt-0",
                        member.is_active
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive"
                      )}
                    >
                      {member.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </div>

                  {/* Desktop actions */}
                  <div className="hidden xl:flex xl:items-center xl:justify-end">
                    <RowActionMenu
                      actions={[
                        {
                          label: "Editar",
                          onClick: () => navigate(`/portal/admin/equipe/${member.id}/editar`),
                        },
                        {
                          label: member.is_active ? "Desativar" : "Reativar",
                          onClick: () => void handleToggleActive(member),
                        },
                        {
                          label: "Redefinir senha",
                          onClick: () => void handleForcePasswordReset(member),
                        },
                        ...(isSuperAdmin
                          ? [
                              {
                                label: "Remover",
                                onClick: () => setConfirmDeleteId(member.id),
                                destructive: true,
                              },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Pagination (no card wrapper) */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Página {page + 1} de {totalPages} · {filteredMembers.length} resultado(s)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
