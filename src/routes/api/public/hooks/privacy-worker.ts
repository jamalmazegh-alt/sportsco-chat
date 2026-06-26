import { createFileRoute } from "@tanstack/react-router";
import { verifyCronSecret } from "@/lib/cron-secret.server";

/**
 * Cron-triggered worker that processes pending data export requests.
 * Auth: dedicated shared secret (PRIVACY_WORKER_SECRET), NOT the public anon key.
 */
export const Route = createFileRoute("/api/public/hooks/privacy-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = verifyCronSecret(request, {
          primaryEnv: "PRIVACY_WORKER_SECRET",
          legacyEnv: "DATA_RETENTION_SECRET",
          headerNames: ["x-privacy-worker-secret", "x-cron-secret"],
        });
        if (!auth.ok) {
          return new Response(auth.status === 503 ? "Not configured" : "Forbidden", {
            status: auth.status,
          });
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
