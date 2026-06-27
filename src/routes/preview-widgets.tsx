import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, Trophy, ChevronRight, Plus, CalendarDays, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview-widgets")({
  component: PreviewWidgets,
});

type S = "empty" | "planned" | "live" | "done";

function Card({
  teamsCount,
  teamsSummary,
  state,
  count,
  startsLabel,
}: {
  teamsCount: number;
  teamsSummary: string;
  state: S;
  count: number;
  startsLabel?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 max-w-md">
      <Link
        to="/"
        className="group relative overflow-hidden rounded-2xl border border-border bg-card p-3 hover:border-accent/50 hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_12%,transparent)]"
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-speed-lines-accent opacity-60 pointer-events-none"
        />
        <div
          aria-hidden
          className="absolute -top-8 -right-8 h-20 w-20 rounded-full bg-accent/20 blur-2xl pointer-events-none"
        />
        <div className="relative">
          <div className="icon-halo h-8 w-8 rounded-lg bg-accent flex items-center justify-center mb-2">
            <Users className="h-4 w-4 text-accent-foreground" />
          </div>
          <p className="text-2xl font-bold leading-none font-display tracking-tight">
            {teamsCount}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
            Équipes
          </p>
          {teamsSummary && (
            <p className="text-[10px] text-muted-foreground mt-1 truncate">{teamsSummary}</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground absolute top-2.5 right-2.5 transition-transform group-hover:translate-x-0.5" />
      </Link>

      <Link
        to="/"
        className={cn(
          "group relative overflow-hidden rounded-2xl border bg-card p-3 hover:border-primary/50",
          state === "empty" && "border-dashed border-border",
          state === "planned" &&
            "border-border hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_10%,transparent)]",
          state === "live" &&
            "border-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_15%,transparent)]",
          state === "done" && "border-border opacity-90",
        )}
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-speed-lines opacity-60 pointer-events-none"
        />
        <div
          aria-hidden
          className={cn(
            "absolute -top-8 -right-8 h-20 w-20 rounded-full blur-2xl pointer-events-none",
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
              className={cn("h-4 w-4", state === "live" ? "text-primary" : "text-muted-foreground")}
            />
          </div>
          {state === "empty" ? (
            <>
              <p className="text-2xl font-bold leading-none text-muted-foreground font-display tracking-tight">
                0
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                Tournois
              </p>
              <p className="text-[10px] font-semibold text-primary mt-1.5 inline-flex items-center gap-0.5">
                <Plus className="h-3 w-3" />
                Créer un tournoi
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold leading-none font-display tracking-tight">{count}</p>
              <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                {count > 1 ? "Tournois" : "Tournoi"}
              </p>
              {state === "live" && (
                <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary border border-primary/30">
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span className="live-dot absolute inset-0 rounded-full" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                  En cours
                </span>
              )}
              {state === "planned" && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                  <CalendarDays className="h-2.5 w-2.5" />
                  {startsLabel ?? "À venir"}
                </span>
              )}
              {state === "done" && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground border border-border">
                  <Check className="h-2.5 w-2.5" />
                  Terminé
                </span>
              )}
            </>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground absolute top-2.5 right-2.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function PreviewWidgets() {
  return (
    <div className="min-h-screen bg-background p-8 space-y-8">
      <div>
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          État: vide
        </h2>
        <Card teamsCount={0} teamsSummary="" state="empty" count={0} />
      </div>
      <div>
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          État: planifié
        </h2>
        <Card
          teamsCount={3}
          teamsSummary="U13 · U15 · Seniors"
          state="planned"
          count={2}
          startsLabel="14 juil."
        />
      </div>
      <div>
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          État: live
        </h2>
        <Card teamsCount={5} teamsSummary="U11 · U13 · U15" state="live" count={1} />
      </div>
      <div>
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
          État: terminé
        </h2>
        <Card teamsCount={4} teamsSummary="U13 · Seniors" state="done" count={3} />
      </div>
    </div>
  );
}
