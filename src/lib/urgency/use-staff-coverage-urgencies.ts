// Collecteur couverture staff — COACH / ADMIN uniquement (jamais joueur/parent).
//
// Périmètre :
//   - Pour chaque événement à venir des équipes de l'utilisateur :
//     * staff équipe = team_members role IN ('coach','assistant_coach')
//     * non-absent = aucune indispo active couvrant events.starts_at::date
//     * COUVERT si ≥ MIN_COVERED_STAFF staff équipe non-absent, OU
//       au moins une ligne event_staff_assignments (renfort inclus)
//   - Emet un UrgencyItem 'staff-uncovered' seulement si non couvert.
//
// La logique pure `computeStaffCoverage` est extraite pour tests unitaires
// sans React ni Supabase.

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { dateLocale } from "@/lib/date-locale";
import { severityForStart } from "./pure";
import type { UrgencyCollectorResult, UrgencyItem } from "./types";

/**
 * Seuil minimum de staff non-absent requis pour considérer l'événement
 * couvert. Isolé pour permettre plus tard un minimum N sans réécriture.
 */
export const MIN_COVERED_STAFF = 1;

const HORIZON_DAYS = 14;
const DAY_MS = 86_400_000;

type StaffAvailabilityRow = {
  user_id: string;
  start_date: string;
  end_date: string;
  certainty: "confirmed" | "tentative";
  status: string;
};

export type CoverageEventInput = {
  eventId: string;
  title: string | null;
  startsAt: string; // ISO
  teamId: string;
  teamName: string | null;
  teamStaffUserIds: readonly string[];
  availabilities: readonly StaffAvailabilityRow[];
  assignmentsCount: number;
};

/**
 * Un staff est ABSENT sur la date `dateStr` s'il existe au moins une indispo
 * active (`status='active'`) dont l'intervalle [start_date, end_date] contient
 * la date. `tentative` compte comme absent (spec Lot 4b : "non absent" =
 * aucune indispo active).
 */
function isStaffAbsentOnDate(
  userId: string,
  dateStr: string,
  rows: readonly StaffAvailabilityRow[],
): boolean {
  return rows.some(
    (r) =>
      r.user_id === userId &&
      r.status === "active" &&
      r.start_date <= dateStr &&
      r.end_date >= dateStr,
  );
}

export type CoverageDecision = {
  eventId: string;
  covered: boolean;
  reason: "has-assignment" | "team-staff-available" | "no-staff-available";
};

/** Pur : décide si un événement est couvert. */
export function computeCoverage(input: CoverageEventInput): CoverageDecision {
  if (input.assignmentsCount > 0) {
    return { eventId: input.eventId, covered: true, reason: "has-assignment" };
  }
  const dateStr = input.startsAt.slice(0, 10);
  let nonAbsent = 0;
  for (const uid of input.teamStaffUserIds) {
    if (!isStaffAbsentOnDate(uid, dateStr, input.availabilities)) {
      nonAbsent += 1;
      if (nonAbsent >= MIN_COVERED_STAFF) {
        return { eventId: input.eventId, covered: true, reason: "team-staff-available" };
      }
    }
  }
  return { eventId: input.eventId, covered: false, reason: "no-staff-available" };
}

export type ComputeStaffCoverageUrgenciesArgs = {
  events: readonly CoverageEventInput[];
  now?: Date;
  formatWhen: (iso: string) => string;
  uncoveredLabel: (teamName: string | null) => string;
  fallbackTitle: string;
};

export function computeStaffCoverageUrgencies(
  args: ComputeStaffCoverageUrgenciesArgs,
): UrgencyItem[] {
  const { events, now = new Date(), formatWhen, uncoveredLabel, fallbackTitle } = args;
  const items: UrgencyItem[] = [];
  for (const ev of events) {
    const decision = computeCoverage(ev);
    if (decision.covered) continue;
    // Ne remonter que les événements strictement à venir.
    const delta = new Date(ev.startsAt).getTime() - now.getTime();
    if (delta <= 0) continue;
    const sev = severityForStart(ev.startsAt, now) ?? "medium";
    const evTitle = ev.title?.trim() || fallbackTitle;
    items.push({
      id: `staff-uncovered:${ev.eventId}:coach`,
      source: "staff-uncovered",
      sourceId: ev.eventId,
      severity: sev,
      role: "coach",
      title: uncoveredLabel(ev.teamName),
      subtitle: `${evTitle} · ${formatWhen(ev.startsAt)}`,
      anchorAt: ev.startsAt,
      primaryAction: { kind: "open-event", eventId: ev.eventId },
    });
  }
  return items;
}

