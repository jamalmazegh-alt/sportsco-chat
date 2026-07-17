import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns the set of parent emails (lowercased) for a given player that have
 * a recorded transactional-email attempt (status 'sent' or 'pending').
 *
 * Access control: the caller must already be able to read the player's
 * player_parents rows under RLS. We use the user-scoped Supabase client
 * from `requireSupabaseAuth` to list parent emails, so unauthorized callers
 * simply get an empty list. Only then do we consult email_send_log with
 * the admin client (service-role SELECT-only) to check delivery status.
 */
export const getParentInviteStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { playerId: string }) =>
    z.object({ playerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // 1. Emails the caller is allowed to see for this player (via RLS).
    const { data: parents, error } = await supabase
      .from("player_parents")
      .select("email")
      .eq("player_id", data.playerId);
    if (error || !parents) return { sentEmails: [] as string[] };

    const emails = Array.from(
      new Set(
        parents
          .map((p) => (p.email ?? "").trim().toLowerCase())
          .filter((e) => e.length > 0),
      ),
    );
    if (emails.length === 0) return { sentEmails: [] as string[] };

    // 2. Check the send log with service role (RLS restricts this table).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("email_send_log")
      .select("recipient_email, status")
      .in("recipient_email", emails)
      .in("status", ["sent", "pending"] as never);

    const sent = new Set<string>();
    for (const r of rows ?? []) {
      const addr = (r as { recipient_email?: string }).recipient_email;
      if (addr) sent.add(addr.toLowerCase());
    }
    return { sentEmails: Array.from(sent) };
  });
