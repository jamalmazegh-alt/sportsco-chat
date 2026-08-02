import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ token: z.string().min(1).max(200) });

/**
 * Prévient le staff de l'équipe qu'un joueur vient de rejoindre via QR code,
 * afin qu'il valide la fiche. Best-effort et idempotent.
 */
export const notifyStaffOfQrJoin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { notifyTeamStaffOfQrJoin } = await import("@/lib/club-invite-notify.server");
    try {
      return await notifyTeamStaffOfQrJoin(data.token, context.userId);
    } catch (e) {
      console.error("[qr-join-notify] failed", e instanceof Error ? e.message : String(e));
      return { notified: 0, playerId: null };
    }
  });
