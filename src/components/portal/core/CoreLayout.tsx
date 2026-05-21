import { Link, Outlet, useLocation } from "react-router-dom";

import { ArrowLeft, Banknote, BarChart, Building2, Target, TrendingUp, Zap } from "@/assets/icons";
import { cn } from "@/design-system";

/**
 * Layout da zona Core (Command Center executivo do ecossistema).
 *
 * Protótipo: zona isolada sob /portal/core, separada do portal admin
 * operacional. Ver docs/ECOSYSTEM-ARCHITECTURE.md, secoes 2 e 3.
 */

type CoreNavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  exact?: boolean;
  ready?: boolean;
};

const CORE_NAV: CoreNavItem[] = [
  { label: "Visão Consolidada", to: "/portal/core", icon: BarChart, exact: true, ready: true },
  { label: "Produtos", to: "/portal/core/produtos", icon: Building2, ready: true },
  { label: "Financeiro", to: "/portal/core/financeiro", icon: Banknote, ready: true },
  { label: "Métricas SaaS", to: "/portal/core/metricas", icon: TrendingUp, ready: true },
  { label: "Comparativo", to: "/portal/core/comparativo", icon: Target, ready: true },
  { label: "Infraestrutura", to: "/portal/core/infra", icon: Zap, ready: true },
];

function isActive(pathname: string, item: CoreNavItem) {
  if (item.exact) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export default function CoreLayout() {
  const location = useLocation();
  const current = CORE_NAV.find((item) => isActive(location.pathname, item));

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border/75 bg-card">
        <div className="border-b border-border/75 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Elkys
          </p>
          <p className="text-sm font-semibold text-foreground">Command Center</p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {CORE_NAV.map((item) => {
            const active = isActive(location.pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-border/80 bg-background font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-background/60 hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                    active
                      ? "bg-primary/12 text-primary dark:bg-primary/18"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {!item.ready ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    breve
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border/75 p-2">
          <Link
            to="/portal/admin"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
          >
            <ArrowLeft size={14} />
            Voltar ao portal admin
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-border/75 bg-background px-6">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight text-foreground">
              {current?.label ?? "Command Center"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Visão executiva do ecossistema de produtos Elkys
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
            Protótipo · dados simulados
          </span>
        </header>

        <main className="flex-1 overflow-auto px-6 py-6">
          <div className="mx-auto w-full max-w-[1280px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
