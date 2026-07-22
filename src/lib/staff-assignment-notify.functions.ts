import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as React from "react";
import { render } from "@react-email/components";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TEMPLATES } from "@/lib/email-templates/registry";

const Input = z.object({
  eventId: z.string().uuid(),
  userId: z.string().uuid(),
  action: z.enum(["assigned", "unassigned"]),
  origin: z.string().url().optional(),
});

/**
 * Sends an email to a user newly assigned to (or removed from) an event.
 * In-app notification and push are handled elsewhere. This mirrors
 * notifyCoachAssigned: skip-self, suppression, idempotent per (event,user,action).
 */
export const dispatchStaffAssignmentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId: actorId } = context;
    const { eventId, userId, action, origin } = data;

    if (actorId === userId) return { sent: false, reason: "self" as const };

    const stableMessageId = `staff-${action}-${eventId}-${userId}`;

    const { data: already } = await supabaseAdmin
      .from("email_send_log")
      .select("id")
      .eq("message_id", stableMessageId)
      .limit(1);
    if (already && already.length > 0) {
      return { sent: false, reason: "duplicate" as const };
    }

    const [{ data: ev }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("events")
        .select("id, title, starts_at, type, team_id, opponent, teams:team_id(name)")
        .eq("id", eventId)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("id, first_name, preferred_language")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    if (!ev) return { sent: false, reason: "no_event" as const };

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const recipientEmail = authUser?.user?.email;
    if (!recipientEmail) return { sent: false, reason: "no_email" as const };

    const { data: suppressed } = await supabaseAdmin
      .from("suppressed_emails")
      .select("email")
      .eq("email", recipientEmail.toLowerCase())
      .maybeSingle();
    if (suppressed) return { sent: false, reason: "suppressed" as const };

    const dt = new Date((ev as any).starts_at);
    const locale = (profile?.preferred_language ?? "fr").slice(0, 2).toLowerCase();
    const dateStr = dt.toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const timeStr = dt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

    const isMatch = (ev as any).type === "match";
    const teamName = ((ev as any).teams?.name as string | null) ?? undefined;
    const opponent = ((ev as any).opponent as string | null) ?? null;
    const eventLabel =
      isMatch && opponent
        ? `Match vs ${opponent}`
        : isMatch
          ? "Match"
          : ((ev as any).title as string) || "Événement";

    const templateData = {
      displayName: profile?.first_name ?? undefined,
      action,
      eventLabel,
      teamName,
      dateStr,
      timeStr,
      eventUrl: `${origin ?? "https://clubero.app"}/events/${eventId}`,
      locale,
    };

    const entry = TEMPLATES["event-staff-assignment"];
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
      label: `event-staff-${action}`,
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
      template_name: "event-staff-assignment",
      recipient_email: recipientEmail,
      status: "queued",
    });

    return { sent: true as const };
  });
