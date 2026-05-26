import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";

import {
  buttonVariants,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorText,
  Field,
  Input,
  Label,
} from "@/design-system";
import AlertBanner from "@/components/portal/shared/AlertBanner";
import DraftBanner from "@/components/portal/shared/DraftBanner";
import { useAuth } from "@/contexts/AuthContext";
import { useFormDraftAutoSave } from "@/hooks/useFormDraftAutoSave";
import { supabase } from "@/integrations/supabase/client";
import { maskCPF, maskDate, maskPhone, isValidCPF, parseFormDate, unmaskDigits } from "@/lib/masks";
import { getSupabaseFunctionAuthHeaders } from "@/lib/supabase-functions";
import type { Database } from "@/integrations/supabase/types";
import { useEffect } from "react";

type AppRole = Database["public"]["Enums"]["app_role"];

type TeamOption = { user_id: string; full_name: string };

const ROLE_OPTIONS: { value: AppRole; label: string; description: string }[] = [
  {
    value: "admin_super",
    label: "Admin Super",
    description:
      "Acesso total à plataforma, incluindo ações críticas (exclusão permanente e operações irreversíveis).",
  },
  {
    value: "admin",
    label: "Admin",
    description:
      "Gestão operacional completa — cadastros, edição, finanças e equipe, sem ações irreversíveis.",
  },
  {
    value: "comercial",
    label: "Comercial",
    description: "CRM, leads e propostas — ownership completo do funil comercial.",
  },
  {
    value: "juridico",
    label: "Jurídico",
    description: "Contratos, anexos jurídicos e histórico de versões.",
  },
  {
    value: "financeiro",
    label: "Financeiro",
    description: "Cobrança, visão financeira, despesas e régua automática (leitura operacional).",
  },
  {
    value: "marketing",
    label: "Marketing",
    description: "Calendário editorial e documentos de Marketing & Design.",
  },
  {
    value: "developer",
    label: "Desenvolvimento — Developer",
    description: "Projetos, tarefas técnicas, documentação de dev e suporte técnico.",
  },
  {
    value: "designer",
    label: "Desenvolvimento — Designer",
    description: "Projetos, entregáveis visuais, UX/UI e documentação técnica.",
  },
  {
    value: "po",
    label: "Desenvolvimento — PO",
    description:
      "Projetos, gestão de entregas, tarefas e acompanhamento do time de desenvolvimento.",
  },
  {
    value: "support",
    label: "Suporte",
    description: "Pós-venda — tickets de suporte e histórico de atendimento.",
  },
];

const selectClass =
  "flex h-10 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const teamSchema = z.object({
  full_name: z.string().min(3, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional(),
  gender: z.enum(["", "masculino", "feminino"]).optional(),
  cpf: z.string().optional(),
  birth_date: z.string().optional(),
  senioridade: z
    .enum(["", "estagiario", "junior", "pleno", "senior", "lead", "gerente"])
    .optional(),
  manager_id: z.string().optional(),
  system_role: z.enum([
    "admin_super",
    "admin",
    "comercial",
    "juridico",
    "financeiro",
    "marketing",
    "developer",
    "designer",
    "po",
    "support",
  ]),
  status: z.enum(["active", "inactive"]),
});

type TeamForm = z.infer<typeof teamSchema>;

function generateTempPassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const specials = "!@#$%&*";
  const all = upper + lower + digits + specials;
  const rand = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const base = [rand(upper), rand(lower), rand(digits), rand(specials)];
  for (let i = 0; i < 6; i++) base.push(rand(all));
  return base.sort(() => Math.random() - 0.5).join("");
}

