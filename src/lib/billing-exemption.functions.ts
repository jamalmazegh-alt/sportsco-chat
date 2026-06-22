import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSuperAdmin } from "@/lib/authz.server";
import { createLogger } from "@/lib/logger.server";

const log = createLogger("billing-exemption");

const exemptReasonSchema = z.enum(["beta_club", "partner", "internal", "other"]);

async function logAudit(opts: {
  actor: string;
  action: string;
  clubId: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("superadmin_audit_logs").insert({
      actor_user_id: opts.actor,
      action: opts.action,
      target_type: "club",
      target_id: opts.clubId,
      club_id: opts.clubId,
      metadata: (opts.metadata ?? null) as never,
    });
  } catch (err) {
    log.error("audit_log_failed", { err });
  }
}

export const grantBillingExemption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        reason: exemptReasonSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("id, name")
      .eq("id", data.clubId)
      .maybeSingle();
    if (!club) throw new Error("Club introuvable");

    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("status, exempt_from_billing")
      .eq("club_id", data.clubId)
      .maybeSingle();

    if (existing?.exempt_from_billing === true) {
      return { ok: true, alreadyExempt: true };
    }

    const now = new Date().toISOString();
    await supabaseAdmin.from("subscriptions").upsert(
      {
        club_id: data.clubId,
        exempt_from_billing: true,
        exempt_reason: data.reason,
        exempt_granted_at: now,
        exempt_granted_by: context.userId,
        status: existing?.status ?? "canceled",
      },
      { onConflict: "club_id" },
    );

    await logAudit({
      actor: context.userId,
      action: "billing_exemption_granted",
      clubId: data.clubId,
      metadata: { reason: data.reason, club_name: club.name },
    });

    return { ok: true, alreadyExempt: false };
  });

export const revokeBillingExemption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("exempt_from_billing")
      .eq("club_id", data.clubId)
      .maybeSingle();

    if (!existing?.exempt_from_billing) {
      return { ok: true, wasExempt: false };
    }

    await supabaseAdmin
      .from("subscriptions")
      .update({
        exempt_from_billing: false,
        exempt_reason: null,
        exempt_granted_at: null,
        exempt_granted_by: null,
      })
      .eq("club_id", data.clubId);

    await logAudit({
      actor: context.userId,
      action: "billing_exemption_revoked",
      clubId: data.clubId,
    });

    return { ok: true, wasExempt: true };
  });
