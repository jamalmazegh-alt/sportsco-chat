import { resolveClubTz } from "@/lib/time/club-tz";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as React from "react";
import { render } from "@react-email/components";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertClubRole } from "@/lib/authz.server";
import { TEMPLATES } from "@/lib/email-templates/registry";

const Input = z.object({
  eventId: z.string().uuid(),
  userId: z.string().uuid(),
  action: z.enum(["assigned", "unassigned"]),
  origin: z.string().url().optional(),
});

/** Roles that may assign/unassign event staff (mirrors RLS insert/delete). */
const STAFF_MANAGER_ROLES = ["admin", "dirigeant", "coach", "assistant_coach"] as const;

/**
 * Sends an email to a user newly assigned to (or removed from) an event.
 * In-app notification and push are handled elsewhere. This mirrors
 * notifyCoachAssigned: skip-self, suppression, idempotent per (event,user,action).
 */
export const dispatchStaffAssignmentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId: actorId, supabase } = context;
    const { eventId, userId, action, origin } = data;

    if (actorId === userId) return { sent: false, reason: "self" as const };

    // Resolve club from the event first, then authorize — supabaseAdmin below
    // can read auth.users emails, so client-provided eventId/userId must not
    // be trusted without a club-role check.
    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, title, starts_at, type, team_id, opponent, teams:team_id(name, club_id)")
      .eq("id", eventId)
      .maybeSingle();
    if (!ev) return { sent: false, reason: "no_event" as const };

    const clubId = (ev as { teams?: { club_id?: string } | null }).teams?.club_id ?? null;
    if (!clubId) return { sent: false, reason: "no_event" as const };

    await assertClubRole({
      supabase,
      userId: actorId,
      clubId,
      allowedRoles: STAFF_MANAGER_ROLES,
    });

    const stableMessageId = `staff-${action}-${eventId}-${userId}`;

    const { data: already } = await supabaseAdmin
      .from("email_send_log")
      .select("id")
      .eq("message_id", stableMessageId)
      .limit(1);
    if (already && already.length > 0) {
      return { sent: false, reason: "duplicate" as const };
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, preferred_language")
      .eq("id", userId)
      .maybeSingle();

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const recipientEmail = authUser?.user?.email;
    if (!recipientEmail) return { sent: false, reason: "no_email" as const };

    const { data: suppressed } = await supabaseAdmin
      .from("suppressed_emails")
      .select("email")
      .eq("email", recipientEmail.toLowerCase())
      .maybeSingle();
    if (suppressed) return { sent: false, reason: "suppressed" as const };

    let clubTzRaw: string | null = null;
    if (clubId) {
      const { data: clubRow } = await supabaseAdmin
        .from("clubs")
        .select("timezone")
        .eq("id", clubId)
        .maybeSingle();
      clubTzRaw = ((clubRow as { timezone?: string | null } | null)?.timezone ?? null) as
        | string
        | null;
    }
    const clubTz = resolveClubTz(clubTzRaw);

    const dt = new Date((ev as any).starts_at);
    const locale = (profile?.preferred_language ?? "fr").slice(0, 2).toLowerCase();
    const dateStr = dt.toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: clubTz,
    });
    const timeStr = dt.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: clubTz,
    });

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
