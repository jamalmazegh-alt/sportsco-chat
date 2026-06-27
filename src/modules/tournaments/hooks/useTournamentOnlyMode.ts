import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * A user is in "tournament-only" mode when:
 *   - they have at least one USED tournament pass
 *   - AND they have no active/trialing subscription on any of their clubs
 *
 * In that mode the UI hides all non-tournament features.
 */
export function useTournamentOnlyMode(): {
  isLoading: boolean;
  tournamentOnly: boolean;
} {
  const { user, memberships } = useAuth();
  const userId = user?.id ?? null;
  const clubIds = memberships.map((m) => m.club_id);
  const signupRole = (user?.user_metadata as { signup_role?: string } | undefined)?.signup_role;
  const isTournamentOrganizer = signupRole === "tournament_organizer" && memberships.length === 0;

  const { data, isLoading } = useQuery({
    queryKey: ["tournament-only-mode", userId, clubIds.sort().join(",")],
    enabled: !!userId && !isTournamentOrganizer,
    staleTime: 60_000,
    queryFn: async () => {
      const [passes, entitlements, subs, collaborations, pendingByEmail] = await Promise.all([
        supabase
          .from("tournament_passes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId!)
          .eq("status", "used"),
        supabase
          .from("tournament_entitlements")
          .select("id", { count: "exact", head: true })
          .eq("organizer_id", userId!)
          .eq("status", "active"),
        clubIds.length
          ? supabase
              .from("subscriptions")
              .select("id", { count: "exact", head: true })
              .in("club_id", clubIds)
              .in("status", ["active", "trialing"])
          : Promise.resolve({ count: 0 } as { count: number }),
        supabase
          .from("tournament_collaborators")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId!)
          .is("revoked_at", null),
        supabase.rpc("current_user_has_tournament_collab"),
      ]);
      const usedCount = passes.count ?? 0;
      const activeEntitlements = entitlements.count ?? 0;
      const activeSubs = (subs as { count: number | null }).count ?? 0;
      const activeCollaborations =
        (collaborations.count ?? 0) + (pendingByEmail?.data === true ? 1 : 0);
      return { usedCount, activeEntitlements, activeSubs, activeCollaborations };
    },
  });

  const tournamentOnly =
    isTournamentOrganizer ||
    (!!data &&
      (data.usedCount > 0 || data.activeEntitlements > 0 || data.activeCollaborations > 0) &&
      data.activeSubs === 0);
  return { isLoading: isLoading && !isTournamentOrganizer, tournamentOnly };
}
