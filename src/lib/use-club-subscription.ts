import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns whether the given club currently has an active subscription
 * (trialing/active/past_due and not expired). Used to gate the UI for
 * clubs that haven't subscribed yet (or whose subscription lapsed).
 *
 * Uses the SECURITY DEFINER RPC `club_has_active_subscription` so non-admin
 * members (coach, player, parent) — who cannot SELECT the subscriptions row
 * via RLS — still get the correct value. Reading the row directly would
 * return null for them and incorrectly lock the whole club UI.
 */
export function useClubSubscriptionActive(clubId: string | null): {
  isLoading: boolean;
  isActive: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["club-subscription-active", clubId],
    enabled: !!clubId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("club_has_active_subscription", {
        _club_id: clubId!,
      });
      if (error) throw error;
      return !!data;
    },
  });

  if (!clubId) return { isLoading: false, isActive: false };
  if (isLoading || data === undefined) return { isLoading, isActive: false };
  return { isLoading: false, isActive: !!data };
}
