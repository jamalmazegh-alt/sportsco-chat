/**
 * Cron hook — push reminder ~30 min before a tournament match kicks off.
 * Schedule via pg_cron every 10 min. Tag dedup is handled by the
 * `reminders` table-style guard: we use a `details->>'push_30min_sent'`
 * flag stored on the match itself.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyCronSecret } from "@/lib/cron-secret.server";
import { fanoutTournamentMatchReminder } from "@/lib/push-fanout.server";

const WINDOW_MIN = 30;
const TOLERANCE_MIN = 15; // cron runs every 10 min, slightly wider window

export const Route = createFileRoute("/api/public/hooks/tournament-match-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = verifyCronSecret(request, {
          primaryEnv: "TOURNAMENT_MATCH_REMINDERS_SECRET",
          legacyEnv: "EVENT_REMINDERS_SECRET",
          headerNames: ["x-tournament-match-reminders-secret", "x-event-reminders-secret", "x-cron-secret"],
        });
        if (!auth.ok) {
          return new Response(auth.status === 503 ? "Not configured" : "Forbidden", {
            status: auth.status,
          });
        }

        const now = Date.now();
        const winStart = new Date(now + (WINDOW_MIN - TOLERANCE_MIN) * 60 * 1000).toISOString();
        const winEnd = new Date(now + (WINDOW_MIN + TOLERANCE_MIN) * 60 * 1000).toISOString();

        const { data: matches, error } = await supabaseAdmin
          .from("tournament_matches")
          .select("id, scheduled_at, team_a_id, team_b_id, details, status")
          .gte("scheduled_at", winStart)
          .lte("scheduled_at", winEnd)
          .in("status", ["scheduled", "live"]);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        let processed = 0;
        let dispatched = 0;

        for (const m of (matches ?? []) as any[]) {
          if (!m.team_a_id || !m.team_b_id) continue;
          const details = (m.details ?? {}) as Record<string, unknown>;
          if (details.push_30min_sent === true) continue;

          try {
            const r = await fanoutTournamentMatchReminder(m.id);
            dispatched += r.dispatched;
            await supabaseAdmin
              .from("tournament_matches")
              .update({ details: { ...details, push_30min_sent: true } })
              .eq("id", m.id);
            processed++;
          } catch (e) {
            console.warn("[tournament-match-reminders] failed", m.id, (e as Error).message);
          }
        }

        return Response.json({ ok: true, processed, dispatched });
      },
    },
  },
});
