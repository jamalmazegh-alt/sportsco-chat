/**
 * Server-only — Web Push sender.
 *
 * Pure Web Crypto implementation (RFC 8291 aes128gcm + VAPID JWT).
 * No Node-only deps so it bundles cleanly for Cloudflare Workers.
 *
 * Refs: RFC 8030, RFC 8188, RFC 8291, RFC 8292.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { VAPID_PUBLIC_KEY } from "@/lib/pwa";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/* -------------------------------------------------------------------------- */
/* base64url helpers                                                          */
/* -------------------------------------------------------------------------- */

function b64uEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.byteLength; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64uDecode(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* VAPID JWT (ES256)                                                          */
/* -------------------------------------------------------------------------- */

let cachedVapidKey: { priv: CryptoKey; pubB64u: string } | null = null;
const cachedVapidJwtByAudience = new Map<
  string,
  { jwt: string; createdAt: number; expiresAt: number }
>();
const VAPID_JWT_TTL_SECONDS = 12 * 60 * 60;
const VAPID_JWT_MIN_REUSE_SECONDS = 60 * 60;

function derLength(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, body: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array([tag]), derLength(body.byteLength), body);
}

function derSeq(...parts: Uint8Array[]): Uint8Array {
  return der(0x30, concatBytes(...parts));
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function buildP256Pkcs8PrivateKey(privBytes: Uint8Array, pubBytes: Uint8Array): Uint8Array {
  const ecPublicKeyOid = new Uint8Array([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  const prime256v1Oid = new Uint8Array([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]);
  const algorithmIdentifier = derSeq(ecPublicKeyOid, prime256v1Oid);
  const ecPrivateKey = derSeq(
    der(0x02, new Uint8Array([0x01])),
    der(0x04, privBytes),
    der(0xa1, der(0x03, concatBytes(new Uint8Array([0x00]), pubBytes))),
  );
  return derSeq(der(0x02, new Uint8Array([0x00])), algorithmIdentifier, der(0x04, ecPrivateKey));
}

function buildP256SpkiPublicKey(pubBytes: Uint8Array): Uint8Array {
  const ecPublicKeyOid = new Uint8Array([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  const prime256v1Oid = new Uint8Array([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]);
  return derSeq(
    derSeq(ecPublicKeyOid, prime256v1Oid),
    der(0x03, concatBytes(new Uint8Array([0x00]), pubBytes)),
  );
}

async function loadVapidKey(): Promise<{ priv: CryptoKey; pubB64u: string }> {
  if (cachedVapidKey) return cachedVapidKey;
  const privRaw = process.env.VAPID_PRIVATE_KEY?.trim();
  const pubRaw = VAPID_PUBLIC_KEY.trim();
  if (!privRaw) throw new Error("VAPID private key missing");

  const privBytes = b64uDecode(privRaw); // 32-byte d
  const pubBytes = b64uDecode(pubRaw); // 65-byte uncompressed (0x04 || x || y)
  if (privBytes.byteLength !== 32) throw new Error("Bad VAPID private key length");
  if (pubBytes.byteLength !== 65 || pubBytes[0] !== 0x04)
    throw new Error("Bad VAPID public key (must be 65-byte uncompressed P-256)");

  const priv = await crypto.subtle.importKey(
    "pkcs8",
    exactArrayBuffer(buildP256Pkcs8PrivateKey(privBytes, pubBytes)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const pub = await crypto.subtle.importKey(
    "spki",
    exactArrayBuffer(buildP256SpkiPublicKey(pubBytes)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const probe = new TextEncoder().encode("vapid-key-check");
  const probeSig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, probe);
  const keysMatch = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    pub,
    probeSig,
    probe,
  );
  if (!keysMatch) throw new Error("VAPID private key does not match browser public key");

  cachedVapidKey = { priv, pubB64u: pubRaw };
  return cachedVapidKey;
}

function getVapidSubject(): string {
  const fallback = "mailto:contact@clubero.app";
  const raw = (process.env.VAPID_SUBJECT || "").trim();
  if (!raw) return fallback;
  const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
  if (/^mailto:/i.test(raw)) {
    const email = raw
      .replace(/^mailto:/i, "")
      .trim()
      .replace(/^<|>$/g, "")
      .trim();
    if (emailPattern.test(email)) return `mailto:${email}`;
    console.warn("[push] invalid VAPID_SUBJECT mailto, using fallback");
    return fallback;
  }
  if (/^https:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:") return url.toString();
    } catch {
      // fall through to fallback
    }
    console.warn("[push] invalid VAPID_SUBJECT url, using fallback");
    return fallback;
  }
  if (emailPattern.test(raw)) return `mailto:${raw}`;
  console.warn("[push] invalid VAPID_SUBJECT format, using fallback");
  return fallback;
}

async function buildVapidJwt(audience: string): Promise<string> {
  const { priv } = await loadVapidKey();
  const subject = getVapidSubject();
  const now = Math.floor(Date.now() / 1000);
  const cacheKey = `${audience}|${subject}`;
  const cached = cachedVapidJwtByAudience.get(cacheKey);
  if (
    cached &&
    now - cached.createdAt < VAPID_JWT_MIN_REUSE_SECONDS &&
    cached.expiresAt - now > 60
  ) {
    return cached.jwt;
  }

  const header = { typ: "JWT", alg: "ES256" };
  const exp = now + VAPID_JWT_TTL_SECONDS; // Apple rejects JWTs expiring more than 24h ahead.
  const payload = { aud: audience, exp, sub: subject };

  const enc = new TextEncoder();
  const headerB64 = b64uEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = b64uEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    priv,
    enc.encode(signingInput),
  );
  // Web Crypto returns raw r||s (64 bytes for P-256) — already the JOSE format
  const jwt = `${signingInput}.${b64uEncode(sig)}`;
  // Apple explicitly asks senders not to refresh VAPID JWTs more than once per hour.
  cachedVapidJwtByAudience.set(cacheKey, { jwt, createdAt: now, expiresAt: exp });
  return jwt;
}

/* -------------------------------------------------------------------------- */
/* Payload encryption (aes128gcm — RFC 8188 + RFC 8291)                       */
/* -------------------------------------------------------------------------- */

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    ikm.buffer.slice(ikm.byteOffset, ikm.byteOffset + ikm.byteLength) as ArrayBuffer,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      info: info.buffer.slice(info.byteOffset, info.byteOffset + info.byteLength) as ArrayBuffer,
    },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

async function encryptPayload(
  plaintext: Uint8Array,
  uaPublicKey: Uint8Array, // 65 bytes uncompressed
  authSecret: Uint8Array, // 16 bytes
): Promise<{ body: Uint8Array }> {
  // Ephemeral ECDH keypair
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey)); // 65 bytes

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublicKey.buffer.slice(
      uaPublicKey.byteOffset,
      uaPublicKey.byteOffset + uaPublicKey.byteLength,
    ) as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256),
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK_key = HKDF-Extract(auth_secret, ecdh_secret) then expand with "WebPush: info\0|ua_public|as_public"
  const keyInfo = concatBytes(new TextEncoder().encode("WebPush: info\0"), uaPublicKey, ephPubRaw);
  const ikm = await hkdf(ecdhSecret, authSecret, keyInfo, 32);

  // CEK
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const cek = await hkdf(ikm, salt, cekInfo, 16);

  // Nonce
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonce = await hkdf(ikm, salt, nonceInfo, 12);

  // Plaintext + 0x02 padding delimiter (single record)
  const padded = concatBytes(plaintext, new Uint8Array([0x02]));

  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek.buffer.slice(cek.byteOffset, cek.byteOffset + cek.byteLength) as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce.buffer.slice(
          nonce.byteOffset,
          nonce.byteOffset + nonce.byteLength,
        ) as ArrayBuffer,
      },
      aesKey,
      padded.buffer.slice(padded.byteOffset, padded.byteOffset + padded.byteLength) as ArrayBuffer,
    ),
  );

  // Build aes128gcm record:
  //   salt(16) || rs(4, big-endian) || idlen(1) || keyid(idlen) || ciphertext
  // For Web Push the keyid is the ephemeral public key (65 bytes).
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  const dv = new DataView(header.buffer);
  dv.setUint32(16, rs, false);
  header[20] = 65;
  header.set(ephPubRaw, 21);

  return { body: concatBytes(header, ciphertext) };
}

