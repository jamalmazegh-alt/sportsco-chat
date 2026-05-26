// One-shot sync: pulls latest posts from a provider and inserts them as
// wall_posts with source != 'clubero'. Idempotent via the unique index on
// (club_id, source, external_id).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptToken, encryptToken } from "./crypto.server";
import { getProvider, type SocialNetwork } from "./providers.server";

type ConnRow = {
  id: string;
  club_id: string;
  network: SocialNetwork;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  account_id: string | null;
  is_active: boolean;
};

export async function syncConnection(conn: ConnRow): Promise<{
  imported: number;
  skipped: number;
  error?: string;
}> {
  if (!conn.is_active || !conn.account_id) {
    return { imported: 0, skipped: 0, error: "inactive_or_no_account" };
  }
  const provider = getProvider(conn.network);
  try {
    let accessToken = await decryptToken(conn.access_token);

    // Refresh token if it expires in less than 7 days (X only really uses this)
    const expSoon =
      conn.token_expires_at &&
      new Date(conn.token_expires_at).getTime() < Date.now() + 7 * 86400 * 1000;
    if (expSoon && conn.refresh_token && "refresh" in provider && provider.refresh) {
      const refresh = await decryptToken(conn.refresh_token);
      const refreshed = await provider.refresh(refresh);
      if (refreshed) {
        accessToken = refreshed.accessToken;
        await supabaseAdmin
          .from("club_social_connections")
          .update({
            access_token: await encryptToken(refreshed.accessToken),
            refresh_token: refreshed.refreshToken
              ? await encryptToken(refreshed.refreshToken)
              : conn.refresh_token,
            token_expires_at: refreshed.expiresAt,
          })
          .eq("id", conn.id);
      }
    }

    const posts = await provider.fetchRecentPosts(accessToken, conn.account_id);

    let imported = 0;
    let skipped = 0;
    for (const p of posts) {
      const { error } = await supabaseAdmin.from("wall_posts").insert({
        club_id: conn.club_id,
        author_user_id: null,
        body: p.body,
        attachments: [],
        is_pinned: false,
        source: conn.network,
        external_id: p.external_id,
        external_url: p.external_url,
        external_media_url: p.external_media_url,
        created_at: p.created_at,
      });
      if (error) {
        if (error.code === "23505") skipped++;
        else throw error;
      } else {
        imported++;
      }
    }

    await supabaseAdmin
      .from("club_social_connections")
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq("id", conn.id);

    return { imported, skipped };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    await supabaseAdmin
      .from("club_social_connections")
      .update({
        last_sync_error: message.slice(0, 500),
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", conn.id);
    return { imported: 0, skipped: 0, error: message };
  }
}

export async function syncAll(): Promise<{ total: number; results: unknown[] }> {
  const { data, error } = await supabaseAdmin
    .from("club_social_connections")
    .select(
      "id, club_id, network, access_token, refresh_token, token_expires_at, account_id, is_active",
    )
    .eq("is_active", true);
  if (error) throw error;
  const results: unknown[] = [];
  for (const conn of (data ?? []) as ConnRow[]) {
    const r = await syncConnection(conn);
    results.push({ club_id: conn.club_id, network: conn.network, ...r });
  }
  return { total: (data ?? []).length, results };
}
