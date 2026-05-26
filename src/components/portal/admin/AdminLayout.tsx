import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import PortalErrorBoundary from "@/components/portal/shared/PortalErrorBoundary";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import { useTheme } from "@/hooks/useDarkMode";
import { useSidebarBadges, resolveBadgeValue } from "@/hooks/useSidebarBadges";

import { useAuth, type AppRole } from "@/contexts/AuthContext";
import { Button, HexAvatar, HexPattern, cn } from "@/design-system";
import AdminNotificationBell from "@/components/portal/admin/AdminNotificationBell";
// CommandPalette e carregado sob demanda: so monta o chunk quando o usuario
// abre a paleta pela primeira vez. Mantem o entry do portal enxuto.
const CommandPalette = lazy(() => import("@/components/portal/admin/CommandPalette"));
// Janela de ajuda de atalhos (Camada 2 do Sistema de Atalhos Elkys), aberta
// pela tecla "?". Tambem sob demanda para nao pesar o entry do portal.
const KeyboardShortcutsHelp = lazy(() => import("@/components/portal/admin/KeyboardShortcutsHelp"));
import EnvironmentBanner from "@/components/portal/shared/EnvironmentBanner";
import PortalBreadcrumbs from "@/components/portal/shared/PortalBreadcrumbs";
import { resolveAdminBreadcrumbs } from "@/lib/admin-breadcrumbs";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PROFILE_AVATAR_TRANSFORM,
  PORTAL_PROFILE_UPDATED_EVENT,
  getProfileAvatarImageStyle,
  getProfileInitials,
  resolveProfileAvatarTransform,
  type PortalProfileUpdatedDetail,
} from "@/lib/profile";
import {
  AgileMono,
  ArrowLeft,
  ArrowRight,
  BarChart,
  Banknote,
  Building2,
  CalendarX,
  CheckCircle,
  ChevronRight,
  Code2,
  FileText,
  Folder,
  Mail,
  Search,
  Shield,
  SuporteFill,
  Target,
  Users,
  X,
  Zap,
} from "@/assets/icons";

// Mapeia o role principal do usuario para o slug de dominio usado em
// /tarefas/:domain e /calendario/:domain. Admins (admin/admin_super) recebem
// null — significam "visao geral, sem filtro de dominio" e a rota cai pra
// /tarefas (todas) e /calendario.
const ROLE_TO_DOMAIN: Record<string, string> = {
  comercial: "comercial",
  financeiro: "financeiro",
  juridico: "juridico",
  marketing: "marketing",
  support: "suporte",
  developer: "desenvolvimento",
  designer: "desenvolvimento",
  po: "desenvolvimento",
};

// Precedencia clara: se o usuario acumula roles, escolhemos o dominio mais
// "operacional" pra que Tarefas/Calendario apontem ao trabalho diario dele.
// Admins puros caem em null e veem a visao geral (todos os dominios).
const DOMAIN_PRIORITY: AppRole[] = [
  "developer",
  "designer",
  "po",
  "comercial",
  "financeiro",
  "juridico",
  "marketing",
  "support",
];

function resolvePrimaryDomain(roles: AppRole[]): string | null {
  const isPureAdmin = roles.every((r) => r === "admin" || r === "admin_super") && roles.length > 0;
  if (isPureAdmin) return null;
  for (const r of DOMAIN_PRIORITY) {
    if (roles.includes(r)) return ROLE_TO_DOMAIN[r] ?? null;
  }
  return null;
}

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  roles: AppRole[];
  badge?: string;
  /** Letra de destino da Camada 3 dos atalhos (sequencia "E" + letra). */
  shortcut: string;
};

type NavSection = {
  label?: string;
  items: NavItem[];
};

// Sidebar organizada pelos 4 dominios da arquitetura (CRM / Financeiro /
// Desenvolvimento / Juridico) + Marketing e Sistema como areas de apoio.
// Juridico ainda nao tem tela propria (vira no Sub-step D); por enquanto
// nao aparece como secao para nao mostrar item vazio.
//
// Ownership por dominio:
//   CRM            → leads, propostas, pipeline (hub /crm)
//   Financeiro     → clientes (master), receita, despesas, cobranca
//   Desenvolvimento → projetos, tarefas, suporte pos-entrega
//   Marketing      → calendario, materiais
//   Sistema        → equipe, auditoria, documentos internos

