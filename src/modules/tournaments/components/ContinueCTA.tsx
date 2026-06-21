import { useTranslation } from "react-i18next";
import {
  UserPlus,
  Dices,
  CalendarClock,
  Zap,
  Trophy,
  Share2,
  CheckCircle2,
  Rocket,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContinueAction } from "../lib/control-center";

const ICON: Record<ContinueAction["kind"], typeof UserPlus> = {
  add_team: UserPlus,
  run_draw: Dices,
  generate_matches: CalendarClock,
  enter_next_score: Zap,
  create_flights: Trophy,
  share_results: Share2,
  publish_tournament: Rocket,
  all_done: CheckCircle2,
};

const LABEL_KEY: Record<ContinueAction["kind"], string> = {
  add_team: "controlCenter.cta.add_team",
  run_draw: "controlCenter.cta.run_draw",
  generate_matches: "controlCenter.cta.generate_matches",
  enter_next_score: "controlCenter.cta.enter_next_score",
  create_flights: "controlCenter.cta.create_flights",
  share_results: "controlCenter.cta.share_results",
  publish_tournament: "controlCenter.cta.publish_tournament",
  all_done: "controlCenter.cta.all_done",
};

const LABEL_DEFAULT: Record<ContinueAction["kind"], string> = {
  add_team: "Ajouter une équipe",
  run_draw: "Lancer le tirage",
  generate_matches: "Générer les matchs",
  enter_next_score: "Saisir le prochain score",
  create_flights: "Créer les Flights",
  share_results: "Partager les résultats",
  publish_tournament: "Publier le tournoi",
  all_done: "Tout est terminé",
};

const GREEN_GRADIENT = "linear-gradient(135deg,#16a34a 0%,#15803d 100%)";

interface Props {
  action: ContinueAction;
  onAction: (action: ContinueAction) => void;
  /** Render as a sticky bottom bar (default) or inline hero card. */
  variant?: "sticky" | "hero";
  disabled?: boolean;
}

export function ContinueCTA({ action, onAction, variant = "sticky", disabled }: Props) {
  const { t } = useTranslation("tournaments");
  const Icon = ICON[action.kind];
  const label = t(LABEL_KEY[action.kind], { defaultValue: LABEL_DEFAULT[action.kind] });
  const isDone = action.kind === "all_done";

  if (variant === "hero") {
    return (
      <button
        type="button"
        onClick={() => onAction(action)}
        disabled={disabled || isDone}
        className={cn(
          "group relative w-full overflow-hidden rounded-2xl border-[1.5px] p-4 text-left transition-all",
          isDone
            ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
            : "border-emerald-500/30 hover:-translate-y-0.5 hover:border-emerald-500/60",
        )}
        style={
          isDone
            ? undefined
            : {
                background:
                  "linear-gradient(135deg,rgba(22,163,74,.08) 0%,rgba(21,128,61,.04) 60%,transparent 100%)",
                boxShadow: "0 4px 16px -4px rgba(22,163,74,.18)",
              }
        }
      >
        {/* shimmer accent */}
        {!isDone && (
          <span
            aria-hidden
            className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-40 blur-2xl"
            style={{ background: GREEN_GRADIENT }}
          />
        )}
        <div className="relative flex items-center gap-3">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-md",
              isDone && "bg-emerald-500",
            )}
            style={
              !isDone
                ? { background: GREEN_GRADIENT, boxShadow: "0 4px 12px rgba(22,163,74,.35)" }
                : undefined
            }
          >
            <Icon className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              {t("controlCenter.nextAction", { defaultValue: "Prochaine action" })}
            </div>
            <div className="truncate text-base font-bold text-slate-900 dark:text-slate-50">
              {label}
            </div>
          </div>
          {!isDone && (
            <ChevronRight className="h-5 w-5 text-emerald-600 transition-transform group-hover:translate-x-1" />
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="sticky bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 dark:from-slate-950 dark:via-slate-950/95">
      <Button
        type="button"
        onClick={() => onAction(action)}
        disabled={disabled || isDone}
        className="h-12 w-full rounded-xl text-base font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
        style={
          isDone
            ? undefined
            : { background: GREEN_GRADIENT, boxShadow: "0 8px 24px -6px rgba(22,163,74,.45)" }
        }
      >
        <Icon className="h-5 w-5" strokeWidth={2.5} />
        {label}
        {!isDone && <ChevronRight className="ml-auto h-4 w-4" />}
      </Button>
    </div>
  );
}