export default function AdminTeamCreate() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<TeamForm>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      status: "active",
      system_role: "developer",
      gender: "",
      senioridade: "",
      manager_id: "",
    },
  });

  const selectedRole = watch("system_role");
  const roleInfo = ROLE_OPTIONS.find((r) => r.value === selectedRole);

  const [managerOptions, setManagerOptions] = useState<TeamOption[]>([]);

  // Carrega opcoes de "lider direto". Mantemos o filtro de ativos, mas
  // sempre incluimos o usuario logado (mesmo que o team_members dele esteja
  // marcado inativo ou com user_id desalinhado) — sem isso, um admin_super
  // recem-criado nao consegue se selecionar.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("team_members")
        .select("user_id, full_name, email, is_active")
        .order("full_name", { ascending: true });

      if (!active || !data) return;

      const currentUserId = user?.id ?? null;
      const currentUserEmail = user?.email?.toLowerCase() ?? null;

      const seen = new Set<string>();
      const opts: TeamOption[] = [];

      // Inclui ativos com user_id (caso comum) + o usuario logado, ainda
      // que o registro dele esteja inativo ou sem user_id no team_members.
      for (const t of data) {
        const isCurrentUser =
          (currentUserId && t.user_id === currentUserId) ||
          (currentUserEmail && t.email?.toLowerCase() === currentUserEmail);

        if (!t.is_active && !isCurrentUser) continue;

        const resolvedUserId = t.user_id ?? (isCurrentUser ? currentUserId : null);
        if (!resolvedUserId || seen.has(resolvedUserId)) continue;

        seen.add(resolvedUserId);
        opts.push({ user_id: resolvedUserId, full_name: t.full_name });
      }

      // Fallback ultimo recurso: se mesmo assim o usuario logado nao apareceu
      // (sem nenhum team_member rastreavel), forca a entrada usando o nome
      // dos metadados de auth — assim Lucelho sempre se ve.
      if (currentUserId && !seen.has(currentUserId)) {
        const metaName =
          (user?.user_metadata?.full_name as string | undefined) ??
          (user?.user_metadata?.name as string | undefined) ??
          currentUserEmail ??
          "Você";
        opts.unshift({ user_id: currentUserId, full_name: `${metaName} (você)` });
      }

      setManagerOptions(opts);
    })();
    return () => {
      active = false;
    };
  }, [user?.id, user?.email, user?.user_metadata]);

  /* ── Auto-save de rascunho local ── */
  const watchedValues = watch();
  const draftKey = `elkys:admin:team-create:draft:${user?.id ?? "anon"}`;
  const {
    hasDraft: hasLocalDraft,
    draftSavedAt: localDraftSavedAt,
    restore: restoreLocalDraft,
    discard: discardLocalDraft,
    clearDraft: clearLocalDraft,
  } = useFormDraftAutoSave<TeamForm>({
    storageKey: draftKey,
    values: watchedValues,
    onRestore: (restored) => reset(restored),
    autoRestore: false,
  });

  const onSubmit = async (data: TeamForm) => {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    let createdUserId: string | null = null;
    let shouldRollbackUser = false;

    try {
      const roleLabel =
        ROLE_OPTIONS.find((r) => r.value === data.system_role)?.label ?? data.system_role;
      const tempPassword = generateTempPassword();
      const authHeaders = await getSupabaseFunctionAuthHeaders();

      if (data.cpf && !isValidCPF(unmaskDigits(data.cpf))) {
        throw new Error("CPF inválido.");
      }

      // 1. Create auth user via Admin API (no Supabase confirmation email)
      const { data: createData, error: createError } = await supabase.functions.invoke(
        "create-user",
        {
          body: { email: data.email, password: tempPassword, full_name: data.full_name },
          headers: authHeaders,
        }
      );
      if (createError) throw new Error(`create-user: ${createError.message}`);
      if (createData?.error) throw new Error(String(createData.error));
      if (!createData?.user_id)
        throw new Error("Não foi possível criar o usuário. Verifique o e-mail.");
      const newUserId = createData.user_id as string;
      createdUserId = newUserId;
      shouldRollbackUser = true;

      // 2. Insert team member record
      const { error: memberError } = await supabase.from("team_members").insert({
        user_id: newUserId ?? null,
        full_name: data.full_name,
        email: data.email,
        phone: data.phone || null,
        gender: data.gender || null,
        cpf: data.cpf ? unmaskDigits(data.cpf) : null,
        birth_date: parseFormDate(data.birth_date ?? ""),
        senioridade: data.senioridade || null,
        manager_id: data.manager_id || null,
        role_title: roleLabel,
        is_active: data.status === "active",
        must_change_password: true,
      });
      if (memberError) throw memberError;

      // 3. Assign role in user_roles
      if (newUserId) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({ user_id: newUserId, role: data.system_role });

        if (roleError) throw roleError;
      }

      shouldRollbackUser = false;

      // 4. Send welcome email
      const { error: emailError } = await supabase.functions.invoke("send-team-welcome", {
        body: {
          email: data.email,
          name: data.full_name,
          temp_password: tempPassword,
          role_label: roleLabel,
          gender: data.gender || null,
        },
        headers: authHeaders,
      });
      if (emailError) {
        console.warn("[send-team-welcome] email error:", emailError.message);
      }

      toast.success("Membro cadastrado com sucesso.", {
        description: `${data.full_name} receberá um e-mail com as credenciais de acesso.`,
      });
      clearLocalDraft();
      navigate("/portal/admin/equipe", { replace: true });
    } catch (submitError) {
      if (shouldRollbackUser && createdUserId) {
        try {
          await supabase.functions.invoke("delete-user", {
            body: { user_id: createdUserId },
            headers: await getSupabaseFunctionAuthHeaders(),
          });
        } catch (rollbackError) {
          console.error("[team-create] rollback delete-user failed", rollbackError);
        }
      }

      const message =
        submitError instanceof Error ? submitError.message : "Não foi possível cadastrar o membro.";
      setFormError(
        message.includes("already registered") || message.includes("duplicate key")
          ? "E-mail já cadastrado."
          : message
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link to="/portal/admin/equipe" className={buttonVariants({ variant: "outline" })}>
          Voltar para equipe
        </Link>
      </div>

      {hasLocalDraft && (
        <DraftBanner
          savedAt={localDraftSavedAt}
          onRestore={restoreLocalDraft}
          onDiscard={discardLocalDraft}
          title="Rascunho de membro encontrado"
        />
      )}

      <Card className="border-border/70 bg-card/92">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-lg">Dados do membro</CardTitle>
          <CardDescription>
            Registre nome, contato, cargo e nível de acesso do integrante.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {formError ? (
            <div className="mb-5">
              <AlertBanner tone="destructive" title={formError} />
            </div>
          ) : null}

          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field>
              <Label required>Nome completo</Label>
              <Input {...register("full_name")} placeholder="Nome do membro" />
              <ErrorText className={errors.full_name ? "" : "invisible"}>
                {errors.full_name?.message || "\u00A0"}
              </ErrorText>
            </Field>

            <Field>
              <Label required>E-mail</Label>
              <Input {...register("email")} type="email" placeholder="email@elkys.com.br" />
              <ErrorText className={errors.email ? "" : "invisible"}>
                {errors.email?.message || "\u00A0"}
              </ErrorText>
            </Field>

            <Field>
              <Label>Telefone</Label>
              <Controller
                name="phone"
                control={control}
                defaultValue=""
                render={({ field }) => (
                  <Input
                    {...field}
                    onChange={(event) => field.onChange(maskPhone(event.target.value))}
                    placeholder="(31) 99999-9999"
                  />
                )}
              />
            </Field>

            <Field>
              <Label>Tratamento formal</Label>
              <select {...register("gender")} className={selectClass}>
                <option value="">Prezado(a) — não informado</option>
                <option value="masculino">Sr. (masculino)</option>
                <option value="feminino">Sra. (feminino)</option>
              </select>
            </Field>

            <Field>
              <Label>CPF</Label>
              <Controller
                name="cpf"
                control={control}
                defaultValue=""
                render={({ field }) => (
                  <Input
                    {...field}
                    onChange={(event) => field.onChange(maskCPF(event.target.value))}
                    placeholder="000.000.000-00"
                  />
                )}
              />
            </Field>

            <Field>
              <Label>Data de nascimento</Label>
              <Controller
                name="birth_date"
                control={control}
                defaultValue=""
                render={({ field }) => (
                  <Input
                    {...field}
                    onChange={(event) => field.onChange(maskDate(event.target.value))}
                    placeholder="DD/MM/AAAA"
                    inputMode="numeric"
                  />
                )}
              />
            </Field>

            <Field>
              <Label>Senioridade</Label>
              <select {...register("senioridade")} className={selectClass}>
                <option value="">Não informado</option>
                <option value="estagiario">Estagiário(a)</option>
                <option value="junior">Júnior</option>
                <option value="pleno">Pleno</option>
                <option value="senior">Sênior</option>
                <option value="lead">Lead / Tech Lead</option>
                <option value="gerente">Gerente</option>
              </select>
            </Field>

            <Field>
              <Label>Líder direto</Label>
              <select {...register("manager_id")} className={selectClass}>
                <option value="">Não atribuído</option>
                {managerOptions.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <Label required>Cargo / Nível de acesso</Label>
              <select {...register("system_role")} className={selectClass}>
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className={`mt-1 text-xs text-muted-foreground ${roleInfo ? "" : "invisible"}`}>
                {roleInfo?.description || "\u00A0"}
              </p>
              <ErrorText className={errors.system_role ? "" : "invisible"}>
                {errors.system_role?.message || "\u00A0"}
              </ErrorText>
            </Field>

            <Field>
              <Label required>Status</Label>
              <select {...register("status")} className={selectClass}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
              <ErrorText className={errors.status ? "" : "invisible"}>
                {errors.status?.message || "\u00A0"}
              </ErrorText>
            </Field>

            <div className="flex justify-end md:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando membro..." : "Salvar membro"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
