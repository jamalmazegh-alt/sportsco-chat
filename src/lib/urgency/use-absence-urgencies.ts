// Collecteur escouade réduite — COACH-ONLY.
// medium quand ≥3 joueurs indisponibles dans une fenêtre 14j.
// anchorAt = prochain événement publié du club dans la fenêtre (résout
// l'ambiguïté du tri sur une fenêtre, pas un événement ponctuel).

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import type { UrgencyCollectorResult, UrgencyItem } from "./types";

const DAY_MS = 86_400_000;
const REDUCED_SQUAD_THRESHOLD = 3;
const WINDOW_DAYS = 14;

export function useAbsenceUrgencies(): UrgencyCollectorResult & { isPending: boolean } {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();
  const isCoach =
    roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");

  const today = new Date().toISOString().slice(0, 10);
  const horizonDate = new Date(Date.now() + WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  const horizonIso = new Date(Date.now() + WINDOW_DAYS * DAY_MS).toISOString();
  const nowIso = new Date().toISOString();

  const q = useQuery({
    queryKey: ["urgency", "reduced-squad", activeClubId, today],
    enabled: !!activeClubId && isCoach,
    staleTime: 30_000,
    queryFn: async (): Promise<UrgencyItem[]> => {
      const { data: tm, error: tmErr } = await supabase
        .from("team_members")
        .select("player_id, team_id, teams:team_id(id, name, club_id, deleted_at)")
        .eq("role", "player");
      if (tmErr) throw tmErr;
      const teamRows = (tm ?? []).filter(
        (r: any) => r.teams && r.teams.club_id === activeClubId && !r.teams.deleted_at,
      );
      const playerIds = Array.from(new Set(teamRows.map((r: any) => r.player_id)));
      if (playerIds.length === 0) return [];

      const { data: avails, error: aErr } = await supabase
        .from("player_availabilities")
        .select("player_id, start_date, end_date")
        .in("player_id", playerIds)
        .eq("status", "active")
        .gte("end_date", today)
        .lte("start_date", horizonDate);
      if (aErr) throw aErr;

      const unavailablePlayers = new Set((avails ?? []).map((a: any) => a.player_id));
      if (unavailablePlayers.size === 0) return [];

      // Group unavailable players per team; emit one item per team above threshold.
      const perTeam = new Map<string, { name: string; players: Set<string> }>();
      for (const r of teamRows) {
        const teamId = r.teams.id as string;
        const teamName = (r.teams.name as string) ?? "";
        if (!unavailablePlayers.has(r.player_id as string)) continue;
        const entry = perTeam.get(teamId) ?? { name: teamName, players: new Set<string>() };
        entry.players.add(r.player_id as string);
        perTeam.set(teamId, entry);
      }

      const items: UrgencyItem[] = [];
      for (const [teamId, { name, players }] of perTeam) {
        if (players.size < REDUCED_SQUAD_THRESHOLD) continue;

        // anchorAt = prochain événement publié de l'équipe dans la fenêtre.
        let anchorAt = horizonIso;
        const { data: nextEv } = await supabase
          .from("events")
          .select("starts_at")
          .eq("team_id", teamId)
          .eq("status", "published")
          .gte("starts_at", nowIso)
          .lte("starts_at", horizonIso)
          .order("starts_at", { ascending: true })
          .limit(1);
        if (nextEv && nextEv[0]) anchorAt = nextEv[0].starts_at;

        items.push({
          id: `reduced-squad:${teamId}:coach`,
          source: "reduced-squad",
          sourceId: teamId,
          severity: "medium",
          role: "coach",
          title: name
            ? t("urgency.coach.reducedSquadTitleTeam", {
                team: name,
              })
            : t("urgency.coach.reducedSquadTitle"),
          subtitle: t("urgency.coach.reducedSquadSubtitle", {
            count: players.size,
          }),
          anchorAt,
          primaryAction: { kind: "open-team-availability", teamId },
        });
      }
      return items;
    },
  });

  return {
    items: q.data ?? [],
    failed: q.isError,
    isPending: q.isPending && q.fetchStatus !== "idle",
  };
}
