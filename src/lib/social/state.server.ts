// Encode/decode opaque OAuth state used to round-trip context through the
// social provider. The state is encrypted with the same key used for tokens.
import { encryptToken, decryptToken } from "./crypto.server";

export type OAuthState = {
  club_id: string;
  network: "instagram" | "facebook" | "twitter";
  nonce: string;
  code_verifier?: string; // X / Twitter PKCE
  return_to?: string;
};

export async function encodeState(state: OAuthState): Promise<string> {
  const json = JSON.stringify(state);
  const enc = await encryptToken(json);
  // URL-safe
  return enc.replace(/\+/g, "-").replace(/\//g, "_");
}

export async function decodeState(encoded: string): Promise<OAuthState | null> {
  try {
    const restored = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = await decryptToken(restored);
    return JSON.parse(json) as OAuthState;
  } catch {
    return null;
  }
}

// PKCE helpers (used only by X / Twitter)
export function randomString(len = 48): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, len);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
  const bytes = new Uint8Array(hash);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
