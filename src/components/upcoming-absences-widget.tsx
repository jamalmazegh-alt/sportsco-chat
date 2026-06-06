import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Palmtree, Plus, CheckCircle2, ChevronRight, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DeclareAbsenceDrawer } from "@/components/declare-absence-drawer";
import { UnavailableBadge, type UnavailableReason } from "@/components/unavailable-badge";
import { cn } from "@/lib/utils";

interface Props {
  clubId: string;
  className?: string;
}

type Row = {
  id: string;
  player_id: string;
  start_date: string;
  end_date: string;
  reason: UnavailableReason;
  player: { id: string; first_name: string; last_name: string } | null;
};

function formatRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };
  const s = new Date(start).toLocaleDateString(undefined, opts);
  const e = new Date(end).toLocaleDateString(undefined, opts);
  return s === e ? s : `${s} → ${e}`;
}

export function UpcomingAbsencesWidget({ clubId, className }: Props) {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const in14days = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["upcoming-absences", clubId, today],
    enabled: !!clubId,
    queryFn: async (): Promise<Row[]> => {
      // Players of the club (via team_members → teams)
      const { data: tm } = await supabase
        .from("team_members")
        .select("player_id, teams:team_id(club_id, deleted_at)")
        .eq("role", "player");
      const playerIds = Array.from(
        new Set(
          (tm ?? [])
            .filter((r: any) => r.teams && r.teams.club_id === clubId && !r.teams.deleted_at)
            .map((r: any) => r.player_id),
        ),
      );
      if (playerIds.length === 0) return [];
      const { data } = await supabase
        .from("player_availabilities")
        .select("id, player_id, start_date, end_date, reason, players:player_id(id, first_name, last_name)")
        .in("player_id", playerIds)
        .eq("status", "active")
        .gte("end_date", today)
        .order("start_date", { ascending: true });
      return (data ?? []).map((r: any) => ({
        id: r.id,
        player_id: r.player_id,
        start_date: r.start_date,
        end_date: r.end_date,
        reason: r.reason,
        player: r.players,
      }));
    },
    staleTime: 30_000,
  });

  const total = rows.length;
  const top = rows.slice(0, 4);
  const upcoming14 = rows.filter((r) => r.start_date <= in14days && r.end_date >= today);
  const reducedSquad = upcoming14.length >= 3;

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center",
              total > 0 ? "bg-sky-500/10 text-sky-600" : "bg-emerald-500/10 text-emerald-600",
            )}
          >
            {total > 0 ? <Palmtree className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </div>
          <h2 className="text-sm font-semibold">
            {isLoading
              ? t("availability.upcomingWidget", { defaultValue: "Absences à venir" })
              : total > 0
                ? t("availability.upcomingWidget", { defaultValue: "Absences à venir" })
                : t("availability.noneUpcoming", { defaultValue: "Aucune absence à venir" })}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="text-xs text-primary font-medium inline-flex items-center gap-0.5"
        >
          {t("availability.declare", { defaultValue: "Déclarer" })}
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {reducedSquad && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t("availability.reducedSquad", {
            n: upcoming14.length,
            defaultValue: `⚠️ ${upcoming14.length} joueurs indisponibles dans les 14 prochains jours`,
          })}
        </div>
      )}

      {total > 0 && (
        <ul className="mt-3 space-y-1.5">
          {top.map((r) => {
            const name = r.player
              ? `${r.player.first_name} ${r.player.last_name.charAt(0)}.`
              : "—";
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              >
                <Link
                  to="/players/$playerId"
                  params={{ playerId: r.player_id }}
                  className="min-w-0 flex-1"
                >
                  <p className="font-medium truncate">{name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {formatRange(r.start_date, r.end_date)}
                  </p>
                </Link>
                <UnavailableBadge reason={r.reason} />
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("availability.declare", { defaultValue: "Déclarer une absence" })}
        </Button>
      </div>

      <DeclareAbsenceDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </section>
  );
}
