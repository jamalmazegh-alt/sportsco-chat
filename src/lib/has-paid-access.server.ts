import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasPaidAccessFromSubscription } from "@/lib/has-paid-access";

/** Server-side paid-access check for a club (Stripe subscription or manual exemption). */
export async function hasPaidAccess(clubId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("status, trial_end, current_period_end, exempt_from_billing")
    .eq("club_id", clubId)
    .maybeSingle();
  return hasPaidAccessFromSubscription(data);
}
