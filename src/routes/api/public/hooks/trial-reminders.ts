import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";

const MILESTONES = [7, 3, 1, 0] as const;

function formatFrDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export const Route = createFileRoute("/api/public/hooks/trial-reminders")({
  server: {
    handlers: {
      POST: async () => {
        // Find trialing subs whose trial_end is within the next 8 days OR just expired (last 24h)
        const horizon = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
        const lookback = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: subs, error } = await supabaseAdmin
          .from("subscriptions")
          .select("id, club_id, status, trial_end, trial_reminders_sent")
          .eq("status", "trialing")
          .not("trial_end", "is", null)
          .gte("trial_end", lookback)
          .lte("trial_end", horizon);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        let processed = 0;
        let sent = 0;

        for (const sub of subs ?? []) {
          processed++;
          const trialEnd = sub.trial_end as string;
          const days = daysUntil(trialEnd);
          const already = (sub.trial_reminders_sent ?? []) as number[];

          // Pick the next milestone to send: largest milestone <= current days remaining, not yet sent
          const milestone = MILESTONES.find((m) => days <= m && !already.includes(m));
          if (milestone === undefined) continue;

          // Fetch club + admin recipients
          const { data: club } = await supabaseAdmin
            .from("clubs")
            .select("id, name")
            .eq("id", sub.club_id)
            .single();
          if (!club) continue;

          const { data: admins } = await supabaseAdmin
            .from("club_members")
            .select("user_id")
            .eq("club_id", sub.club_id)
            .in("role", ["admin", "dirigeant"]);

          const userIds = (admins ?? []).map((a: any) => a.user_id);
          if (userIds.length === 0) continue;

          // Get emails via auth admin
          const recipients: { email: string; firstName?: string }[] = [];
          for (const uid of userIds) {
            const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
            const email = u?.user?.email;
            if (!email) continue;
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("first_name")
              .eq("id", uid)
              .maybeSingle();
            recipients.push({ email, firstName: profile?.first_name ?? undefined });
          }

          const billingUrl = "https://www.clubero.app/admin/billing";
          const trialEndDate = formatFrDate(trialEnd);

          for (const r of recipients) {
            try {
              await enqueueTransactionalEmailServer({
                templateName: "trial-reminder",
                recipientEmail: r.email,
                idempotencyKey: `trial-reminder:${sub.id}:${milestone}:${r.email}`,
                templateData: {
                  recipientFirstName: r.firstName,
                  clubName: club.name,
                  daysRemaining: milestone,
                  trialEndDate,
                  billingUrl,
                },
              });
              sent++;
            } catch (e) {
              console.error("[trial-reminders] enqueue failed", e);
            }
          }

          // Mark milestone as sent
          await supabaseAdmin
            .from("subscriptions")
            .update({ trial_reminders_sent: [...already, milestone] })
            .eq("id", sub.id);
        }

        return new Response(JSON.stringify({ processed, sent }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
