import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, MapPin, ChevronRight, Plus, Users, BarChart3 } from "lucide-react";
import { isToday, isTomorrow } from "date-fns";
import { fmt } from "@/lib/date-locale";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AttendancePill } from "@/components/attendance-pill";
import { EventFormSheet } from "@/components/event-form-sheet";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { AdminKpis } from "@/components/admin-kpis";
import { cn } from "@/lib/utils";
import { HomeSkeleton } from "@/components/skeletons";
import { InsightsSection } from "@/components/insights-section";
import { useTournamentOnlyMode } from "@/modules/tournaments/hooks/useTournamentOnlyMode";
import { HomeQuickCards } from "@/components/home-quick-cards";
import { ClubAvailabilityWidget } from "@/components/club-availability-widget";
import { DeclareAbsenceDrawer } from "@/components/declare-absence-drawer";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.home.title") },
      { name: "description", content: i18n.t("meta.home.description") },
    ],
  }),
});

function formatWhen(d: Date) {
  const label = isToday(d)
    ? i18n.t("common.today")
    : isTomorrow(d)
      ? i18n.t("common.tomorrow")
      : fmt(d, "EEE d MMM");
  return `${label} · ${fmt(d, "HH:mm")}`;
}

function HomePage() {
  const { t, i18n } = useTranslation();
  const { user, activeClubId, memberships } = useAuth();
  const roles = useMyRoles();
  const club = memberships.find((m) => m.club_id === activeClubId)?.club;
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const { tournamentOnly, isLoading: tOnlyLoading } = useTournamentOnlyMode();
  if (!tOnlyLoading && tournamentOnly) return <Navigate to="/tournaments" replace />;

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, competitions")
        .eq("club_id", activeClubId!)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });

  // Next event (any team in club user can see)
  const { data: upcoming } = useQuery({
    queryKey: ["upcoming", activeClubId],
    enabled: !!activeClubId && !!teams,
    queryFn: async () => {
      if (!teams || teams.length === 0) return [];
      const teamIds = teams.map((t) => t.id);
      const { data, error } = await supabase
        .from("events")
        .select("id, title, starts_at, location, type, status, team_id")
        .in("team_id", teamIds)
        .eq("status", "published")
        .is("deleted_at", null)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      return (data ?? []).map((e) => ({
        ...e,
        team_name: teams.find((t) => t.id === e.team_id)?.name ?? "",
      }));
    },
  });

  // My convocations only (player or parent)
  const { data: myConvocs } = useQuery({
    queryKey: ["my-convocs-home", user?.id, activeClubId],
    enabled: !!user && !!activeClubId,
    queryFn: async () => {
      const [{ data: own }, { data: children }] = await Promise.all([
        supabase.from("players").select("id, first_name, last_name").eq("user_id", user!.id),
        supabase
          .from("player_parents")
          .select("player_id, players:player_id(id, first_name, last_name)")
          .eq("parent_user_id", user!.id),
      ]);
      const ownIds = new Set((own ?? []).map((p: any) => p.id));
      const players = [
        ...(own ?? []).map((p: any) => ({ ...p, isOwn: true })),
        ...((children ?? [])
          .map((c: any) => c.players)
          .filter(Boolean)
          .map((p: any) => ({ ...p, isOwn: ownIds.has(p.id) }))),
      ];
      const playerIds = players.map((p) => p.id);
      if (playerIds.length === 0) return [];

      const { data } = await supabase
        .from("convocations")
        .select("id, status, player_id, event:event_id(id, title, starts_at, location, type, status, team_id)")
        .in("player_id", playerIds)
        .order("created_at", { ascending: false });

      const now = new Date();
      return (data ?? [])
        .filter((c: any) => c.event && new Date(c.event.starts_at) >= now)
        .map((c: any) => ({
          ...c.event,
          team_name: (teams ?? []).find((t) => t.id === c.event.team_id)?.name ?? "",
          convocation: { id: c.id, status: c.status },
          player: players.find((p) => p.id === c.player_id) ?? null,
        }))
        .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    },
  });

  // Teams the user (or their children) belong to — for player/parent quick access
  const { data: myTeams } = useQuery({
    queryKey: ["my-teams-home", user?.id, activeClubId],
    enabled: !!user && !!activeClubId,
    queryFn: async () => {
      const [{ data: own }, { data: children }] = await Promise.all([
        supabase.from("players").select("id, first_name, last_name").eq("user_id", user!.id),
        supabase
          .from("player_parents")
          .select("player_id, players:player_id(id, first_name, last_name)")
          .eq("parent_user_id", user!.id),
      ]);
      const ownIds = new Set((own ?? []).map((p: any) => p.id));
      const players = [
        ...(own ?? []).map((p: any) => ({ ...p, isOwn: true })),
        ...((children ?? [])
          .map((c: any) => c.players)
          .filter(Boolean)
          .map((p: any) => ({ ...p, isOwn: ownIds.has(p.id) }))),
      ];
      if (players.length === 0) return [] as any[];
      const playerIds = players.map((p) => p.id);
      const { data: tms } = await supabase
        .from("team_members")
        .select("team_id, player_id, teams:team_id(id, name, image_url, deleted_at)")
        .in("player_id", playerIds);
      const seen = new Map<string, { team: any; player: any }>();
      for (const tm of (tms ?? []) as any[]) {
        const team = tm.teams;
        if (!team || team.deleted_at) continue;
        const player = players.find((p) => p.id === tm.player_id);
        if (!player) continue;
        const key = `${team.id}:${player.id}`;
        if (!seen.has(key)) seen.set(key, { team, player });
      }
      return Array.from(seen.values());
    },
  });

  const isCoach = roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");
  const isAdmin = roles.includes("admin");

  // Show skeleton on first paint while the primary queries hydrate.
  if (activeClubId && teamsLoading) {
    return <HomeSkeleton />;
  }

  return (
    <div className="px-5 pt-6 space-y-6 pb-4">
      {/* Club hero — energetic gradient banner */}
      <header className="relative overflow-hidden rounded-3xl border border-border bg-gradient-hero p-6 pb-7">
        <div aria-hidden className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-[color:var(--energy)]/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-[color:var(--brand-blue)]/25 blur-3xl" />
        <div className="relative flex flex-col items-center text-center">
          {club?.logo_url ? (
            <div className="relative">
              <div aria-hidden className="absolute inset-0 rounded-3xl bg-gradient-primary blur-md opacity-40" />
              <img
                src={club.logo_url}
                alt={club.name}
                className="relative h-24 w-24 rounded-3xl object-cover border-2 border-card shadow-elevated bg-white"
              />
            </div>
          ) : (
            <div className="h-24 w-24 rounded-3xl bg-gradient-primary flex items-center justify-center text-3xl font-bold text-white border-2 border-card shadow-elevated">
              {club?.name?.[0] ?? "C"}
            </div>
          )}
          <p className="mt-3 text-[11px] uppercase tracking-[0.15em] text-[color:var(--energy)] font-bold">
            {club?.name}
          </p>
          <h1 className="text-2xl font-bold mt-1 font-display tracking-tight">
            {t("dashboard.greeting", { name: user?.user_metadata?.full_name?.split(" ")[0] ?? "" })}
          </h1>
        </div>
      </header>

      {/* Insights (admins/coaches) */}
      {isCoach && activeClubId && <InsightsSection clubId={activeClubId} />}

      {/* Club availability (suspensions + absences unified) */}
      {isCoach && activeClubId && <ClubAvailabilityWidget clubId={activeClubId} />}





      {/* Onboarding checklist (admins) */}
      {isAdmin && activeClubId && (
        <OnboardingChecklist
          clubId={activeClubId}
          hasLogo={!!club?.logo_url}
          onCreateEvent={() => setCreateOpen(true)}
        />
      )}

      {/* KPIs strip (admins/coaches) */}
      {isCoach && activeClubId && <AdminKpis clubId={activeClubId} />}

      {/* Quick actions */}
      {isCoach && (
        <div className="space-y-2">
          {user && (
            <EventFormSheet
              open={createOpen}
              onOpenChange={setCreateOpen}
              mode="create"
              teams={teams ?? []}
              userId={user.id}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["events"] });
                qc.invalidateQueries({ queryKey: ["upcoming"] });
              }}
              trigger={
                <Button className="w-full h-12 text-[15px] font-semibold shadow-sm">
                  <Plus className="h-4 w-4" />
                  {t("dashboard.createEvent")}
                </Button>
              }
            />
          )}
          {activeClubId && (
            <HomeQuickCards clubId={activeClubId} teams={teams ?? []} />
          )}
        </div>
      )}

      {/* For players/parents: quick absence declaration */}
      {!isCoach && myTeams && myTeams.length > 0 && (
        <section>
          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => setAbsenceOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {t("availability.declare", { defaultValue: "Déclarer une absence" })}
          </Button>
          <DeclareAbsenceDrawer open={absenceOpen} onOpenChange={setAbsenceOpen} />
        </section>
      )}

      {/* For players/parents: shortcut to team(s) */}
      {!isCoach && myTeams && myTeams.length > 0 && (
        <section className="space-y-2">
          {myTeams.map(({ team, player }) => (
            <Link
              key={`${team.id}-${player.id}`}
              to="/teams/$teamId"
              params={{ teamId: team.id }}
              className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {team.image_url ? (
                  <img src={team.image_url} alt={team.name} className="h-10 w-10 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {player.isOwn
                      ? t("dashboard.myTeam")
                      : t("dashboard.childTeam", { name: player.first_name })}
                    {" · "}
                    {team.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{t("dashboard.teamHint")}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </section>
      )}

      {/* For players/parents: shortcut to attendance stats (own or child's) */}
      {!isCoach && myConvocs && myConvocs.length > 0 && (() => {
        const seen = new Map<string, { id: string; first_name: string; last_name?: string; isOwn?: boolean }>();
        for (const e of myConvocs as any[]) {
          if (e.player && !seen.has(e.player.id)) seen.set(e.player.id, e.player);
        }
        const players = Array.from(seen.values());
        if (players.length === 0) return null;
        return (
          <section className="space-y-2">
            {players.map((p) => (
              <Link
                key={p.id}
                to="/players/$playerId"
                params={{ playerId: p.id }}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {p.isOwn
                        ? t("dashboard.myStats")
                        : t("dashboard.childStats", { name: p.first_name })}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.isOwn
                        ? t("dashboard.myStatsHint")
                        : t("dashboard.childStatsHint", { name: p.first_name })}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </section>
        );
      })()}

      {/* For players/parents: unified list of upcoming events with action-required highlight on pending convocations */}
      {!isCoach && (() => {
        const convocPlayers = new Map<string, { id: string; first_name: string; isOwn?: boolean }>();
        for (const e of (myConvocs ?? []) as any[]) {
          if (e.player && !convocPlayers.has(e.player.id)) convocPlayers.set(e.player.id, e.player);
        }
        const list = Array.from(convocPlayers.values());
        const hasOwn = list.some((p) => p.isOwn);
        const childOnly = list.length > 0 && !hasOwn;
        const headerLabel = !childOnly
          ? t("dashboard.myConvocations")
          : list.length === 1
            ? t("dashboard.childConvocations", { name: list[0].first_name })
            : t("dashboard.childrenConvocations");
        return (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {headerLabel}
            </h2>
            <Link to="/events" className="text-xs text-primary font-medium">
              {t("dashboard.viewAll")}
            </Link>
          </div>
          {!myConvocs || myConvocs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <Calendar className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t("dashboard.noUpcoming")}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {myConvocs.map((e: any, idx: number) => {
                const actionRequired = e.convocation?.status === "pending";
                const isFirst = idx === 0 && !actionRequired;
                return (
                  <li key={e.id}>
                    <Link
                      to="/events/$eventId"
                      params={{ eventId: e.id }}
                      className={cn(
                        "flex items-center justify-between rounded-2xl border active:scale-[0.99] transition-transform",
                        actionRequired
                          ? "border-pending/40 bg-pending/5 ring-1 ring-pending/30 p-4"
                          : isFirst
                            ? "border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-5 shadow-sm ring-1 ring-primary/10"
                            : "border-border bg-card p-4",
                      )}
                    >
                      <div className="min-w-0">
                        {isFirst && (
                          <p className="text-[10px] uppercase tracking-[0.15em] text-primary font-bold mb-1">
                            {t("dashboard.nextEvent")}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <p className={cn("font-medium truncate", isFirst && "text-lg font-semibold")}>{e.title}</p>
                          {actionRequired && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-pending text-pending-foreground shrink-0">
                              {t("dashboard.actionRequired")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <Calendar className="h-3 w-3" />
                          <span>{formatWhen(new Date(e.starts_at))}</span>
                          {e.player && <span>· {e.player.first_name}</span>}
                          {e.team_name && <span>· {e.team_name}</span>}
                          {e.location && (
                            <>
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{e.location}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {e.convocation && <AttendancePill status={e.convocation.status} />}
                        <ChevronRight className={cn("text-muted-foreground", isFirst ? "h-5 w-5 text-primary" : "h-4 w-4")} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        );
      })()}

      {/* For coaches/admins: upcoming events for all teams */}
      {isCoach && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t("dashboard.nextEvent")}
            </h2>
            <Link to="/events" className="text-xs text-primary font-medium">
              {t("dashboard.viewAll")}
            </Link>
          </div>
          {!upcoming || upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <Calendar className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t("dashboard.noUpcoming")}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((e, idx) => {
                const isFirst = idx === 0;
                return (
                  <li key={e.id}>
                    <Link
                      to="/events/$eventId"
                      params={{ eventId: e.id }}
                      className={cn(
                        "flex items-center justify-between rounded-2xl border active:scale-[0.99] transition-transform",
                        isFirst
                          ? "border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-5 shadow-sm ring-1 ring-primary/10"
                          : "border-border bg-card p-4",
                      )}
                    >
                      <div className="min-w-0">
                        {isFirst && (
                          <p className="text-[10px] uppercase tracking-[0.15em] text-primary font-bold mb-1">
                            {t("dashboard.nextEvent")}
                          </p>
                        )}
                        <p className={cn("font-medium truncate", isFirst && "text-lg font-semibold")}>{e.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          {formatWhen(new Date(e.starts_at))}
                          {e.location && (
                            <>
                              <span>·</span>
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{e.location}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <ChevronRight className={cn("text-muted-foreground shrink-0", isFirst ? "h-5 w-5 text-primary" : "h-4 w-4")} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
