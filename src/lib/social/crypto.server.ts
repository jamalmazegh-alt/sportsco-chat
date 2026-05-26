// AES-GCM encryption helpers for storing OAuth tokens at rest.
// Uses Web Crypto (available in Cloudflare Workers + Node 20).
// Format stored in DB: "v1:<base64(iv)>:<base64(ciphertext)>"

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is not configured");
  }
  // Accept either raw 32-byte base64 OR any string we hash to 32 bytes (sha-256).
  let keyBytes: Uint8Array;
  try {
    const buf = base64ToBytes(raw);
    if (buf.length === 32) {
      keyBytes = buf;
    } else {
      keyBytes = new Uint8Array(
        await crypto.subtle.digest("SHA-256", TEXT_ENCODER.encode(raw) as BufferSource),
      );
    }
  } catch {
    keyBytes = new Uint8Array(
      await crypto.subtle.digest("SHA-256", TEXT_ENCODER.encode(raw) as BufferSource),
    );
  }
  return crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptToken(plaintext: string): Promise<string> {
  if (!plaintext) return "";
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    TEXT_ENCODER.encode(plaintext) as BufferSource,
  );
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipher))}`;
}

export async function decryptToken(stored: string): Promise<string> {
  if (!stored) return "";
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") {
    // Legacy plaintext token — return as-is to allow rolling migration.
    return stored;
  }
  const key = await getKey();
  const iv = base64ToBytes(parts[1]);
  const data = base64ToBytes(parts[2]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data as BufferSource,
  );
  return TEXT_DECODER.decode(plain);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
