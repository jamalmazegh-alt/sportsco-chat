/**
 * Sprint 5 Feature 2 — Coach insights manual refresh.
 *
 * Limited to 1 call / 24h / coach. The cron continues to populate insights
 * automatically; this server fn lets a coach trigger a fresh detection pass
 * for the clubs they coach.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkLlmDailyLimit } from "./core.server";

const InputSchema = z.object({
  clubId: z.string().uuid(),
});

export const refreshCoachInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorise: user must be a member of the club with a coach-like role.
    const { data: membership } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", data.clubId)
      .eq("user_id", userId)
      .maybeSingle();
    const role = membership?.role ?? null;
    const allowedRoles = new Set(["coach", "admin", "owner", "manager"]);
    if (!role || !allowedRoles.has(role)) {
      return { ok: false as const, reason: "forbidden" as const };
    }

    // 1 call / 24h / coach (bucket = userId+clubId so distinct clubs don't share quota)
    const bucketId = `${userId}:${data.clubId}`;
    const allowed = await checkLlmDailyLimit(bucketId, "coach_insights_refresh", 1);
    if (!allowed) {
      return { ok: false as const, reason: "rate_limited" as const };
    }

    // Run detection on demand
    const { detectAndGenerateInsightsForClub } = await import("@/lib/insights.server");
    try {
      const res = await detectAndGenerateInsightsForClub(data.clubId);
      return { ok: true as const, ...res };
    } catch {
      return { ok: false as const, reason: "error" as const };
    }
  });
