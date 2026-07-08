/**
 * POST /api/public/build-clubero/save
 * Enregistre une réponse via save_build_clubero_answer (service_role).
 * Rate-limit IP, valide question_key ∈ config.
 */
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";
import { QUESTIONS } from "@/lib/build-clubero-config";

const LIMIT_SAVE_PER_HOUR = 300;

const KNOWN_KEYS = new Set(QUESTIONS.map((q) => q.key));
const KNOWN_TYPES = new Set([
  "single",
  "multi",
  "icon",
  "rating",
  "slider",
  "rank",
  "text",
] as const);

const SaveSchema = z.object({
  session_id: z.string().min(8).max(80),
  question_key: z.string().min(1).max(64),
  question_type: z.string().min(1).max(16),
  value: z.unknown(),
});

export const Route = createFileRoute("/api/public/build-clubero/save")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: z.infer<typeof SaveSchema>;
        try {
          body = SaveSchema.parse(await request.json());
        } catch {
          return json({ error: "bad_request" }, 400);
        }
        if (!KNOWN_KEYS.has(body.question_key)) return json({ error: "bad_request" }, 400);
        if (!KNOWN_TYPES.has(body.question_type as never))
          return json({ error: "bad_request" }, 400);

        const ip = getClientIp(request);
        const effectiveLimit =
          ip === "unknown" ? Math.max(10, Math.floor(LIMIT_SAVE_PER_HOUR / 10)) : LIMIT_SAVE_PER_HOUR;
        const allowed = await checkRateLimit(
          `build_clubero:save:${ip}`,
          "build_clubero_save",
          effectiveLimit,
        );
        if (!allowed) return json({ error: "rate_limited" }, 429);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.rpc("save_build_clubero_answer" as never, {
            p_session_id: body.session_id,
            p_question_key: body.question_key,
            p_question_type: body.question_type,
            p_value: (body.value ?? null) as never,
          } as never);
          if (error) {
            const msg = error.message ?? "";
            if (msg.includes("response_completed")) return json({ error: "response_completed" }, 409);
            if (msg.includes("answers_limit_exceeded"))
              return json({ error: "answers_limit_exceeded" }, 409);
            if (msg.includes("session_not_found")) return json({ error: "session_not_found" }, 404);
            console.warn("[build-clubero/save] rpc failed", msg);
            return json({ error: "server_error" }, 500);
          }
          return json({ ok: true }, 200);
        } catch (err) {
          console.error("[build-clubero/save] failed:", err);
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
