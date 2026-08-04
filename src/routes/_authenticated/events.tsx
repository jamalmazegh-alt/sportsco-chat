import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, isPast, isToday, isSameDay, startOfDay } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useAuth, useActiveRole, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  EventsFilterSheet,
  DEFAULT_EVENTS_FILTERS,
  type EventsFilters,
} from "@/components/events/EventsFilterSheet";

import {
  Calendar,
  Plus,
  Users,
  Trophy,
  Dumbbell,
  BellRing,
  Home,
  Plane,
  List,
  CalendarDays,
  Ban,
  Clock,
  Search,
  Send,
} from "lucide-react";
import { EventCreateChooser } from "@/components/events/EventCreateChooser";
import { EmptyState } from "@/components/empty-state";
import { ConvocationBand } from "@/components/convocation-band";
import {
  ConvocationResponseBadge,
  type ConvocationResponse,
} from "@/components/convocation-response-badge";
import {
  ConvocationSummaryPill,
  buildConvocationCounts,
  type ConvocationCounts,
} from "@/components/convocation-summary-pill";
import { cn } from "@/lib/utils";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/events")({
  component: EventsRoute,
  head: () => ({
    meta: [
      { title: i18n.t("meta.events.title") },
      { name: "description", content: i18n.t("meta.events.description") },
    ],
  }),
});

function EventsRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/events") return <Outlet />;
  return <EventsPage />;
}

const TYPE_ICONS: Record<string, typeof Calendar> = {
  training: Dumbbell,
  match: Trophy,
  tournament: Trophy,
  meeting: Users,
  other: Calendar,
};

