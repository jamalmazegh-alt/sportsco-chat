import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-triggered worker that processes pending data export requests.
 * Auth: standard Supabase anon `apikey` header (set by pg_cron).
 */
export const Route = createFileRoute("/api/public/hooks/privacy-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") || request.headers.get("Authorization")?.replace("Bearer ", "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { processAllPendingExports } = await import("@/lib/privacy-worker.server");
        try {
          const result = await processAllPendingExports(10);
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
