import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(20).max(256),
  auth: z.string().min(10).max(256),
  user_agent: z.string().max(512).optional(),
});

export const Route = createFileRoute("/api/push/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userErr } = await sb.auth.getUser(token);
        if (userErr || !userData?.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        let parsed;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
          {
            user_id: userId,
            endpoint: parsed.endpoint,
            p256dh: parsed.p256dh,
            auth: parsed.auth,
            user_agent: parsed.user_agent ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" },
        );
        if (error) {
          console.error("[push/subscribe] upsert failed", error);
          return new Response("Server error", { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
