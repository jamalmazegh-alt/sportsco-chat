import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildCheckoutForRegistration } from "@/modules/tournaments/tournament-payments.server";

// Public endpoint: lookup-by-id payment info + checkout creation for a
// payment link shared by the tournament organiser. The registration_id is
// a UUID and acts as the unguessable secret; we additionally require that
// a valid `payment_link` exists and is not expired before allowing payment.

const InfoQuery = z.object({
  id: z.string().uuid(),
});

const PostBody = z.object({
  id: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/tournament-payment-link")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = InfoQuery.safeParse({ id: url.searchParams.get("id") });
        if (!parsed.success) {
          return Response.json({ error: "Invalid id" }, { status: 400 });
        }
        const { data: reg } = await supabaseAdmin
          .from("tournament_registrations")
          .select(
            "id, tournament_id, team_name, payment_status, payment_link, payment_link_expires_at, amount_paid, currency",
          )
          .eq("id", parsed.data.id)
          .maybeSingle();
        if (!reg) return Response.json({ error: "Not found" }, { status: 404 });

        const { data: t } = await supabaseAdmin
          .from("tournaments")
          .select("id, name, slug, registration_fee, registration_currency, payment_mode")
          .eq("id", reg.tournament_id)
          .single();
        if (!t) return Response.json({ error: "Not found" }, { status: 404 });

        const expired =
          !reg.payment_link_expires_at ||
          new Date(reg.payment_link_expires_at).getTime() < Date.now();

        return Response.json({
          registration: {
            id: reg.id,
            team_name: reg.team_name,
            payment_status: reg.payment_status,
            link_expires_at: reg.payment_link_expires_at,
            link_present: !!reg.payment_link,
            link_expired: expired,
          },
          tournament: {
            name: t.name,
            slug: t.slug,
            registration_fee: t.registration_fee,
            registration_currency: t.registration_currency,
            payment_mode: t.payment_mode,
          },
        });
      },
      POST: async ({ request }) => {
        let parsed: z.infer<typeof PostBody>;
        try {
          parsed = PostBody.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid input" }, { status: 400 });
        }

        const { data: reg } = await supabaseAdmin
          .from("tournament_registrations")
          .select("id, payment_status, payment_link, payment_link_expires_at")
          .eq("id", parsed.id)
          .maybeSingle();
        if (!reg) return Response.json({ error: "Not found" }, { status: 404 });
        if (reg.payment_status !== "pending") {
          return Response.json({ error: "Not awaiting payment" }, { status: 400 });
        }
        if (
          !reg.payment_link ||
          !reg.payment_link_expires_at ||
          new Date(reg.payment_link_expires_at).getTime() < Date.now()
        ) {
          return Response.json({ error: "Payment link expired" }, { status: 410 });
        }

        const origin = new URL(request.url).origin;
        const result = await buildCheckoutForRegistration({
          registrationId: parsed.id,
          origin,
        });
        if (!result) {
          return Response.json({ error: "Checkout unavailable" }, { status: 400 });
        }
        return Response.json({ url: result.url });
      },
    },
  },
});
