/**
 * POST /api/public/build-clubero/complete
 * Finalise via complete_build_clubero_response (service_role). Idempotent.
 * Rate-limit IP + validation contact (email valide si opt-in).
 */
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";
import { emailOk } from "@/lib/build-clubero-config";

const LIMIT_COMPLETE_PER_HOUR = 30;

const ContactSchema = z
  .object({
    first_name: z.string().max(80).nullable().optional(),
    last_name: z.string().max(80).nullable().optional(),
    email: z.string().max(255).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    club: z.string().max(120).nullable().optional(),
    newsletter: z.boolean().default(false),
    beta: z.boolean().default(false),
  })
  .nullable();


const CompleteSchema = z.object({
  session_id: z.string().min(8).max(80),
  contact: ContactSchema.optional(),
});

export const Route = createFileRoute("/api/public/build-clubero/complete")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: z.infer<typeof CompleteSchema>;
        try {
          body = CompleteSchema.parse(await request.json());
        } catch {
          return json({ error: "bad_request" }, 400);
        }

        const contact = body.contact ?? null;
        if (contact && (contact.newsletter || contact.beta)) {
          if (!contact.email || !emailOk(contact.email)) {
            return json({ error: "bad_request" }, 400);
          }
        }

        const ip = getClientIp(request);
        const effectiveLimit =
          ip === "unknown"
            ? Math.max(3, Math.floor(LIMIT_COMPLETE_PER_HOUR / 10))
            : LIMIT_COMPLETE_PER_HOUR;
        const allowed = await checkRateLimit(
          `build_clubero:complete:${ip}`,
          "build_clubero_complete",
          effectiveLimit,
        );
        if (!allowed) return json({ error: "rate_limited" }, 429);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.rpc(
            "complete_build_clubero_response" as never,
            {
              p_session_id: body.session_id,
              p_contact: (contact ?? null) as never,
            } as never,
          );
          if (error) {
            console.warn("[build-clubero/complete] rpc failed", error.message);
            return json({ error: "server_error" }, 500);
          }
          return json({ ok: true }, 200);
        } catch (err) {
          console.error("[build-clubero/complete] failed:", err);
          return json({ error: "server_error" }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
