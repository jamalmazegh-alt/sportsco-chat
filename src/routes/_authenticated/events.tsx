import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, isPast, isToday } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Plus, Users, Trophy, Dumbbell } from "lucide-react";
import { EventFormSheet } from "@/components/event-form-sheet";
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
  const dateLocale = i18n.language?.startsWith("fr") ? fr : enUS;

  const { data: teams } = useQuery({
    queryKey: ["teams", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, competitions")
        .eq("club_id", activeClubId!)
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
        .select("id, title, starts_at, location, type, status, team_id, opponent, competition_type, competition_name")
        .in("team_id", teamIds)
        .order("starts_at", { ascending: true });
      return (data ?? []).map((e) => ({
        ...e,
        team_name: teams!.find((t) => t.id === e.team_id)?.name ?? "",
      }));
    },
  });

  const visibleEvents = useMemo(() => {
    if (!events) return [] as typeof events;
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

  return (
    <div className="px-5 pt-8 pb-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("events.title")}</h1>
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

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : !events || events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Calendar className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{t("events.noEvents")}</p>
        </div>
      ) : (
        <div className="space-y-7">
          {grouped.map((group) => (
            <section key={group.key} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground sticky top-0 bg-background/80 backdrop-blur py-1 -mx-5 px-5">
                {group.label}
              </h2>
              <ul className="space-y-2.5">
                {group.items.map((e) => {
                  const Icon = TYPE_ICONS[e.type] ?? Calendar;
                  const d = new Date(e.starts_at);
                  const past = isPast(d) && !isToday(d);
                  return (
                    <li key={e.id}>
                      <Link
                        to="/events/$eventId"
                        params={{ eventId: e.id }}
                        className={cn(
                          "flex items-stretch gap-3 rounded-2xl border bg-card overflow-hidden active:scale-[0.99] transition-transform",
                          past ? "border-border/60 opacity-70" : "border-border hover:border-primary/40",
                        )}
                      >
                        {/* Date block */}
                        <div className={cn(
                          "flex flex-col items-center justify-center w-16 shrink-0 py-3",
                          past ? "bg-muted/40" : "bg-primary/8",
                        )}>
                          <span className={cn(
                            "text-[10px] font-semibold uppercase tracking-wider",
                            past ? "text-muted-foreground" : "text-primary",
                          )}>
                            {format(d, "EEE", { locale: dateLocale })}
                          </span>
                          <span className="text-2xl font-bold leading-none mt-0.5">
                            {format(d, "d")}
                          </span>
                          <span className="text-[10px] text-muted-foreground mt-1">
                            {format(d, "HH:mm")}
                          </span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 py-3 pr-3 flex flex-col justify-center gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                              {t(`events.types.${e.type}`)}
                            </span>
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
                            {e.team_name && (
                              <span className="text-[10px] text-muted-foreground truncate">
                                · {e.team_name}
                              </span>
                            )}
                          </div>
                          <p className="font-medium truncate leading-tight">
                            {e.title}
                            {e.opponent && (
                              <span className="text-muted-foreground font-normal"> · {e.opponent}</span>
                            )}
                          </p>
                          {e.location && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{e.location}</span>
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
