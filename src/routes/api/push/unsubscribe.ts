import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  endpoint: z.string().url().max(2048).optional(),
  all_for_user: z.boolean().optional(),
});

export const Route = createFileRoute("/api/push/unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data: userData } = await sb.auth.getUser(token);
        if (!userData?.user) return new Response("Unauthorized", { status: 401 });

        let parsed;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        if (!parsed.endpoint && !parsed.all_for_user) {
          return new Response("Bad request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let q = supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userData.user.id);
        if (parsed.endpoint) q = q.eq("endpoint", parsed.endpoint);
        await q;
        return Response.json({ ok: true });
      },
    },
  },
});
