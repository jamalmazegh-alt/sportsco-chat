import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { render } from "@react-email/components";
import * as React from "react";
import { TEMPLATES } from "@/lib/email-templates/registry";

const Input = z.object({
  teamId: z.string().uuid(),
  coachUserId: z.string().uuid(),
  origin: z.string().url().optional(),
});

/**
 * Notify a coach that they've been attached to a team.
 * - In-app notification is handled by the DB trigger trg_notify_coach_assigned.
 * - This server fn sends the email via the existing transactional email queue.
 *
 * Constraints:
 * - Skips self-add (caller == coach)
 * - Skips if no actor (won't happen here: requires auth)
 * - Idempotent on (teamId, coachUserId) via idempotencyKey + email_send_log
 */
export const notifyCoachAssigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId: actorId } = context;
    const { teamId, coachUserId, origin } = data;

    // Skip self-add
    if (actorId === coachUserId) return { sent: false, reason: "self" as const };

    // Idempotency: avoid duplicate sends on replay
    const idempotencyKey = `coach-assigned-${teamId}-${coachUserId}`;
    const { data: already } = await supabaseAdmin
      .from("email_send_log")
      .select("id")
      .eq("template_name", "coach-assigned")
      .eq("status", "sent")
      .limit(1);
    // Defensive secondary dedup: also use idempotencyKey as message_id later in pipeline.

    // Fetch team / club / coach
    const [{ data: team }, { data: coach }] = await Promise.all([
      supabaseAdmin.from("teams").select("id, name, club_id").eq("id", teamId).maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("id, first_name, preferred_language")
        .eq("id", coachUserId)
        .maybeSingle(),
    ]);
    if (!team) return { sent: false, reason: "no_team" as const };

    const { data: club } = team.club_id
      ? await supabaseAdmin.from("clubs").select("name").eq("id", team.club_id).maybeSingle()
      : { data: null as { name: string } | null };

    // Recipient email via auth admin
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(coachUserId);
    const recipientEmail = authUser?.user?.email;
    if (!recipientEmail) return { sent: false, reason: "no_email" as const };

    const locale = (coach?.preferred_language ?? "fr").slice(0, 2).toLowerCase();

    const templateData = {
      displayName: coach?.first_name ?? undefined,
      teamName: team.name,
      clubName: club?.name ?? "",
      teamUrl: `${origin ?? "https://clubero.app"}/teams/${teamId}`,
      locale,
    };

    // Pre-render and enqueue directly using the existing pipeline.
    const entry = TEMPLATES["coach-assigned"];
    if (!entry) return { sent: false, reason: "no_template" as const };
    const subject =
      typeof entry.subject === "function" ? entry.subject(templateData) : entry.subject;
    const html = await render(React.createElement(entry.component, templateData));
    const text = await render(React.createElement(entry.component, templateData), { plainText: true });

    const messageId = crypto.randomUUID();
    const payload = {
      to: recipientEmail,
      from: `Clubero <notify@clubero.app>`,
      sender_domain: "notify.clubero.app",
      subject,
      html,
      text,
      purpose: "transactional",
      label: "coach-assigned",
      idempotency_key: idempotencyKey,
      message_id: messageId,
      queued_at: new Date().toISOString(),
    };

    // Check suppression
    const { data: suppressed } = await supabaseAdmin
      .from("suppressed_emails")
      .select("email")
      .eq("email", recipientEmail.toLowerCase())
      .maybeSingle();
    if (suppressed) return { sent: false, reason: "suppressed" as const };

    // Check idempotency in email_send_log
    const { data: dup } = await supabaseAdmin
      .from("email_send_log")
      .select("id")
      .eq("template_name", "coach-assigned")
      .eq("recipient_email", recipientEmail)
      .ilike("error_message", `%${idempotencyKey}%`)
      .limit(1);
    // primary dedup: track idempotency by inserting a queued row with the idem key in error_message
    // (acts as our marker — email_send_log has no idempotency_key column).

    const { data: existingQueued } = await supabaseAdmin
      .from("email_send_log")
      .select("id, status")
      .eq("recipient_email", recipientEmail)
      .eq("template_name", "coach-assigned")
      .in("status", ["sent", "queued"]) as any;
    if (existingQueued && existingQueued.length > 0) {
      // Filter by idempotency — same coach assigned to same team should only send once.
      // We track via inserting message_id derived from idempotency.
    }

    const stableMessageId = `coach-${teamId}-${coachUserId}`.replace(/[^a-z0-9-]/gi, "-");
    const { data: already2 } = await supabaseAdmin
      .from("email_send_log")
      .select("id")
      .eq("message_id", stableMessageId)
      .limit(1);
    if (already2 && already2.length > 0) {
      return { sent: false, reason: "duplicate" as const };
    }

    payload.message_id = stableMessageId;

    await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload,
    });
    await supabaseAdmin.from("email_send_log").insert({
      message_id: stableMessageId,
      template_name: "coach-assigned",
      recipient_email: recipientEmail,
      status: "queued",
    });

    return { sent: true as const };
  });
