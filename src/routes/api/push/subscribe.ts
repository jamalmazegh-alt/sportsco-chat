import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Web Push (client PWA existant — `channel` absent pour compatibilité).
const WebBody = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(20).max(256),
  auth: z.string().min(10).max(256),
  user_agent: z.string().max(512).optional(),
  takeover: z.boolean().optional(),
});

// Push natif Capacitor : le token FCM/APNs est opaque (pas une URL). Il est
// stocké dans `endpoint` (clé UNIQUE → upsert), p256dh/auth n'existent pas.
const NativeBody = z.object({
  channel: z.enum(["fcm", "apns"]),
  token: z
    .string()
    .min(16)
    .max(4096)
    .regex(/^[A-Za-z0-9_:.-]+$/, "invalid token format"),
  user_agent: z.string().max(512).optional(),
  takeover: z.boolean().optional(),
});

type NormalizedSub = {
  channel: "web" | "fcm" | "apns";
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string;
  takeover?: boolean;
};

function parseBody(raw: unknown): NormalizedSub {
  const channel = (raw as { channel?: unknown })?.channel;
  if (channel === "fcm" || channel === "apns") {
    const b = NativeBody.parse(raw);
    return {
      channel: b.channel,
      endpoint: b.token,
      p256dh: "",
      auth: "",
      user_agent: b.user_agent,
      takeover: b.takeover,
    };
  }
  const b = WebBody.parse(raw);
  return { channel: "web", ...b };
}

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

        let parsed: NormalizedSub;
        try {
          parsed = parseBody(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: existing, error: existingError } = await supabaseAdmin
          .from("push_subscriptions")
          .select("user_id")
          .eq("endpoint", parsed.endpoint)
          .maybeSingle();
        if (existingError) {
          console.error("[push/subscribe] ownership check failed", existingError);
          return new Response("Server error", { status: 500 });
        }
        if (existing?.user_id && existing.user_id !== userId && parsed.takeover !== true) {
          return new Response("Subscription already belongs to another account", { status: 409 });
        }

        const base = {
          user_id: userId,
          endpoint: parsed.endpoint,
          p256dh: parsed.p256dh,
          auth: parsed.auth,
          user_agent: parsed.user_agent ?? null,
          updated_at: new Date().toISOString(),
        };

        let { error } = await supabaseAdmin
          .from("push_subscriptions")
          .upsert({ ...base, channel: parsed.channel }, { onConflict: "endpoint" });

        // La colonne `channel` peut ne pas encore exister (code déployé avant sa
        // migration) : PostgREST renvoie alors 42703 et l'upsert échoue. Pour une
        // souscription WEB, `channel` vaut de toute façon la valeur par défaut :
        // on réessaie sans elle plutôt que de renvoyer une 500 à un utilisateur
        // qui active simplement ses notifications.
        //
        // Pour un token NATIF, en revanche, on ne retente pas : l'enregistrer
        // sans son canal le ferait passer pour du Web Push et l'envoi partirait
        // sur le mauvais chemin. Mieux vaut échouer franchement.
        if (error?.code === "42703" && parsed.channel === "web") {
          console.warn("[push/subscribe] colonne `channel` absente — upsert sans elle");
          ({ error } = await supabaseAdmin
            .from("push_subscriptions")
            .upsert(base, { onConflict: "endpoint" }));
        }

        if (error) {
          console.error("[push/subscribe] upsert failed", error);
          return new Response("Server error", { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
