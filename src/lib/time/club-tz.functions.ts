import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({ clubId: z.string().uuid() });

/**
 * Vide le cache serveur du fuseau horaire d'un club après modification.
 * Best-effort : le cache est local à l'instance worker, le TTL (60 s) reste
 * le filet de sécurité pour les autres instances.
 */
export const invalidateClubTzCache = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_club_role", {
      _user_id: context.userId,
      _club_id: data.clubId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { invalidateClubTz } = await import("@/lib/time/club-tz.server");
    invalidateClubTz(data.clubId);
    return { ok: true };
  });
