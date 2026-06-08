import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureSuperAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden");
}

export const listPrivacyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [exp, del] = await Promise.all([
      supabaseAdmin
        .from("data_export_requests")
        .select("id, user_id, status, requested_at, completed_at, file_url, error, processed_by")
        .order("requested_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("account_deletion_requests")
        .select("id, user_id, status, requested_at, scheduled_for, processed_at, reason, approved_at, approved_by, error, hard_delete")
        .order("requested_at", { ascending: false })
        .limit(100),
    ]);
    // Resolve user emails
    const allIds = Array.from(new Set([
      ...(exp.data ?? []).map((r: any) => r.user_id),
      ...(del.data ?? []).map((r: any) => r.user_id),
    ]));
    const userMap = new Map<string, { email: string | null; name: string | null }>();
    if (allIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", allIds);
      for (const p of profs ?? []) {
        userMap.set(p.id, { email: null, name: [p.first_name, p.last_name].filter(Boolean).join(" ") || null });
      }
      for (const id of allIds) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        const cur = userMap.get(id) ?? { email: null, name: null };
        userMap.set(id, { ...cur, email: u?.user?.email ?? null });
      }
    }
    const enrich = (r: any) => ({ ...r, _user: userMap.get(r.user_id) ?? null });
    return {
      exports: (exp.data ?? []).map(enrich),
      deletions: (del.data ?? []).map(enrich),
    };
  });

export const retryExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.userId);
    const { processExportRequest } = await import("@/lib/privacy-worker.server");
    await processExportRequest(data.id, context.userId);
    return { ok: true };
  });

export const approveDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; hardDelete?: boolean }) =>
    z.object({ id: z.string().uuid(), hardDelete: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("account_deletion_requests")
      .update({
        approved_at: new Date().toISOString(),
        approved_by: context.userId,
        hard_delete: !!data.hardDelete,
      })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw error;
    const { processDeletionRequest } = await import("@/lib/privacy-worker.server");
    await processDeletionRequest(data.id, { processedBy: context.userId, hardDelete: !!data.hardDelete });
    return { ok: true };
  });

export const rejectDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("account_deletion_requests")
      .update({ status: "cancelled", processed_by: context.userId })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
