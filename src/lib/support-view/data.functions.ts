import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ReadSupportViewInput } from "@/lib/support-view/schemas";

async function assertSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

/**
 * Enforces server-side session validation (expiration, ownership, not-ended)
 * on EVERY read via loadValidatedSession. The client-side banner timer is
 * confort UX only — a sleeping tab that never fires is caught here.
 */
export const getSupportViewContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReadSupportViewInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { loadValidatedSession, supportDataService, logSupportAction } =
      await import("@/lib/support-view/service.server");
    const session = await loadValidatedSession(context.supabase, context.userId, data.session_id);
    const summary = await supportDataService.getContextSummary(session);
    await logSupportAction(context.supabase, session.id, "read.context");
    return summary;
  });

export const getSupportViewEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReadSupportViewInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { loadValidatedSession, supportDataService, logSupportAction } =
      await import("@/lib/support-view/service.server");
    const session = await loadValidatedSession(context.supabase, context.userId, data.session_id);
    const out = await supportDataService.listEvents(session);
    await logSupportAction(context.supabase, session.id, "read.events");
    return out;
  });

export const getSupportViewTeams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReadSupportViewInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { loadValidatedSession, supportDataService, logSupportAction } =
      await import("@/lib/support-view/service.server");
    const session = await loadValidatedSession(context.supabase, context.userId, data.session_id);
    const out = await supportDataService.listTeams(session);
    await logSupportAction(context.supabase, session.id, "read.teams");
    return out;
  });

export const getSupportViewPlayers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReadSupportViewInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { loadValidatedSession, supportDataService, logSupportAction } =
      await import("@/lib/support-view/service.server");
    const session = await loadValidatedSession(context.supabase, context.userId, data.session_id);
    const out = await supportDataService.listPlayers(session);
    await logSupportAction(context.supabase, session.id, "read.players");
    return out;
  });

export const getSupportViewPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReadSupportViewInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { loadValidatedSession, supportDataService, logSupportAction } =
      await import("@/lib/support-view/service.server");
    const session = await loadValidatedSession(context.supabase, context.userId, data.session_id);
    const out = await supportDataService.listPayments(session);
    await logSupportAction(context.supabase, session.id, "read.payments");
    return out;
  });

export const getSupportViewConvocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReadSupportViewInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { loadValidatedSession, supportDataService, logSupportAction } =
      await import("@/lib/support-view/service.server");
    const session = await loadValidatedSession(context.supabase, context.userId, data.session_id);
    const out = await supportDataService.listConvocations(session);
    await logSupportAction(context.supabase, session.id, "read.convocations");
    return out;
  });
