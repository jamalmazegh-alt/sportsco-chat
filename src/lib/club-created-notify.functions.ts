import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sends an admin notification to hello@clubero.app when a brand-new club is
 * created via the onboarding flow (before/without going through Stripe).
 * Re-uses the "subscription-admin-notification" template (eventType=trial_started).
 */
export const notifyClubCreated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { clubId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");

    // Verify the caller is actually a member of the club they're notifying about.
    const { data: membership } = await context.supabase
      .from("club_members")
      .select("club_id")
      .eq("club_id", data.clubId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!membership) return { ok: false };

    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("id, name, created_at, created_by")
      .eq("id", data.clubId)
      .maybeSingle();
    if (!club) return { ok: false };

    let customerEmail: string | null = null;
    if (club.created_by) {
      const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(club.created_by);
      customerEmail = userRes?.user?.email ?? null;
    }

    await enqueueTransactionalEmailServer({
      templateName: "subscription-admin-notification",
      idempotencyKey: `club-created-${club.id}`,
      templateData: {
        eventType: "trial_started",
        clubId: club.id,
        clubName: club.name,
        plan: "trial_30d",
        status: "onboarded",
        customerEmail,
        trialEnd: null,
        currentPeriodEnd: null,
        cancelAt: null,
        stripeSubscriptionId: null,
      },
    });

    return { ok: true };
  });
