import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, isPast, isToday, isSameDay, startOfDay } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Plus, Users, Trophy, Dumbbell, BellRing, Home, Plane, List, CalendarDays, Ban } from "lucide-react";
import { EventFormSheet } from "@/components/event-form-sheet";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/events")({
  component: EventsRoute,
  head: () => ({ meta: [{ title: "Events — Clubero" }] }),
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
  const isCoach = role === "admin" || role === "coach";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedDay, setSelectedDay] = useState<Date>(() => startOfDay(new Date()));
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
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

  const { data: events, isLoading } = useQuery({
    queryKey: ["events", activeClubId],
    enabled: !!activeClubId && !!teams,
    queryFn: async () => {
      const teamIds = (teams ?? []).map((t) => t.id);
      if (teamIds.length === 0) return [];
      const { data } = await supabase
        .from("events")
        .select("id, title, starts_at, location, type, status, team_id, opponent, competition_type, competition_name, is_home")
        .in("team_id", teamIds)
        .is("deleted_at", null)
        .order("starts_at", { ascending: true });
      const list = data ?? [];
      const matchIds = list.filter((e) => e.type === "match").map((e) => e.id);
      let resultsById = new Map<string, { home_score: number; away_score: number }>();
      if (matchIds.length > 0) {
        const { data: results } = await supabase
          .from("match_results")
          .select("event_id, home_score, away_score")
          .in("event_id", matchIds);
        resultsById = new Map(
          (results ?? []).map((r: any) => [r.event_id, { home_score: r.home_score, away_score: r.away_score }])
        );
      }
      return list.map((e) => ({
        ...e,
        team_name: teams!.find((t) => t.id === e.team_id)?.name ?? "",
        result: resultsById.get(e.id) ?? null,
      }));
    },
  });

  const visibleEvents = useMemo(() => {
    if (!events) return [];
    if (showPast) return events;
    return events.filter((e) => {
      const d = new Date(e.starts_at);
      return !(isPast(d) && !isToday(d));
    });
  }, [events, showPast]);

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

  const typePriority: Record<string, number> = { match: 0, tournament: 1, training: 2, meeting: 3, other: 4 };

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
    eventTypesByDate.forEach((type, ts) => { if (type === "match") arr.push(new Date(ts)); });
    return arr;
  }, [eventTypesByDate]);
  const tournamentDates = useMemo(() => {
    const arr: Date[] = [];
    eventTypesByDate.forEach((type, ts) => { if (type === "tournament") arr.push(new Date(ts)); });
    return arr;
  }, [eventTypesByDate]);
  const trainingDates = useMemo(() => {
    const arr: Date[] = [];
    eventTypesByDate.forEach((type, ts) => { if (type === "training") arr.push(new Date(ts)); });
    return arr;
  }, [eventTypesByDate]);
  const meetingDates = useMemo(() => {
    const arr: Date[] = [];
    eventTypesByDate.forEach((type, ts) => { if (type === "meeting") arr.push(new Date(ts)); });
    return arr;
  }, [eventTypesByDate]);
  const otherDates = useMemo(() => {
    const arr: Date[] = [];
    eventTypesByDate.forEach((type, ts) => { if (type === "other") arr.push(new Date(ts)); });
    return arr;
  }, [eventTypesByDate]);

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
                  ? "border-border/60 opacity-70"
                  : "border-border hover:border-primary/40",
          )}
        >
          <div className={cn(
            "flex flex-col items-center justify-center w-16 shrink-0 py-3",
            isCancelled ? "bg-red-100/40" : isLoss ? "bg-defeat/15" : past ? "bg-muted/40" : "bg-primary/8",
          )}>
            <span className={cn(
              "text-[10px] font-semibold uppercase tracking-wider",
              isCancelled ? "text-red-600" : past ? "text-muted-foreground" : "text-primary",
            )}>
              {format(d, "EEE", { locale: dateLocale })}
            </span>
            <span className="text-2xl font-bold leading-none mt-0.5">{format(d, "d")}</span>
            <span className="text-[10px] text-muted-foreground mt-1">{format(d, "HH:mm")}</span>
          </div>
          <div className="flex-1 min-w-0 py-3 pr-3 flex flex-col justify-center gap-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t(`events.types.${e.type}`)}
              </span>
              {isCancelled && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md border bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300 inline-flex items-center gap-1">
                  <Ban className="h-3 w-3" />
                  {t("events.status.cancelled")}
                </span>
              )}
              {e.type === "match" && e.competition_type && (
                <span className={cn(
                  "text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md border",
                  e.competition_type === "friendly" && "bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300",
                  e.competition_type === "championship" && "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300",
                  e.competition_type === "cup" && "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
                )}>
                  {t(`events.competitionTypes.${e.competition_type}`)}
                </span>
              )}
              {e.type === "match" && e.is_home !== null && e.is_home !== undefined && (
                <span className={cn(
                  "text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md border inline-flex items-center gap-1",
                  e.is_home
                    ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300"
                    : "bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-300"
                )}>
                  {e.is_home ? <Home className="h-3 w-3" /> : <Plane className="h-3 w-3" />}
                  {e.is_home ? t("events.home") : t("events.away")}
                </span>
              )}
              {e.type === "match" && e.competition_name && (
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground truncate">
                  · {e.competition_name}
                </span>
              )}
            </div>
            <p className={cn("font-medium truncate leading-tight", isCancelled && "line-through text-muted-foreground")}>
              {(() => {
                if (e.type === "match" && e.opponent && e.team_name) return `${e.team_name} vs ${e.opponent}`;
                if (e.type === "match" && e.opponent && e.title?.toLowerCase().startsWith("vs ")) return e.title;
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
            {e.type === "match" && e.result && (() => {
              const ourSide = e.is_home === false ? "away" : "home";
              const ours = ourSide === "home" ? e.result.home_score : e.result.away_score;
              const theirs = ourSide === "home" ? e.result.away_score : e.result.home_score;
              const oc = ours > theirs ? "win" : ours < theirs ? "loss" : "draw";
              return (
                <p className={cn(
                  "text-xs font-bold tabular-nums inline-flex items-center gap-1.5 mt-0.5 w-fit px-1.5 py-0.5 rounded",
                  oc === "win" && "bg-present/15 text-present",
                  oc === "loss" && "bg-defeat/15 text-defeat",
                  oc === "draw" && "bg-draw/15 text-draw",
                )}>
                  <Trophy className="h-3 w-3" />
                  {t(`match.${oc}`)} {ours} — {theirs}
                </p>
              );
            })()}
          </div>
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
        {isCoach && user && (
          <EventFormSheet
            open={open}
            onOpenChange={setOpen}
            mode="create"
            teams={teams ?? []}
            userId={user.id}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["events"] });
              qc.invalidateQueries({ queryKey: ["upcoming"] });
            }}
            trigger={
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4" />
                {t("events.create")}
              </Button>
            }
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={view === "list"}
          >
            <List className="h-3.5 w-3.5" />
            {t("events.viewList", { defaultValue: "Liste" })}
          </button>
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              view === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={view === "calendar"}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {t("events.viewCalendar", { defaultValue: "Calendrier" })}
          </button>
        </div>
        {view === "list" && pastCount > 0 && (
          <button
            type="button"
            onClick={() => setShowPast((s) => !s)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            {showPast ? t("events.hidePast") : t("events.showPast", { count: pastCount })}
          </button>
        )}
      </div>

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
          title={t("events.noEvents")}
          description={
            isCoach
              ? t("events.emptyHintCoach", {
                  defaultValue: "Crée ton premier entraînement ou match — les joueurs seront convoqués automatiquement.",
                })
              : t("events.emptyHintPlayer", {
                  defaultValue: "Aucun événement prévu pour le moment. Tu seras notifié dès qu'un coach en programme un.",
                })
          }
          action={
            isCoach && user ? (
              <EventFormSheet
                open={open}
                onOpenChange={setOpen}
                mode="create"
                teams={teams ?? []}
                userId={user.id}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["events"] });
                  qc.invalidateQueries({ queryKey: ["upcoming"] });
                }}
                trigger={
                  <Button size="sm" className="h-9">
                    <Plus className="h-4 w-4" />
                    {t("events.create")}
                  </Button>
                }
              />
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
            {t("events.calendarHint", { defaultValue: "Touche un jour avec une pastille pour voir les événements." })}
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
                    {t("events.noEventsThisDay", { defaultValue: "Aucun événement ce jour." })}
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
