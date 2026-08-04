/**
 * Staff availability shared UI + hooks.
 *
 * Reads staff_availabilities via the SECURITY DEFINER RPC `get_staff_availabilities`
 * (never queries the table directly). Renders reason/comment only when
 * `can_view_reason = true`.
 *
 * Two surfaces:
 *  - <StaffAvailabilityForEvent teamId clubId date /> : coach list + pill for a specific date.
 *  - <StaffAvailabilityForTeamMonth teamId clubId monthStart monthEnd days /> : month grid
 *    mirroring the players' availability calendar.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleDashed, MinusCircle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UnavailableBadge, type UnavailableReason } from "@/components/unavailable-badge";
import { listTeamCoachesForAvailability } from "@/lib/staff-availability.functions";
import { cn } from "@/lib/utils";

type StaffAvailabilityRow = {
  id: string;
  user_id: string;
  club_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  comment: string | null;
  certainty: "confirmed" | "tentative";
  visibility: "staff" | "admins_only";
  status: string;
  can_view_reason: boolean;
};

type Coach = { user_id: string; full_name: string; role: string };

type Status = "available" | "tentative" | "unavailable";

const STAFF_REASON_BG: Record<string, string> = {
  vacation: "bg-sky-500/70",
  injury: "bg-amber-500/70",
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

/** Compute status for a coach on a specific date given all of their rows. */
function statusForDate(rows: StaffAvailabilityRow[], dateStr: string): Status {
  const overlapping = rows.filter(
    (r) => r.status === "active" && r.start_date <= dateStr && r.end_date >= dateStr,
  );
  if (overlapping.length === 0) return "available";
  if (overlapping.some((r) => r.certainty === "confirmed")) return "unavailable";
  return "tentative";
}

/** Fetch coaches (head + assistant) of a team. */
function useTeamCoaches(teamId: string | undefined) {
  const listTeamCoaches = useServerFn(listTeamCoachesForAvailability);
  return useQuery({
    queryKey: ["team-coaches", teamId],
    enabled: !!teamId,
    queryFn: async (): Promise<Coach[]> => {
      return listTeamCoaches({ data: { teamId: teamId! } });
    },
  });
}

