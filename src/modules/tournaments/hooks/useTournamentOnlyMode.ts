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
  const signupRole = (user?.user_metadata as { signup_role?: string } | undefined)
    ?.signup_role;
  const isTournamentOrganizer =
    signupRole === "tournament_organizer" && memberships.length === 0;

  const { data, isLoading } = useQuery({
    queryKey: ["tournament-only-mode", userId, clubIds.sort().join(",")],
    enabled: !!userId && !isTournamentOrganizer,
    staleTime: 60_000,
    queryFn: async () => {
      const [passes, subs] = await Promise.all([
        supabase
          .from("tournament_passes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId!)
          .eq("status", "used"),
        clubIds.length
          ? supabase
              .from("subscriptions")
              .select("id", { count: "exact", head: true })
              .in("club_id", clubIds)
              .in("status", ["active", "trialing"])
          : Promise.resolve({ count: 0 } as { count: number }),
      ]);
      const usedCount = passes.count ?? 0;
      const activeSubs = (subs as { count: number | null }).count ?? 0;
      return { usedCount, activeSubs };
    },
  });

  const tournamentOnly =
    isTournamentOrganizer ||
    (!!data && data.usedCount > 0 && data.activeSubs === 0);
  return { isLoading: isLoading && !isTournamentOrganizer, tournamentOnly };
}
