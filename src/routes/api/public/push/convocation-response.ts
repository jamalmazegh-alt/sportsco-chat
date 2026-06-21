/**
 * Public endpoint called by the email-response page (`/r/$token`) to fan
 * out push notifications after a player/parent responds via token link.
 *
 * Token-protected: caller must provide the convocation's `response_token`.
 * Runs the same fan-out helpers as the authenticated dispatcher.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const InputSchema = z.object({
  token: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/push/convocation-response")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid body", { status: 400 });
        }
        const parsed = InputSchema.safeParse(body);
        if (!parsed.success) {
          return new Response("Invalid input", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: conv } = await supabaseAdmin
          .from("convocations")
          .select("id, event_id, status, responded_at")
          .eq("response_token", parsed.data.token)
          .maybeSingle();

        if (!conv) {
          return new Response("Not found", { status: 404 });
        }
        // Only allow a push when the response is fresh (last 5 min) to bound abuse
        const respondedAt = (conv as any).responded_at as string | null;
        if (!respondedAt || Date.now() - new Date(respondedAt).getTime() > 5 * 60 * 1000) {
          return Response.json({ skipped: "stale" });
        }

        const { fanoutConvocationResponse, fanoutConvocationComplete } = await import(
          "@/lib/push-fanout.server"
        );
        const r1 = await fanoutConvocationResponse((conv as any).id as string);
        const r2 = r1.eventId ? await fanoutConvocationComplete(r1.eventId) : { dispatched: 0 };

        return Response.json({ response: r1.dispatched, complete: r2.dispatched });
      },
    },
  },
});
