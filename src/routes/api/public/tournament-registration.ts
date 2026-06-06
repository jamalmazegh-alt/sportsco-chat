import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildCheckoutForRegistration } from "@/modules/tournaments/tournament-payments.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";

const Schema = z.object({
  tournament_slug: z.string().trim().min(1).max(120),
  team_name: z.string().trim().min(2).max(120),
  short_name: z.string().trim().max(20).optional().nullable(),
  contact_name: z.string().trim().min(2).max(120),
  contact_email: z.string().trim().email().max(255),
  contact_phone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const Route = createFileRoute("/api/public/tournament-registration")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const url =
          process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
          return Response.json({ error: "Server misconfigured" }, { status: 500 });
        }

        let parsed: z.infer<typeof Schema>;
        try {
          parsed = Schema.parse(await request.json());
        } catch (e: any) {
          return Response.json(
            { error: "Invalid input", details: e?.errors ?? null },
            { status: 400 },
          );
        }

        const supabase = createClient(url, key);

        const { data: tournament, error: tErr } = await supabase
          .from("tournaments")
          .select("id, name, status, settings, num_teams, slug, registration_fee, registration_currency, payment_mode")
          .eq("slug", parsed.tournament_slug)
          .maybeSingle();
        if (tErr) {
          return Response.json({ error: "Database error" }, { status: 500 });
        }
        if (!tournament) {
          return Response.json({ error: "Tournament not found" }, { status: 404 });
        }
        if (!["published", "in_progress"].includes(tournament.status)) {
          return Response.json(
            { error: "Tournament not open for registration" },
            { status: 400 },
          );
        }

        const reg = (tournament.settings as any)?.registration ?? {};
        if (!reg.enabled) {
          return Response.json(
            { error: "Registration not enabled" },
            { status: 400 },
          );
        }
        const parseLocalish = (s: string | null | undefined): number | null => {
          if (!s) return null;
          const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
          const t = new Date(hasTz ? s : `${s}Z`).getTime();
          return Number.isFinite(t) ? t : null;
        };
        const now = Date.now();
        const opensAt = parseLocalish(reg.opensAt);
        const closesAt = parseLocalish(reg.closesAt);
        if (opensAt !== null && opensAt > now) {
          return Response.json(
            { error: "Registration not yet open" },
            { status: 400 },
          );
        }
        if (closesAt !== null && closesAt < now) {
          return Response.json(
            { error: "Registration closed" },
            { status: 400 },
          );
        }

        // Capacity cap
        const capRaw =
          typeof reg.maxTeams === "number" && reg.maxTeams > 0
            ? reg.maxTeams
            : typeof tournament.num_teams === "number" && tournament.num_teams > 0
              ? tournament.num_teams
              : null;
        if (capRaw !== null) {
          const [{ count: approved }, { count: pending }] = await Promise.all([
            supabase
              .from("tournament_teams")
              .select("id", { count: "exact", head: true })
              .eq("tournament_id", tournament.id),
            supabase
              .from("tournament_registrations")
              .select("id", { count: "exact", head: true })
              .eq("tournament_id", tournament.id)
              .eq("status", "pending"),
          ]);
          if ((approved ?? 0) + (pending ?? 0) >= capRaw) {
            return Response.json(
              { error: "Registrations full" },
              { status: 400 },
            );
          }
        }

        const { data: row, error: insErr } = await supabase
          .from("tournament_registrations")
          .insert({
            tournament_id: tournament.id,
            team_name: parsed.team_name,
            short_name: parsed.short_name || null,
            contact_name: parsed.contact_name,
            contact_email: parsed.contact_email.toLowerCase(),
            contact_phone: parsed.contact_phone || null,
            notes: parsed.notes || null,
            players: [],
            status: reg.requiresApproval ? "pending" : "approved",
          })
          .select("id, status, roster_token")
          .single();
        if (insErr) {
          console.error("Registration insert failed", insErr);
          return Response.json({ error: "Failed to register" }, { status: 500 });
        }

        const origin = new URL(request.url).origin;
        const rosterUrl = `${origin}/tournament/${tournament.slug}/roster/${row.roster_token}`;

        // Auto-approval path: create team immediately
        if (!reg.requiresApproval) {
          const { data: team, error: teamErr } = await supabase
            .from("tournament_teams")
            .insert({
              tournament_id: tournament.id,
              name: parsed.team_name,
              short_name: parsed.short_name || null,
              contact_email: parsed.contact_email.toLowerCase(),
              contact_phone: parsed.contact_phone || null,
            })
            .select("id")
            .single();
          if (!teamErr && team) {
            await supabase
              .from("tournament_registrations")
              .update({
                tournament_team_id: team.id,
                decided_at: new Date().toISOString(),
              })
              .eq("id", row.id);
          }

          // Send roster link email
          try {
            await enqueueTransactionalEmailServer({
              templateName: "tournament-roster-link",
              recipientEmail: parsed.contact_email,
              templateData: {
                contactName: parsed.contact_name,
                tournamentName: tournament.name,
                teamName: parsed.team_name,
                rosterUrl,
                status: "approved",
              },
              idempotencyKey: `roster-link:${row.id}`,
            });
          } catch (e) {
            console.error("Failed to send roster email", e);
          }
        } else {
          // Pending approval: acknowledge with a roster link (active once approved)
          try {
            await enqueueTransactionalEmailServer({
              templateName: "tournament-roster-link",
              recipientEmail: parsed.contact_email,
              templateData: {
                contactName: parsed.contact_name,
                tournamentName: tournament.name,
                teamName: parsed.team_name,
                rosterUrl,
                status: "pending",
              },
              idempotencyKey: `roster-link-pending:${row.id}`,
            });
          } catch (e) {
            console.error("Failed to send pending email", e);
          }
        }

        // Online payment
        const fee = (tournament as any).registration_fee ?? 0;
        const mode = (tournament as any).payment_mode ?? "offline";
        let checkout_url: string | null = null;
        if (fee > 0 && (mode === "online" || mode === "both")) {
          try {
            const co = await buildCheckoutForRegistration({
              registrationId: row.id,
              origin,
            });
            checkout_url = co?.url ?? null;
          } catch (e) {
            console.error("Failed to build checkout for registration", e);
          }
        }

        return Response.json({
          success: true,
          registration_id: row.id,
          status: row.status,
          requires_approval: !!reg.requiresApproval,
          requires_payment: fee > 0 && mode !== "offline",
          checkout_url,
          roster_url: rosterUrl,
        });
      },
    },
  },
});
