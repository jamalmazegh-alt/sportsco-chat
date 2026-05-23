import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { detectAndGenerateInsightsForClub } from "@/lib/insights.server";

// Trigger detection for the active club (admins/coaches)
export const triggerInsightsDetection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clubId: string }) =>
    z.object({ clubId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Authorize: user must be admin/coach of the club
    const { data: membership } = await supabaseAdmin
      .from("club_members")
      .select("roles")
      .eq("club_id", data.clubId)
      .eq("user_id", userId)
      .maybeSingle();
    const roles: string[] = (membership?.roles as string[] | undefined) ?? [];
    if (
      !roles.includes("admin") &&
      !roles.includes("coach") &&
      !roles.includes("assistant_coach")
    ) {
      throw new Response("Forbidden", { status: 403 });
    }
    const result = await detectAndGenerateInsightsForClub(data.clubId);
    return { ok: true, ...result };
  });

// Dismiss an insight (adds the user to dismissed_by)
export const dismissInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { insightId: string }) =>
    z.object({ insightId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: row, error } = await supabaseAdmin
      .from("coach_insights")
      .select("id, club_id, dismissed_by")
      .eq("id", data.insightId)
      .maybeSingle();
    if (error || !row) throw new Response("Not found", { status: 404 });

    const { data: membership } = await supabaseAdmin
      .from("club_members")
      .select("roles")
      .eq("club_id", row.club_id)
      .eq("user_id", userId)
      .maybeSingle();
    const roles: string[] = (membership?.roles as string[] | undefined) ?? [];
    if (
      !roles.includes("admin") &&
      !roles.includes("coach") &&
      !roles.includes("assistant_coach")
    ) {
      throw new Response("Forbidden", { status: 403 });
    }

    const dismissed = new Set<string>(((row.dismissed_by as string[] | null) ?? []).map(String));
    dismissed.add(userId);
    const { error: upErr } = await supabaseAdmin
      .from("coach_insights")
      .update({ dismissed_by: Array.from(dismissed) })
      .eq("id", data.insightId);
    if (upErr) throw new Response(upErr.message, { status: 500 });
    return { ok: true };
  });
