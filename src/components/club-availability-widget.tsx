import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Users,
  ShieldAlert,
  Palmtree,
  HeartPulse,
  CheckCircle2,
  Plus,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { QuickSanctionDrawer } from "@/components/quick-sanction-drawer";
import { DeclareAbsenceDrawer } from "@/components/declare-absence-drawer";
import { UnavailableBadge, type UnavailableReason } from "@/components/unavailable-badge";
import { cn } from "@/lib/utils";

interface Props {
  clubId: string;
  className?: string;
}

type SuspensionItem = {
  kind: "suspension";
  id: string;
  player_id: string;
  name: string;
  remaining: number;
  sortKey: number; // remaining matches
};

type AbsenceItem = {
  kind: "absence";
  id: string;
  player_id: string;
  name: string;
  reason: UnavailableReason;
  start_date: string;
  end_date: string;
  sortKey: number; // start_date as time
};

type Item = SuspensionItem | AbsenceItem;

function shortName(first?: string | null, last?: string | null) {
  const f = first ?? "";
  const l = last ? `${last.charAt(0)}.` : "";
  return `${f} ${l}`.trim() || "—";
}

function formatUntil(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
  });
}

export function ClubAvailabilityWidget({ clubId, className }: Props) {
  const { t } = useTranslation();
  const [sanctionOpen, setSanctionOpen] = useState(false);
  const [absenceOpen, setAbsenceOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const in14days = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  // 1) Active suspensions for this club
  const { data: suspensions = [] } = useQuery({
    queryKey: ["club-avail-suspensions", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_suspensions")
        .select(
          "id, player_id, matches_to_serve, matches_served, status, players:player_id(id, first_name, last_name)",
        )
        .eq("club_id", clubId)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => ({
          id: r.id,
          player_id: r.player_id,
          remaining: Math.max(0, (r.matches_to_serve ?? 0) - (r.matches_served ?? 0)),
          first_name: r.players?.first_name as string | null,
          last_name: r.players?.last_name as string | null,
        }))
        .filter((r) => r.remaining > 0)
        .sort((a, b) => a.remaining - b.remaining);
    },
    staleTime: 30_000,
  });

  // 2) Active absences overlapping [today, today+14]
  const { data: absences = [] } = useQuery({
    queryKey: ["club-avail-absences", clubId, today],
    enabled: !!clubId,
    queryFn: async () => {
      const { data: tm } = await supabase
        .from("team_members")
        .select("player_id, teams:team_id(club_id, deleted_at)")
        .eq("role", "player");
      const playerIds = Array.from(
        new Set(
          (tm ?? [])
            .filter((r: any) => r.teams && r.teams.club_id === clubId && !r.teams.deleted_at)
            .map((r: any) => r.player_id as string),
        ),
      );
      if (playerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("player_availabilities")
        .select(
          "id, player_id, start_date, end_date, reason, players:player_id(id, first_name, last_name)",
        )
        .in("player_id", playerIds)
        .eq("status", "active")
        .lte("start_date", in14days)
        .gte("end_date", today)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        player_id: r.player_id,
        start_date: r.start_date as string,
        end_date: r.end_date as string,
        reason: r.reason as UnavailableReason,
        first_name: r.players?.first_name as string | null,
        last_name: r.players?.last_name as string | null,
      }));
    },
    staleTime: 30_000,
  });

  const suspendedCount = suspensions.length;
  const injuredCount = absences.filter((a) => a.reason === "injury").length;
  const absentCount = absences.length - injuredCount;
  const total = suspendedCount + absences.length;

  const items: Item[] = useMemo(() => {
    const list: Item[] = [];
    suspensions.forEach((s) =>
      list.push({
        kind: "suspension",
        id: `s-${s.id}`,
        player_id: s.player_id,
        name: shortName(s.first_name, s.last_name),
        remaining: s.remaining,
        sortKey: s.remaining,
      }),
    );
    absences.forEach((a) =>
      list.push({
        kind: "absence",
        id: `a-${a.id}`,
        player_id: a.player_id,
        name: shortName(a.first_name, a.last_name),
        reason: a.reason,
        start_date: a.start_date,
        end_date: a.end_date,
        sortKey: new Date(a.start_date).getTime() / 86_400_000,
      }),
    );
    // Urgent first: suspensions (matches asc) before absences (start asc)
    return list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "suspension" ? -1 : 1;
      return a.sortKey - b.sortKey;
    });
  }, [suspensions, absences]);

  const top = items.slice(0, 5);
  const extra = Math.max(0, items.length - top.length);

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
              total > 0
                ? "bg-primary/10 text-primary"
                : "bg-emerald-500/10 text-emerald-600",
            )}
          >
            {total > 0 ? <Users className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </div>
          <h2 className="text-sm font-semibold truncate">
            {t("widget.availability.title", { defaultValue: "Disponibilité du club" })}
          </h2>
        </div>
      </div>

      {total === 0 ? (
        <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
          {t("widget.availability.allAvailable", {
            defaultValue: "✅ Tous les joueurs sont disponibles",
          })}
        </p>
      ) : (
        <>
          {/* Counters */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            {suspendedCount > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-destructive">
                <ShieldAlert className="h-3.5 w-3.5" />
                {t("widget.availability.suspended", {
                  defaultValue: "{{n}} suspendu(s)",
                  n: suspendedCount,
                })}
              </span>
            )}
            {absentCount > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-sky-700 dark:text-sky-400">
                <Palmtree className="h-3.5 w-3.5" />
                {t("widget.availability.absent", {
                  defaultValue: "{{n}} absent(s)",
                  n: absentCount,
                })}
              </span>
            )}
            {injuredCount > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                <HeartPulse className="h-3.5 w-3.5" />
                {t("widget.availability.injured", {
                  defaultValue: "{{n}} blessé(s)",
                  n: injuredCount,
                })}
              </span>
            )}
          </div>

          <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("widget.availability.total", {
              defaultValue: "Total indisponibles : {{n}}",
              n: total,
            })}
          </p>

          {absences.length >= 3 && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {t("availability.reducedSquad", {
                  n: absences.length,
                  defaultValue: `⚠️ ${absences.length} joueurs indisponibles dans les 14 prochains jours`,
                })}
              </span>
            </div>
          )}

          <ul className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
            {top.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              >
                <Link
                  to="/players/$playerId"
                  params={{ playerId: it.player_id }}
                  className="min-w-0 flex-1"
                >
                  <p className="font-medium truncate">{it.name}</p>
                  {it.kind === "absence" && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {t("availability.until", { defaultValue: "jusqu'au {{date}}", date: formatUntil(it.end_date) })}
                    </p>
                  )}
                </Link>
                {it.kind === "suspension" ? (
                  <UnavailableBadge
                    reason="suspension"
                    detail={t("discipline.matchesLeft", {
                      defaultValue: "{{count}} match restant",
                      count: it.remaining,
                    })}
                  />
                ) : (
                  <UnavailableBadge reason={it.reason} />
                )}
              </li>
            ))}
          </ul>

          {extra > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("widget.availability.more", { defaultValue: "+ {{n}} autres", n: extra })}
            </p>
          )}
        </>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/club/discipline" className="inline-flex items-center justify-center gap-1">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span className="truncate">
              {t("widget.availability.viewSuspensions", { defaultValue: "Voir les suspensions" })}
            </span>
            <ChevronRight className="h-3 w-3" />
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/players" className="inline-flex items-center justify-center gap-1">
            <Palmtree className="h-3.5 w-3.5" />
            <span className="truncate">
              {t("widget.availability.viewAbsences", { defaultValue: "Voir les absences" })}
            </span>
            <ChevronRight className="h-3 w-3" />
          </Link>
        </Button>
        <Button size="sm" variant="default" onClick={() => setSanctionOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="truncate">
            {t("discipline.createSanction", { defaultValue: "Créer une sanction" })}
          </span>
        </Button>
        <Button size="sm" variant="default" onClick={() => setAbsenceOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="truncate">
            {t("availability.declare", { defaultValue: "Déclarer une absence" })}
          </span>
        </Button>
      </div>

      <QuickSanctionDrawer
        open={sanctionOpen}
        onOpenChange={setSanctionOpen}
        clubId={clubId}
      />
      <DeclareAbsenceDrawer open={absenceOpen} onOpenChange={setAbsenceOpen} />
    </section>
  );
}
