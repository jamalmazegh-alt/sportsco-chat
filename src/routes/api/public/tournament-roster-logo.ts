import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const TokenSchema = z.string().uuid();

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 4 * 1024 * 1024;

function getAdmin() {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export const Route = createFileRoute("/api/public/tournament-roster-logo")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const supabase = getAdmin();
        if (!supabase) return Response.json({ error: "Server misconfigured" }, { status: 500 });

        const form = await request.formData().catch(() => null);
        if (!form) return Response.json({ error: "Invalid form" }, { status: 400 });
        const token = String(form.get("token") ?? "");
        const file = form.get("file");
        const parsed = TokenSchema.safeParse(token);
        if (!parsed.success) return Response.json({ error: "Invalid token" }, { status: 400 });
        if (!(file instanceof File))
          return Response.json({ error: "Missing file" }, { status: 400 });
        if (!ALLOWED.has(file.type))
          return Response.json({ error: "Unsupported file type" }, { status: 415 });
        if (file.size > MAX_BYTES)
          return Response.json({ error: "File too large (max 4MB)" }, { status: 413 });

        // Verify token + get tournament_team_id
        const { data: reg, error: regErr } = await supabase
          .from("tournament_registrations")
          .select("id, status, tournament_team_id")
          .eq("roster_token", parsed.data)
          .maybeSingle();
        if (regErr) return Response.json({ error: regErr.message }, { status: 500 });
        if (!reg) return Response.json({ error: "Invalid token" }, { status: 404 });
        if (reg.status !== "approved" || !reg.tournament_team_id) {
          return Response.json({ error: "registration_not_approved" }, { status: 403 });
        }

        const ext =
          file.type === "image/png" ? "png"
          : file.type === "image/webp" ? "webp"
          : "jpg";
        const path = `${reg.tournament_team_id}/roster-${Date.now()}.${ext}`;
        const buf = new Uint8Array(await file.arrayBuffer());

        const { error: upErr } = await supabase.storage
          .from("team-images")
          .upload(path, buf, { contentType: file.type, upsert: false, cacheControl: "3600" });
        if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

        const { data: pub } = supabase.storage.from("team-images").getPublicUrl(path);
        const logoUrl = pub.publicUrl;

        const { error: rpcErr } = await supabase.rpc("set_team_logo_via_token", {
          _token: parsed.data,
          _logo_url: logoUrl,
        });
        if (rpcErr) return Response.json({ error: rpcErr.message }, { status: 500 });

        return Response.json({ success: true, logo_url: logoUrl });
      },
      DELETE: async ({ request }: { request: Request }) => {
        const supabase = getAdmin();
        if (!supabase) return Response.json({ error: "Server misconfigured" }, { status: 500 });
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const parsed = TokenSchema.safeParse(token);
        if (!parsed.success) return Response.json({ error: "Invalid token" }, { status: 400 });
        const { error } = await supabase.rpc("set_team_logo_via_token", {
          _token: parsed.data,
          _logo_url: null,
        });
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ success: true });
      },
    },
  },
});
