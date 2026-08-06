/**
 * Server-only — expéditeur APNs direct, pour le canal `apns` (iOS).
 *
 * Pourquoi ne pas passer par FCM comme Android ? Parce que le plugin Capacitor
 * iOS n'embarque pas Firebase : il s'enregistre directement auprès d'APNs et
 * renvoie un **jeton d'appareil APNs** hexadécimal. FCM, lui, n'accepte dans son
 * champ `token` que des jetons d'enregistrement FCM. Les deux formats ne sont
 * pas interchangeables : envoyer un jeton APNs à FCM échoue.
 *
 * Deux voies existaient. Ajouter le SDK Firebase iOS pour obtenir un vrai jeton
 * FCM — ce qui impose une dépendance, un `GoogleService-Info.plist` et une
 * initialisation dans l'AppDelegate. Ou parler à Apple en direct, ce que fait ce
 * fichier : moins de pièces mobiles, et Firebase ne sert plus que pour Android.
 *
 * Implémentation en Web Crypto pur, comme `push-fcm.server.ts` : les Workers
 * Cloudflare n'ont pas les API Node dont dépendent les bibliothèques APNs.
 * Apple signe en **ES256** — courbe P-256 — là où le compte de service Google
 * signe en RS256.
 *
 * Configuration : `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (contenu du
 * fichier .p8), `APNS_BUNDLE_ID`, et `APNS_SANDBOX` pour viser le bac à sable.
 * Le .p8 ne doit jamais entrer dans le dépôt.
 */

export interface ApnsPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Résultat d'un envoi : le statut HTTP pilote l'élagage des tokens morts. */
export interface ApnsSendResult {
  status: number;
  /** `true` si Apple signale un jeton définitivement invalide (à supprimer). */
  unregistered: boolean;
}

const PROD_HOST = "https://api.push.apple.com";
const SANDBOX_HOST = "https://api.sandbox.push.apple.com";

/**
 * Apple rejette un jeton de moins de 20 minutes s'il est régénéré trop souvent,
 * et un jeton de plus d'une heure. On vise 45 minutes : loin des deux bornes.
 */
const JWT_REFRESH_SECONDS = 45 * 60;

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

interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  host: string;
}

function readConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  // Comme pour FCM : la variable d'environnement porte des `\n` littéraux.
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!keyId || !teamId || !privateKey || !bundleId) return null;
  return {
    keyId,
    teamId,
    privateKey,
    bundleId,
    host: process.env.APNS_SANDBOX === "1" ? SANDBOX_HOST : PROD_HOST,
  };
}

/** `true` si l'expéditeur APNs est configuré — sinon les envois sont ignorés. */
export function isApnsConfigured(): boolean {
  return readConfig() !== null;
}

let cachedKey: CryptoKey | null = null;
let cachedJwt: { value: string; issuedAt: number } | null = null;

async function loadSigningKey(privateKey: string): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const pkcs8 = pemToPkcs8(privateKey);
  cachedKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8.buffer.slice(pkcs8.byteOffset, pkcs8.byteOffset + pkcs8.byteLength) as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return cachedKey;
}

/**
 * Jeton d'autorisation APNs, réutilisé pendant 45 minutes.
 *
 * Contrairement à OAuth2, Apple ne délivre rien : c'est nous qui produisons le
 * jeton et il vaut pour tous les envois. Le régénérer à chaque notification
 * ferait rejeter le trafic pour abus (`TooManyProviderTokenUpdates`).
 */
async function getProviderToken(): Promise<string | null> {
  const cfg = readConfig();
  if (!cfg) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < JWT_REFRESH_SECONDS) return cachedJwt.value;

  const header = { alg: "ES256", kid: cfg.keyId };
  const claims = { iss: cfg.teamId, iat: now };

  const enc = new TextEncoder();
  const signingInput = `${b64u(enc.encode(JSON.stringify(header)))}.${b64u(
    enc.encode(JSON.stringify(claims)),
  )}`;

  const key = await loadSigningKey(cfg.privateKey);
  // Web Crypto renvoie déjà une signature ECDSA au format brut r||s, qui est
  // celui attendu par JWS — aucune conversion depuis DER n'est nécessaire.
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signingInput),
  );

  cachedJwt = { value: `${signingInput}.${b64u(sig)}`, issuedAt: now };
  return cachedJwt.value;
}

/**
 * Envoie une notification à un jeton d'appareil iOS.
 *
 * La charge utile `aps` est affichée par le système, y compris application
 * fermée. L'URL de destination voyage à côté, dans une clé personnalisée que
 * `initNativePushOnLaunch()` lit au tap — même contrat que le canal FCM.
 */
export async function sendApnsToToken(
  token: string,
  payload: ApnsPayload,
): Promise<ApnsSendResult> {
  const cfg = readConfig();
  const jwt = await getProviderToken();
  if (!cfg || !jwt) return { status: 0, unregistered: false };

  const body = {
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      // Regroupe les notifications d'un même sujet plutôt que de les empiler,
      // équivalent du `tag` Web Push et Android.
      ...(payload.tag ? { "thread-id": payload.tag } : {}),
    },
    ...(payload.url ? { url: payload.url } : {}),
    ...(payload.tag ? { tag: payload.tag } : {}),
  };

  const res = await fetch(`${cfg.host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": cfg.bundleId,
      // `alert` est obligatoire depuis iOS 13 : sans lui, Apple rejette.
      "apns-push-type": "alert",
      // 10 = livrer immédiatement. 5 mettrait la notification en attente.
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.ok) return { status: res.status, unregistered: false };

  const detail = await res.text().catch(() => "");
  // 410 Unregistered : application désinstallée. 400 BadDeviceToken : jeton
  // inutilisable, souvent un jeton du bac à sable envoyé en production — les
  // deux environnements APNs sont étanches.
  const unregistered =
    res.status === 410 ||
    (res.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/i.test(detail));
  console.warn("[apns] send rejected", res.status, detail.slice(0, 240));
  return { status: res.status, unregistered };
}
