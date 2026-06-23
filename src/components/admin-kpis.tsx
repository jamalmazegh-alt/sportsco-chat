import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { TrendingUp, Clock, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
        return { attendancePct: null, pendingResponses: 0, upcoming7d: 0 };
      }

      const { data: pastEvents } = await supabase
        .from("events")
        .select("id")
        .in("team_id", teamIds)
        .gte("starts_at", past30)
        .lte("starts_at", nowIso);
      const pastEventIds = (pastEvents ?? []).map((e) => e.id);

      let attendancePct: number | null = null;
      if (pastEventIds.length > 0) {
        const { data: convocs } = await supabase
          .from("convocations")
          .select("status")
          .in("event_id", pastEventIds);
        const list = convocs ?? [];
        const replied = list.filter((c) => c.status !== "pending").length;
        const present = list.filter((c) => c.status === "present").length;
        attendancePct = replied > 0 ? Math.round((present / replied) * 100) : null;
      }

      const { data: upcomingEvents } = await supabase
        .from("events")
        .select("id")
        .in("team_id", teamIds)
        .eq("status", "published")
        .gte("starts_at", nowIso)
        .lte("starts_at", next7);
      const upcomingIds = (upcomingEvents ?? []).map((e) => e.id);

      let pendingResponses = 0;
      if (upcomingIds.length > 0) {
        const { count } = await supabase
          .from("convocations")
          .select("id", { count: "exact", head: true })
          .in("event_id", upcomingIds)
          .eq("status", "pending");
        pendingResponses = count ?? 0;
      }

      return {
        attendancePct,
        pendingResponses,
        upcoming7d: upcomingIds.length,
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
      bar: "linear-gradient(90deg, #0f4a26 0%, #2d9d5f 100%)",
      iconBg: "linear-gradient(135deg, #d4ead9 0%, #b8dcc4 100%)",
      iconColor: "#0f4a26",
      valueGradient: "linear-gradient(135deg, #0f4a26 0%, #2d9d5f 100%)",
      to: "/stats" as const,
    },
    {
      icon: Clock,
      label: t("dashboard.kpis.pendingResponses", { defaultValue: "Réponses en attente" }),
      value: data?.pendingResponses ?? 0,
      bar: "linear-gradient(90deg, #b45309 0%, #f59e0b 100%)",
      iconBg: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
      iconColor: "#92400e",
      valueGradient: "linear-gradient(135deg, #92400e 0%, #f59e0b 100%)",
      to: "/follow-ups" as const,
    },
    {
      icon: CalendarClock,
      label: t("dashboard.kpis.upcoming7d"),
      value: data?.upcoming7d ?? 0,
      bar: "linear-gradient(90deg, #1e40af 0%, #3b82f6 100%)",
      iconBg: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
      iconColor: "#1e40af",
      valueGradient: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
      to: "/events" as const,
    },
  ];

  return (
    <section>
      <h2 className="text-[11px] font-bold text-foreground uppercase tracking-[0.14em] mb-2.5 px-0.5">
        {t("dashboard.kpis.title")}
      </h2>
      <div className="grid grid-cols-3 gap-2.5">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <Link
              key={i}
              to={it.to}
              className="relative overflow-hidden rounded-[14px] border-[1.5px] border-border bg-card p-3 flex flex-col gap-1.5 min-h-[104px] shadow-[0_1px_2px_rgba(15,40,24,0.04)] active:scale-[0.98] transition-transform hover:bg-accent/30"
            >
              <div
                aria-hidden
                className="absolute top-0 inset-x-0 h-[3px]"
                style={{ background: it.bar }}
              />
              <div
                className="h-8 w-8 rounded-[10px] flex items-center justify-center"
                style={{ background: it.iconBg }}
              >
                <Icon className="h-4 w-4" style={{ color: it.iconColor }} strokeWidth={2.4} />
              </div>
              <p
                className="text-[26px] font-black leading-none tabular-nums tracking-tight bg-clip-text text-transparent"
                style={{ backgroundImage: it.valueGradient }}
              >
                {isLoading ? "…" : it.value}
              </p>
              <p className="text-[10px] uppercase tracking-[0.1em] font-bold text-muted-foreground leading-tight">
                {it.label}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
