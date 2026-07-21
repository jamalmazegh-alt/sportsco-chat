// Badge de couverture staff — lit la même logique que le collector Lot 4b.
// Affiche 🟢 « Encadrement OK » ou 🔴 « Aucun coach dispo ».
// Visible pour staff + admins uniquement (le call-site gate).

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { computeCoverage } from "@/lib/urgency/use-staff-coverage-urgencies";
import { cn } from "@/lib/utils";

export function StaffCoverageBadge({
  eventId,
  teamId,
  clubId,
  startsAt,
  className,
}: {
  eventId: string;
  teamId: string;
  clubId: string;
  /** ISO */
  startsAt: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const dateStr = startsAt.slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["staff-coverage-badge", eventId, teamId, clubId, dateStr],
    enabled: !!eventId && !!teamId && !!clubId,
    staleTime: 30_000,
    queryFn: async () => {
      const [staffRes, avRes, asgRes] = await Promise.all([
        supabase
          .from("team_members")
          .select("user_id")
          .eq("team_id", teamId)
          .in("role", ["coach", "assistant_coach"] as any),
        supabase.rpc("get_staff_availabilities", {
          p_team_id: teamId,
          p_club_id: clubId,
          p_start: dateStr,
          p_end: dateStr,
        }),
        supabase
          .from("event_staff_assignments")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId),
      ]);
      const staff = (staffRes.data ?? [])
        .map((r: any) => r.user_id)
        .filter(Boolean) as string[];
      const availabilities = (avRes.data ?? []).map((r: any) => ({
        user_id: r.user_id,
        start_date: r.start_date,
        end_date: r.end_date,
        certainty: r.certainty,
        status: r.status,
      }));
      const assignmentsCount = asgRes.count ?? 0;
      return computeCoverage({
        eventId,
        title: null,
        startsAt,
        teamId,
        teamName: null,
        teamStaffUserIds: Array.from(new Set(staff)),
        availabilities,
        assignmentsCount,
      });
    },
  });

  if (isLoading || !data) return null;
  const covered = data.covered;
  const Icon = covered ? CheckCircle2 : AlertTriangle;
  const label = covered
    ? t("staffCoverage.badge.covered", { defaultValue: "Encadrement OK" })
    : t("staffCoverage.badge.uncovered", { defaultValue: "Aucun coach dispo" });
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border",
        covered
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-destructive/40 bg-destructive/10 text-destructive",
        className,
      )}
      title={label}
    >
      <Icon className="h-3 w-3" strokeWidth={2.4} />
      {label}
    </span>
  );
}
