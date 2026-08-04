import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarX2, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnavailableBadge, type UnavailableReason } from "@/components/unavailable-badge";

type Player = { id: string; first_name: string | null; last_name: string | null };

interface Props {
  teamId: string;
  players: Player[];
}

type Row = {
  id: string;
  player_id: string;
  start_date: string;
  end_date: string;
  reason: UnavailableReason;
};

function formatRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };
  const s = new Date(start).toLocaleDateString(undefined, opts);
  const e = new Date(end).toLocaleDateString(undefined, opts);
  return s === e ? s : `${s} → ${e}`;
}

function daysBetween(start: string, end: string) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
}

export function TeamAbsencesTable({ teamId, players }: Props) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["team-upcoming-absences", teamId, today],
    enabled: !!teamId && players.length > 0,
    queryFn: async (): Promise<Row[]> => {
      const ids = players.map((p) => p.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("player_availabilities")
        .select("id, player_id, start_date, end_date, reason")
        .in("player_id", ids)
        .eq("status", "active")
        .gte("end_date", today)
        .order("start_date", { ascending: true });
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

  const playersWithAbsences = useMemo(() => {
    return players
      .filter((p) => byPlayer.has(p.id))
      .sort((a, b) => (a.last_name ?? "").localeCompare(b.last_name ?? ""));
  }, [players, byPlayer]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <CalendarX2 className="h-4 w-4" />
          {t("availability.teamTable.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && (
          <div className="p-4 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
        )}
        {!isLoading && playersWithAbsences.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t("availability.teamTable.empty")}
          </div>
        )}
        {playersWithAbsences.length > 0 && (
          <div className="divide-y">
            {playersWithAbsences.map((p) => {
              const list = byPlayer.get(p.id)!;
              const totalDays = list.reduce(
                (acc, r) => acc + daysBetween(r.start_date, r.end_date),
                0,
              );
              return (
                <Link
                  key={p.id}
                  to="/players/$playerId"
                  params={{ playerId: p.id }}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {p.first_name} {p.last_name}
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {t("availability.teamTable.days", {
                          count: totalDays,
                          defaultValue: `${totalDays} j`,
                        })}
                      </span>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {list.map((r) => (
                        <li key={r.id} className="flex items-center gap-2 text-xs">
                          <UnavailableBadge reason={r.reason} />
                          <span className="text-muted-foreground">
                            {formatRange(r.start_date, r.end_date)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
