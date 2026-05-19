import type { BreadcrumbTrailItem } from "@/components/portal/shared/PortalBreadcrumbs";

const ADMIN_ROOT: BreadcrumbTrailItem = {
  label: "Visão Geral",
  href: "/portal/admin",
};

interface SectionDef {
  match: (pathname: string) => boolean;
  trail: (pathname: string) => BreadcrumbTrailItem[];
}

const SECTIONS: SectionDef[] = [
  // Clientes
  {
    match: (p) => p === "/portal/admin/clientes",
    trail: () => [ADMIN_ROOT, { label: "Clientes" }],
  },
  {
    match: (p) => p === "/portal/admin/clientes/novo",
    trail: () => [
      ADMIN_ROOT,
      { label: "Clientes", href: "/portal/admin/clientes" },
      { label: "Novo cliente" },
    ],
  },
  {
    match: (p) => p.startsWith("/portal/admin/clientes/"),
    trail: () => [
      ADMIN_ROOT,
      { label: "Clientes", href: "/portal/admin/clientes" },
      { label: "Detalhes do cliente" },
    ],
  },

  // Projetos
  {
    match: (p) => p === "/portal/admin/projetos",
    trail: () => [ADMIN_ROOT, { label: "Projetos" }],
  },
  {
    match: (p) => p === "/portal/admin/projetos/novo",
    trail: () => [
      ADMIN_ROOT,
      { label: "Projetos", href: "/portal/admin/projetos" },
      { label: "Novo projeto" },
    ],
  },
  {
    match: (p) => p.startsWith("/portal/admin/projetos/"),
    trail: () => [
      ADMIN_ROOT,
      { label: "Projetos", href: "/portal/admin/projetos" },
      { label: "Detalhes do projeto" },
    ],
  },

  // Tarefas
  {
    match: (p) => p === "/portal/admin/tarefas",
    trail: () => [ADMIN_ROOT, { label: "Tarefas" }],
  },

  // Financeiro
  {
    match: (p) => p === "/portal/admin/financeiro",
    trail: () => [ADMIN_ROOT, { label: "Financeiro" }],
  },
  {
    match: (p) => p === "/portal/admin/comunicacoes",
    trail: () => [ADMIN_ROOT, { label: "Comunicações" }],
  },
  {
    match: (p) => p === "/portal/admin/financeiro/nova-despesa",
    trail: () => [
      ADMIN_ROOT,
      { label: "Financeiro", href: "/portal/admin/financeiro" },
      { label: "Nova despesa" },
    ],
  },
  {
    match: (p) => p === "/portal/admin/cobranca-automatica",
    trail: () => [
      ADMIN_ROOT,
      { label: "Financeiro", href: "/portal/admin/financeiro" },
      { label: "Régua de Cobrança" },
    ],
  },

  // CRM
  {
    match: (p) => p === "/portal/admin/crm",
    trail: () => [ADMIN_ROOT, { label: "CRM" }],
  },
  {
    match: (p) => p.startsWith("/portal/admin/leads/"),
    trail: () => [
      ADMIN_ROOT,
      { label: "CRM", href: "/portal/admin/crm" },
      { label: "Detalhe do lead" },
    ],
  },
  {
    match: (p) => p === "/portal/admin/propostas/nova",
    trail: () => [
      ADMIN_ROOT,
      { label: "CRM", href: "/portal/admin/crm" },
      { label: "Nova proposta" },
    ],
  },
  {
    match: (p) => p.startsWith("/portal/admin/propostas/"),
    trail: () => [
      ADMIN_ROOT,
      { label: "CRM", href: "/portal/admin/crm" },
      { label: "Detalhe da proposta" },
    ],
  },

  // Suporte
  {
    match: (p) => p === "/portal/admin/suporte",
    trail: () => [ADMIN_ROOT, { label: "Suporte" }],
  },

  // Equipe
  {
    match: (p) => p === "/portal/admin/equipe",
    trail: () => [ADMIN_ROOT, { label: "Equipe" }],
  },
  {
    match: (p) => p === "/portal/admin/equipe/novo",
    trail: () => [
      ADMIN_ROOT,
      { label: "Equipe", href: "/portal/admin/equipe" },
      { label: "Novo membro" },
    ],
  },
  {
    match: (p) => p.startsWith("/portal/admin/equipe/") && p.endsWith("/editar"),
    trail: () => [
      ADMIN_ROOT,
      { label: "Equipe", href: "/portal/admin/equipe" },
      { label: "Editar membro" },
    ],
  },

  // Marketing
  {
    match: (p) => p === "/portal/admin/calendario",
    trail: () => [ADMIN_ROOT, { label: "Calendário" }],
  },
  {
    match: (p) => p === "/portal/admin/documentos/marketing-design",
    trail: () => [ADMIN_ROOT, { label: "Documentos M&D" }],
  },

  // Sistema
  {
    match: (p) => p === "/portal/admin/audit-log",
    trail: () => [ADMIN_ROOT, { label: "Auditoria" }],
  },
  {
    match: (p) => p === "/portal/admin/documentos/desenvolvedor",
    trail: () => [ADMIN_ROOT, { label: "Documentos Dev" }],
  },

  // Perfil
  {
    match: (p) => p === "/portal/admin/perfil",
    trail: () => [ADMIN_ROOT, { label: "Meu perfil" }],
  },
];

/**
 * Resolve a trilha de breadcrumbs para uma rota admin.
 * Retorna [] para a home, ou um array com raiz + seção + (detalhe).
 */
export function resolveAdminBreadcrumbs(pathname: string): BreadcrumbTrailItem[] {
  if (pathname === "/portal/admin") return [];
  for (const section of SECTIONS) {
    if (section.match(pathname)) return section.trail(pathname);
  }
  return [ADMIN_ROOT];
}
