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
          "group w-full text-left rounded-2xl border p-4 flex items-center gap-3 transition-all",
          isDone
            ? "border-emerald-300/40 bg-emerald-50/50 dark:bg-emerald-950/20"
            : "border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent hover:border-primary hover:shadow-sm",
        )}
      >
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl shrink-0",
            isDone ? "bg-emerald-500/15 text-emerald-600" : "bg-primary text-primary-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("controlCenter.nextAction", { defaultValue: "Prochaine action" })}
          </div>
          <div className="text-base font-semibold truncate">{label}</div>
        </div>
        {!isDone && (
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        )}
      </button>
    );
  }

  return (
    <div className="sticky bottom-0 left-0 right-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 bg-gradient-to-t from-background via-background/95 to-transparent">
      <Button
        type="button"
        onClick={() => onAction(action)}
        disabled={disabled || isDone}
        className="w-full h-12 text-base font-semibold shadow-lg"
      >
        <Icon className="h-5 w-5" />
        {label}
        {!isDone && <ChevronRight className="h-4 w-4 ml-auto" />}
      </Button>
    </div>
  );
}
