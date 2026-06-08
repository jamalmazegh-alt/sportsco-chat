import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as React from "react";
import { render } from "@react-email/components";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TEMPLATES } from "@/lib/email-templates/registry";

const Input = z.object({
  teamId: z.string().uuid(),
  coachUserId: z.string().uuid(),
  origin: z.string().url().optional(),
});

/**
 * Sends an email to a coach freshly attached to a team.
 * In-app notification is handled by the DB trigger trg_notify_coach_assigned.
 *
 * Constraints:
 * - Skips self-add
 * - Skips if the coach is in the suppression list
 * - Idempotent: a stable message_id derived from (teamId, coachUserId)
 *   ensures the same email is never sent twice on replay.
 */
export const notifyCoachAssigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId: actorId } = context;
    const { teamId, coachUserId, origin } = data;

    if (actorId === coachUserId) return { sent: false, reason: "self" as const };

    const stableMessageId = `coach-${teamId}-${coachUserId}`;

    // Idempotency
    const { data: already } = await supabaseAdmin
      .from("email_send_log")
      .select("id")
      .eq("message_id", stableMessageId)
      .limit(1);
    if (already && already.length > 0) {
      return { sent: false, reason: "duplicate" as const };
    }

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

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(coachUserId);
    const recipientEmail = authUser?.user?.email;
    if (!recipientEmail) return { sent: false, reason: "no_email" as const };

    // Suppression check
    const { data: suppressed } = await supabaseAdmin
      .from("suppressed_emails")
      .select("email")
      .eq("email", recipientEmail.toLowerCase())
      .maybeSingle();
    if (suppressed) return { sent: false, reason: "suppressed" as const };

    const locale = (coach?.preferred_language ?? "fr").slice(0, 2).toLowerCase();
    const templateData = {
      displayName: coach?.first_name ?? undefined,
      teamName: team.name,
      clubName: club?.name ?? "",
      teamUrl: `${origin ?? "https://clubero.app"}/teams/${teamId}`,
      locale,
    };

    const entry = TEMPLATES["coach-assigned"];
    if (!entry) return { sent: false, reason: "no_template" as const };

    const subject =
      typeof entry.subject === "function" ? entry.subject(templateData) : entry.subject;
    const html = await render(React.createElement(entry.component, templateData));
    const text = await render(React.createElement(entry.component, templateData), {
      plainText: true,
    });

    const payload = {
      to: recipientEmail,
      from: "Clubero <notify@clubero.app>",
      sender_domain: "notify.clubero.app",
      subject,
      html,
      text,
      purpose: "transactional",
      label: "coach-assigned",
      idempotency_key: stableMessageId,
      message_id: stableMessageId,
      queued_at: new Date().toISOString(),
    };

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
