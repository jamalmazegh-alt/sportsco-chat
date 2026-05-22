import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns whether the given club currently has an active subscription
 * (trialing/active/past_due and not expired). Used to gate the UI for
 * clubs that haven't subscribed yet (or whose subscription lapsed).
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
      const { data } = await supabase
        .from("subscriptions")
        .select("status, trial_end, current_period_end")
        .eq("club_id", clubId!)
        .maybeSingle();
      return data;
    },
  });

  if (!clubId) return { isLoading: false, isActive: false };
  if (isLoading || !data) return { isLoading, isActive: false };

  const now = Date.now();
  const trialEnd = data.trial_end ? new Date(data.trial_end).getTime() : null;
  const periodEnd = data.current_period_end
    ? new Date(data.current_period_end).getTime()
    : null;

  const active =
    (data.status === "trialing" && trialEnd !== null && trialEnd > now) ||
    ((data.status === "active" || data.status === "past_due") &&
      (periodEnd === null || periodEnd > now));

  return { isLoading: false, isActive: active };
}
