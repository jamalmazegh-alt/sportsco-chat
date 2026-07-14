import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * Resolve emails for a list of parent (or player) auth user IDs, so we can
 * fall back to the auth email when `player_parents.email` is empty.
 *
 * Auth: caller must be signed in. We rely on RLS on downstream tables to
 * ensure the caller is legitimately handling these players; this fn only
 * returns bare email addresses keyed by user_id, no PII beyond email.
 */
export const resolveParentEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const out: Record<string, string> = {};
    // getUserById is one call per user — acceptable for the small batches used
    // when sending convocations (typically <30 recipients).
    await Promise.all(
      data.userIds.map(async (uid) => {
        try {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
          const email = u?.user?.email;
          if (email) out[uid] = email;
        } catch {
          // best-effort: skip missing users
        }
      }),
    );
    return { emails: out };
  });