// Sidebar consolidada (auditoria 2026-05-20): de 30+ itens repetidos por
// dominio (Tarefas Comercial, Tarefas Financeiro...) para ~14 entradas
// agrupadas por teor. "Tarefas" e "Calendario" sao agora links unicos com
// href/badge resolvidos dinamicamente a partir do dominio primario do
// usuario (resolvePrimaryDomain). Admins puros caem em /tarefas (todas).
function buildNavSections(primaryDomain: string | null): NavSection[] {
  const tasksHref = primaryDomain
    ? `/portal/admin/tarefas/${primaryDomain}`
    : "/portal/admin/tarefas";
  const tasksBadge = primaryDomain ? `tasks:${primaryDomain}` : "tasks:all";
  const calendarHref = primaryDomain
    ? `/portal/admin/calendario/${primaryDomain}`
    : "/portal/admin/calendario";

  return [
    {
      items: [
        {
          label: "Visão Geral",
          shortcut: "V",
          href: "/portal/admin",
          icon: BarChart,
          roles: ["admin_super", "admin"],
        },
      ],
    },
    {
      label: "Comercial",
      items: [
        {
          label: "CRM",
          shortcut: "C",
          href: "/portal/admin/crm",
          icon: Target,
          roles: ["admin_super", "admin", "comercial", "marketing"],
        },
      ],
    },
    {
      label: "Financeiro",
      items: [
        {
          label: "Visão financeira",
          shortcut: "F",
          href: "/portal/admin/financeiro",
          icon: Banknote,
          roles: ["admin_super", "admin", "financeiro"],
        },
        {
          label: "Clientes",
          shortcut: "L",
          href: "/portal/admin/clientes",
          icon: Building2,
          roles: ["admin_super", "admin", "financeiro", "comercial"],
        },
        {
          label: "Régua de cobrança",
          shortcut: "R",
          href: "/portal/admin/cobranca-automatica",
          icon: Zap,
          roles: ["admin_super", "admin", "financeiro"],
        },
      ],
    },
    {
      label: "Jurídico",
      items: [
        {
          label: "Contratos",
          shortcut: "O",
          // Query param casa com o badge contracts:validating — clicar leva
          // direto pra lista filtrada por em_validacao.
          href: "/portal/admin/contratos?status=em_validacao",
          icon: FileText,
          roles: ["admin_super", "admin", "juridico"],
          badge: "contracts:validating",
        },
      ],
    },
    {
      label: "Operação",
      items: [
        {
          label: "Projetos",
          shortcut: "P",
          href: "/portal/admin/projetos",
          icon: AgileMono,
          roles: ["admin_super", "admin", "developer", "designer", "po", "support", "financeiro"],
        },
        {
          label: "Suporte",
          shortcut: "S",
          // sla=risk casa com o badge tickets:sla.
          href: "/portal/admin/suporte?sla=risk",
          icon: SuporteFill,
          roles: ["admin_super", "admin", "support"],
          badge: "tickets:sla",
        },
      ],
    },
    {
      label: "Trabalho",
      items: [
        {
          label: "Tarefas",
          shortcut: "T",
          href: tasksHref,
          icon: CheckCircle,
          roles: [
            "admin_super",
            "admin",
            "comercial",
            "financeiro",
            "juridico",
            "marketing",
            "developer",
            "designer",
            "po",
            "support",
          ],
          badge: tasksBadge,
        },
        {
          label: "Calendário",
          shortcut: "A",
          href: calendarHref,
          icon: CalendarX,
          roles: [
            "admin_super",
            "admin",
            "comercial",
            "financeiro",
            "juridico",
            "marketing",
            "developer",
            "designer",
            "po",
            "support",
          ],
        },
        {
          label: "Documentos Dev",
          shortcut: "D",
          href: "/portal/admin/documentos/desenvolvedor",
          icon: Code2,
          roles: ["admin_super", "admin", "developer", "designer", "po"],
        },
        {
          label: "Documentos M&D",
          shortcut: "M",
          href: "/portal/admin/documentos/marketing-design",
          icon: Folder,
          roles: ["admin_super", "admin", "marketing"],
        },
      ],
    },
    {
      label: "Sistema",
      items: [
        {
          label: "Equipe",
          shortcut: "Q",
          href: "/portal/admin/equipe",
          icon: Users,
          roles: ["admin_super", "admin"],
        },
        {
          label: "Comunicações",
          shortcut: "N",
          href: "/portal/admin/comunicacoes",
          icon: Mail,
          roles: ["admin_super", "admin", "comercial", "financeiro"],
        },
        {
          label: "Auditoria",
          shortcut: "I",
          href: "/portal/admin/audit-log",
          icon: Shield,
          roles: ["admin_super", "admin"],
        },
      ],
    },
  ];
}

