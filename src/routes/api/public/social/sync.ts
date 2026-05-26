// Cron-triggered: sync ALL active social connections.
// Protected by shared secret header `x-cron-secret`.
import { createFileRoute } from "@tanstack/react-router";
import { syncAll } from "@/lib/social/sync.server";

export const Route = createFileRoute("/api/public/social/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SOCIAL_SYNC_SECRET ?? process.env.DATA_RETENTION_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        const provided =
          request.headers.get("x-cron-secret") ?? request.headers.get("x-social-sync-secret");
        if (provided !== secret) return new Response("Forbidden", { status: 403 });
        try {
          const result = await syncAll();
          return Response.json(result);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "unknown";
          return new Response(JSON.stringify({ error: msg }), { status: 500 });
        }
      },
    },
  },
});
