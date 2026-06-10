import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const EVENT_NAMES = [
  "banner_seen",
  "banner_clicked",
  "pricing_viewed",
  "trial_started",
  "club_activated",
  "payment_completed",
] as const;

const schema = z.object({
  event_name: z.enum(EVENT_NAMES),
  properties: z.record(z.string(), z.any()).default({}),
  session_id: z.string().max(120).optional(),
});

/**
 * Log a conversion-funnel event. Unauthenticated allowed (e.g. `pricing_viewed`
 * from a logged-out visitor). User id is derived from the bearer token when
 * present; otherwise stored as null.
 */
export const logConversionEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Best-effort: derive user_id from current Authorization header if any.
    let user_id: string | null = null;
    try {
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      const auth = getRequestHeader("authorization");
      if (auth?.startsWith("Bearer ")) {
        const token = auth.slice(7);
        const { data: u } = await supabaseAdmin.auth.getUser(token);
        user_id = u.user?.id ?? null;
      }
    } catch {
      // Ignore — tracking is best-effort.
    }
    await supabaseAdmin.from("conversion_events").insert({
      event_name: data.event_name,
      properties: data.properties ?? {},
      session_id: data.session_id ?? null,
      user_id,
    });
    return { ok: true };
  });
