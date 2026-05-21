import { useEffect } from "react";

import { X } from "@/assets/icons";

// Detecta Mac uma unica vez no modulo: muda apenas o rotulo do modificador
// exibido (simbolo Cmd no Mac, "Ctrl" no resto).
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl";

/** Uma area da barra lateral e a letra do atalho "E" + letra. */
type ShortcutNavItem = { label: string; shortcut: string };

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  navItems: ShortcutNavItem[];
}

function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-h-[1.5rem] min-w-[1.5rem] items-center justify-center rounded-md border border-border/75 bg-background px-1.5 text-[11px] font-semibold text-muted-foreground">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-1.5">
      <span className="min-w-0 truncate text-sm text-foreground">{label}</span>
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((key, idx) => (
          <KeyCap key={idx}>{key}</KeyCap>
        ))}
      </span>
    </div>
  );
}

function ShortcutGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-1.5">
      <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/**
 * Janela de ajuda da Camada 2 do Sistema de Atalhos Elkys. Aberta pela tecla
 * "?" no AdminLayout. A lista de "Ir para" e gerada a partir da barra lateral
 * real do usuario, entao reflete o papel dele. Ver docs/KEYBOARD-SHORTCUTS.md.
 */
export function KeyboardShortcutsHelp({ open, onClose, navItems }: KeyboardShortcutsHelpProps) {
  // Fecha com Esc e trava o scroll do body enquanto aberta.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Camada 3: cada area tem sua letra de salto (sequencia "E" + letra).
  const jumpItems = navItems;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-secondary-dark/45 px-3 py-6 backdrop-blur-sm sm:py-[8vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Atalhos de teclado"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/75 bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border/75 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Atalhos de teclado</p>
            <p className="truncate text-[11px] text-muted-foreground">
              Aperte ? a qualquer momento para abrir esta lista.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar atalhos"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="sidebar-scroll max-h-[65vh] overflow-y-auto py-1">
          <ShortcutGroup title="Busca">
            <ShortcutRow keys={[MOD_LABEL, "K"]} label="Abrir a busca universal" />
            <ShortcutRow keys={["/"]} label="Abrir a busca universal" />
          </ShortcutGroup>

          {jumpItems.length > 0 ? (
            <ShortcutGroup title="Ir para (E + letra da área)">
              {jumpItems.map((item) => (
                <ShortcutRow key={item.shortcut} keys={["E", item.shortcut]} label={item.label} />
              ))}
            </ShortcutGroup>
          ) : null}

          <ShortcutGroup title="Geral">
            <ShortcutRow keys={["?"]} label="Abrir / fechar esta ajuda" />
            <ShortcutRow keys={["["]} label="Recolher / expandir a barra lateral" />
            <ShortcutRow keys={["Esc"]} label="Fechar janelas, menus e a busca" />
          </ShortcutGroup>
        </div>

        <div className="border-t border-border/75 bg-background/40 px-4 py-2 text-[10px] text-muted-foreground">
          A regra é simples: aperte E, de Elkys, depois a letra da área.
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcutsHelp;
