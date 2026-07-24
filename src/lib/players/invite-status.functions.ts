import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns per-parent-email delivery status for a given player, computed as
 * the LATEST row per message_id in email_send_log. Buckets:
 *  - sentEmails: latest status is 'sent' or 'pending'
 *  - failedEmails: latest status is 'failed', 'dlq', 'bounced', 'complained',
 *    or 'suppressed', with an optional error message.
 *
 * Access control: caller must be able to read the player's player_parents
 * rows under RLS. Unauthorized callers simply get empty lists.
 */
export const getParentInviteStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { playerId: string }) =>
    z.object({ playerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: parents, error } = await supabase
      .from("player_parents")
      .select("email")
      .eq("player_id", data.playerId);
    if (error || !parents) {
      return {
        sentEmails: [] as string[],
        failedEmails: [] as { email: string; error: string | null }[],
      };
    }

    const emails = Array.from(
      new Set(parents.map((p) => (p.email ?? "").trim().toLowerCase()).filter((e) => e.length > 0)),
    );
    if (emails.length === 0) {
      return {
        sentEmails: [] as string[],
        failedEmails: [] as { email: string; error: string | null }[],
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("email_send_log")
      .select("recipient_email, status, error_message, message_id, created_at")
      .eq("template_name", "player-invite")
      .in("recipient_email", emails)
      .order("created_at", { ascending: false });

    // Latest status per message_id
    const latestByMessage = new Map<
      string,
      { recipient_email: string; status: string; error_message: string | null }
    >();
    for (const r of rows ?? []) {
      const row = r as {
        recipient_email: string | null;
        status: string | null;
        error_message: string | null;
        message_id: string | null;
      };
      if (!row.message_id || !row.recipient_email || !row.status) continue;
      if (!latestByMessage.has(row.message_id)) {
        latestByMessage.set(row.message_id, {
          recipient_email: row.recipient_email,
          status: row.status,
          error_message: row.error_message,
        });
      }
    }

    // Per-email: track the most recent event and whether ANY successful send exists
    const sent = new Set<string>();
    const failed = new Map<string, string | null>();
    const latestPerEmail = new Map<string, { status: string; error: string | null; ts: number }>();

    // Rebuild ordered by created_at desc — rows already ordered desc from query
    for (const r of rows ?? []) {
      const row = r as {
        recipient_email: string | null;
        status: string | null;
        error_message: string | null;
        message_id: string | null;
        created_at: string | null;
      };
      if (!row.recipient_email || !row.status) continue;
      const email = row.recipient_email.toLowerCase();
      const ts = row.created_at ? new Date(row.created_at).getTime() : 0;
      if (!latestPerEmail.has(email)) {
        latestPerEmail.set(email, { status: row.status, error: row.error_message, ts });
      }
    }

    const SUCCESS = new Set(["sent", "pending"]);
    const FAILURE = new Set(["failed", "dlq", "bounced", "complained", "suppressed"]);

    for (const [email, entry] of latestPerEmail) {
      if (SUCCESS.has(entry.status)) {
        sent.add(email);
      } else if (FAILURE.has(entry.status)) {
        failed.set(email, entry.error);
      }
    }

    return {
      sentEmails: Array.from(sent),
      failedEmails: Array.from(failed.entries()).map(([email, error]) => ({ email, error })),
    };
  });
