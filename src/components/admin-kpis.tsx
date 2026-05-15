import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { TrendingUp, AlertTriangle, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface AdminKpisProps {
  clubId: string;
}

/**
 * Real-time KPI strip for club admins/coaches.
 * - Attendance % over the last 30 days (present / replied)
 * - Number of players with ≥3 absences in the last 30 days
 * - Number of published events in the next 7 days
 */
export function AdminKpis({ clubId }: AdminKpisProps) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-kpis", clubId],
    queryFn: async () => {
      const now = new Date();
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const next7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const nowIso = now.toISOString();

      const { data: teams } = await supabase
        .from("teams")
        .select("id")
        .eq("club_id", clubId);
      const teamIds = (teams ?? []).map((t) => t.id);
      if (teamIds.length === 0) {
        return { attendancePct: null, playersAlert: 0, upcoming7d: 0 };
      }

      // Past 30d events for these teams
      const { data: pastEvents } = await supabase
        .from("events")
        .select("id")
        .in("team_id", teamIds)
        .gte("starts_at", past30)
        .lte("starts_at", nowIso);
      const pastEventIds = (pastEvents ?? []).map((e) => e.id);

      // Convocations on those events
      let attendancePct: number | null = null;
      const playerAbsenceCount = new Map<string, number>();
      if (pastEventIds.length > 0) {
        const { data: convocs } = await supabase
          .from("convocations")
          .select("status, player_id")
          .in("event_id", pastEventIds);
        const list = convocs ?? [];
        const replied = list.filter((c) => c.status !== "pending").length;
        const present = list.filter((c) => c.status === "present").length;
        attendancePct = replied > 0 ? Math.round((present / replied) * 100) : null;
        list.forEach((c) => {
          if (c.status === "absent") {
            playerAbsenceCount.set(c.player_id, (playerAbsenceCount.get(c.player_id) ?? 0) + 1);
          }
        });
      }
      const playersAlert = Array.from(playerAbsenceCount.values()).filter((n) => n >= 3).length;

      // Upcoming 7d events
      const { count: upcomingCount } = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .in("team_id", teamIds)
        .eq("status", "published")
        .gte("starts_at", nowIso)
        .lte("starts_at", next7);

      return {
        attendancePct,
        playersAlert,
        upcoming7d: upcomingCount ?? 0,
      };
    },
    staleTime: 60_000,
  });

  const items = [
    {
      icon: TrendingUp,
      label: t("dashboard.kpis.attendance30d"),
      value:
        data?.attendancePct == null
          ? t("dashboard.kpis.noData")
          : `${data.attendancePct}%`,
      tone: "text-present",
      bg: "bg-present/10 border-present/20",
    },
    {
      icon: AlertTriangle,
      label: t("dashboard.kpis.playersAlert"),
      hint: t("dashboard.kpis.playersAlertHint"),
      value: data?.playersAlert ?? 0,
      tone: "text-absent",
      bg: "bg-absent/10 border-absent/20",
    },
    {
      icon: CalendarClock,
      label: t("dashboard.kpis.upcoming7d"),
      value: data?.upcoming7d ?? 0,
      tone: "text-primary",
      bg: "bg-primary/10 border-primary/20",
    },
  ];

  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {t("dashboard.kpis.title")}
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <div
              key={i}
              className={cn(
                "rounded-2xl border p-3 flex flex-col items-start gap-1.5 min-h-[88px]",
                it.bg,
              )}
            >
              <Icon className={cn("h-4 w-4", it.tone)} />
              <p className={cn("text-xl font-bold leading-none", it.tone)}>
                {isLoading ? "…" : it.value}
              </p>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground leading-tight">
                {it.label}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