/** Fetch staff_availabilities via the SECURITY DEFINER RPC for a team/period. */
function useStaffAvailabilities(
  teamId: string | undefined,
  clubId: string | undefined,
  periodStart: string,
  periodEnd: string,
) {
  return useQuery({
    queryKey: ["staff-availabilities", teamId, clubId, periodStart, periodEnd],
    enabled: !!teamId && !!clubId,
    queryFn: async (): Promise<StaffAvailabilityRow[]> => {
      const { data, error } = await supabase.rpc("get_staff_availabilities", {
        p_team_id: teamId!,
        p_club_id: clubId!,
        p_start: periodStart,
        p_end: periodEnd,
      });
      if (error) throw error;
      return (data ?? []) as StaffAvailabilityRow[];
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// EVENT variant — coach list on a single date.
// ---------------------------------------------------------------------------

export function StaffAvailabilityForEvent({
  teamId,
  clubId,
  date,
  className,
}: {
  teamId: string;
  clubId: string;
  /** YYYY-MM-DD */
  date: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { data: coaches = [], isLoading: cLoading } = useTeamCoaches(teamId);
  const { data: rows = [], isLoading: rLoading } = useStaffAvailabilities(
    teamId,
    clubId,
    date,
    date,
  );

  const byCoach = useMemo(() => {
    const m = new Map<string, StaffAvailabilityRow[]>();
    for (const r of rows) {
      const arr = m.get(r.user_id) ?? [];
      arr.push(r);
      m.set(r.user_id, arr);
    }
    return m;
  }, [rows]);

  const isLoading = cLoading || rLoading;

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 space-y-3", className)}>
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Users className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{t("staffAvailability.eventTitle")}</h3>
          <p className="text-[11px] text-muted-foreground">{t("staffAvailability.eventHint")}</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : coaches.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("staffAvailability.noCoaches")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {coaches.map((c) => {
            const list = byCoach.get(c.user_id) ?? [];
            const status = statusForDate(list, date);
            const conflict =
              status !== "available"
                ? (list.find(
                    (r) => r.status === "active" && r.start_date <= date && r.end_date >= date,
                  ) ?? null)
                : null;
            return (
              <li key={c.user_id} className="py-2 flex items-center gap-3">
                <span className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold shrink-0">
                  {(c.full_name?.split(" ")[0]?.[0] ?? "") +
                    (c.full_name?.split(" ")[1]?.[0] ?? "")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.full_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.role === "assistant_coach"
                      ? t("teams.role.assistant_coach")
                      : t("teams.role.coach")}
                  </div>
                </div>
                <StaffStatusPill status={status} />
                {conflict?.can_view_reason && conflict?.reason && (
                  <UnavailableBadge reason={conflict.reason as UnavailableReason} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StaffStatusPill({ status }: { status: Status }) {
  const { t } = useTranslation();
  if (status === "available") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        {t("staffAvailability.status.available")}
      </span>
    );
  }
  if (status === "tentative") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
        <CircleDashed className="h-3 w-3" />
        {t("staffAvailability.status.tentative")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
      <MinusCircle className="h-3 w-3" />
      {t("staffAvailability.status.unavailable")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TEAM variant — month grid mirroring the players' calendar.
// ---------------------------------------------------------------------------

export function StaffAvailabilityForTeamMonth({
  teamId,
  clubId,
  cursor,
  days,
}: {
  teamId: string;
  clubId: string;
  /** first day of the displayed month */
  cursor: Date;
  days: Date[];
}) {
  const { t, i18n } = useTranslation();
  const daysInMonth = days.length;
  const monthStart = ymd(days[0] ?? cursor);
  const monthEnd = ymd(days[days.length - 1] ?? cursor);
  const todayStr = ymd(new Date());

  const { data: coaches = [] } = useTeamCoaches(teamId);
  const { data: rows = [], isLoading } = useStaffAvailabilities(
    teamId,
    clubId,
    monthStart,
    monthEnd,
  );

  const byCoach = useMemo(() => {
    const m = new Map<string, StaffAvailabilityRow[]>();
    for (const r of rows) {
      const arr = m.get(r.user_id) ?? [];
      arr.push(r);
      m.set(r.user_id, arr);
    }
    return m;
  }, [rows]);

  if (coaches.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-x-auto">
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t("staffAvailability.teamTitle")}</h3>
        <span className="text-[11px] text-muted-foreground">
          · {coaches.length} {t("teams.coaches")}
        </span>
      </div>

      <div className="min-w-max">
        {/* Header row */}
        <div
          className="grid border-b bg-muted/30"
          style={{ gridTemplateColumns: `180px repeat(${daysInMonth}, 28px)` }}
        >
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-r">
            {t("teams.coach")}
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

        {/* Coach rows */}
        {coaches.map((c) => {
          const list = byCoach.get(c.user_id) ?? [];
          return (
            <div
              key={c.user_id}
              className="grid border-b hover:bg-muted/20 relative"
              style={{
                gridTemplateColumns: `180px repeat(${daysInMonth}, 28px)`,
                minHeight: 40,
              }}
            >
              <div
                className="px-3 py-2 text-xs truncate border-r flex items-center gap-1.5"
                title={c.full_name}
              >
                <span className="truncate">{c.full_name}</span>
                {c.role === "assistant_coach" && (
                  <span className="text-[9px] uppercase text-muted-foreground shrink-0">
                    · adj.
                  </span>
                )}
              </div>
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
                  s.getMonth() === cursor.getMonth() && s.getFullYear() === cursor.getFullYear()
                    ? s.getDate()
                    : 1,
                );
                const endDay = Math.min(
                  daysInMonth,
                  e.getMonth() === cursor.getMonth() && e.getFullYear() === cursor.getFullYear()
                    ? e.getDate()
                    : daysInMonth,
                );
                const left = 180 + (startDay - 1) * 28 + 2;
                const width = (endDay - startDay + 1) * 28 - 4;
                const tone =
                  r.certainty === "tentative"
                    ? "bg-amber-500/60"
                    : (STAFF_REASON_BG[r.reason ?? "other"] ?? "bg-destructive/70");
                const label =
                  r.can_view_reason && r.reason
                    ? t(`availability.reason.${r.reason}`, { defaultValue: r.reason })
                    : t("staffAvailability.masked");
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 h-6 rounded flex items-center px-2 text-[10px] text-white font-medium truncate shadow-sm",
                      tone,
                      r.certainty === "tentative" && "ring-1 ring-amber-600/40",
                    )}
                    style={{ left, width }}
                    title={`${label} · ${r.start_date} → ${r.end_date}${
                      r.can_view_reason && r.comment ? ` · ${r.comment}` : ""
                    }${r.certainty === "tentative" ? ` · ${t("staffAvailability.status.tentative")}` : ""}`}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          );
        })}

        {isLoading && (
          <div className="p-3 text-center text-xs text-muted-foreground">{t("common.loading")}</div>
        )}
      </div>
    </div>
  );
}
