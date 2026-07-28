import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertClubRole } from "@/lib/authz.server";

const ChannelsInput = z.object({
  clubId: z.string().uuid(),
  channels: z.array(z.enum(["email", "in_app"])).max(2),
});

/**
 * Met à jour `clubs.convocation_channels` et trace le changement dans
 * `audit_logs` (before/after). Passe par supabaseAdmin après contrôle de rôle
 * pour que les superadmins (support view / impersonation) puissent aussi
 * enregistrer — l'écriture directe côté client échouait sous RLS.
 */
export const updateConvocationChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ChannelsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin"],
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before, error: readErr } = await supabaseAdmin
      .from("clubs")
      .select("convocation_channels")
      .eq("id", data.clubId)
      .single();
    if (readErr) throw new Error(readErr.message);

    const { error } = await supabaseAdmin
      .from("clubs")
      .update({ convocation_channels: data.channels })
      .eq("id", data.clubId);
    if (error) throw new Error(error.message);

    try {
      await supabaseAdmin.from("audit_logs").insert({
        actor_user_id: context.userId,
        club_id: data.clubId,
        entity_type: "club_settings",
        entity_id: data.clubId,
        action: "convocation_channels.updated",
        changes: {
          field: "convocation_channels",
          before: before?.convocation_channels ?? null,
          after: data.channels,
        },
      });
    } catch (e) {
      console.error("audit_logs insert failed (swallowed)", e);
    }

    return { ok: true as const, channels: data.channels };
  });
