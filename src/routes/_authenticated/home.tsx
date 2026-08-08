import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, ChevronRight, Plus, Users, BarChart3, CreditCard } from "lucide-react";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { EventCreateChooser } from "@/components/events/EventCreateChooser";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { AdminKpis } from "@/components/admin-kpis";
import { cn } from "@/lib/utils";
import { HomeSkeleton } from "@/components/skeletons";

import { useTournamentOnlyMode } from "@/modules/tournaments/hooks/useTournamentOnlyMode";
import { HomeQuickCards } from "@/components/home-quick-cards";
import { HomeNeedsCard } from "@/components/home-needs-card";
import { listMyObligations } from "@/lib/payment-checkout.functions";
import { isV2 } from "@/config/features";
import { EventCard } from "@/components/events/event-card";
import { getEventsWeather } from "@/lib/weather/weather.functions";
import { weatherAvailability } from "@/lib/weather/rules";
import { fr, enUS } from "date-fns/locale";

import { DeclareAbsenceDrawer } from "@/components/declare-absence-drawer";
import { UrgencyCenter } from "@/components/urgency-center";
import { SponsorBanner } from "@/components/sponsors/sponsor-banner";
import { getActiveSponsorsForHome } from "@/lib/sponsors.functions";
import {
  buildConvocationCounts,
  type ConvocationCounts,
} from "@/components/convocation-summary-pill";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.home.title") },
      { name: "description", content: i18n.t("meta.home.description") },
    ],
  }),
});

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
  const getSponsorsFn = useServerFn(getActiveSponsorsForHome);

  const { data: sponsorsForHome } = useQuery({
    queryKey: ["sponsors-home", activeClubId],
    enabled: !!activeClubId,
    queryFn: () => getSponsorsFn({ data: { clubId: activeClubId! } }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const hasSponsor = (sponsorsForHome?.length ?? 0) > 0;

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams", activeClubId, "with-internal"],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, sport, championship, competitions, is_internal")
        .eq("club_id", activeClubId!)
        .is("deleted_at", null)
        .is("archived_at", null)
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
        .select(
          "id, title, starts_at, ends_at, location, type, status, team_id, opponent, competition_type, competition_name, is_home, convocations_sent",
        )
        .in("team_id", teamIds)
        .eq("status", "published")
        .is("deleted_at", null)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(3);
      if (error) throw error;
      return (data ?? []).map((e) => {
        const team = teams.find((t) => t.id === e.team_id);
        const isInternal = Boolean((team as { is_internal?: boolean } | undefined)?.is_internal);
        return {
          ...e,
          team_name: isInternal ? "" : (team?.name ?? ""),
        };
      });
    },
  });

  const dateLocale = i18n.language?.startsWith("fr") ? fr : enUS;

  // Coach view: which of the "next events" already have convocations dispatched.
  const { data: convocStats } = useQuery({
    queryKey: ["home-convocs-sent", activeClubId, (upcoming ?? []).map((e) => e.id).join(",")],
    enabled: !!upcoming && upcoming.length > 0,
    queryFn: async () => {
      const ids = (upcoming ?? []).map((e) => e.id);
      if (ids.length === 0)
        return { sent: new Set<string>(), counts: new Map<string, ConvocationCounts>() };
      const { data } = await supabase
        .from("convocations")
        .select("event_id, status, players:player_id(deleted_at)")
        .in("event_id", ids);
      // Ignore convocations attached to soft-deleted player records (ghost duplicates),
      // so card counts match the event detail page.
      const rows = (
        (data ?? []) as Array<{
          event_id: string;
          status: string | null;
          players: { deleted_at: string | null } | null;
        }>
      )
        .filter((r) => r.players && !r.players.deleted_at)
        .map((r) => ({ event_id: r.event_id, status: r.status }));
      return {
        sent: new Set<string>(rows.map((c) => c.event_id)),
        counts: buildConvocationCounts(rows),
      };
    },
    staleTime: 30_000,
  });
  const convocSentSet = convocStats?.sent;

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
          "id, status, player_id, event:event_id(id, title, starts_at, ends_at, location, type, status, team_id, opponent, competition_type, competition_name, is_home)",
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
        .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
        .slice(0, 3);
    },
  });

  // Météo — un seul appel pour les deux listes de l'accueil (prochains
  // événements côté staff, convocations côté joueur/parent).
  const weatherEventIds = useMemo(() => {
    const now = new Date();
    const ids = [
      ...(upcoming ?? []).map((e) => ({ id: e.id, status: e.status, starts_at: e.starts_at })),
      ...((myConvocs as any[]) ?? []).map((e: any) => ({
        id: e.id,
        status: e.status,
        starts_at: e.starts_at,
      })),
    ];
    const seen = new Set<string>();
    return ids
      .filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        // On envoie tout ce qui n'est ni passé ni annulé : le serveur connaît
        // les coordonnées et décide s'il y a une prévision ou un message.
        return (
          weatherAvailability(
            { status: e.status, startsAt: new Date(e.starts_at), latitude: 1, longitude: 1 },
            now,
          ) !== "silent"
        );
      })
      .map((e) => e.id);
  }, [upcoming, myConvocs]);

  const { data: weatherByEvent } = useQuery({
    queryKey: ["home-events-weather", weatherEventIds],
    enabled: weatherEventIds.length > 0,
    queryFn: () => getEventsWeather({ data: { eventIds: weatherEventIds } }),
    staleTime: 30 * 60_000,
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
        .select("team_id, player_id, teams:team_id(id, name, image_url, deleted_at, archived_at)")
        .in("player_id", playerIds);
      const seen = new Map<string, { team: any; player: any }>();
      for (const tm of (tms ?? []) as any[]) {
        const team = tm.teams;
        if (!team || team.deleted_at || team.archived_at) continue;
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
    <div className={cn("px-5 space-y-6 pb-4", hasSponsor ? "pt-6" : "pt-10")}>
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
              style={{
                background:
                  "linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 72%, white) 100%)",
              }}
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

      {/* Centre d'urgence : convocations sans réponse J-1/J-2/J-3 + effectif réduit
          + besoins ouverts non répondus (déplacés depuis HomeNeedsCard).
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
              className="text-[11px] text-foreground font-bold inline-flex items-center gap-0.5 hover:text-primary transition-colors"
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
              {upcoming.map((e, idx) => (
                <EventCard
                  key={e.id}
                  event={e as any}
                  dateLocale={dateLocale}
                  isCoach={isCoach}
                  highlight={idx === 0}
                  convocationSent={!!(e as any).convocations_sent || !!convocSentSet?.has(e.id)}
                  counts={convocStats?.counts.get(e.id) ?? null}
                  weather={weatherByEvent?.[e.id] ?? null}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Mes coups de main : rendu en bas de page (sous les prochains events). */}

      {/* KPIs (admins/coaches) — insights are now unified in UrgencyCenter deck above */}
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
                  background:
                    "linear-gradient(135deg, var(--primary) 0%, color-mix(in oklab, var(--primary) 72%, white) 100%)",
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
                teams={(teams ?? []).filter((t) => !(t as { is_internal?: boolean }).is_internal)}
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
          {activeClubId && (
            <HomeQuickCards
              clubId={activeClubId}
              teams={(teams ?? []).filter((t) => !(t as { is_internal?: boolean }).is_internal)}
            />
          )}
        </div>
      )}

      {/* For players/parents: quick absence declaration */}
      {!isCoach && myTeams && myTeams.length > 0 && (
        <section>
          <Button variant="outline" className="w-full h-11" onClick={() => setAbsenceOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("availability.declare")}
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
                  className="text-[11px] text-foreground font-bold inline-flex items-center gap-0.5 hover:text-primary transition-colors"
                >
                  {t("dashboard.viewAll")}
                  <ChevronRight className="h-3 w-3" strokeWidth={2.6} />
                </Link>
              </div>
              {!myConvocs || myConvocs.length === 0 ? (
                <div className="rounded-[14px] border-[1.5px] border-dashed border-border bg-card p-8 text-center">
                  <Calendar className="mx-auto h-8 w-8 text-muted-foreground/70 mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">
                    {t("dashboard.noUpcoming")}
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {(myConvocs as any[]).map((e: any, idx: number) => {
                    const isCancelled = e.status === "cancelled";
                    const actionRequired = !isCancelled && e.convocation?.status === "pending";
                    return (
                      <EventCard
                        key={`${e.id}-${e.player?.id ?? ""}`}
                        event={e}
                        dateLocale={dateLocale}
                        isCoach={false}
                        highlight={idx === 0 && !actionRequired && !isCancelled}
                        actionRequired={actionRequired}
                        // Un parent de plusieurs enfants doit voir de qui il s'agit ;
                        // pour un joueur seul, le prénom n'apprend rien.
                        showPlayerName={childOnly || list.length > 1}
                        myConvocation={
                          e.convocation
                            ? {
                                status: e.convocation.status,
                                playerName: e.player?.first_name ?? "",
                              }
                            : null
                        }
                        weather={weatherByEvent?.[e.id] ?? null}
                      />
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })()}

      {/* Mes coups de main : engagements en cours + récemment complétés.
          Placé en bas pour rester sous les prochains events. */}
      {activeClubId && <HomeNeedsCard />}
    </div>
  );
}