/* -------------------------------------------------------------------------- */
/* Send                                                                       */
/* -------------------------------------------------------------------------- */

interface RawSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendOne(sub: RawSubscription, payload: PushPayload): Promise<number> {
  const endpointUrl = new URL(sub.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const jwt = await buildVapidJwt(audience);
  const { pubB64u } = await loadVapidKey();

  const uaPublic = b64uDecode(sub.p256dh);
  const authSecret = b64uDecode(sub.auth);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));

  const { body } = await encryptPayload(plaintext, uaPublic, authSecret);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${pubB64u}`,
      "Crypto-Key": `p256ecdsa=${pubB64u}`,
    },
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const apnsId = res.headers.get("apns-id") || "";
    const authHint = res.headers.get("www-authenticate") || "";
    console.warn(
      "[push] provider rejected",
      res.status,
      endpointUrl.host,
      detail.slice(0, 240) || authHint || apnsId,
    );
  }

  return res.status;
}

/**
 * Send a push notification to every active subscription of one user.
 * Cleans up endpoints that respond 404/410 (gone).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs?.length) return { sent: 0, pruned: 0 };

  let sent = 0;
  const toPrune: string[] = [];

  for (const s of subs as RawSubscription[]) {
    try {
      const status = await sendOne(s, payload);
      if (status >= 200 && status < 300) {
        sent++;
      } else if (status === 404 || status === 410) {
        toPrune.push(s.endpoint);
      } else {
        console.warn("[push] non-2xx status", status, "endpoint:", s.endpoint);
      }
    } catch (e) {
      console.warn("[push] send threw", (e as Error).message);
    }
  }

  if (toPrune.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", toPrune);
  }

  return { sent, pruned: toPrune.length };
}

/** Fire-and-forget — never blocks or throws on caller. */
export function sendPushToUserFireAndForget(userId: string, payload: PushPayload): void {
  sendPushToUser(userId, payload).catch((e) =>
    console.warn("[push] background send failed", (e as Error).message),
  );
}
