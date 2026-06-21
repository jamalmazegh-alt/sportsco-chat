import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Palmtree, Plus, CheckCircle2, ChevronRight, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles } from "@/lib/auth-context";
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
  const roles = useMyRoles();
  const canDeclare = roles.includes("player") || roles.includes("parent");

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

  const noAbsences = total === 0 && !isLoading;
  const headerBg = noAbsences
    ? "linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%)"
    : "linear-gradient(135deg, #92400e 0%, #f59e0b 100%)";
  const headerTextClass = noAbsences ? "text-[#0f2818]" : "text-white";
  const headerSubTextClass = noAbsences ? "text-[#64748b]" : "text-white/85";
  const iconTileClass = noAbsences
    ? "bg-white ring-1 ring-[#e2e8f0]"
    : "bg-white/20 backdrop-blur-sm ring-1 ring-white/30";
  const iconColorClass = noAbsences ? "text-[#2d9d5f]" : "text-white";
  const patternColor = noAbsences ? "#0f2818" : "#fff";
  const declareBtnClass = noAbsences
    ? "text-[#0f4a26] bg-white ring-1 ring-[#e2e8f0] hover:bg-[#f0f9f3]"
    : "text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm ring-1 ring-white/30";

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[16px] border-[1.5px] border-[#e2e8f0] bg-white shadow-[0_1px_2px_rgba(15,40,24,0.04)]",
        className,
      )}
    >
      {/* Header gradient */}
      <div className="relative overflow-hidden p-4" style={{ background: headerBg }}>
        <svg
          aria-hidden
          className="absolute inset-0 h-full w-full opacity-[0.12] pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="abs-pat" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="30" stroke={patternColor} strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#abs-pat)" />
        </svg>
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("h-10 w-10 rounded-[12px] flex items-center justify-center shrink-0", iconTileClass)}>
              {noAbsences ? (
                <CheckCircle2 className={cn("h-5 w-5", iconColorClass)} strokeWidth={2.4} />
              ) : (
                <Palmtree className={cn("h-5 w-5", iconColorClass)} strokeWidth={2.4} />
              )}
            </div>
            <div className="min-w-0">
              <h2 className={cn("text-[15px] font-black leading-tight truncate", headerTextClass)}>
                {noAbsences
                  ? t("availability.noneUpcoming", { defaultValue: "Aucune absence à venir" })
                  : t("availability.upcomingWidget", { defaultValue: "Absences à venir" })}
              </h2>
              {!noAbsences && (
                <p className={cn("text-[11px] font-bold uppercase tracking-[0.1em] mt-0.5", headerSubTextClass)}>
                  {total} {total > 1 ? "joueurs" : "joueur"}
                </p>
              )}
            </div>
          </div>
          {canDeclare && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className={cn(
                "shrink-0 text-[11px] font-bold inline-flex items-center gap-0.5 px-2.5 py-1.5 rounded-full transition-all",
                declareBtnClass,
              )}
            >
              {t("availability.declare", { defaultValue: "Déclarer" })}
              <ChevronRight className="h-3 w-3" strokeWidth={2.6} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {(reducedSquad || total > 0 || canDeclare) && (
        <div className="p-3 space-y-2.5">
          {reducedSquad && (
            <div className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-[#fcd34d] bg-[#fffbeb] px-3 py-2 text-[11px] font-semibold text-[#92400e]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
              {t("availability.reducedSquad", {
                n: upcoming14.length,
                defaultValue: `⚠️ ${upcoming14.length} joueurs indisponibles dans les 14 prochains jours`,
              })}
            </div>
          )}

          {total > 0 && (
            <ul className="space-y-1.5">
              {top.map((r) => {
                const name = r.player
                  ? `${r.player.first_name} ${r.player.last_name.charAt(0)}.`
                  : "—";
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-[10px] border-[1.5px] border-[#e2e8f0] bg-white px-3 py-2 text-sm hover:border-[#cbd5e1] transition-colors"
                  >
                    <Link
                      to="/players/$playerId"
                      params={{ playerId: r.player_id }}
                      className="min-w-0 flex-1"
                    >
                      <p className="font-bold text-[13px] text-[#0f2818] truncate">{name}</p>
                      <p className="text-[11px] text-[#64748b] font-medium truncate">
                        {formatRange(r.start_date, r.end_date)}
                      </p>
                    </Link>
                    <UnavailableBadge reason={r.reason} />
                  </li>
                );
              })}
            </ul>
          )}

          {canDeclare && (
            <Button
              size="sm"
              variant="outline"
              className="w-full border-[1.5px] border-[#e2e8f0] hover:border-[#2d9d5f] hover:bg-[#f0f9f3] hover:text-[#0f4a26] font-bold rounded-[10px]"
              onClick={() => setDrawerOpen(true)}
            >
              <Plus className="h-4 w-4" strokeWidth={2.4} />
              {t("availability.declare", { defaultValue: "Déclarer une absence" })}
            </Button>
          )}
        </div>
      )}

      {canDeclare && <DeclareAbsenceDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />}
    </section>
  );
}