const adminPageMeta = [
  {
    match: (pathname: string) => pathname === "/portal/admin",
    title: "Visão Geral",
    description:
      "Panorama executivo da operação com leitura direta de receita recorrente, pendências e custo mensal.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/calendario",
    title: "Calendário",
    description:
      "Agenda operacional geral para campanhas, reuniões, entregas e marcos de todas as áreas.",
  },
  {
    match: (pathname: string) => pathname.startsWith("/portal/admin/calendario/"),
    title: "Calendário",
    description: "Agenda operacional filtrada por área — eventos, entregas e marcos do domínio.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/documentos/marketing-design",
    title: "Documentos M&D",
    description:
      "Área interna para concentrar links, referências e materiais de Marketing & Design.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/documentos/desenvolvedor",
    title: "Documentos Dev",
    description:
      "Área interna para concentrar links técnicos, handoffs e materiais de Desenvolvimento.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/clientes",
    title: "Clientes",
    description:
      "Carteira organizada para localizar rapidamente contas ativas, recorrência e valor contratado.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/clientes/novo",
    title: "Novo cliente",
    description: "",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/projetos",
    title: "Projetos",
    description:
      "Carteira operacional organizada por projeto, com foco em status, etapas, escopo e andamento.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/tarefas",
    title: "Tarefas",
    description:
      "Kanban e calendário unificado para acompanhar tarefas, pendências e compromissos da equipe.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/projetos/novo",
    title: "Novo projeto",
    description: "",
  },
  {
    match: (pathname: string) =>
      pathname.startsWith("/portal/admin/projetos/") && pathname !== "/portal/admin/projetos/novo",
    title: "Detalhes do projeto",
    description: "Leitura operacional centralizada do projeto com financeiro, anexos e timeline.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/financeiro",
    title: "Financeiro",
    description: "Receitas e despesas centralizadas em uma única leitura operacional.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/financeiro/nova-despesa",
    title: "Nova despesa",
    description:
      "Lançamento financeiro enxuto para manter consistência, rastreabilidade e visão real do custo operacional.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/despesas",
    title: "Despesas",
    description:
      "Controle financeiro dos custos operacionais com leitura objetiva por período e categoria.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/despesas/nova",
    title: "Nova despesa",
    description:
      "Lançamento financeiro enxuto para manter consistência, rastreabilidade e visão real do custo operacional.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/crm",
    title: "CRM",
    description: "Funil de vendas completo: leads, propostas e pipeline em uma visao unificada.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/equipe",
    title: "Equipe",
    description: "Gestao da equipe interna e comunicacao com clientes.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/equipe/novo",
    title: "Novo membro",
    description:
      "Registro interno de pessoas com identificação, cargo e disponibilidade para a operação.",
  },
  {
    match: (pathname: string) =>
      pathname.startsWith("/portal/admin/clientes/") && pathname !== "/portal/admin/clientes/novo",
    title: "Detalhes do cliente",
    description: "Perfil completo do cliente com dados contratuais, documentos e histórico.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/suporte",
    title: "Suporte",
    description: "Solicitações de ajuda abertas pelos clientes para acompanhamento e resolução.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/notificacoes",
    title: "Notificações",
    description: "Envio e histórico de comunicações para os clientes do portal.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/inadimplencia",
    title: "Inadimplencia",
    description:
      "Relatorio detalhado de cobrancas vencidas com aging, valor em aberto e acoes de cobranca.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/pipeline",
    title: "Pipeline",
    description: "Kanban do funil comercial: Prospecção → Qualificado → Proposta → Ganho/Perdido.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/receita-clientes",
    title: "Receita por Cliente",
    description:
      "Ranking de clientes por receita gerada com distribuicao percentual e ticket medio.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/comunicacoes",
    title: "Comunicações",
    description:
      "Rastreio dos e-mails enviados pelo portal — taxa de entrega, abertura (pixel) e clique (link encurtado).",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/audit-log",
    title: "Log de Auditoria",
    description: "Registro cronologico de todas as acoes realizadas no painel administrativo.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/metas",
    title: "Metas Financeiras",
    description: "Definicao e acompanhamento de metas de faturamento por periodo.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/leads",
    title: "Leads",
    description: "Pipeline de captacao e qualificacao de leads para o funil de vendas.",
  },
  {
    match: (pathname: string) =>
      pathname.startsWith("/portal/admin/leads/") && pathname !== "/portal/admin/leads",
    title: "Detalhe do Lead",
    description: "Dados, interacoes e historico de relacionamento com o lead.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/propostas",
    title: "Propostas",
    description: "Gestao de propostas comerciais com acompanhamento de status e valor.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/propostas/nova",
    title: "Nova Proposta",
    description: "",
  },
  {
    match: (pathname: string) =>
      pathname.startsWith("/portal/admin/propostas/") &&
      pathname !== "/portal/admin/propostas" &&
      pathname !== "/portal/admin/propostas/nova",
    title: "Detalhe da Proposta",
    description: "Edicao e acompanhamento da proposta comercial.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/cobranca-automatica",
    title: "Regua de Cobranca",
    description:
      "Automacao de lembretes e cobrancas com regras, templates e historico de execucao.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/contratos",
    title: "Contratos",
    description:
      "Gestao juridica dos contratos do portal com filtros por status e historico de versoes.",
  },
  {
    match: (pathname: string) => pathname === "/portal/admin/perfil",
    title: "Perfil",
    description: "Dados pessoais, foto e leitura do acesso interno no portal da Elkys.",
  },
];

