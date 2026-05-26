// Server functions for managing social connections from the admin settings UI.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NETWORK = z.enum(["instagram", "facebook", "twitter"]);

export const listSocialConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS already restricts to admins of the club; we just project safe columns.
    const { data: rows, error } = await supabase
      .from("club_social_connections")
      .select(
        "id, network, account_name, is_active, connected_at, last_synced_at, last_sync_error, token_expires_at",
      )
      .eq("club_id", data.clubId);
    if (error) throw new Error(error.message);
    return { connections: rows ?? [] };
  });

export const startSocialConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        network: NETWORK,
        origin: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Verify user is admin of the club
    const { data: member } = await supabase
      .from("club_members")
      .select("roles")
      .eq("club_id", data.clubId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member || !(member.roles ?? []).includes("admin")) {
      throw new Error("Forbidden");
    }

    const { encodeState, randomString, pkceChallenge } = await import(
      "@/lib/social/state.server"
    );
    const { getProvider } = await import("@/lib/social/providers.server");

    const redirectUri = `${data.origin}/api/public/social/callback`;
    const nonce = randomString(24);
    let codeVerifier: string | undefined;
    let url: string;

    if (data.network === "twitter") {
      codeVerifier = randomString(64);
      const challenge = await pkceChallenge(codeVerifier);
      const state = await encodeState({
        club_id: data.clubId,
        network: data.network,
        nonce,
        code_verifier: codeVerifier,
      });
      url = getProvider("twitter").getAuthUrl(state, redirectUri, challenge);
    } else {
      const state = await encodeState({
        club_id: data.clubId,
        network: data.network,
        nonce,
      });
      url = getProvider(data.network).getAuthUrl(state, redirectUri);
    }
    return { url };
  });

export const disconnectSocial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clubId: z.string().uuid(), network: NETWORK }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Soft-delete imported posts from this source
    const { error: e1 } = await supabase
      .from("wall_posts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("club_id", data.clubId)
      .eq("source", data.network);
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await supabase
      .from("club_social_connections")
      .delete()
      .eq("club_id", data.clubId)
      .eq("network", data.network);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const syncSocialNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clubId: z.string().uuid(), network: NETWORK }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase
      .from("club_members")
      .select("roles")
      .eq("club_id", data.clubId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member || !(member.roles ?? []).includes("admin")) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncConnection } = await import("@/lib/social/sync.server");
    const { data: conn, error } = await supabaseAdmin
      .from("club_social_connections")
      .select(
        "id, club_id, network, access_token, refresh_token, token_expires_at, account_id, is_active",
      )
      .eq("club_id", data.clubId)
      .eq("network", data.network)
      .maybeSingle();
    if (error || !conn) throw new Error(error?.message ?? "not_found");
    const result = await syncConnection(conn as Parameters<typeof syncConnection>[0]);
    return result;
  });