export function useStaffCoverageUrgencies(): UrgencyCollectorResult & { isPending: boolean } {
  const { t } = useTranslation();
  const { user, activeClubId } = useAuth();
  const roles = useMyRoles();
  const isAdmin = roles.includes("admin");
  const isStaff = isAdmin || roles.includes("coach") || roles.includes("assistant_coach");
  const enabled = !!activeClubId && !!user && isStaff;

  const nowIso = new Date().toISOString();
  const horizonIso = new Date(Date.now() + HORIZON_DAYS * DAY_MS).toISOString();

  const q = useQuery({
    queryKey: ["urgency", "staff-uncovered", activeClubId, user?.id],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<UrgencyItem[]> => {
      // 1. Équipes visibles : admin → toutes les équipes du club actif ;
      //    coach/adjoint → uniquement les équipes où il est staff.
      const { data: allTeams, error: tErr } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", activeClubId!);
      if (tErr) throw tErr;
      const clubTeamIds = new Set((allTeams ?? []).map((t) => t.id));
      if (clubTeamIds.size === 0) return [];

      let scopedTeamIds: string[];
      if (isAdmin) {
        scopedTeamIds = Array.from(clubTeamIds);
      } else {
        const { data: mine, error: mErr } = await supabase
          .from("team_members")
          .select("team_id, role")
          .eq("user_id", user!.id)
          .in("role", ["coach"] as any);
        if (mErr) throw mErr;
        scopedTeamIds = Array.from(
          new Set((mine ?? []).map((r) => r.team_id).filter((id) => clubTeamIds.has(id))),
        );
      }
      if (scopedTeamIds.length === 0) return [];

      // 2. Événements publiés à venir dans ces équipes.
      const { data: events, error: evErr } = await supabase
        .from("events")
        .select("id, title, starts_at, team_id")
        .in("team_id", scopedTeamIds)
        .eq("status", "published")
        .gte("starts_at", nowIso)
        .lte("starts_at", horizonIso)
        .order("starts_at", { ascending: true });
      if (evErr) throw evErr;
      if (!events || events.length === 0) return [];
      const eventIds = events.map((e) => e.id);
      const teamNameById = new Map((allTeams ?? []).map((t) => [t.id, t.name as string | null]));

      // 3. Staff par équipe (batch).
      const { data: staffRows, error: sErr } = await supabase
        .from("team_members")
        .select("team_id, user_id, role")
        .in("team_id", scopedTeamIds)
        .in("role", ["coach"] as any);
      if (sErr) throw sErr;
      const staffByTeam = new Map<string, Set<string>>();
      for (const r of staffRows ?? []) {
        if (!r.user_id) continue;
        const set = staffByTeam.get(r.team_id) ?? new Set<string>();
        set.add(r.user_id);
        staffByTeam.set(r.team_id, set);
      }

      // 4. Assignations existantes (batch).
      const { data: asg, error: aErr } = await supabase
        .from("event_staff_assignments")
        .select("event_id")
        .in("event_id", eventIds);
      if (aErr) throw aErr;
      const asgCountByEvent = new Map<string, number>();
      for (const r of asg ?? []) {
        asgCountByEvent.set(r.event_id, (asgCountByEvent.get(r.event_id) ?? 0) + 1);
      }

      // 5. Disponibilités par équipe (une RPC / équipe, fenêtre = horizon).
      //    Filtrage par date fait dans computeCoverage.
      const todayStr = new Date().toISOString().slice(0, 10);
      const horizonDateStr = new Date(Date.now() + HORIZON_DAYS * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const availByTeam = new Map<string, StaffAvailabilityRow[]>();
      await Promise.all(
        scopedTeamIds.map(async (teamId) => {
          const { data, error } = await supabase.rpc("get_staff_availabilities", {
            p_team_id: teamId,
            p_club_id: activeClubId!,
            p_start: todayStr,
            p_end: horizonDateStr,
          });
          if (error) return; // fail-soft : équipe sans droit → traitée comme "aucune indispo"
          availByTeam.set(
            teamId,
            (data ?? []).map((r: any) => ({
              user_id: r.user_id,
              start_date: r.start_date,
              end_date: r.end_date,
              certainty: r.certainty,
              status: r.status,
            })),
          );
        }),
      );

      // 6. Passe pure : décision + mapping en UrgencyItem[].
      const inputs: CoverageEventInput[] = events.map((e) => ({
        eventId: e.id,
        title: e.title as string | null,
        startsAt: e.starts_at,
        teamId: e.team_id,
        teamName: teamNameById.get(e.team_id) ?? null,
        teamStaffUserIds: Array.from(staffByTeam.get(e.team_id) ?? []),
        availabilities: availByTeam.get(e.team_id) ?? [],
        assignmentsCount: asgCountByEvent.get(e.id) ?? 0,
      }));

      const locale = dateLocale();
      return computeStaffCoverageUrgencies({
        events: inputs,
        formatWhen: (iso) => format(new Date(iso), "EEE d MMM, HH:mm", { locale }),
        uncoveredLabel: (teamName) =>
          teamName
            ? t("urgency.coach.staffUncoveredTeam", {
                team: teamName,
              })
            : t("urgency.coach.staffUncovered"),
        fallbackTitle: t("urgency.coach.staffUncoveredFallback"),
      });
    },
  });

  return {
    items: q.data ?? [],
    failed: q.isError,
    isPending: q.isPending && q.fetchStatus !== "idle",
  };
}