function isItemActive(currentPath: string, href: string) {
  if (href === "/portal/admin") return currentPath === href;
  // CRM hub: active for leads/:id and propostas/* sub-routes
  if (href === "/portal/admin/crm") {
    return (
      currentPath === href ||
      currentPath.startsWith("/portal/admin/leads/") ||
      currentPath.startsWith("/portal/admin/propostas/")
    );
  }
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

function MenuGlyph({ className }: { className?: string }) {
  return (
    <span className={cn("flex h-4 w-4 flex-col items-center justify-center gap-1", className)}>
      <span className="block h-[1.5px] w-4 rounded-full bg-current" />
      <span className="block h-[1.5px] w-3 rounded-full bg-current" />
      <span className="block h-[1.5px] w-4 rounded-full bg-current" />
    </span>
  );
}

/** Isolated clock component — its 10s interval only re-renders itself, not the whole layout. */
const SidebarClock = memo(function SidebarClock({ className }: { className?: string }) {
  const [time, setTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      );
    };
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, []);
  return <p className={className}>{time}</p>;
});

export default function AdminLayout() {
  const { user, roles, signOut } = useAuth();
  const { data: sidebarBadges } = useSidebarBadges();
  const primaryDomain = useMemo(() => resolvePrimaryDomain(roles), [roles]);
  const navSections = useMemo(
    () =>
      buildNavSections(primaryDomain)
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => item.roles.some((role) => roles.includes(role))),
        }))
        .filter((section) => section.items.length > 0),
    [roles, primaryDomain]
  );
  // Lista plana das areas visiveis, na ordem de render da barra lateral. E a
  // base da Camada 3 dos atalhos: Alt+N salta para o N-esimo item daqui.
  const flatNavItems = useMemo(
    () => navSections.flatMap((section) => section.items),
    [navSections]
  );
  // Mapa letra-de-atalho -> rota, base da Camada 3 (sequencia "E" + letra).
  const navByShortcut = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of flatNavItems) {
      map.set(item.shortcut.toLowerCase(), item.href);
    }
    return map;
  }, [flatNavItems]);
  const { resolvedTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Sidebar sempre inicia recolhida (icon-only). O usuario pode expandi-la
  // durante a sessao, mas a cada novo carregamento ela volta ao estado recolhido.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  // Sidebar sempre inicia com todas as secoes colapsadas. A secao que contem
  // a rota ativa e auto-expandida via `containsActive` no render.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const section of buildNavSections(null)) {
      if (section.label) initial[section.label] = true;
    }
    return initial;
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Sequencia de atalho "E" + letra (Camada 3). O ref espelha o state pra ser
  // lido dentro do handler de teclado sem recriar o listener a cada tecla.
  const [leaderArmed, setLeaderArmed] = useState(false);
  const leaderArmedRef = useRef(false);
  const leaderTimeoutRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [profileName, setProfileName] = useState("Usuário logado");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileAvatarTransform, setProfileAvatarTransform] = useState(
    DEFAULT_PROFILE_AVATAR_TRANSFORM
  );
  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleSection = useCallback((label: string) => {
    setCollapsedSections((prev) => ({ ...prev, [label]: !prev[label] }));
  }, []);

  // Sistema de Atalhos Elkys (ver docs/KEYBOARD-SHORTCUTS.md):
  //  Camada 1 - Busca: Ctrl/Cmd+K ou "/" abrem a paleta.
  //  Camada 2 - Ajuda: "?" abre/fecha o painel de atalhos.
  //  Camada 3 - Salto: a sequencia "E" (de Elkys) + letra vai para a area.
  //             "E" arma o modo por 2s e mostra um indicador; a letra
  //             seguinte navega. Cancelavel com Esc.
  // Atalhos sem modificador so disparam fora de campos editaveis.
  useEffect(() => {
    const clearLeaderTimeout = () => {
      if (leaderTimeoutRef.current !== null) {
        window.clearTimeout(leaderTimeoutRef.current);
        leaderTimeoutRef.current = null;
      }
    };
    const disarmLeader = () => {
      clearLeaderTimeout();
      leaderArmedRef.current = false;
      setLeaderArmed(false);
    };

    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      // Com a sequencia armada, a proxima tecla escolhe a area.
      if (leaderArmedRef.current) {
        // Teclas modificadoras sozinhas nao contam (ex.: Shift antes da letra).
        if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") {
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          disarmLeader();
          return;
        }
        const dest = navByShortcut.get(e.key.toLowerCase());
        disarmLeader();
        if (dest && !isEditable) {
          e.preventDefault();
          setHelpOpen(false);
          navigate(dest);
        }
        return;
      }

      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const isSlashShortcut = e.key === "/" && !isEditable;

      if (isCmdK || isSlashShortcut) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (isEditable || e.metaKey || e.ctrlKey || e.altKey) return;

      // "?" abre/fecha a ajuda de atalhos.
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }

      // "[" alterna o estado recolhido da sidebar.
      if (e.key === "[") {
        e.preventDefault();
        setSidebarCollapsed((current) => !current);
        return;
      }

      // "E" arma a sequencia de salto da Camada 3.
      if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        clearLeaderTimeout();
        leaderArmedRef.current = true;
        setLeaderArmed(true);
        leaderTimeoutRef.current = window.setTimeout(disarmLeader, 2000);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      clearLeaderTimeout();
    };
  }, [navigate, navByShortcut]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.body.style.overflow = mobileOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    let active = true;

    const fallbackNameFromUser = () => {
      const metadataName = user?.user_metadata?.full_name;
      if (typeof metadataName === "string" && metadataName.trim().length > 0) {
        return metadataName.trim();
      }

      const emailPrefix = user?.email
        ?.split("@")[0]
        ?.replace(/[._-]+/g, " ")
        .trim();
      if (!emailPrefix) return "Usuário logado";

      return emailPrefix.replace(/\b\w/g, (letter) => letter.toUpperCase());
    };

    const formatName = (value: string) => {
      const parts = value.trim().split(/\s+/);
      if (parts.length <= 1) return value.trim();
      return `${parts[0]} ${parts[parts.length - 1]}`;
    };

    if (!user?.id) {
      setProfileName("Usuário logado");
      setProfileAvatarUrl(null);
      setProfileAvatarTransform(DEFAULT_PROFILE_AVATAR_TRANSFORM);
      return () => {
        active = false;
      };
    }

    const loadProfile = async () => {
      const profileRes = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;

      const resolvedName = profileRes.data?.full_name?.trim() || fallbackNameFromUser();
      const resolvedAvatar =
        profileRes.data?.avatar_url?.trim() ||
        (typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null);
      const resolvedAvatarTransform = resolveProfileAvatarTransform({
        zoom: profileRes.data?.avatar_zoom ?? user.user_metadata?.avatar_zoom,
        positionX: profileRes.data?.avatar_position_x ?? user.user_metadata?.avatar_position_x,
        positionY: profileRes.data?.avatar_position_y ?? user.user_metadata?.avatar_position_y,
      });

      setProfileName(formatName(resolvedName));
      setProfileAvatarUrl(resolvedAvatar);
      setProfileAvatarTransform(resolvedAvatarTransform);
    };

    void loadProfile();

    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<PortalProfileUpdatedDetail>).detail;
      if (!active || !detail) return;

      if (typeof detail.fullName === "string" && detail.fullName.trim().length > 0) {
        setProfileName(formatName(detail.fullName));
      }

      if ("avatarUrl" in detail) {
        setProfileAvatarUrl(detail.avatarUrl ?? null);
      }

      if (detail.avatarTransform) {
        setProfileAvatarTransform(resolveProfileAvatarTransform(detail.avatarTransform));
      }
    };

    window.addEventListener(PORTAL_PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener);

    return () => {
      active = false;
      window.removeEventListener(
        PORTAL_PROFILE_UPDATED_EVENT,
        handleProfileUpdated as EventListener
      );
    };
  }, [user?.email, user?.id, user?.user_metadata]);

  const isDarkTheme = mounted && resolvedTheme === "dark";
  const avatarInitial = getProfileInitials(profileName, "U");
  const avatarImageStyle = useMemo(
    () => getProfileAvatarImageStyle(profileAvatarTransform),
    [profileAvatarTransform]
  );
  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mounted]
  );

  const currentPageMeta = useMemo(
    () =>
      adminPageMeta.find((item) => item.match(location.pathname)) ?? {
        title: "Painel Administrativo",
        description: "Ambiente interno para acompanhamento objetivo da operação Elkys.",
      },
    [location.pathname]
  );

  const breadcrumbTrail = useMemo(
    () => resolveAdminBreadcrumbs(location.pathname),
    [location.pathname]
  );

  // Forca expandir a secao que contem a rota ativa, mesmo que o usuario
  // tenha colapsado antes. Sem isso, o usuario poderia navegar via URL e
  // perder a referencia visual de onde esta.
  const activeSectionLabel = useMemo(() => {
    for (const section of navSections) {
      if (!section.label) continue;
      if (section.items.some((item) => isItemActive(location.pathname, item.href))) {
        return section.label;
      }
    }
    return null;
  }, [navSections, location.pathname]);

  const closeMobileSidebar = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#admin-main" className="skip-to-content">
        Pular para o conteúdo
      </a>
      <EnvironmentBanner />
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-secondary-dark/35 backdrop-blur-sm lg:hidden"
          onClick={closeMobileSidebar}
          aria-label="Fechar navegação"
        />
      ) : null}

      <div className="relative flex min-h-screen">
        <aside
          id="admin-sidebar"
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex h-dvh flex-col border-r border-border/75 bg-card transition-all duration-300 ease-out lg:sticky lg:top-0 lg:h-screen",
            sidebarCollapsed ? "w-[6.5rem]" : "w-56",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="flex h-16 items-center justify-between gap-2 border-b border-border/75 px-3">
            <Link
              to="/portal/admin"
              className="flex min-w-0 items-center"
              aria-label="Ir para visão geral do admin"
            >
              <img
                src={
                  isDarkTheme
                    ? "/imgs/icons/lettering_elkys.webp"
                    : "/imgs/icons/lettering_elkys_purple.webp"
                }
                alt="Elkys"
                width={90}
                height={30}
                className={cn("block h-auto", sidebarCollapsed ? "w-[48px]" : "w-[60px]")}
              />
            </Link>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden shrink-0 text-muted-foreground hover:text-foreground lg:inline-flex"
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
            >
              {sidebarCollapsed ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="justify-self-center text-muted-foreground hover:text-foreground lg:hidden"
              onClick={closeMobileSidebar}
              aria-label="Fechar sidebar"
            >
              <X size={18} />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2 sidebar-scroll">
            <nav className="space-y-1">
              {navSections.map((section, sectionIdx) => {
                const sectionKey = section.label ?? "overview";
                const isOverviewSection = !section.label;
                const userCollapsed = section.label
                  ? Boolean(collapsedSections[section.label])
                  : false;
                const containsActive = section.label && activeSectionLabel === section.label;
                // Em modo icon-only nunca colapsamos por dentro — a propria
                // sidebar ja esta colapsada e remover items mais ainda
                // confundiria. Sections sem label tambem nunca colapsam.
                const collapsed =
                  !sidebarCollapsed && !isOverviewSection && userCollapsed && !containsActive;
                const showHeader = !sidebarCollapsed && !isOverviewSection;
                const showDivider = !sidebarCollapsed && sectionIdx > 0;

                return (
                  <div
                    key={sectionKey}
                    className={cn(
                      "space-y-0.5",
                      showDivider ? "border-t border-border/40 pt-1.5 mt-1.5" : null
                    )}
                  >
                    {showHeader ? (
                      <button
                        type="button"
                        onClick={() => toggleSection(section.label!)}
                        aria-expanded={!collapsed}
                        aria-controls={`sidebar-section-${sectionKey}`}
                        className="group flex w-full min-h-[32px] items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:bg-background/40 hover:text-foreground lg:min-h-[26px]"
                      >
                        <span className="truncate">{section.label}</span>
                        <ChevronRight
                          size={10}
                          className={cn(
                            "shrink-0 opacity-60 transition-transform duration-200",
                            collapsed ? "rotate-0" : "rotate-90"
                          )}
                        />
                      </button>
                    ) : null}

                    {sidebarCollapsed && section.label ? (
                      <span
                        className="block px-1 py-0.5 text-center text-[7px] font-semibold uppercase leading-[1.1] tracking-wider text-muted-foreground/60"
                        aria-hidden="true"
                      >
                        {section.label}
                      </span>
                    ) : null}

                    <div
                      id={`sidebar-section-${sectionKey}`}
                      hidden={collapsed}
                      className="space-y-0.5"
                    >
                      {section.items.map((item) => {
                        const { label, href, icon: Icon, badge, shortcut } = item;
                        const active = isItemActive(location.pathname, href);
                        const badgeCount = resolveBadgeValue(sidebarBadges, badge);

                        return (
                          <Link
                            key={href}
                            to={href}
                            title={sidebarCollapsed ? label : undefined}
                            aria-label={label}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "group relative flex items-center gap-2 overflow-hidden rounded-lg border px-2 py-1.5 transition-all duration-300 ease-out",
                              sidebarCollapsed
                                ? "min-h-[44px] justify-center px-0 lg:min-h-[36px]"
                                : "min-h-[44px] lg:min-h-[34px]",
                              active
                                ? "border-border/80 bg-background text-foreground"
                                : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-background/65 hover:text-foreground"
                            )}
                          >
                            {!sidebarCollapsed ? (
                              <HexPattern
                                variant="inline"
                                className={cn(
                                  active
                                    ? "-right-4 -bottom-4 h-14 w-14 opacity-[0.16] transition-all duration-300 dark:opacity-[0.22]"
                                    : "-right-4 -bottom-4 h-14 w-14 opacity-[0.05] transition-all duration-300 group-hover:opacity-[0.09] dark:opacity-[0.08] dark:group-hover:opacity-[0.12]"
                                )}
                              />
                            ) : (
                              <HexPattern
                                variant="inline"
                                className={cn(
                                  "left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2",
                                  active
                                    ? "opacity-[0.14] transition-all duration-300 dark:opacity-[0.2]"
                                    : "opacity-[0.04] transition-all duration-300 group-hover:opacity-[0.08] dark:opacity-[0.07] dark:group-hover:opacity-[0.1]"
                                )}
                              />
                            )}

                            {!sidebarCollapsed && active ? (
                              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
                            ) : null}

                            <span
                              className={cn(
                                "relative z-10 flex shrink-0 items-center justify-center rounded-md transition-all duration-300 ease-out",
                                sidebarCollapsed ? "h-7 w-7" : "h-6 w-6",
                                active
                                  ? "bg-primary/12 text-primary dark:bg-primary/18"
                                  : "bg-transparent text-muted-foreground group-hover:text-foreground"
                              )}
                            >
                              <Icon size={16} />
                            </span>

                            {!sidebarCollapsed ? (
                              <span className="relative z-10 min-w-0 flex-1 truncate text-xs font-medium">
                                {label}
                              </span>
                            ) : null}

                            {badgeCount > 0 ? (
                              sidebarCollapsed ? (
                                <span
                                  className="absolute right-1 top-1 z-20 flex h-2 w-2 rounded-full bg-destructive"
                                  aria-label={`${badgeCount} pendencia(s)`}
                                  title={`${badgeCount} pendencia(s)`}
                                />
                              ) : (
                                <span
                                  className="relative z-10 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-destructive/15 px-1 text-[10px] font-semibold text-destructive"
                                  aria-label={`${badgeCount} pendencia(s)`}
                                  title={`${badgeCount} pendencia(s)`}
                                >
                                  {badgeCount > 99 ? "99+" : badgeCount}
                                </span>
                              )
                            ) : !sidebarCollapsed ? (
                              <kbd
                                aria-hidden="true"
                                className="relative z-10 hidden h-4 items-center justify-center rounded border border-border/60 bg-background/60 px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/45 transition-colors group-hover:text-muted-foreground/75 lg:inline-flex"
                              >
                                {`E ${shortcut}`}
                              </kbd>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-border/75 p-2">
            <Link
              to="/portal/admin/perfil"
              className={cn(
                "group mb-2 block rounded-lg border border-border/75 bg-background/60 p-2 transition-colors duration-200 hover:border-primary/20 hover:bg-background",
                sidebarCollapsed ? "px-0 py-2" : ""
              )}
              aria-label="Abrir perfil"
              title={sidebarCollapsed ? profileName : undefined}
            >
              {sidebarCollapsed ? (
                <div className="flex flex-col items-center gap-1">
                  {profileAvatarUrl ? (
                    <HexAvatar
                      size="sm"
                      src={profileAvatarUrl}
                      fallback={avatarInitial}
                      alt={profileName}
                      imageStyle={avatarImageStyle}
                      backgroundClassName="scale-[1.1]"
                      contentInsetClassName="inset-[6.25%]"
                      className="h-7 w-7"
                    />
                  ) : (
                    <HexAvatar
                      size="sm"
                      fallback={avatarInitial}
                      backgroundClassName="scale-[1.1]"
                      contentInsetClassName="inset-[6.25%]"
                      className="h-7 w-7"
                    />
                  )}
                  <p className="w-full truncate text-center text-[9px] font-semibold leading-tight text-foreground">
                    {profileName}
                  </p>
                  <SidebarClock className="text-[9px] font-medium leading-none text-muted-foreground tabular-nums" />
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  {profileAvatarUrl ? (
                    <HexAvatar
                      size="sm"
                      src={profileAvatarUrl}
                      fallback={avatarInitial}
                      alt={profileName}
                      imageStyle={avatarImageStyle}
                      backgroundClassName="scale-[1.1]"
                      contentInsetClassName="inset-[6.25%]"
                      className="h-9 w-9"
                    />
                  ) : (
                    <HexAvatar
                      size="sm"
                      fallback={avatarInitial}
                      backgroundClassName="scale-[1.1]"
                      contentInsetClassName="inset-[6.25%]"
                      className="h-9 w-9"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
                      {profileName}
                    </p>
                    <SidebarClock className="text-[11px] font-medium leading-tight text-muted-foreground tabular-nums" />
                  </div>
                </div>
              )}
            </Link>

            <Button
              type="button"
              variant="ghost"
              size={sidebarCollapsed ? "icon" : "default"}
              className={cn(
                "w-full text-destructive hover:bg-destructive/10 hover:text-destructive",
                sidebarCollapsed ? "px-0" : "justify-start"
              )}
              onClick={() => void signOut()}
              aria-label="Sair"
              title={sidebarCollapsed ? "Sair" : undefined}
            >
              <X size={18} />
              {!sidebarCollapsed ? <span>Sair</span> : null}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col transition-all duration-300 ease-out">
          <header className="sticky top-0 z-20 h-16 border-b border-border/75 bg-background">
            <div className="flex h-full items-center justify-between gap-4 px-4 md:px-6 xl:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="items-center justify-center text-muted-foreground hover:text-foreground lg:hidden"
                  onClick={() => setMobileOpen(true)}
                  aria-controls="admin-sidebar"
                  aria-expanded={mobileOpen}
                  aria-label="Abrir navegação"
                >
                  <MenuGlyph />
                </Button>

                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-base font-semibold tracking-tight text-foreground md:text-lg">
                    {currentPageMeta.title}
                  </p>
                  {currentPageMeta.description ? (
                    <p className="hidden max-w-2xl truncate text-xs leading-relaxed text-muted-foreground md:block">
                      {currentPageMeta.description}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 md:gap-3">
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  aria-label="Abrir busca rápida (Ctrl+K)"
                  className="group inline-flex h-9 items-center gap-2 rounded-lg border border-border/75 bg-card/40 px-2 text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground sm:px-3 md:w-64 lg:w-72"
                >
                  <Search size={14} className="shrink-0" />
                  <span className="hidden min-w-0 flex-1 truncate text-left text-xs md:inline">
                    Buscar ou pular para...
                  </span>
                  <kbd className="hidden shrink-0 rounded border border-border/75 bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground/80 group-hover:text-muted-foreground md:inline-flex">
                    Ctrl K
                  </kbd>
                </button>
                <p className="hidden text-right text-sm font-medium capitalize text-muted-foreground xl:block">
                  {todayLabel}
                </p>
                <AdminNotificationBell />
              </div>
            </div>
          </header>

          <main
            id="admin-main"
            tabIndex={-1}
            className="flex-1 overflow-auto px-4 py-5 md:px-6 md:py-6 xl:px-8 xl:py-8"
          >
            <div className="mx-auto w-full max-w-[1400px]">
              <PortalBreadcrumbs trail={breadcrumbTrail} />
              <PortalErrorBoundary key={location.pathname}>
                <Suspense fallback={<PortalLoading />}>
                  <Outlet />
                </Suspense>
              </PortalErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      {paletteOpen ? (
        <Suspense fallback={null}>
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        </Suspense>
      ) : null}

      {helpOpen ? (
        <Suspense fallback={null}>
          <KeyboardShortcutsHelp
            open={helpOpen}
            onClose={() => setHelpOpen(false)}
            navItems={flatNavItems.map((item) => ({
              label: item.label,
              shortcut: item.shortcut,
            }))}
          />
        </Suspense>
      ) : null}

      {leaderArmed ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 rounded-full border border-border/75 bg-card px-3.5 py-2 text-xs shadow-xl">
            <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border/75 bg-background px-1 text-[10px] font-semibold text-foreground">
              E
            </kbd>
            <span className="text-muted-foreground">aperte a letra da área</span>
            <span className="text-muted-foreground/40">·</span>
            <kbd className="inline-flex h-5 items-center justify-center rounded border border-border/75 bg-background px-1.5 text-[10px] font-semibold text-muted-foreground">
              Esc
            </kbd>
            <span className="text-muted-foreground/70">cancelar</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
