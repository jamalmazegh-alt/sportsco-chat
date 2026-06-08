import { createFileRoute } from "@tanstack/react-router";
import { detectInsightsForAllActiveClubs } from "@/lib/insights.server";
import { verifyCronSecret } from "@/lib/cron-secret.server";

export const Route = createFileRoute("/api/public/hooks/coach-insights")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = verifyCronSecret(request, {
          primaryEnv: "COACH_INSIGHTS_SECRET",
          legacyEnv: "DATA_RETENTION_SECRET",
          headerNames: ["x-coach-insights-secret", "x-cron-secret"],
        });
        if (!auth.ok) {
          return new Response(auth.status === 503 ? "Not configured" : "Forbidden", {
            status: auth.status,
          });
        }

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
