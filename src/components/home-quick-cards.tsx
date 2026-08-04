import { Link } from "@tanstack/react-router";
import { useMyRoles } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Users, Trophy, ChevronRight, Plus, CalendarDays, Check, Tent } from "lucide-react";
import { listMyTournaments } from "@/modules/tournaments/tournaments.functions";
import { listClubCamps } from "@/lib/camps.functions";
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
  const canManageCamps =
    roles.includes("admin") || roles.includes("dirigeant") || roles.includes("coach");
  const fn = useServerFn(listMyTournaments);
  const campsFn = useServerFn(listClubCamps);
  const { data, isLoading } = useQuery({
    queryKey: ["home-tournaments", clubId],
    queryFn: () => fn({ data: { club_id: clubId, limit: 10, exclude_completed: true } }),
    staleTime: 30_000,
  });
  const { data: campsData } = useQuery({
    queryKey: ["home-camps", clubId],
    queryFn: () => campsFn({ data: { clubId, includeArchived: false } }),
    enabled: canManageCamps,
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
  const teamsSummary = (teams ?? [])
    .slice(0, 3)
    .map((x) => x.name)
    .join(" · ");

  const camps = campsData ?? [];
  const campsCount = camps.length;
  const nextCamp = [...camps]
    .filter((c) => c.status === "published" || c.status === "draft")
    .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""))[0];

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        {/* Teams card */}
        <Link
          to="/teams"
          className="group relative overflow-hidden rounded-[14px] border-[1.5px] border-border bg-card p-[11px] min-h-[88px] active:scale-[0.99] transition-all hover:border-primary hover:shadow-[0_4px_12px_color-mix(in oklab, var(--primary) 14%, transparent)]"
        >
          <div
            aria-hidden
            className="absolute top-0 inset-x-0 h-[3px]"
            style={{
              background:
                "linear-gradient(90deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 72%, white) 100%)",
            }}
          />
          <div className="relative">
            <div
              className="h-[26px] w-[26px] rounded-[8px] flex items-center justify-center mb-2"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in oklab, var(--primary) 16%, white) 0%, color-mix(in oklab, var(--primary) 28%, white) 100%)",
              }}
            >
              <Users className="h-4 w-4 text-foreground" strokeWidth={2.4} />
            </div>
            <p
              className="text-[24px] font-black leading-none tabular-nums tracking-tight bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 72%, white) 100%)",
              }}
            >
              {teamsCount}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-[0.1em] font-bold">
              {t("nav.teams")}
            </p>
            {teamsSummary && (
              <p className="text-[10px] text-muted-foreground/70 mt-1 truncate font-medium">
                {teamsSummary}
              </p>
            )}
          </div>
          <ChevronRight
            className="h-4 w-4 text-muted-foreground/70 absolute top-3 right-3 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.4}
          />
        </Link>

        {/* Tournaments card */}
        <Link
          to="/tournaments"
          className={cn(
            "group relative overflow-hidden rounded-[14px] border-[1.5px] bg-card p-[11px] min-h-[88px] active:scale-[0.99] transition-all",
            state === "empty" && "border-dashed border-border hover:border-primary",
            state === "planned" &&
              "border-border hover:border-[#f59e0b] hover:shadow-[0_4px_12px_rgba(245,158,11,0.12)]",
            state === "live" &&
              "border-primary shadow-[0_4px_12px_color-mix(in oklab, var(--primary) 22%, transparent)]",
            state === "done" && "border-border opacity-90",
          )}
        >
          <div
            aria-hidden
            className="absolute top-0 inset-x-0 h-[3px]"
            style={{
              background:
                state === "live"
                  ? "linear-gradient(90deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 72%, white) 100%)"
                  : state === "planned"
                    ? "linear-gradient(90deg, #b45309 0%, #f59e0b 100%)"
                    : "linear-gradient(90deg, #94a3b8 0%, #cbd5e1 100%)",
            }}
          />
          <div className="relative">
            <div
              className="h-[26px] w-[26px] rounded-[8px] flex items-center justify-center mb-2"
              style={{
                background:
                  state === "live"
                    ? "linear-gradient(135deg, color-mix(in oklab, var(--primary) 16%, white) 0%, color-mix(in oklab, var(--primary) 28%, white) 100%)"
                    : state === "planned"
                      ? "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)"
                      : "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
              }}
            >
              <Trophy
                className="h-4 w-4"
                strokeWidth={2.4}
                style={{
                  color:
                    state === "live"
                      ? "var(--primary)"
                      : state === "planned"
                        ? "#92400e"
                        : "#64748b",
                }}
              />
            </div>

            {state === "empty" ? (
              <>
                <p className="text-[24px] font-black leading-none text-[#cbd5e1] tabular-nums tracking-tight">
                  0
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-[0.1em] font-bold">
                  {t("nav.tournaments")}
                </p>
                {canCreateTournament && (
                  <p className="text-[10px] font-bold text-foreground mt-1.5 inline-flex items-center gap-0.5">
                    <Plus className="h-3 w-3" strokeWidth={2.6} />
                    {t("dashboard.tournamentsCard.createCta")}
                  </p>
                )}
              </>
            ) : (
              <>
                <p
                  className="text-[24px] font-black leading-none tabular-nums tracking-tight bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      state === "live"
                        ? "linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 72%, white) 100%)"
                        : state === "planned"
                          ? "linear-gradient(135deg, #92400e 0%, #f59e0b 100%)"
                          : "linear-gradient(135deg, #64748b 0%, #94a3b8 100%)",
                  }}
                >
                  {isLoading ? "…" : count}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-[0.1em] font-bold">
                  {count > 1 ? t("nav.tournaments") : t("nav.tournament")}
                </p>
                <StateBadge state={state} startsOn={highlight?.starts_on ?? null} />
              </>
            )}
          </div>
          <ChevronRight
            className="h-4 w-4 text-muted-foreground/70 absolute top-3 right-3 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.4}
          />
        </Link>
      </div>

      {canManageCamps && (
        <Link
          to="/admin/camps"
          className="group relative overflow-hidden rounded-[14px] border-[1.5px] border-border bg-card p-[11px] min-h-[64px] active:scale-[0.99] transition-all hover:border-lime-500 hover:shadow-[0_4px_12px_rgba(132,204,22,0.12)] flex items-center gap-3"
        >
          <div
            aria-hidden
            className="absolute top-0 inset-x-0 h-[3px]"
            style={{ background: "linear-gradient(90deg, #4d7c0f 0%, #84cc16 100%)" }}
          />
          <div
            className="h-[36px] w-[36px] rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #ecfccb 0%, #d9f99d 100%)" }}
          >
            <Tent className="h-5 w-5" strokeWidth={2.4} style={{ color: "#4d7c0f" }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold leading-tight">{t("dashboard.campsCard.title")}</p>
            {campsCount === 0 ? (
              <p className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-0.5 font-medium">
                <Plus className="h-3 w-3" strokeWidth={2.6} />
                {t("dashboard.campsCard.createCta")}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {campsCount}{" "}
                {campsCount > 1
                  ? t("dashboard.campsCard.plural")
                  : t("dashboard.campsCard.singular")}
                {nextCamp?.start_date ? ` · ${fmt(new Date(nextCamp.start_date), "d MMM")}` : ""}
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/70 shrink-0" strokeWidth={2.4} />
        </Link>
      )}
    </div>
  );
}

function StateBadge({ state, startsOn }: { state: TournamentState; startsOn: string | null }) {
  const { t } = useTranslation();
  if (state === "live") {
    return (
      <span
        className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-white"
        style={{
          background:
            "linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 72%, white) 100%)",
        }}
      >
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inset-0 rounded-full bg-card/70 animate-ping" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-card" />
        </span>
        {t("dashboard.tournamentsCard.live")}
      </span>
    );
  }
  if (state === "planned") {
    const label = startsOn
      ? fmt(new Date(startsOn), "d MMM")
      : t("dashboard.tournamentsCard.upcoming");
    return (
      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[9px] font-bold text-[#92400e]">
        <CalendarDays className="h-2.5 w-2.5" strokeWidth={2.6} />
        {label}
      </span>
    );
  }
  return (
    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
      <Check className="h-2.5 w-2.5" strokeWidth={2.6} />
      {t("dashboard.tournamentsCard.done")}
    </span>
  );
}
