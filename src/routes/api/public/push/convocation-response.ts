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
  token: z
    .string()
    .min(16)
    .max(128)
    .regex(/^[a-f0-9-]+$/i),
});

function tokenFromReferer(request: Request): string | null {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const [, route, rawToken] = url.pathname.split("/");
    return route === "r" && rawToken ? decodeURIComponent(rawToken) : null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/push/convocation-response")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text().catch(() => "");
        let body: unknown = null;
        if (rawBody.trim()) {
          try {
            body = JSON.parse(rawBody);
          } catch {
            body = rawBody.trim();
          }
        }
        const token =
          (typeof body === "string" ? body : null) ||
          ((body as { token?: unknown } | null)?.token as string | undefined) ||
          ((body as { response_token?: unknown } | null)?.response_token as string | undefined) ||
          ((body as { responseToken?: unknown } | null)?.responseToken as string | undefined) ||
          new URL(request.url).searchParams.get("token") ||
          tokenFromReferer(request);
        const parsed = InputSchema.safeParse({ token });
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

        const { fanoutConvocationResponse, fanoutConvocationComplete } =
          await import("@/lib/push-fanout.server");
        const r1 = await fanoutConvocationResponse((conv as any).id as string);
        const r2 = r1.eventId ? await fanoutConvocationComplete(r1.eventId) : { dispatched: 0 };

        return Response.json({ response: r1.dispatched, complete: r2.dispatched });
      },
    },
  },
});
