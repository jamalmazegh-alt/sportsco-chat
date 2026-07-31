/**
 * Server-only — expéditeur Firebase Cloud Messaging (HTTP v1).
 *
 * Utilisé pour les canaux natifs (`fcm` sur Android, `apns` sur iOS via FCM).
 * Le canal `web` reste servi par le Web Push VAPID de `push-send.server.ts`.
 *
 * Implémentation en Web Crypto pur, sans `firebase-admin` : ce dernier dépend
 * d'API Node absentes des Workers Cloudflare. On signe donc nous-mêmes le JWT
 * du compte de service (RS256) pour obtenir un jeton OAuth2, exactement comme
 * le fichier voisin le fait déjà en ES256 pour VAPID.
 *
 * Configuration : `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`,
 * extraits du JSON de compte de service Firebase. Le JSON lui-même ne doit
 * jamais entrer dans le dépôt.
 */

export interface FcmPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Résultat d'un envoi : le statut HTTP pilote l'élagage des tokens morts. */
export interface FcmSendResult {
  status: number;
  /** `true` si FCM signale un token définitivement invalide (à supprimer). */
  unregistered: boolean;
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const JWT_TTL_SECONDS = 3600;

function b64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.byteLength; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function readConfig(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  // Les variables d'environnement ne portent pas de vrais retours à la ligne :
  // la clé PEM est stockée avec des `\n` littéraux, qu'il faut restaurer.
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

/** `true` si l'expéditeur natif est configuré — sinon les envois sont ignorés. */
export function isFcmConfigured(): boolean {
  return readConfig() !== null;
}

let cachedKey: CryptoKey | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

async function loadSigningKey(privateKey: string): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const pkcs8 = pemToPkcs8(privateKey);
  cachedKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8.buffer.slice(pkcs8.byteOffset, pkcs8.byteOffset + pkcs8.byteLength) as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return cachedKey;
}

/**
 * Jeton d'accès OAuth2, mis en cache jusqu'à une minute avant expiration —
 * un aller-retour par notification serait inutilement coûteux sur un fanout.
 */
async function getAccessToken(): Promise<string | null> {
  const cfg = readConfig();
  if (!cfg) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - now > 60) return cachedToken.value;

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: cfg.clientEmail,
    scope: FCM_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + JWT_TTL_SECONDS,
  };

  const enc = new TextEncoder();
  const signingInput = `${b64u(enc.encode(JSON.stringify(header)))}.${b64u(
    enc.encode(JSON.stringify(claims)),
  )}`;

  const key = await loadSigningKey(cfg.privateKey);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(signingInput));
  const assertion = `${signingInput}.${b64u(sig)}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    console.error("[fcm] token exchange failed", res.status, (await res.text()).slice(0, 200));
    return null;
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;

  cachedToken = { value: json.access_token, expiresAt: now + (json.expires_in ?? 3600) };
  return cachedToken.value;
}

/**
 * Envoie une notification à un token natif.
 *
 * La charge utile est déclarée en `notification` (affichage géré par l'OS,
 * y compris app fermée) plus un bloc `data` portant l'URL de destination, que
 * `initNativePushOnLaunch()` lit au tap.
 */
export async function sendFcmToToken(
  token: string,
  payload: FcmPayload,
  channel: "fcm" | "apns",
): Promise<FcmSendResult> {
  const cfg = readConfig();
  const accessToken = await getAccessToken();
  if (!cfg || !accessToken) return { status: 0, unregistered: false };

  const message: Record<string, unknown> = {
    token,
    notification: { title: payload.title, body: payload.body },
    data: {
      ...(payload.url ? { url: payload.url } : {}),
      ...(payload.tag ? { tag: payload.tag } : {}),
    },
  };

  if (channel === "apns") {
    // iOS via FCM : le `tag` sert de clé de regroupement, équivalent du
    // comportement Web Push. Le son par défaut évite une notif silencieuse.
    message.apns = {
      payload: { aps: { sound: "default", ...(payload.tag ? { "thread-id": payload.tag } : {}) } },
    };
  } else {
    // Android : `tag` remplace une notification précédente de même clé plutôt
    // que d'en empiler une nouvelle.
    message.android = {
      priority: "high",
      notification: { ...(payload.tag ? { tag: payload.tag } : {}) },
    };
  }

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (res.ok) return { status: res.status, unregistered: false };

  const detail = await res.text().catch(() => "");
  // UNREGISTERED / INVALID_ARGUMENT sur le token = destinataire disparu
  // (app désinstallée, token tourné). 404 et 400 sont les statuts associés.
  const unregistered =
    res.status === 404 || (res.status === 400 && /UNREGISTERED|INVALID_ARGUMENT/i.test(detail));
  console.warn("[fcm] send rejected", res.status, channel, detail.slice(0, 240));
  return { status: res.status, unregistered };
}
