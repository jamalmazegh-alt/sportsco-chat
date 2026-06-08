// Cron-triggered: sync ALL active social connections.
// Protected by shared secret header `x-cron-secret`.
import { createFileRoute } from "@tanstack/react-router";
import { syncAll } from "@/lib/social/sync.server";
import { verifyCronSecret } from "@/lib/cron-secret.server";

export const Route = createFileRoute("/api/public/social/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = verifyCronSecret(request, {
          primaryEnv: "SOCIAL_SYNC_SECRET",
          legacyEnv: "DATA_RETENTION_SECRET",
          headerNames: ["x-social-sync-secret", "x-cron-secret"],
        });
        if (!auth.ok) {
          return new Response(auth.status === 503 ? "Not configured" : "Forbidden", {
            status: auth.status,
          });
        }
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
