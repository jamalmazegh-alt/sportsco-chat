import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertClubAdmin(
  supabase: SupabaseClient,
  userId: string,
  clubId: string,
): Promise<void> {
  const { data } = await supabase
    .from("club_members")
    .select("roles, role")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  const isAdmin =
    !!data &&
    ((data.roles ?? []).includes("admin") || data.role === "admin");
  if (isAdmin) return;
  const { data: isFin } = await supabaseAdmin.rpc("has_club_role_text", {
    _user_id: userId,
    _club_id: clubId,
    _role: "financial_admin",
  });
  if (isFin === true) return;
  throw new Error("Only club admins or financial admins can manage seasons");
}

const SeasonInput = z.object({
  label: z.string().min(1).max(50),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_current: z.boolean().optional(),
});

export const listSeasons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clubId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Any club member can read
    const { data: seasons, error } = await context.supabase
      .from("seasons")
      .select("id, label, start_date, end_date, is_current, created_at")
      .eq("club_id", data.clubId)
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    return { seasons: seasons ?? [] };
  });

export const createSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clubId: z.string().uuid(), season: SeasonInput }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubAdmin(context.supabase, context.userId, data.clubId);
    if (data.season.end_date < data.season.start_date) {
      throw new Error("End date must be after start date");
    }
    // If is_current, unset others first
    if (data.season.is_current) {
      await supabaseAdmin
        .from("seasons")
        .update({ is_current: false })
        .eq("club_id", data.clubId)
        .eq("is_current", true);
    }
    const { data: created, error } = await supabaseAdmin
      .from("seasons")
      .insert({ club_id: data.clubId, ...data.season })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const updateSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        seasonId: z.string().uuid(),
        season: SeasonInput.partial(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubAdmin(context.supabase, context.userId, data.clubId);
    if (data.season.is_current) {
      await supabaseAdmin
        .from("seasons")
        .update({ is_current: false })
        .eq("club_id", data.clubId)
        .eq("is_current", true)
        .neq("id", data.seasonId);
    }
    const { error } = await supabaseAdmin
      .from("seasons")
      .update(data.season)
      .eq("id", data.seasonId)
      .eq("club_id", data.clubId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCurrentSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ clubId: z.string().uuid(), seasonId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubAdmin(context.supabase, context.userId, data.clubId);
    await supabaseAdmin
      .from("seasons")
      .update({ is_current: false })
      .eq("club_id", data.clubId)
      .eq("is_current", true);
    const { error } = await supabaseAdmin
      .from("seasons")
      .update({ is_current: true })
      .eq("id", data.seasonId)
      .eq("club_id", data.clubId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ clubId: z.string().uuid(), seasonId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubAdmin(context.supabase, context.userId, data.clubId);
    const { error } = await supabaseAdmin
      .from("seasons")
      .delete()
      .eq("id", data.seasonId)
      .eq("club_id", data.clubId);
    if (error) {
      // Likely FK restrict (payment_items / fundraising_campaigns)
      throw new Error(
        "Cannot delete season: payment items or campaigns reference it.",
      );
    }
    return { ok: true };
  });
