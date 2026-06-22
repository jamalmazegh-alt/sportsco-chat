import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sends a test Web Push notification to the calling super admin.
 * Returns per-subscription send results so the UI can show what happened.
 */
export const dispatchSuperadminTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push-send.server");

    // Guard — must be a super admin
    const { data: admin } = await supabaseAdmin
      .from("super_admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!admin) throw new Response("Forbidden", { status: 403 });

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, user_agent, created_at")
      .eq("user_id", context.userId);

    const subscriptions = (subs ?? []).map((s) => ({
      endpoint: (s as any).endpoint as string,
      host: safeHost((s as any).endpoint as string),
      user_agent: ((s as any).user_agent as string | null) ?? null,
      created_at: ((s as any).created_at as string | null) ?? null,
    }));

    if (subscriptions.length === 0) {
      console.warn("[push-test] no subscriptions for superadmin", context.userId);
      return {
        ok: false,
        reason: "no_subscriptions" as const,
        subscriptions: [],
        sent: 0,
        pruned: 0,
        userId: context.userId,
        at: new Date().toISOString(),
      };
    }

    const payload = {
      title: "🔔 Test push Clubero",
      body: `Test envoyé à ${new Date().toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}`,
      url: "/superadmin/settings",
      tag: `superadmin-test-${Date.now()}`,
    };

    console.log("[push-test] dispatching", {
      userId: context.userId,
      subscriptions: subscriptions.length,
    });

    const result = await sendPushToUser(context.userId, payload);

    console.log("[push-test] result", { ...result, userId: context.userId });

    return {
      ok: result.sent > 0,
      reason: result.sent > 0 ? ("sent" as const) : ("send_failed" as const),
      subscriptions,
      sent: result.sent,
      pruned: result.pruned,
      userId: context.userId,
      at: new Date().toISOString(),
    };
  });

function safeHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "unknown";
  }
}
