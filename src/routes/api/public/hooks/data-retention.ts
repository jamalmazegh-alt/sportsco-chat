/**
 * GDPR data retention cleanup (audit point #11).
 *
 * Enforces the per-table TTLs documented in `docs/privacy/retention.md`.
 * Public endpoint — secured by a shared header secret (DATA_RETENTION_SECRET)
 * checked at runtime. Called by pg_cron daily.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type CleanupResult = { table: string; deleted: number; error?: string };

async function deleteOlderThan(
  table: string,
  column: string,
  intervalDays: number,
  extra?: { column: string; value: unknown },
): Promise<CleanupResult> {
  const cutoff = new Date(Date.now() - intervalDays * 24 * 3600 * 1000).toISOString();
  let q = supabaseAdmin.from(table as any).delete({ count: "exact" }).lt(column, cutoff);
  if (extra) q = q.eq(extra.column, extra.value);
  const { count, error } = await q;
  if (error) return { table, deleted: 0, error: error.message };
  return { table, deleted: count ?? 0 };
}

export const Route = createFileRoute("/api/public/hooks/data-retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.DATA_RETENTION_SECRET;
        if (!secret) {
          return new Response("Not configured", { status: 503 });
        }
        const provided = request.headers.get("x-retention-secret");
        if (provided !== secret) {
          return new Response("Forbidden", { status: 403 });
        }

        const results: CleanupResult[] = [];

        // ---- TTLs (must match docs/privacy/retention.md) ----------------------
        // audit_logs / superadmin_audit_logs : 12 months
        results.push(await deleteOlderThan("audit_logs", "created_at", 365));
        results.push(await deleteOlderThan("superadmin_audit_logs", "created_at", 365));

        // email_send_log : 90 days (transactional accountability window)
        results.push(await deleteOlderThan("email_send_log", "created_at", 90));

        // notifications : 180 days (after read or creation, whichever is later — use created_at)
        results.push(await deleteOlderThan("notifications", "created_at", 180));

        // event_messages : 24 months
        results.push(await deleteOlderThan("event_messages", "created_at", 730));

        // verification_codes : delete expired + consumed > 1 day
        results.push(await deleteOlderThan("verification_codes", "expires_at", 1));

        // data_export_requests fulfilled : 30 days after fulfilment
        {
          const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
          const { count, error } = await supabaseAdmin
            .from("data_export_requests")
            .delete({ count: "exact" })
            .eq("status", "fulfilled")
            .lt("fulfilled_at", cutoff);
          results.push({
            table: "data_export_requests",
            deleted: count ?? 0,
            error: error?.message,
          });
        }

        // account_deletion_requests completed : keep 30 days post-completion
        {
          const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
          const { count, error } = await supabaseAdmin
            .from("account_deletion_requests")
            .delete({ count: "exact" })
            .eq("status", "completed")
            .lt("completed_at", cutoff);
          results.push({
            table: "account_deletion_requests",
            deleted: count ?? 0,
            error: error?.message,
          });
        }

        // reminders past their target : 30 days
        results.push(await deleteOlderThan("reminders", "created_at", 30));

        return Response.json({
          ok: true,
          ran_at: new Date().toISOString(),
          results,
        });
      },
    },
  },
});