function EventsPage() {
  const { t, i18n } = useTranslation();
  const { user, activeClubId } = useAuth();
  const role = useActiveRole();
  const roles = useMyRoles();
  const isCoach =
    roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedDay, setSelectedDay] = useState<Date>(() => startOfDay(new Date()));
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<EventsFilters>(DEFAULT_EVENTS_FILTERS);
  const [hideTrainings, setHideTrainings] = useState(false);
  const dateLocale = i18n.language?.startsWith("fr") ? fr : enUS;

  const { data: club } = useQuery({
    queryKey: ["club", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("clubs")
        .select("id, name, logo_url")
        .eq("id", activeClubId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: teams } = useQuery({
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

  // Teams shown in filter chips / new-event picker exclude the internal team.
  const visibleTeams = useMemo(
    () => (teams ?? []).filter((t) => !(t as { is_internal?: boolean }).is_internal),
    [teams],
  );

  const { data: events, isLoading } = useQuery({
    queryKey: ["events", activeClubId, isCoach],
    enabled: !!activeClubId && !!teams,
    queryFn: async () => {
      const teamIds = (teams ?? []).map((t) => t.id);
      if (teamIds.length === 0) return [];
      let q = supabase
        .from("events")
        .select(
          "id, title, starts_at, location, type, status, team_id, opponent, competition_type, competition_name, is_home, convocations_sent",
        )
        .in("team_id", teamIds)
        .is("deleted_at", null)
        .order("starts_at", { ascending: true });
      if (!isCoach) q = q.eq("status", "published");
      const { data } = await q;
      const list = data ?? [];
      const matchIds = list.filter((e) => e.type === "match").map((e) => e.id);
      let resultsById = new Map<string, { home_score: number; away_score: number }>();
      if (matchIds.length > 0) {
        const { data: results } = await supabase
          .from("match_results")
          .select("event_id, home_score, away_score")
          .in("event_id", matchIds);
        resultsById = new Map(
          (results ?? []).map((r: any) => [
            r.event_id,
            { home_score: r.home_score, away_score: r.away_score },
          ]),
        );
      }
      return list.map((e) => {
        const team = teams!.find((t) => t.id === e.team_id);
        const isInternal = Boolean((team as { is_internal?: boolean } | undefined)?.is_internal);
        return {
          ...e,
          team_name: isInternal ? "" : (team?.name ?? ""),
          result: resultsById.get(e.id) ?? null,
        };
      });
    },
  });

  const internalTeamIds = useMemo(
    () =>
      new Set(
        (teams ?? []).filter((t) => (t as { is_internal?: boolean }).is_internal).map((t) => t.id),
      ),
    [teams],
  );
  const hasInternalTeam = internalTeamIds.size > 0;

  const baseVisibleEvents = useMemo(() => {
    if (!events) return [];
    const q = searchQuery.trim().toLowerCase();
    const fromTs = filters.dateFrom ? startOfDay(filters.dateFrom).getTime() : null;
    const toTs = filters.dateTo
      ? startOfDay(filters.dateTo).getTime() + 24 * 60 * 60 * 1000 - 1
      : null;
    return events.filter((e) => {
      if (!filters.showCancelled && e.status === "cancelled") return false;
      if (hideTrainings && e.type === "training") return false;
      if (filters.types.size > 0 && !filters.types.has(e.type as any)) return false;
      if (filters.teamIds.size > 0 && !filters.teamIds.has(e.team_id)) return false;
      if (!filters.includeInternal && internalTeamIds.has(e.team_id)) return false;
      if (filters.homeAway !== "all") {
        if (e.type !== "match" && e.type !== "tournament") return false;
        if (filters.homeAway === "home" && e.is_home === false) return false;
        if (filters.homeAway === "away" && e.is_home !== false) return false;
      }
      const d = new Date(e.starts_at);
      if (!filters.showPast) {
        if (isPast(d) && !isToday(d)) return false;
      }
      if (fromTs !== null && d.getTime() < fromTs) return false;
      if (toTs !== null && d.getTime() > toTs) return false;
      if (q) {
        const haystack = [e.title, e.opponent, e.team_name, e.competition_name, e.location]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, filters, internalTeamIds, searchQuery, hideTrainings]);

  const pastCount = useMemo(() => {
    if (!events) return 0;
    return events.filter((e) => {
      const d = new Date(e.starts_at);
      return isPast(d) && !isToday(d);
    }).length;
  }, [events]);

  const { data: pendingFollowUps } = useQuery({
    queryKey: ["follow-ups-count", activeClubId],
    enabled: !!activeClubId && isCoach && !!teams,
    queryFn: async () => {
      const teamIds = (teams ?? []).map((t) => t.id);
      if (teamIds.length === 0) return 0;
      const { data: evs } = await supabase
        .from("events")
        .select("id")
        .in("team_id", teamIds)
        .eq("status", "published")
        .gte("starts_at", new Date().toISOString())
        .limit(50);
      const evIds = (evs ?? []).map((e) => e.id);
      if (evIds.length === 0) return 0;
      const { count } = await supabase
        .from("convocations")
        .select("id", { count: "exact", head: true })
        .in("event_id", evIds)
        .eq("status", "pending");
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  // For players/parents: convocations on visible events, keyed by event_id.
  const { data: myConvocsByEvent } = useQuery({
    queryKey: ["my-convocs-by-event", user?.id, activeClubId, (events ?? []).length],
    enabled: !!user && !isCoach && !!events && events.length > 0,
    queryFn: async () => {
      const [{ data: own }, { data: children }] = await Promise.all([
        supabase.from("players").select("id, first_name").eq("user_id", user!.id),
        supabase
          .from("player_parents")
          .select("player_id, players:player_id(id, first_name)")
          .eq("parent_user_id", user!.id),
      ]);
      const players: Array<{ id: string; first_name: string }> = [
        ...(own ?? []).map((p: any) => ({ id: p.id, first_name: p.first_name })),
        ...(children ?? [])
          .map((c: any) => c.players)
          .filter(Boolean)
          .map((p: any) => ({ id: p.id, first_name: p.first_name })),
      ];
      const playerIds = Array.from(new Set(players.map((p) => p.id)));
      if (playerIds.length === 0) return new Map<string, any>();
      const eventIds = (events ?? []).map((e) => e.id);
      const { data } = await supabase
        .from("convocations")
        .select("event_id, status, player_id")
        .in("event_id", eventIds)
        .in("player_id", playerIds);
      const byPlayer = new Map(players.map((p) => [p.id, p]));
      const map = new Map<string, { status: string; playerName: string }>();
      for (const c of (data ?? []) as any[]) {
        const p = byPlayer.get(c.player_id);
        if (!p) continue;
        // Keep first (any convoc); if multiple children, priorité au pending
        const existing = map.get(c.event_id);
        if (!existing || (c.status === "pending" && existing.status !== "pending")) {
          map.set(c.event_id, { status: c.status, playerName: p.first_name });
        }
      }
      return map;
    },
    staleTime: 30_000,
  });

  // Coach view: which events already have convocations dispatched.
  // Rendered as a small "Convocations envoyées" chip on each event row.
  const { data: convocStats } = useQuery({
    queryKey: ["convocs-sent-by-event", activeClubId, (events ?? []).length],
    enabled: !!events && events.length > 0,
    queryFn: async () => {
      const eventIds = (events ?? []).map((e) => e.id);
      if (eventIds.length === 0)
        return { sent: new Set<string>(), counts: new Map<string, ConvocationCounts>() };
      const { data } = await supabase
        .from("convocations")
        .select("event_id, status, players:player_id(deleted_at)")
        .in("event_id", eventIds);
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

  const visibleEvents = useMemo(() => {
    if (filters.convocationsSent === "all") return baseVisibleEvents;
    return baseVisibleEvents.filter((e) => {
      const sent = !!(e as any).convocations_sent || !!convocSentSet?.has(e.id);
      return filters.convocationsSent === "sent" ? sent : !sent;
    });
  }, [baseVisibleEvents, convocSentSet, filters.convocationsSent]);

  const grouped = useMemo(() => {
    if (!visibleEvents) return [];
    const map = new Map<string, { label: string; items: typeof visibleEvents }>();
    for (const e of visibleEvents) {
      const d = new Date(e.starts_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      const label = format(d, "MMMM yyyy", { locale: dateLocale });
      if (!map.has(key)) map.set(key, { label, items: [] as typeof visibleEvents });
      map.get(key)!.items.push(e);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [visibleEvents, dateLocale]);

  const typePriority: Record<string, number> = {
    match: 0,
    tournament: 1,
    training: 2,
    meeting: 3,
    other: 4,
  };

  const eventTypesByDate = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of events ?? []) {
      const ts = startOfDay(new Date(e.starts_at)).getTime();
      const existing = map.get(ts);
      if (existing === undefined || typePriority[e.type] < typePriority[existing]) {
        map.set(ts, e.type);
      }
    }
    return map;
  }, [events]);

  const matchDates = useMemo(() => {
    const arr: Date[] = [];
    eventTypesByDate.forEach((type, ts) => {
      if (type === "match") arr.push(new Date(ts));
    });
    return arr;
  }, [eventTypesByDate]);
  const tournamentDates = useMemo(() => {
    const arr: Date[] = [];
    eventTypesByDate.forEach((type, ts) => {
      if (type === "tournament") arr.push(new Date(ts));
    });
    return arr;
  }, [eventTypesByDate]);
  const trainingDates = useMemo(() => {
    const arr: Date[] = [];
    eventTypesByDate.forEach((type, ts) => {
      if (type === "training") arr.push(new Date(ts));
    });
    return arr;
  }, [eventTypesByDate]);
  const meetingDates = useMemo(() => {
    const arr: Date[] = [];
    eventTypesByDate.forEach((type, ts) => {
      if (type === "meeting") arr.push(new Date(ts));
    });
    return arr;
  }, [eventTypesByDate]);
  const otherDates = useMemo(() => [] as Date[], []);

  const selectedDayEvents = useMemo(() => {
    return (events ?? []).filter((e) => isSameDay(new Date(e.starts_at), selectedDay));
  }, [events, selectedDay]);

  function renderEventItem(e: NonNullable<typeof events>[number]) {
    const Icon = TYPE_ICONS[e.type] ?? Calendar;
    const d = new Date(e.starts_at);
    const past = isPast(d) && !isToday(d);
    const isCancelled = e.status === "cancelled";
    let outcome: "win" | "loss" | "draw" | null = null;
    if (e.type === "match" && e.result) {
      const ourSide = e.is_home === false ? "away" : "home";
      const ours = ourSide === "home" ? e.result.home_score : e.result.away_score;
      const theirs = ourSide === "home" ? e.result.away_score : e.result.home_score;
      outcome = ours > theirs ? "win" : ours < theirs ? "loss" : "draw";
    }
    const isLoss = outcome === "loss";
    return (
      <li key={e.id}>
        <Link
          to="/events/$eventId"
          params={{ eventId: e.id }}
          className={cn(
            "flex items-stretch gap-3 rounded-2xl border bg-card overflow-hidden active:scale-[0.99] transition-transform",
            isCancelled
              ? "border-red-300/60 bg-red-50/30 opacity-60 hover:border-red-400/70"
              : isLoss
                ? "border-defeat/50 bg-defeat/5 hover:border-defeat/70"
                : past
                  ? "border-amber-200/60 bg-amber-50/20 hover:border-amber-300/80 dark:border-amber-900/40 dark:bg-amber-950/10"
                  : "border-border hover:border-primary/40",
          )}
        >
          <div
            className={cn(
              "flex flex-col items-center justify-center w-16 shrink-0 py-3",
              isCancelled
                ? "bg-red-100/40"
                : isLoss
                  ? "bg-defeat/15"
                  : past
                    ? "bg-amber-100/40 dark:bg-amber-900/30"
                    : "bg-primary/8",
            )}
          >
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider",
                isCancelled
                  ? "text-red-600"
                  : past
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-primary",
              )}
            >
              {format(d, "EEE", { locale: dateLocale })}
            </span>
            <span
              className={cn(
                "text-2xl font-bold leading-none mt-0.5",
                past && "text-amber-800 dark:text-amber-300",
              )}
            >
              {format(d, "d")}
            </span>
            <span className="text-[10px] text-muted-foreground mt-1">{format(d, "HH:mm")}</span>
          </div>
          <div className="flex-1 min-w-0 py-3 pr-3 flex flex-col justify-center gap-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Icon
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  past ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "text-[10px] uppercase tracking-wider font-semibold",
                  past ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                )}
              >
                {t(`events.types.${e.type}`)}
              </span>
              {past && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md border bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300 inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t("events.pastBadge")}
                </span>
              )}
              {isCancelled && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md border bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300 inline-flex items-center gap-1">
                  <Ban className="h-3 w-3" />
                  {t("events.status.cancelled")}
                </span>
              )}

              {e.type === "match" && e.competition_type && (
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md border inline-flex items-center gap-1 max-w-full",
                    e.competition_type === "friendly" &&
                      "bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300",
                    e.competition_type === "championship" &&
                      "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300",
                    e.competition_type === "cup" &&
                      "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
                  )}
                >
                  <span>{t(`events.competitionTypes.${e.competition_type}`)}</span>
                  {e.competition_name && (
                    <>
                      <span className="opacity-50">·</span>
                      <span className="font-semibold normal-case tracking-normal truncate">
                        {e.competition_name}
                      </span>
                    </>
                  )}
                </span>
              )}
              {e.type === "match" && e.is_home !== null && e.is_home !== undefined && (
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md border inline-flex items-center gap-1",
                    e.is_home
                      ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300"
                      : "bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-300",
                  )}
                >
                  {e.is_home ? <Home className="h-3 w-3" /> : <Plane className="h-3 w-3" />}
                  {e.is_home ? t("events.home") : t("events.away")}
                </span>
              )}

              {(() => {
                if (e.type !== "match") return null;
                const myC = myConvocsByEvent?.get(e.id);
                if (!myC) return null;
                const s = myC.status;
                const resp: ConvocationResponse | null =
                  s === "pending" || s === "present" || s === "absent" ? s : null;
                if (!resp) return null;
                return <ConvocationResponseBadge response={resp} />;
              })()}
              {((e as any).convocations_sent || convocSentSet?.has(e.id)) && !isCancelled && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"
                  title={t("events.convocsSentTitle")}
                >
                  <Send className="h-3 w-3" />
                  {t("events.convocationsSentShort")}
                </span>
              )}
              {isCoach && !isCancelled && convocStats?.counts.get(e.id) && (
                <ConvocationSummaryPill counts={convocStats.counts.get(e.id)!} />
              )}
            </div>
            <p
              className={cn(
                "font-medium truncate leading-tight",
                isCancelled && "line-through text-muted-foreground",
              )}
            >
              {(() => {
                if (e.type === "match" && e.opponent && e.team_name)
                  return `${e.team_name} vs ${e.opponent}`;
                if (e.type === "match" && e.opponent && e.title?.toLowerCase().startsWith("vs "))
                  return e.title;
                return (
                  <>
                    {e.title}
                    {e.opponent && (
                      <span className="text-muted-foreground font-normal"> · {e.opponent}</span>
                    )}
                  </>
                );
              })()}
            </p>
            {e.type === "match" &&
              e.result &&
              (() => {
                const ourSide = e.is_home === false ? "away" : "home";
                const ours = ourSide === "home" ? e.result.home_score : e.result.away_score;
                const theirs = ourSide === "home" ? e.result.away_score : e.result.home_score;
                const oc = ours > theirs ? "win" : ours < theirs ? "loss" : "draw";
                return (
                  <p
                    className={cn(
                      "text-xs font-bold tabular-nums inline-flex items-center gap-1.5 mt-0.5 w-fit px-1.5 py-0.5 rounded",
                      oc === "win" && "bg-present/15 text-present",
                      oc === "loss" && "bg-defeat/15 text-defeat",
                      oc === "draw" && "bg-draw/15 text-draw",
                    )}
                  >
                    <Trophy className="h-3 w-3" />
                    {t(`match.${oc}`)} {ours} — {theirs}
                  </p>
                );
              })()}
          </div>
          {(() => {
            const myC = myConvocsByEvent?.get(e.id);
            if (!myC) return null;
            return <ConvocationBand title={`Convoqué · ${myC.playerName}`} />;
          })()}
        </Link>
      </li>
    );
  }

  return (
    <div className="px-5 pt-8 pb-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight">{t("events.title")}</h1>
          {club?.name && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">{club.name}</p>
          )}
        </div>
        {isCoach && user && activeClubId && (
          <EventCreateChooser
            clubId={activeClubId}
            teams={visibleTeams}
            userId={user.id}
            open={open}
            onOpenChange={setOpen}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["events"] });
              qc.invalidateQueries({ queryKey: ["upcoming"] });
            }}
          />
        )}
        {isCoach && user && (
          <Button size="sm" className="h-9" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("events.create")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={view === "list"}
          >
            <List className="h-3.5 w-3.5" />
            {t("events.viewList")}
          </button>
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              view === "calendar"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={view === "calendar"}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {t("events.viewCalendar")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === "list" && (
            <>
              <button
                type="button"
                onClick={() => setHideTrainings((v) => !v)}
                aria-pressed={hideTrainings}
                className={cn(
                  "inline-flex items-center gap-1.5 h-9 rounded-md border px-3 text-xs font-medium transition-colors",
                  hideTrainings
                    ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
                title={t("events.hideTrainings")}
              >
                <Dumbbell className="h-3.5 w-3.5" />
                {t("events.hideTrainings")}
              </button>
              <EventsFilterSheet
                filters={filters}
                onChange={setFilters}
                teams={visibleTeams}
                isCoach={isCoach}
                hasInternalTeam={hasInternalTeam}
                pastCount={pastCount}
              />
            </>
          )}
        </div>
      </div>

      {view === "list" && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("events.searchPlaceholder")}
              className="pl-9"
            />
          </div>
        </div>
      )}

      {isCoach && pendingFollowUps && pendingFollowUps > 0 ? (
        <div className="flex justify-end -mt-3">
          <Link
            to="/follow-ups"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline underline-offset-2"
          >
            <BellRing className="h-3.5 w-3.5" />
            {t("followUps.linkBadge", { count: pendingFollowUps })}
          </Link>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : !visibleEvents || visibleEvents.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title={searchQuery.trim() ? t("events.noSearchResults") : t("events.noEvents")}
          description={
            searchQuery.trim()
              ? t("events.noSearchResultsHint")
              : isCoach
                ? t("events.emptyHintCoach")
                : t("events.emptyHintPlayer")
          }
          action={
            searchQuery.trim() ? (
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => setSearchQuery("")}
              >
                {t("events.clearSearch")}
              </Button>
            ) : isCoach && user ? (
              <Button size="sm" className="h-9" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("events.create")}
              </Button>
            ) : null
          }
        />
      ) : view === "calendar" ? (
        <div className="space-y-5">
          <div className="flex justify-center">
            <CalendarUI
              mode="single"
              selected={selectedDay}
              onSelect={(d) => {
                if (!d) return;
                const day = startOfDay(d);
                setSelectedDay(day);
                const hasEvents = (events ?? []).some((e) => isSameDay(new Date(e.starts_at), day));
                if (hasEvents) setDayDialogOpen(true);
              }}
              locale={dateLocale}
              modifiers={{
                matchDay: matchDates,
                tournamentDay: tournamentDates,
                trainingDay: trainingDates,
                meetingDay: meetingDates,
                otherDay: otherDates,
              }}
              modifiersClassNames={{
                matchDay:
                  "relative font-semibold after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-[3px] after:w-5 after:rounded-full after:bg-red-500 after:shadow-[0_0_8px_rgba(239,68,68,0.6)] data-[selected-single=true]:after:bg-red-500",
                tournamentDay:
                  "relative font-semibold after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-[3px] after:w-5 after:rounded-full after:bg-amber-500 after:shadow-[0_0_8px_rgba(245,158,11,0.6)] data-[selected-single=true]:after:bg-amber-500",
                trainingDay:
                  "relative font-semibold after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-[3px] after:w-5 after:rounded-full after:bg-blue-500 after:shadow-[0_0_8px_rgba(59,130,246,0.6)] data-[selected-single=true]:after:bg-blue-500",
                meetingDay:
                  "relative font-semibold after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-[3px] after:w-5 after:rounded-full after:bg-violet-500 after:shadow-[0_0_8px_rgba(139,92,246,0.6)] data-[selected-single=true]:after:bg-violet-500",
                otherDay:
                  "relative font-semibold after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-[3px] after:w-5 after:rounded-full after:bg-muted-foreground after:shadow-[0_0_8px_rgba(100,116,139,0.5)] data-[selected-single=true]:after:bg-muted-foreground",
              }}
              className="p-3 pointer-events-auto [--cell-size:2.5rem]"
            />
          </div>
          <p className="text-xs text-center text-muted-foreground pt-2">
            {t("events.calendarHint")}
          </p>

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pt-1">
            <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
              <span className="h-[3px] w-3.5 rounded-full bg-red-500 inline-block" />
              {t("events.types.match")}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
              <span className="h-[3px] w-3.5 rounded-full bg-amber-500 inline-block" />
              {t("events.types.tournament")}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
              <span className="h-[3px] w-3.5 rounded-full bg-blue-500 inline-block" />
              {t("events.types.training")}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
              <span className="h-[3px] w-3.5 rounded-full bg-violet-500 inline-block" />
              {t("events.types.meeting")}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
              <span className="h-[3px] w-3.5 rounded-full bg-muted-foreground inline-block" />
              {t("events.types.other")}
            </span>
          </div>

          <Dialog open={dayDialogOpen} onOpenChange={setDayDialogOpen}>
            <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
              <DialogHeader className="px-5 pt-5 pb-3 border-b">
                <DialogTitle className="text-base capitalize">
                  {format(selectedDay, "EEEE d MMMM", { locale: dateLocale })}
                </DialogTitle>
              </DialogHeader>
              <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
                {selectedDayEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    {t("events.noEventsThisDay")}
                  </p>
                ) : (
                  <ul className="space-y-2.5" onClick={() => setDayDialogOpen(false)}>
                    {selectedDayEvents.map(renderEventItem)}
                  </ul>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <div className="space-y-7">
          {grouped.map((group) => (
            <section key={group.key} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground sticky top-0 bg-background/80 backdrop-blur py-1 -mx-5 px-5">
                {group.label}
              </h2>
              <ul className="space-y-2.5">{group.items.map(renderEventItem)}</ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
