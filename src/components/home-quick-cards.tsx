import { Link } from "@tanstack/react-router";
import { useMyRoles } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Users, Trophy, ChevronRight, Plus, CalendarDays, Check } from "lucide-react";
import { listMyTournaments } from "@/modules/tournaments/tournaments.functions";
import { fmt } from "@/lib/date-locale";
import { cn } from "@/lib/utils";

interface Props {
  clubId: string;
  teams?: Array<{ id: string; name: string }>;
}

type TournamentState = "empty" | "planned" | "live" | "done";

export function HomeQuickCards({ clubId, teams }: Props) {
  const { t } = useTranslation();
  const roles = useMyRoles();
  const canCreateTournament = roles.includes("admin") || roles.includes("tournament_manager");
  const fn = useServerFn(listMyTournaments);
  const { data, isLoading } = useQuery({
    queryKey: ["home-tournaments", clubId],
    queryFn: () => fn({ data: { club_id: clubId, limit: 10, exclude_completed: true } }),
    staleTime: 30_000,
  });

  const tournaments = (data?.tournaments ?? []) as Array<{
    id: string;
    status: string;
    starts_on: string | null;
  }>;

  // Determine dominant state
  let state: TournamentState = "empty";
  let highlight: { id: string; starts_on: string | null } | null = null;
  if (tournaments.length > 0) {
    const live = tournaments.find((t) => t.status === "in_progress");
    const planned = tournaments
      .filter((t) => t.status === "draft" || t.status === "published")
      .sort((a, b) => (a.starts_on ?? "").localeCompare(b.starts_on ?? ""))[0];
    const done = tournaments.every((t) => t.status === "completed");
    if (live) {
      state = "live";
      highlight = live;
    } else if (planned) {
      state = "planned";
      highlight = planned;
    } else if (done) {
      state = "done";
      highlight = tournaments[0];
    } else {
      state = "planned";
      highlight = tournaments[0];
    }
  }

  const count = tournaments.length;
  const teamsCount = teams?.length ?? 0;
  const teamsSummary = (teams ?? []).slice(0, 3).map((x) => x.name).join(" · ");

  return (
    <div className="grid grid-cols-2 gap-2">
      {/* Teams card */}
      <Link
        to="/teams"
        className="group relative overflow-hidden rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-all hover:border-accent/50 hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_12%,transparent)]"
      >
        <div aria-hidden className="absolute inset-0 bg-speed-lines-accent opacity-60 pointer-events-none" />
        <div aria-hidden className="absolute -top-8 -right-8 h-20 w-20 rounded-full bg-accent/20 blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="icon-halo h-8 w-8 rounded-lg bg-accent flex items-center justify-center mb-2">
            <Users className="h-4 w-4 text-accent-foreground" />
          </div>
          <p className="text-2xl font-bold leading-none font-display tracking-tight">{teamsCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
            {t("nav.teams")}
          </p>
          {teamsSummary && (
            <p className="text-[10px] text-muted-foreground mt-1 truncate">
              {teamsSummary}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground absolute top-2.5 right-2.5 transition-transform group-hover:translate-x-0.5" />
      </Link>

      {/* Tournaments card */}
      <Link
        to="/tournaments"
        className={cn(
          "group relative overflow-hidden rounded-2xl border bg-card p-3 active:scale-[0.99] transition-all hover:border-primary/50",
          state === "empty" && "border-dashed border-border",
          state === "planned" && "border-border hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_10%,transparent)]",
          state === "live" &&
            "border-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_15%,transparent)]",
          state === "done" && "border-border opacity-90",
        )}
      >
        <div aria-hidden className="absolute inset-0 bg-speed-lines opacity-60 pointer-events-none" />
        <div
          aria-hidden
          className={cn(
            "absolute -top-8 -right-8 h-20 w-20 rounded-full blur-2xl pointer-events-none transition-opacity",
            state === "live" ? "bg-primary/30" : "bg-primary/15 group-hover:bg-primary/25",
          )}
        />
        <div className="relative">
          <div
            className={cn(
              "icon-halo h-8 w-8 rounded-lg flex items-center justify-center mb-2",
              state === "live" ? "bg-primary/15" : "bg-muted",
            )}
          >
            <Trophy
              className={cn(
                "h-4 w-4",
                state === "live" ? "text-primary" : "text-muted-foreground",
              )}
            />
          </div>

          {state === "empty" ? (
            <>
              <p className="text-2xl font-bold leading-none text-muted-foreground font-display tracking-tight">0</p>
              <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                {t("nav.tournaments")}
              </p>
              {canCreateTournament && (
                <p className="text-[10px] font-semibold text-primary mt-1.5 inline-flex items-center gap-0.5">
                  <Plus className="h-3 w-3" />
                  {t("dashboard.tournamentsCard.createCta", {
                    defaultValue: "Créer un tournoi",
                  })}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-2xl font-bold leading-none font-display tracking-tight">
                {isLoading ? "…" : count}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                {count > 1 ? t("nav.tournaments") : t("nav.tournament", { defaultValue: "Tournoi" })}
              </p>
              <StateBadge state={state} startsOn={highlight?.starts_on ?? null} />
            </>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground absolute top-2.5 right-2.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function StateBadge({
  state,
  startsOn,
}: {
  state: TournamentState;
  startsOn: string | null;
}) {
  const { t } = useTranslation();
  if (state === "live") {
    return (
      <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary border border-primary/30">
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="live-dot absolute inset-0 rounded-full" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        {t("dashboard.tournamentsCard.live", { defaultValue: "En cours" })}
      </span>
    );
  }
  if (state === "planned") {
    const label = startsOn ? fmt(new Date(startsOn), "d MMM") : t("dashboard.tournamentsCard.upcoming", { defaultValue: "À venir" });
    return (
      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
        <CalendarDays className="h-2.5 w-2.5" />
        {label}
      </span>
    );
  }
  return (
    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground border border-border">
      <Check className="h-2.5 w-2.5" />
      {t("dashboard.tournamentsCard.done", { defaultValue: "Terminé" })}
    </span>
  );
}
