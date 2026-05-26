// OAuth + sync logic per social network. Server-only.
// Each provider exposes:
//   - getAuthUrl(state, redirectUri)
//   - exchangeCode(code, redirectUri) -> { accessToken, refreshToken?, expiresAt?, accountId?, accountName? }
//   - fetchRecentPosts(accessToken, accountId, sinceExternalId?) -> ExternalPost[]
//   - refreshToken?(refreshToken) -> { accessToken, expiresAt? }

export type SocialNetwork = "instagram" | "facebook" | "twitter";

export type ExternalPost = {
  external_id: string;
  external_url: string;
  external_media_url: string | null;
  body: string;
  created_at: string; // ISO
};

export type OAuthResult = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  accountId?: string | null;
  accountName?: string | null;
};

const MAX_BODY = 1000;

function truncate(s: string | null | undefined): string {
  if (!s) return "";
  return s.length > MAX_BODY ? s.slice(0, MAX_BODY - 1) + "…" : s;
}

// ---------- INSTAGRAM (Graph API, Business/Creator account) ----------
const IG_GRAPH = "https://graph.facebook.com/v19.0";

export const instagram = {
  getAuthUrl(state: string, redirectUri: string): string {
    const appId = process.env.INSTAGRAM_APP_ID;
    if (!appId) throw new Error("INSTAGRAM_APP_ID missing");
    const scope = [
      "instagram_basic",
      "pages_show_list",
      "pages_read_engagement",
    ].join(",");
    const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scope);
    url.searchParams.set("response_type", "code");
    return url.toString();
  },

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthResult> {
    const appId = process.env.INSTAGRAM_APP_ID!;
    const appSecret = process.env.INSTAGRAM_APP_SECRET!;
    // 1. short-lived user token
    const tokRes = await fetch(
      `${IG_GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`,
    );
    if (!tokRes.ok) throw new Error(`IG token exchange failed: ${await tokRes.text()}`);
    const tok = (await tokRes.json()) as { access_token: string };

    // 2. long-lived user token (~60 days)
    const llRes = await fetch(
      `${IG_GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tok.access_token}`,
    );
    if (!llRes.ok) throw new Error(`IG long-lived failed: ${await llRes.text()}`);
    const ll = (await llRes.json()) as { access_token: string; expires_in?: number };

    // 3. find the IG business account through the user's pages
    const pagesRes = await fetch(
      `${IG_GRAPH}/me/accounts?fields=instagram_business_account,name,id&access_token=${ll.access_token}`,
    );
    const pages = (await pagesRes.json()) as {
      data?: Array<{ id: string; name: string; instagram_business_account?: { id: string } }>;
    };
    const page = pages.data?.find((p) => p.instagram_business_account);
    if (!page?.instagram_business_account) {
      throw new Error("Aucun compte Instagram Business lié à une page Facebook trouvé.");
    }

    const igRes = await fetch(
      `${IG_GRAPH}/${page.instagram_business_account.id}?fields=username&access_token=${ll.access_token}`,
    );
    const ig = (await igRes.json()) as { username?: string };

    return {
      accessToken: ll.access_token,
      refreshToken: null,
      expiresAt: ll.expires_in
        ? new Date(Date.now() + ll.expires_in * 1000).toISOString()
        : null,
      accountId: page.instagram_business_account.id,
      accountName: ig.username ? `@${ig.username}` : page.name,
    };
  },

  async fetchRecentPosts(
    accessToken: string,
    accountId: string,
    _sinceExternalId?: string,
  ): Promise<ExternalPost[]> {
    const url = `${IG_GRAPH}/${accountId}/media?fields=id,caption,media_url,thumbnail_url,permalink,timestamp,media_type&limit=30&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`IG media fetch failed: ${await res.text()}`);
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        caption?: string;
        media_url?: string;
        thumbnail_url?: string;
        permalink: string;
        timestamp: string;
        media_type?: string;
      }>;
    };
    return (json.data ?? []).map((m) => ({
      external_id: m.id,
      external_url: m.permalink,
      external_media_url:
        m.media_type === "VIDEO" ? m.thumbnail_url ?? m.media_url ?? null : m.media_url ?? null,
      body: truncate(m.caption ?? ""),
      created_at: m.timestamp,
    }));
  },

  async refresh(): Promise<null> {
    // IG long-lived tokens don't have a refresh token; renew by re-prompting.
    return null;
  },
};

// ---------- FACEBOOK (Page posts) ----------
export const facebook = {
  getAuthUrl(state: string, redirectUri: string): string {
    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) throw new Error("FACEBOOK_APP_ID missing");
    const scope = ["pages_show_list", "pages_read_engagement", "pages_read_user_content"].join(",");
    const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scope);
    url.searchParams.set("response_type", "code");
    return url.toString();
  },

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthResult> {
    const appId = process.env.FACEBOOK_APP_ID!;
    const appSecret = process.env.FACEBOOK_APP_SECRET!;
    const tokRes = await fetch(
      `${IG_GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`,
    );
    if (!tokRes.ok) throw new Error(`FB token exchange failed: ${await tokRes.text()}`);
    const tok = (await tokRes.json()) as { access_token: string };

    const llRes = await fetch(
      `${IG_GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tok.access_token}`,
    );
    const ll = (await llRes.json()) as { access_token: string; expires_in?: number };

    const pagesRes = await fetch(
      `${IG_GRAPH}/me/accounts?fields=id,name,access_token&access_token=${ll.access_token}`,
    );
    const pages = (await pagesRes.json()) as {
      data?: Array<{ id: string; name: string; access_token: string }>;
    };
    const page = pages.data?.[0];
    if (!page) throw new Error("Aucune page Facebook gérée par ce compte.");

    // Page access tokens derived from a long-lived user token don't expire.
    return {
      accessToken: page.access_token,
      refreshToken: null,
      expiresAt: null,
      accountId: page.id,
      accountName: page.name,
    };
  },

  async fetchRecentPosts(
    accessToken: string,
    accountId: string,
  ): Promise<ExternalPost[]> {
    const url = `${IG_GRAPH}/${accountId}/posts?fields=id,message,full_picture,permalink_url,created_time&limit=30&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FB posts fetch failed: ${await res.text()}`);
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        message?: string;
        full_picture?: string;
        permalink_url?: string;
        created_time: string;
      }>;
    };
    return (json.data ?? [])
      .filter((p) => p.permalink_url)
      .map((p) => ({
        external_id: p.id,
        external_url: p.permalink_url!,
        external_media_url: p.full_picture ?? null,
        body: truncate(p.message ?? ""),
        created_at: p.created_time,
      }));
  },

  async refresh(): Promise<null> {
    return null;
  },
};

// ---------- TWITTER / X v2 (OAuth 2.0 PKCE) ----------
const X_API = "https://api.x.com/2";
const X_OAUTH = "https://x.com/i/oauth2/authorize";
const X_TOKEN = "https://api.x.com/2/oauth2/token";

export const twitter = {
  getAuthUrl(state: string, redirectUri: string, codeChallenge: string): string {
    const clientId = process.env.TWITTER_CLIENT_ID;
    if (!clientId) throw new Error("TWITTER_CLIENT_ID missing");
    const scope = ["tweet.read", "users.read", "offline.access"].join(" ");
    const url = new URL(X_OAUTH);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", scope);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  },

  async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<OAuthResult> {
    const clientId = process.env.TWITTER_CLIENT_ID!;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });
    const auth = btoa(`${clientId}:${clientSecret}`);
    const tokRes = await fetch(X_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body,
    });
    if (!tokRes.ok) throw new Error(`X token exchange failed: ${await tokRes.text()}`);
    const tok = (await tokRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const meRes = await fetch(`${X_API}/users/me`, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const me = (await meRes.json()) as { data?: { id: string; username: string; name: string } };
    return {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? null,
      expiresAt: tok.expires_in
        ? new Date(Date.now() + tok.expires_in * 1000).toISOString()
        : null,
      accountId: me.data?.id ?? null,
      accountName: me.data?.username ? `@${me.data.username}` : me.data?.name ?? null,
    };
  },

  async refresh(refreshToken: string): Promise<OAuthResult | null> {
    const clientId = process.env.TWITTER_CLIENT_ID!;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
    const auth = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch(X_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        client_id: clientId,
      }),
    });
    if (!res.ok) return null;
    const tok = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? refreshToken,
      expiresAt: tok.expires_in
        ? new Date(Date.now() + tok.expires_in * 1000).toISOString()
        : null,
    };
  },

  async fetchRecentPosts(accessToken: string, accountId: string): Promise<ExternalPost[]> {
    const url = `${X_API}/users/${accountId}/tweets?max_results=30&tweet.fields=created_at,attachments&expansions=attachments.media_keys&media.fields=url,preview_image_url,type`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`X tweets fetch failed: ${await res.text()}`);
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        text: string;
        created_at: string;
        attachments?: { media_keys?: string[] };
      }>;
      includes?: {
        media?: Array<{ media_key: string; url?: string; preview_image_url?: string; type: string }>;
      };
    };
    const mediaMap = new Map<string, string>();
    (json.includes?.media ?? []).forEach((m) => {
      const url = m.url ?? m.preview_image_url;
      if (url) mediaMap.set(m.media_key, url);
    });
    return (json.data ?? []).map((t) => {
      const key = t.attachments?.media_keys?.[0];
      return {
        external_id: t.id,
        external_url: `https://x.com/i/web/status/${t.id}`,
        external_media_url: key ? mediaMap.get(key) ?? null : null,
        body: truncate(t.text),
        created_at: t.created_at,
      };
    });
  },
};

export function getProvider(network: SocialNetwork) {
  if (network === "instagram") return instagram;
  if (network === "facebook") return facebook;
  return twitter;
}
