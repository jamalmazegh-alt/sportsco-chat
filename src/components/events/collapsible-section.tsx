import { useId, useState, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Rangée repliable de la pile secondaire du détail d'événement.
 *
 * Encadrement, covoiturage, coups de main et chat sont quatre fonctionnalités
 * entières, mais ce n'est pas pour elles qu'on ouvre la page. À plat, elles
 * repoussaient le chat à plusieurs écrans de défilement — donc personne ne
 * l'atteignait.
 *
 * La condition pour que replier ne soit pas cacher, c'est que la ligne fermée
 * porte un résumé : « 4 sans transport », « 2 places à pourvoir ». On sait s'il
 * faut ouvrir sans ouvrir, et les quatre résumés se lisent ensemble — ce qu'un
 * jeu d'onglets ne permet jamais.
 */

export type SectionSummaryTone = "ok" | "warn" | "info" | "mute";

export interface CollapsibleSectionProps {
  icon: LucideIcon;
  title: string;
  /** Résumé de la ligne fermée. Sans lui, replier reviendrait à cacher. */
  summary?: string | null;
  summaryTone?: SectionSummaryTone;
  /** Une section en alerte s'ouvre d'office. */
  defaultOpen?: boolean;
  children: ReactNode;
}

const TONE: Record<SectionSummaryTone, string> = {
  ok: "border-primary/24 bg-primary/12 text-primary",
  warn: "border-amber-500/30 bg-amber-500/16 text-amber-700 dark:text-amber-300",
  info: "border-sky-500/24 bg-sky-500/12 text-sky-700 dark:text-sky-300",
  mute: "border-border bg-muted text-muted-foreground",
};

export function CollapsibleSection({
  icon: Icon,
  title,
  summary,
  summaryTone = "mute",
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{title}</span>
        {summary && (
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-bold tabular-nums",
              TONE[summaryTone],
            )}
          >
            {summary}
          </span>
        )}
        <ChevronRight
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open && (
        <div id={panelId} className="border-t border-border/50 px-3.5 pb-3.5 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}
