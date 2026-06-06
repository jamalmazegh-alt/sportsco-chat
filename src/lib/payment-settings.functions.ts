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
  throw new Error("Only club admins or financial admins can manage settings");
}

export const getPaymentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clubId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Any club member can read
    const { data: settings, error } = await context.supabase
      .from("club_payment_settings")
      .select("*")
      .eq("club_id", data.clubId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      settings: settings ?? {
        club_id: data.clubId,
        currency: "eur",
        platform_fee_bps: 0,
        min_partial_amount_cents: 500,
        helloasso_enabled: false,
        helloasso_membership_url: null,
        helloasso_fundraising_url: null,
        helloasso_shop_url: null,
        helloasso_tournament_url: null,
      },
    };
  });

const SettingsInput = z.object({
  currency: z.string().length(3).optional(),
  min_partial_amount_cents: z.number().int().min(0).max(100_000).optional(),
  helloasso_enabled: z.boolean().optional(),
  helloasso_membership_url: z.string().url().nullable().optional(),
  helloasso_fundraising_url: z.string().url().nullable().optional(),
  helloasso_shop_url: z.string().url().nullable().optional(),
  helloasso_tournament_url: z.string().url().nullable().optional(),
});

export const updatePaymentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ clubId: z.string().uuid(), patch: SettingsInput })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubAdmin(context.supabase, context.userId, data.clubId);
    const { error } = await supabaseAdmin
      .from("club_payment_settings")
      .upsert(
        { club_id: data.clubId, ...data.patch },
        { onConflict: "club_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
