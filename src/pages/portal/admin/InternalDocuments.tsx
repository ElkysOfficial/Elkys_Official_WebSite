import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Code2, ExternalLink, FileText } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Label,
  buttonVariants,
  cn,
} from "@/design-system";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Audience = "marketing_design" | "developer";
type InternalTeamDocument = Database["public"]["Tables"]["documents"]["Row"];

const AUDIENCE_META: Record<
  Audience,
  {
    eyebrow: string;
    title: string;
    description: string;
    emptyTitle: string;
    emptyDescription: string;
    successMessage: string;
    icon: typeof FileText;
  }
> = {
  marketing_design: {
    eyebrow: "Marketing & Design",
    title: "Documentos internos",
    description:
      "Briefs, links operacionais, peças de apoio e materiais da equipe de Marketing & Design.",
    emptyTitle: "Nenhum documento de Marketing & Design",
    emptyDescription: "Cadastre nome, tipo e link para começar a organizar os materiais da equipe.",
    successMessage: "Documento de Marketing & Design adicionado.",
    icon: FileText,
  },
  developer: {
    eyebrow: "Desenvolvimento",
    title: "Documentos internos",
    description: "Links técnicos, handoffs, materiais de apoio e referências do time dev.",
    emptyTitle: "Nenhum documento de Desenvolvimento",
    emptyDescription:
      "Admins podem cadastrar materiais técnicos para leitura do time de desenvolvimento.",
    successMessage: "Documento de Desenvolvimento adicionado.",
    icon: Code2,
  },
};

function formatDate(dateIso: string) {
  return new Date(dateIso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AdminInternalDocuments({ audience }: { audience: Audience }) {
  const { user, roles } = useAuth();
  const meta = AUDIENCE_META[audience];
  const canManageDocuments = useMemo(() => {
    if (audience === "marketing_design") {
      return roles.some((role) => ["admin_super", "admin", "marketing"].includes(role));
    }

    return roles.some((role) => ["admin_super", "admin"].includes(role));
  }, [audience, roles]);
  const [documents, setDocuments] = useState<InternalTeamDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [form, setForm] = useState({
    label: "",
    type_label: "",
    url: "",
  });

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setPageError(null);

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("audience", audience)
      .order("created_at", { ascending: false });

    if (error) {
      setPageError(error.message);
      setDocuments([]);
      setLoading(false);
      return;
    }

    setDocuments((data as InternalTeamDocument[] | null) ?? []);
    setLoading(false);
  }, [audience]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const handleSave = async () => {
    if (!form.label.trim() || !form.type_label.trim() || !form.url.trim()) {
      toast.error("Preencha nome, tipo e link do documento.");
      return;
    }

    try {
      new URL(form.url.trim());
    } catch {
      toast.error("Informe um link válido.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("documents").insert({
      audience,
      client_id: null,
      type: "outro",
      visibility: "interno",
      label: form.label.trim(),
      description: form.type_label.trim(),
      url: form.url.trim(),
      uploaded_by: user?.id ?? null,
    });

    setSaving(false);

    if (error) {
      toast.error("Não foi possível salvar o documento.", {
        description: error.message,
      });
      return;
    }

    setForm({ label: "", type_label: "", url: "" });
    await loadDocuments();
    toast.success(meta.successMessage);
  };

  const handleRemove = async () => {
    if (!deleteDocumentId) return;

    setRemoving(true);

    const { error } = await supabase.from("documents").delete().eq("id", deleteDocumentId);

    setRemoving(false);

    if (error) {
      toast.error("Não foi possível remover o documento.", {
        description: error.message,
      });
      return;
    }

    setDeleteDocumentId(null);
    await loadDocuments();
    toast.success("Documento removido.");
  };

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {meta.eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            {meta.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{meta.description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] font-semibold text-muted-foreground">
          {documents.length} documento{documents.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className={canManageDocuments ? "grid gap-6 xl:grid-cols-[1fr_1fr]" : ""}>
        {/* ── Add form ── */}
        {canManageDocuments ? (
          <Card className="border-border/60">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-base">Adicionar documento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <Field>
                <Label htmlFor="doc_label">Nome</Label>
                <Input
                  id="doc_label"
                  name="doc_label"
                  value={form.label}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, label: event.target.value }))
                  }
                  placeholder="Ex: Guia visual da campanha"
                />
              </Field>

              <Field>
                <Label htmlFor="doc_type_label">Tipo</Label>
                <Input
                  id="doc_type_label"
                  name="doc_type_label"
                  value={form.type_label}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, type_label: event.target.value }))
                  }
                  placeholder="Ex: Briefing, referência, handoff"
                />
              </Field>

              <Field>
                <Label htmlFor="doc_url">Link</Label>
                <Input
                  id="doc_url"
                  name="doc_url"
                  type="url"
                  value={form.url}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, url: event.target.value }))
                  }
                  placeholder="https://..."
                />
              </Field>

              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  loading={saving}
                  loadingText="Salvando..."
                >
                  Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* ── Document list ── */}
        <div className="space-y-2 [&>*]:h-full">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[72px] animate-pulse rounded-xl border border-border/50 bg-card/60"
                />
              ))}
            </div>
          ) : pageError ? (
            <AdminEmptyState
              icon={meta.icon}
              title="Não foi possível carregar os documentos"
              description={pageError}
              action={
                <Button type="button" onClick={() => void loadDocuments()}>
                  Tentar novamente
                </Button>
              }
            />
          ) : documents.length === 0 ? (
            <AdminEmptyState
              icon={meta.icon}
              title={meta.emptyTitle}
              description={meta.emptyDescription}
            />
          ) : (
            documents.map((document) => (
              <article
                key={document.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/60 px-4 py-3 transition-all hover:border-primary/25 hover:bg-card sm:gap-4 sm:px-5 sm:py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className="truncate text-sm font-semibold text-foreground"
                      title={document.label}
                    >
                      {document.label}
                    </p>
                    <span className="shrink-0 rounded-full border border-border/50 bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {document.description}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(document.created_at)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={document.url}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    <ExternalLink size={14} />
                    <span className="hidden sm:inline">Abrir</span>
                  </a>

                  {canManageDocuments ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteDocumentId(document.id)}
                    >
                      Remover
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <AlertDialog
        open={deleteDocumentId !== null}
        title="Remover documento"
        description="Essa ação remove o link da equipe desta área interna."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        destructive
        loading={removing}
        loadingLabel="Removendo..."
        onConfirm={() => void handleRemove()}
        onCancel={() => {
          if (!removing) setDeleteDocumentId(null);
        }}
      />
    </div>
  );
}
