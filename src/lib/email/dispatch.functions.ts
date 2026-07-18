/**
 * Create an `email_dispatches` row for an email campaign.
 *
 * A single dispatch_id groups every email that belongs to the same
 * campaign (one initial send, one manual resend, one DLQ replay).
 *
 *  - Initial send      → dispatch_type = 'initial'      (created ONCE before the loop)
 *  - Manual resend     → dispatch_type = 'manual_resend' (NEW dispatch each time)
 *  - Queue retry       → same dispatch_id as the original send (queue processor keeps it)
 *  - DLQ replay        → same dispatch_id as the DLQ rows (see replay-dlq)
 *
 * Combined with the DB unique index
 * `email_send_log_dispatch_recipient_success` on
 * (dispatch_id, recipient_id, notification_type) filtered on
 * status IN ('sent','delivered'), this guarantees at-most-once delivery
 * per (campaign × recipient × notification_type).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  eventId: z.string().uuid().nullable().optional(),
  templateName: z.string().min(1).max(100),
  dispatchType: z.enum(["initial", "manual_resend"]),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const createEmailDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    // Authorization — the caller must be able to reach the event as a coach
    // on its team OR admin/owner on its club. If no eventId (rare — global
    // notifications), we still let signed-in users create a dispatch since
    // the actual email routing is scope-checked at /lovable/email/... send.
    if (data.eventId) {
      const { data: ev } = await context.supabase
        .from("events")
        .select("id, team_id, teams:team_id(club_id)")
        .eq("id", data.eventId)
        .maybeSingle();
      if (!ev) throw new Response("Event not found", { status: 404 });

      let authorized = false;
      const teamId = (ev as any).team_id as string | null;
      const clubId = ((ev as any).teams?.club_id as string | null) ?? null;
      if (teamId) {
        const { data: tm } = await context.supabase
          .from("team_members")
          .select("role")
          .eq("team_id", teamId)
          .eq("user_id", context.userId)
          .maybeSingle();
        const role = (tm as any)?.role as string | undefined;
        if (role === "coach" || role === "assistant_coach") authorized = true;
      }
      if (!authorized && clubId) {
        const { data: cm } = await context.supabase
          .from("club_members")
          .select("role")
          .eq("club_id", clubId)
          .eq("user_id", context.userId)
          .maybeSingle();
        const crole = (cm as any)?.role as string | undefined;
        if (crole === "admin" || crole === "owner" || crole === "dirigeant") authorized = true;
      }
      if (!authorized) throw new Response("Forbidden", { status: 403 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const dispatchId = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("email_dispatches").insert({
      id: dispatchId,
      event_id: data.eventId ?? null,
      template_name: data.templateName,
      dispatch_type: data.dispatchType,
      created_by: context.userId,
      metadata: data.metadata ?? {},
    });
    if (error) {
      console.error("[createEmailDispatch] insert failed", error);
      throw new Response("Failed to create dispatch", { status: 500 });
    }
    return { dispatchId };
  });
