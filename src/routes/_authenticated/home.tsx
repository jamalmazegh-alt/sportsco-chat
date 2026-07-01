import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, MapPin, ChevronRight, Plus, Users, BarChart3, CreditCard } from "lucide-react";
import { isToday, isTomorrow } from "date-fns";
import { fmt } from "@/lib/date-locale";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AttendancePill } from "@/components/attendance-pill";
import { EventCreateChooser } from "@/components/events/EventCreateChooser";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { AdminKpis } from "@/components/admin-kpis";
import { cn } from "@/lib/utils";
import { HomeSkeleton } from "@/components/skeletons";
import { InsightsSection } from "@/components/insights-section";
import { useTournamentOnlyMode } from "@/modules/tournaments/hooks/useTournamentOnlyMode";
import { HomeQuickCards } from "@/components/home-quick-cards";
import { listMyObligations } from "@/lib/payment-checkout.functions";
import { isV2 } from "@/config/features";
import { EventTypeBadge } from "@/lib/event-type-icon";

import { DeclareAbsenceDrawer } from "@/components/declare-absence-drawer";
import { UrgencyCenter } from "@/components/urgency-center";
import { SponsorBanner } from "@/components/sponsors/sponsor-banner";

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

function formatPaymentAmount(cents: number, currency: string | null | undefined, locale: string) {
  const code = (currency || "eur").toUpperCase();
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
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
  const listMyObligationsFn = useServerFn(listMyObligations);

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, sport, championship, competitions")
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
        .limit(3);
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
        ...(children ?? [])
          .map((c: any) => c.players)
          .filter(Boolean)
          .map((p: any) => ({ ...p, isOwn: ownIds.has(p.id) })),
      ];
      const playerIds = players.map((p) => p.id);
      if (playerIds.length === 0) return [];

      const { data } = await supabase
        .from("convocations")
        .select(
          "id, status, player_id, event:event_id(id, title, starts_at, location, type, status, team_id)",
        )
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
        .sort(
          (a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
        );
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
        ...(children ?? [])
          .map((c: any) => c.players)
          .filter(Boolean)
          .map((p: any) => ({ ...p, isOwn: ownIds.has(p.id) })),
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

  const { data: paymentData } = useQuery({
    queryKey: ["my-obligations-home", user?.id, activeClubId],
    enabled: !!user && !!activeClubId,
    staleTime: 60_000,
    queryFn: () => listMyObligationsFn({ data: {} }),
  });

  const isCoach =
    roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");
  const isAdmin = roles.includes("admin");

  const playerHomeEvents = useMemo(() => {
    const byId = new Map<string, any>();
    for (const e of (upcoming ?? []) as any[]) byId.set(e.id, e);
    for (const e of (myConvocs ?? []) as any[]) byId.set(e.id, e);
    return Array.from(byId.values())
      .sort(
        (a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      )
      .slice(0, 3);
  }, [upcoming, myConvocs]);

  const paymentSummary = useMemo(() => {
    const obligations = paymentData?.obligations ?? [];
    if (obligations.length === 0) return null;
    const totalCents = obligations.reduce((sum: number, obligation: any) => {
      return (
        sum + Math.max(0, (obligation.amount_due_cents ?? 0) - (obligation.amount_paid_cents ?? 0))
      );
    }, 0);
    const currency = obligations[0]?.currency ?? "eur";
    return {
      count: obligations.length,
      totalLabel: formatPaymentAmount(totalCents, currency, i18n.language),
    };
  }, [i18n.language, paymentData?.obligations]);

  if (!tOnlyLoading && tournamentOnly) return <Navigate to="/tournaments" replace />;

  // Show skeleton on first paint while the primary queries hydrate.
  if (activeClubId && teamsLoading) {
    return <HomeSkeleton />;
  }

  return (
    <div className="px-5 pt-6 space-y-6 pb-4">
      {activeClubId && <SponsorBanner clubId={activeClubId} />}
      {/* Club hero */}
      <header className="relative overflow-hidden rounded-[20px] border-[1.5px] border-border bg-card p-5 shadow-sm">
        <svg
          aria-hidden
          className="absolute inset-0 h-full w-full opacity-[0.07] dark:opacity-[0.12] pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="terrain-home"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="40"
                stroke="currentColor"
                strokeWidth="1"
                className="text-primary"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#terrain-home)" />
        </svg>
        <div className="relative flex items-center gap-4">
          {club?.logo_url ? (
            <img
              src={club.logo_url}
              alt={club.name}
              className="h-16 w-16 shrink-0 rounded-2xl bg-card object-cover shadow-sm ring-2 ring-border"
            />
          ) : (
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-black text-primary-foreground shadow-sm ring-2 ring-border"
              style={{ background: "linear-gradient(135deg, #0f4a26 0%, #2d9d5f 100%)" }}
            >
              {club?.name?.[0] ?? "C"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              {club?.name}
            </p>
            <h1 className="mt-0.5 truncate text-[22px] font-black leading-tight tracking-tight text-foreground">
              {t("dashboard.greeting", {
                name: user?.user_metadata?.full_name?.split(" ")[0] ?? "",
              })}
            </h1>
          </div>
        </div>
      </header>

      {paymentSummary && (
        <Link
          to="/payments"
          className="group flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-left shadow-sm transition-colors hover:bg-amber-500/15"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {t("payments.homeCard.title", { count: paymentSummary.count })}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("payments.homeCard.subtitle", { amount: paymentSummary.totalLabel })}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">
              {paymentSummary.count}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      )}

      {/* Onboarding checklist (admins) */}
      {isAdmin && activeClubId && (
        <OnboardingChecklist
          clubId={activeClubId}
          hasLogo={!!club?.logo_url}
          onCreateEvent={() => setCreateOpen(true)}
        />
      )}

      {/* Centre d'urgence : convocations sans réponse J-1/J-2/J-3 + effectif réduit.
          UpcomingAbsencesWidget reste sur la page équipe (info détail, pas urgence). */}
      {activeClubId && <UrgencyCenter />}

      {/* Next event(s) for coaches/admins */}
      {isCoach && (
        <section>
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <h2 className="text-[11px] font-bold text-foreground uppercase tracking-[0.14em]">
              {t("dashboard.nextEvent")}
            </h2>
            <Link
              to="/events"
              className="text-[11px] text-foreground font-bold inline-flex items-center gap-0.5 hover:text-[#2d9d5f] transition-colors"
            >
              {t("dashboard.viewAll")}
              <ChevronRight className="h-3 w-3" strokeWidth={2.6} />
            </Link>
          </div>
          {!upcoming || upcoming.length === 0 ? (
            <div className="rounded-[14px] border-[1.5px] border-dashed border-border bg-card p-8 text-center">
              <Calendar className="mx-auto h-8 w-8 text-muted-foreground/70 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">
                {t("dashboard.noUpcoming")}
              </p>
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
                        "relative block overflow-hidden rounded-[14px] border-[1.5px] active:scale-[0.99] transition-all",
                        isFirst
                          ? "border-[#0f4a26] bg-card shadow-[0_4px_14px_rgba(15,74,38,0.18)]"
                          : "border-border bg-card hover:border-border",
                      )}
                    >
                      {isFirst && (
                        <div
                          className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-white"
                          style={{
                            background: "linear-gradient(135deg, #0f4a26 0%, #2d9d5f 100%)",
                          }}
                        >
                          ★ {t("dashboard.nextEvent")}
                        </div>
                      )}
                      <div
                        className={cn(
                          "flex items-center justify-between gap-3",
                          isFirst ? "p-4" : "p-3.5",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <EventTypeBadge type={(e as any).type} size={isFirst ? "md" : "sm"} />
                            <p
                              className={cn(
                                "font-bold truncate text-foreground",
                                isFirst ? "text-[15px]" : "text-sm",
                              )}
                            >
                              {e.title}
                            </p>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-medium mt-1 flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" strokeWidth={2.4} />
                            {formatWhen(new Date(e.starts_at))}
                            {e.location && (
                              <>
                                <span>·</span>
                                <MapPin className="h-3 w-3" strokeWidth={2.4} />
                                <span className="truncate">{e.location}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <ChevronRight
                          className={cn(
                            "shrink-0",
                            isFirst
                              ? "h-5 w-5 text-foreground"
                              : "h-4 w-4 text-muted-foreground/70",
                          )}
                          strokeWidth={2.4}
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Stats: insights + KPIs (admins/coaches) */}
      {isCoach && activeClubId && <InsightsSection clubId={activeClubId} />}
      {isCoach && activeClubId && <AdminKpis clubId={activeClubId} />}

      {/* Primary CTA + duo (quick cards) */}
      {isCoach && (
        <div className="space-y-3">
          {user && activeClubId && (
            <>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="group relative w-full overflow-hidden rounded-[14px] h-14 text-white font-black text-[15px] tracking-tight shadow-[0_4px_14px_rgba(15,74,38,0.3)] active:scale-[0.99] transition-all"
                style={{
                  background: "linear-gradient(135deg, #0f4a26 0%, #2d9d5f 100%)",
                }}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
                  }}
                />
                <span className="relative inline-flex items-center justify-center gap-2">
                  <span className="h-7 w-7 rounded-full bg-card/20 ring-1 ring-white/30 flex items-center justify-center">
                    <Plus className="h-4 w-4" strokeWidth={2.8} />
                  </span>
                  {t("dashboard.createEvent")}
                </span>
              </button>
              <EventCreateChooser
                clubId={activeClubId}
                teams={teams ?? []}
                userId={user.id}
                open={createOpen}
                onOpenChange={setCreateOpen}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["events"] });
                  qc.invalidateQueries({ queryKey: ["upcoming"] });
                }}
              />
            </>
          )}
          {activeClubId && <HomeQuickCards clubId={activeClubId} teams={teams ?? []} />}
        </div>
      )}

      {/* For players/parents: quick absence declaration */}
      {!isCoach && myTeams && myTeams.length > 0 && (
        <section>
          <Button variant="outline" className="w-full h-11" onClick={() => setAbsenceOpen(true)}>
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
                  <img
                    src={team.image_url}
                    alt={team.name}
                    className="h-10 w-10 rounded-xl object-cover shrink-0"
                  />
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
                  <p className="text-xs text-muted-foreground truncate">
                    {t("dashboard.teamHint")}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </section>
      )}

      {/* For players/parents: shortcut to attendance stats (own or child's) */}
      {!isCoach &&
        myConvocs &&
        myConvocs.length > 0 &&
        (() => {
          const seen = new Map<
            string,
            { id: string; first_name: string; last_name?: string; isOwn?: boolean }
          >();
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
      {!isCoach &&
        (() => {
          const convocPlayers = new Map<
            string,
            { id: string; first_name: string; isOwn?: boolean }
          >();
          for (const e of (myConvocs ?? []) as any[]) {
            if (e.player && !convocPlayers.has(e.player.id))
              convocPlayers.set(e.player.id, e.player);
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
              <div className="flex items-center justify-between mb-2.5 px-0.5">
                <h2 className="text-[11px] font-bold text-foreground uppercase tracking-[0.14em]">
                  {headerLabel}
                </h2>
                <Link
                  to="/events"
                  className="text-[11px] text-foreground font-bold inline-flex items-center gap-0.5 hover:text-[#2d9d5f] transition-colors"
                >
                  {t("dashboard.viewAll")}
                  <ChevronRight className="h-3 w-3" strokeWidth={2.6} />
                </Link>
              </div>
              {playerHomeEvents.length === 0 ? (
                <div className="rounded-[14px] border-[1.5px] border-dashed border-border bg-card p-8 text-center">
                  <Calendar className="mx-auto h-8 w-8 text-muted-foreground/70 mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">
                    {t("dashboard.noUpcoming")}
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {playerHomeEvents.map((e: any, idx: number) => {
                    const isCancelled = e.status === "cancelled";
                    const actionRequired = !isCancelled && e.convocation?.status === "pending";
                    const isFirst = idx === 0 && !actionRequired && !isCancelled;
                    return (
                      <li key={e.id}>
                        <Link
                          to="/events/$eventId"
                          params={{ eventId: e.id }}
                          className={cn(
                            "relative block overflow-hidden rounded-[14px] border-[1.5px] active:scale-[0.99] transition-all",
                            isCancelled
                              ? "border-red-400/70 bg-red-50/40 dark:bg-red-950/20"
                              : actionRequired
                                ? "border-[#fcd34d] bg-[#fffbeb] shadow-[0_2px_8px_rgba(245,158,11,0.15)]"
                                : isFirst
                                  ? "border-[#0f4a26] bg-card shadow-[0_4px_14px_rgba(15,74,38,0.18)]"
                                  : "border-border bg-card hover:border-border",
                          )}
                        >
                          {isFirst && (
                            <div
                              className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-white"
                              style={{
                                background: "linear-gradient(135deg, #0f4a26 0%, #2d9d5f 100%)",
                              }}
                            >
                              ★ {t("dashboard.nextEvent")}
                            </div>
                          )}
                          <div
                            className={cn(
                              "flex items-center justify-between gap-3",
                              isFirst ? "p-4" : "p-3.5",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <EventTypeBadge
                                  type={(e as any).type}
                                  size={isFirst ? "md" : "sm"}
                                />
                                <p
                                  className={cn(
                                    "font-bold truncate text-foreground",
                                    isFirst ? "text-[15px]" : "text-sm",
                                    isCancelled && "line-through text-red-700 dark:text-red-300",
                                  )}
                                >
                                  {e.title}
                                </p>
                                {isCancelled ? (
                                  <span className="text-[9px] font-black uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[4px] bg-red-600 text-white shrink-0">
                                    {t("events.status.cancelled", { defaultValue: "Annulé" })}
                                  </span>
                                ) : (
                                  actionRequired && (
                                    <span className="text-[9px] font-black uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[4px] bg-[#f59e0b] text-white shrink-0">
                                      {t("dashboard.actionRequired")}
                                    </span>
                                  )
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground font-medium mt-1 flex items-center gap-1.5 flex-wrap">
                                <Calendar className="h-3 w-3" strokeWidth={2.4} />
                                <span>{formatWhen(new Date(e.starts_at))}</span>
                                {e.player && <span>· {e.player.first_name}</span>}
                                {e.team_name && <span>· {e.team_name}</span>}
                                {e.location && (
                                  <>
                                    <MapPin className="h-3 w-3" strokeWidth={2.4} />
                                    <span className="truncate">{e.location}</span>
                                  </>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {e.convocation && <AttendancePill status={e.convocation.status} />}
                              <ChevronRight
                                className={cn(
                                  isFirst
                                    ? "h-5 w-5 text-foreground"
                                    : "h-4 w-4 text-muted-foreground/70",
                                )}
                                strokeWidth={2.4}
                              />
                            </div>
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
    </div>
  );
}
