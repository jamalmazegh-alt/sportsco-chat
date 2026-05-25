import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const PlayerSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  jersey_number: z.union([z.number().int().min(0).max(999), z.string()]).nullable().optional(),
  position: z.string().trim().max(40).nullable().optional(),
  is_captain: z.boolean().optional(),
});

const TokenSchema = z.string().uuid();

function getSupabase() {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export const Route = createFileRoute("/api/public/tournament-roster")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = getSupabase();
        if (!supabase) return Response.json({ error: "Server misconfigured" }, { status: 500 });
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const parsed = TokenSchema.safeParse(token);
        if (!parsed.success) return Response.json({ error: "Invalid token" }, { status: 400 });

        const { data, error } = await supabase.rpc("get_registration_by_roster_token", {
          _token: parsed.data,
        });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!data) return Response.json({ error: "Not found" }, { status: 404 });
        return Response.json({ registration: data });
      },
      POST: async ({ request }: { request: Request }) => {
        const supabase = getSupabase();
        if (!supabase) return Response.json({ error: "Server misconfigured" }, { status: 500 });
        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid body" }, { status: 400 });
        }
        const Body = z.object({
          token: TokenSchema,
          players: z.array(PlayerSchema).max(40),
        });
        const parsed = Body.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
        }
        const normalized = parsed.data.players.map((p) => ({
          first_name: p.first_name,
          last_name: p.last_name,
          jersey_number:
            typeof p.jersey_number === "number"
              ? p.jersey_number
              : typeof p.jersey_number === "string" && p.jersey_number.trim() !== ""
                ? Number(p.jersey_number)
                : null,
          position: p.position ?? null,
          is_captain: !!p.is_captain,
        }));

        const { data, error } = await supabase.rpc("save_roster_via_token", {
          _token: parsed.data.token,
          _players: normalized as any,
        });
        if (error) {
          const msg = error.message || "Failed";
          const status = msg.includes("registration_not_approved")
            ? 403
            : msg.includes("invalid_token")
              ? 404
              : 400;
          return Response.json({ error: msg }, { status });
        }
        return Response.json({ success: true, result: data });
      },
    },
  },
});
