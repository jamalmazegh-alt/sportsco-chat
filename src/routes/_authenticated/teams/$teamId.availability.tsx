import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnavailableBadge, type UnavailableReason } from "@/components/unavailable-badge";
import { DeclareAbsenceDrawer } from "@/components/declare-absence-drawer";
import { StaffAvailabilityForTeamMonth } from "@/components/staff-availability";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="p-6 space-y-3">
      <p className="text-sm text-destructive">{String(error?.message ?? error)}</p>
      <Button
        onClick={() => {
          reset();
          router.invalidate();
        }}
        size="sm"
      >
        Réessayer
      </Button>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/teams/$teamId/availability")({
  component: TeamAvailabilityCalendar,
  head: () => ({
    meta: [
      { title: "Calendrier des absences — Clubero" },
      {
        name: "description",
        content: "Suivi mensuel des absences joueurs et staff d’une équipe dans Clubero.",
      },
      { property: "og:title", content: "Calendrier des absences — Clubero" },
      {
        property: "og:description",
        content: "Suivi mensuel des absences joueurs et staff d’une équipe dans Clubero.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ErrorBoundary,

  notFoundComponent: TeamNotFound,
});

function TeamNotFound() {
  const { t } = useTranslation();
  return <div className="p-6 text-sm">{t("teams.notFound")}</div>;
}

type Player = { id: string; first_name: string | null; last_name: string | null };
type Row = {
  id: string;
  player_id: string;
  start_date: string;
  end_date: string;
  reason: UnavailableReason;
  comment: string | null;
};

const REASON_BG: Record<UnavailableReason, string> = {
  suspension: "bg-destructive/70",
  injury: "bg-amber-500/70",
  vacation: "bg-sky-500/70",
  school: "bg-indigo-500/70",
  family: "bg-rose-500/70",
  work: "bg-slate-500/70",
  other: "bg-muted-foreground/50",
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function TeamAvailabilityCalendar() {
  const { teamId } = Route.useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [absencePlayerId, setAbsencePlayerId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const monthStart = cursor;
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const days = useMemo(
    () =>
      Array.from(
        { length: daysInMonth },
        (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1),
      ),
    [cursor, daysInMonth],
  );
  const monthStartStr = ymd(monthStart);
  const monthEndStr = ymd(monthEnd);

  const { data: team } = useQuery({
    queryKey: ["team-basic", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, club_id")
        .eq("id", teamId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: players = [] } = useQuery({
    queryKey: ["team-players-basic", teamId],
    queryFn: async (): Promise<Player[]> => {
      const { data, error } = await supabase
        .from("team_members")
        .select("player:players!inner(id, first_name, last_name, deleted_at)")
        .eq("team_id", teamId);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => r.player)
        .filter((p: any) => p && !p.deleted_at)
        .map((p: any) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name }))
        .sort((a, b) => (a.last_name ?? "").localeCompare(b.last_name ?? ""));
    },
  });

  const playerIds = players.map((p) => p.id);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["team-availability-month", teamId, monthStartStr, monthEndStr, playerIds.length],
    enabled: playerIds.length > 0,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("player_availabilities")
        .select("id, player_id, start_date, end_date, reason, comment")
        .in("player_id", playerIds)
        .eq("status", "active")
        .lte("start_date", monthEndStr)
        .gte("end_date", monthStartStr);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 30_000,
  });

  const byPlayer = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = m.get(r.player_id) ?? [];
      arr.push(r);
      m.set(r.player_id, arr);
    }
    return m;
  }, [rows]);

  const monthLabel = cursor.toLocaleDateString(i18n.language, { month: "long", year: "numeric" });
  const todayStr = ymd(new Date());

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/teams/$teamId" params={{ teamId }}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t("common.back", { defaultValue: "Retour" })}
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {t("availability.calendar.title", { defaultValue: "Calendrier des absences" })}
          </h1>
          {team?.name && <p className="text-sm text-muted-foreground">{team.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            aria-label={t("availability.calendar.prevMonth")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[140px] text-center text-sm font-medium capitalize">
            {monthLabel}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            aria-label={t("availability.calendar.nextMonth")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const d = new Date();
              setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
          >
            {t("common.today", { defaultValue: "Aujourd'hui" })}
          </Button>
          <Button
            size="sm"
            className="ml-2"
            disabled={players.length === 0}
            onClick={() => {
              setAbsencePlayerId("");
              setPickerOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("availability.declare", { defaultValue: "Déclarer une absence" })}
          </Button>
        </div>
      </div>

      {/* Player picker → drawer */}
      {pickerOpen && (
        <Card className="border-primary/40">
          <CardContent className="p-3 flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium">
                {t("availability.calendar.pickPlayer", { defaultValue: "Joueur concerné" })}
              </label>
              <Select value={absencePlayerId} onValueChange={setAbsencePlayerId}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {players.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.first_name} {p.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={!absencePlayerId}
              onClick={() => {
                setPickerOpen(false);
                setAbsenceOpen(true);
              }}
            >
              {t("common.continue", { defaultValue: "Continuer" })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPickerOpen(false)}>
              {t("common.cancel", { defaultValue: "Annuler" })}
            </Button>
          </CardContent>
        </Card>
      )}

      {absencePlayerId && (
        <DeclareAbsenceDrawer
          open={absenceOpen}
          onOpenChange={setAbsenceOpen}
          playerId={absencePlayerId}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["team-availability-month", teamId] });
          }}
        />
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            {players.length} {t("teams.players", { defaultValue: "joueurs" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {players.length === 0 ? (
            <div className="p-6 text-sm text-center text-muted-foreground">
              {t("availability.calendar.noPlayers", {
                defaultValue: "Aucun joueur dans cette équipe.",
              })}
            </div>
          ) : (
            <div className="min-w-max">
              {/* Header row */}
              <div
                className="grid border-b bg-muted/30 sticky top-0 z-10"
                style={{ gridTemplateColumns: `180px repeat(${daysInMonth}, 28px)` }}
              >
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-r">
                  {t("teams.player", { defaultValue: "Joueur" })}
                </div>
                {days.map((d) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = ymd(d) === todayStr;
                  return (
                    <div
                      key={d.getDate()}
                      className={cn(
                        "text-center text-[10px] py-1 border-r border-border/50",
                        isWeekend && "bg-muted/50",
                        isToday && "bg-primary/10 text-primary font-semibold",
                      )}
                    >
                      <div className="font-medium">{d.getDate()}</div>
                      <div className="text-muted-foreground uppercase">
                        {d.toLocaleDateString(i18n.language, { weekday: "narrow" })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Player rows */}
              {players.map((p) => {
                const list = byPlayer.get(p.id) ?? [];
                return (
                  <div
                    key={p.id}
                    className="grid border-b hover:bg-muted/20 relative"
                    style={{
                      gridTemplateColumns: `180px repeat(${daysInMonth}, 28px)`,
                      minHeight: 40,
                    }}
                  >
                    <Link
                      to="/players/$playerId/availability"
                      params={{ playerId: p.id }}
                      className="px-3 py-2 text-xs truncate border-r flex items-center hover:text-primary"
                      title={`${p.first_name ?? ""} ${p.last_name ?? ""}`}
                    >
                      <span className="truncate">
                        {p.first_name} {p.last_name}
                      </span>
                    </Link>
                    {days.map((d) => {
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const isToday = ymd(d) === todayStr;
                      return (
                        <div
                          key={d.getDate()}
                          className={cn(
                            "border-r border-border/30",
                            isWeekend && "bg-muted/30",
                            isToday && "bg-primary/5",
                          )}
                        />
                      );
                    })}
                    {/* Absence bars */}
                    {list.map((r) => {
                      const s = new Date(r.start_date);
                      const e = new Date(r.end_date);
                      const startDay = Math.max(
                        1,
                        s.getMonth() === cursor.getMonth() &&
                          s.getFullYear() === cursor.getFullYear()
                          ? s.getDate()
                          : 1,
                      );
                      const endDay = Math.min(
                        daysInMonth,
                        e.getMonth() === cursor.getMonth() &&
                          e.getFullYear() === cursor.getFullYear()
                          ? e.getDate()
                          : daysInMonth,
                      );
                      const left = 180 + (startDay - 1) * 28 + 2;
                      const width = (endDay - startDay + 1) * 28 - 4;
                      return (
                        <Link
                          key={r.id}
                          to="/players/$playerId/availability"
                          params={{ playerId: p.id }}
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 h-6 rounded flex items-center px-2 text-[10px] text-white font-medium truncate shadow-sm hover:ring-2 hover:ring-primary/50 transition",
                            REASON_BG[r.reason],
                          )}
                          style={{ left, width }}
                          title={`${t(`availability.reason.${r.reason}`, { defaultValue: r.reason })} · ${r.start_date} → ${r.end_date}${r.comment ? ` · ${r.comment}` : ""}`}
                        >
                          {t(`availability.reason.${r.reason}`, { defaultValue: r.reason })}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {team?.club_id && (
        <StaffAvailabilityForTeamMonth
          teamId={teamId}
          clubId={team.club_id}
          cursor={cursor}
          days={days}
        />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <span className="text-muted-foreground mr-2">
          {t("availability.calendar.legend", { defaultValue: "Légende" })} :
        </span>
        {(
          [
            "vacation",
            "injury",
            "school",
            "family",
            "work",
            "suspension",
            "other",
          ] as UnavailableReason[]
        ).map((r) => (
          <UnavailableBadge key={r} reason={r} />
        ))}
      </div>

      {isLoading && (
        <div className="text-center text-sm text-muted-foreground">
          {t("common.loading", { defaultValue: "Chargement..." })}
        </div>
      )}
    </div>
  );
}
