/**
 * POST /api/public/build-clubero/start
 * NOTE: no LLM/system prompt lives in this route (pure RPC-driven wizard
 * form); feature-context injection is not applicable here.
 * Rate-limit IP réel (CF-Connecting-IP prioritaire) puis appel RPC
 * start_build_clubero_response en service_role. Voir prompt de durcissement.
 */
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";

const LIMIT_START_PER_HOUR = 30;

const StartSchema = z.object({
  session_id: z.string().min(8).max(80),
  locale: z.string().min(2).max(8).optional(),
  utm: z.record(z.string(), z.string()).nullable().optional(),
  device: z.enum(["mobile", "desktop"]).nullable().optional(),
});

export const Route = createFileRoute("/api/public/build-clubero/start")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: z.infer<typeof StartSchema>;
        try {
          body = StartSchema.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ error: "bad_request" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          });
        }

        const ip = getClientIp(request);
        const effectiveLimit =
          ip === "unknown"
            ? Math.max(3, Math.floor(LIMIT_START_PER_HOUR / 10))
            : LIMIT_START_PER_HOUR;
        const allowed = await checkRateLimit(
          `build_clubero:start:${ip}`,
          "build_clubero_start",
          effectiveLimit,
        );
        if (!allowed) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc(
            "start_build_clubero_response" as never,
            {
              p_session_id: body.session_id,
              p_locale: body.locale ?? "fr",
              p_utm: (body.utm ?? null) as never,
              p_device: body.device ?? null,
            } as never,
          );
          if (error) {
            console.warn("[build-clubero/start] rpc failed", error.message);
            return new Response(JSON.stringify({ error: "server_error" }), {
              status: 500,
              headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            });
          }
          return new Response(JSON.stringify({ response_id: data }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        } catch (err) {
          console.error("[build-clubero/start] failed:", err);
          return new Response(JSON.stringify({ error: "server_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
