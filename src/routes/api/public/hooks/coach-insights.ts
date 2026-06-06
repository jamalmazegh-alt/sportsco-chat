import { createFileRoute } from "@tanstack/react-router";
import { detectInsightsForAllActiveClubs } from "@/lib/insights.server";

export const Route = createFileRoute("/api/public/hooks/coach-insights")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Shared cron secret — required to prevent public abuse (AI token spend).
        const secret = process.env.DATA_RETENTION_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        const provided =
          request.headers.get("x-cron-secret") ||
          request.headers.get("x-retention-secret");
        if (provided !== secret) return new Response("Forbidden", { status: 403 });

        try {
          const res = await detectInsightsForAllActiveClubs();
          return new Response(JSON.stringify({ ok: true, ...res }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          console.error("[coach-insights] failed", e);
          return new Response(JSON.stringify({ ok: false, error: e?.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
