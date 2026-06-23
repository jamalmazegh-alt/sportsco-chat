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
        .select("player_id, teams:team_id(id, club_id, deleted_at)")
        .eq("role", "player");
      if (tmErr) throw tmErr;
      const teamRows = (tm ?? []).filter(
        (r: any) => r.teams && r.teams.club_id === activeClubId && !r.teams.deleted_at,
      );
      const playerIds = Array.from(new Set(teamRows.map((r: any) => r.player_id)));
      const teamIds = Array.from(new Set(teamRows.map((r: any) => r.teams.id)));
      if (playerIds.length === 0) return [];

      const { data: avails, error: aErr } = await supabase
        .from("player_availabilities")
        .select("player_id, start_date, end_date")
        .in("player_id", playerIds)
        .eq("status", "active")
        .gte("end_date", today)
        .lte("start_date", horizonDate);
      if (aErr) throw aErr;

      const distinct = new Set((avails ?? []).map((a: any) => a.player_id));
      if (distinct.size < REDUCED_SQUAD_THRESHOLD) return [];

      // anchorAt = prochain événement publié du club dans la fenêtre.
      // Fallback: horizon (la fenêtre elle-même) si rien planifié.
      let anchorAt = horizonIso;
      if (teamIds.length > 0) {
        const { data: nextEv } = await supabase
          .from("events")
          .select("starts_at")
          .in("team_id", teamIds)
          .eq("status", "published")
          .gte("starts_at", nowIso)
          .lte("starts_at", horizonIso)
          .order("starts_at", { ascending: true })
          .limit(1);
        if (nextEv && nextEv[0]) anchorAt = nextEv[0].starts_at;
      }

      const item: UrgencyItem = {
        id: `reduced-squad:${activeClubId}:coach`,
        source: "reduced-squad",
        sourceId: activeClubId!,
        severity: "medium",
        role: "coach",
        title: t("urgency.coach.reducedSquadTitle", { defaultValue: "Effectif réduit" }),
        subtitle: t("urgency.coach.reducedSquadSubtitle", {
          count: distinct.size,
          defaultValue: "{{count}} joueurs indisponibles sur 14j",
        }),
        anchorAt,
        // open-event sur le prochain match — pas d'action dédiée pour l'instant.
        primaryAction: { kind: "open-event", eventId: "" },
      };
      // open-event eventId="" est inerte ; UrgencyCenter pourra masquer
      // l'action si eventId vide (TODO wiring tranche UI).
      return [item];
    },
  });

  return {
    items: q.data ?? [],
    failed: q.isError,
    isPending: q.isPending && q.fetchStatus !== "idle",
  };
}
