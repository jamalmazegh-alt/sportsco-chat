// Collecteur convocations sans réponse — MULTI-RÔLE.
// - coach : agrège par event (`n sans réponse`, CTA remind-all).
//   J-1 → critical, J-2/J-3 → high.
// - player / parent : un item par event où l'utilisateur (ou un de ses enfants)
//   n'a pas répondu. CTA respond. J-1 → critical, J-2/J-3 → high.
//   Pour un parent multi-enfants sur le même event : 1 seul item
//   (sourceId = eventId, dedup naturel).

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { severityForStart } from "./pure";
import type { UrgencyCollectorResult, UrgencyItem, UrgencyRole } from "./types";

export function useConvocationUrgencies(): UrgencyCollectorResult & { isPending: boolean } {
  const { t } = useTranslation();
  const { user, activeClubId } = useAuth();
  const roles = useMyRoles();
  const isCoach =
    roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");
  const isPlayer = roles.includes("player");
  const isParent = roles.includes("parent");

  const nowIso = new Date().toISOString();

  const q = useQuery({
    queryKey: [
      "urgency",
      "convocation-silence",
      activeClubId,
      user?.id,
      isCoach,
      isPlayer,
      isParent,
    ],
    enabled: !!activeClubId && !!user && (isCoach || isPlayer || isParent),
    staleTime: 30_000,
    queryFn: async (): Promise<UrgencyItem[]> => {
      // 1. Events publiés du club dans la fenêtre J-1..J-3
      const { data: teams, error: teamsErr } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", activeClubId!);
      if (teamsErr) throw teamsErr;
      const teamIds = (teams ?? []).map((tm) => tm.id);
      if (teamIds.length === 0) return [];

      const { data: events, error: eventsErr } = await supabase
        .from("events")
        .select("id, title, starts_at, team_id")
        .in("team_id", teamIds)
        .eq("status", "published")
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true });
      if (eventsErr) throw eventsErr;
      if (!events || events.length === 0) return [];
      const eventIds = events.map((e) => e.id);
      const eventById = new Map(events.map((e) => [e.id, e]));

      // 2. Convocations pending sur ces events
      const { data: convocs, error: convErr } = await supabase
        .from("convocations")
        .select("id, player_id, event_id")
        .in("event_id", eventIds)
        .eq("status", "pending");
      if (convErr) throw convErr;
      if (!convocs || convocs.length === 0) return [];

      const items: UrgencyItem[] = [];

      // 3a. COACH — agrégation par event
      if (isCoach) {
        const byEvent = new Map<string, number>();
        for (const c of convocs) {
          byEvent.set(c.event_id, (byEvent.get(c.event_id) ?? 0) + 1);
        }
        for (const [eventId, count] of byEvent) {
          const ev = eventById.get(eventId)!;
          const sev = severityForStart(ev.starts_at) ?? "medium";
          items.push({
            id: `convocation-silence:${eventId}:coach`,
            source: "convocation-silence",
            sourceId: eventId,
            severity: sev,
            role: "coach",
            title: ev.title,
            subtitle: t("urgency.coach.convocationSilence", {
              count,
            }),
            anchorAt: ev.starts_at,
            primaryAction: { kind: "remind-all", eventId },
            secondaryAction: { kind: "open-event", eventId },
          });
        }
      }

      // 3b. PLAYER / PARENT — ses propres convocations en attente
      if (isPlayer || isParent) {
        // Player IDs concernés par l'utilisateur (lui-même + ses enfants)
        const myPlayerIds = new Set<string>();
        if (isPlayer) {
          const { data: me } = await supabase.from("players").select("id").eq("user_id", user!.id);
          (me ?? []).forEach((p) => myPlayerIds.add(p.id));
        }
        if (isParent) {
          const { data: kids } = await supabase
            .from("player_parents")
            .select("player_id")
            .eq("parent_user_id", user!.id);
          (kids ?? []).forEach((r) => myPlayerIds.add(r.player_id));
        }

        if (myPlayerIds.size > 0) {
          // Dedup parent multi-enfants : un item par event où ≥1 de mes
          // joueurs n'a pas répondu. sourceId = eventId.
          const convocIdsByEvent = new Map<string, string[]>();
          for (const c of convocs) {
            if (myPlayerIds.has(c.player_id)) {
              const list = convocIdsByEvent.get(c.event_id) ?? [];
              list.push(c.id);
              convocIdsByEvent.set(c.event_id, list);
            }
          }
          const role: UrgencyRole = isPlayer ? "player" : "parent";
          for (const [eventId, convocIds] of convocIdsByEvent) {
            const ev = eventById.get(eventId)!;
            const sev = severityForStart(ev.starts_at) ?? "medium";
            items.push({
              id: `convocation-silence:${eventId}:${role}`,
              source: "convocation-silence",
              sourceId: eventId,
              severity: sev,
              role,
              title: ev.title,
              subtitle: t("urgency.self.convocationSilence"),
              anchorAt: ev.starts_at,
              primaryAction: { kind: "respond", eventId },
              quickRespondConvocationId: convocIds.length === 1 ? convocIds[0] : undefined,
            });
          }
        }
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
