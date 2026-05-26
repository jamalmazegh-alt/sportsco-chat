// OAuth callback for social connections. Public route — security comes from
// the encrypted `state` parameter (only the server can mint a valid state).
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decodeState } from "@/lib/social/state.server";
import { encryptToken } from "@/lib/social/crypto.server";
import { getProvider } from "@/lib/social/providers.server";
import { syncConnection } from "@/lib/social/sync.server";

export const Route = createFileRoute("/api/public/social/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateParam = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");
        const baseRedirect = `${url.origin}/admin/settings/social`;

        if (errorParam || !code || !stateParam) {
          return Response.redirect(
            `${baseRedirect}?status=error&reason=${encodeURIComponent(errorParam ?? "missing_code")}`,
            302,
          );
        }
        const state = await decodeState(stateParam);
        if (!state) {
          return Response.redirect(`${baseRedirect}?status=error&reason=bad_state`, 302);
        }
        const redirectUri = `${url.origin}/api/public/social/callback`;

        try {
          const provider = getProvider(state.network);
          const oauth =
            state.network === "twitter"
              ? await provider.exchangeCode(code, redirectUri, state.code_verifier ?? "")
              : await provider.exchangeCode(code, redirectUri);

          const encAccess = await encryptToken(oauth.accessToken);
          const encRefresh = oauth.refreshToken
            ? await encryptToken(oauth.refreshToken)
            : null;

          // Upsert
          const { data: existing } = await supabaseAdmin
            .from("club_social_connections")
            .select("id")
            .eq("club_id", state.club_id)
            .eq("network", state.network)
            .maybeSingle();

          const payload = {
            club_id: state.club_id,
            network: state.network,
            access_token: encAccess,
            refresh_token: encRefresh,
            token_expires_at: oauth.expiresAt ?? null,
            account_id: oauth.accountId ?? null,
            account_name: oauth.accountName ?? null,
            is_active: true,
            last_sync_error: null,
          };

          if (existing) {
            await supabaseAdmin
              .from("club_social_connections")
              .update(payload)
              .eq("id", existing.id);
          } else {
            await supabaseAdmin.from("club_social_connections").insert(payload);
          }

          // Initial sync (best-effort)
          const { data: fresh } = await supabaseAdmin
            .from("club_social_connections")
            .select(
              "id, club_id, network, access_token, refresh_token, token_expires_at, account_id, is_active",
            )
            .eq("club_id", state.club_id)
            .eq("network", state.network)
            .maybeSingle();
          if (fresh) {
            await syncConnection(fresh as Parameters<typeof syncConnection>[0]);
          }

          return Response.redirect(
            `${baseRedirect}?status=connected&network=${state.network}`,
            302,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "unknown";
          return Response.redirect(
            `${baseRedirect}?status=error&reason=${encodeURIComponent(msg.slice(0, 200))}`,
            302,
          );
        }
      },
    },
  },
});
