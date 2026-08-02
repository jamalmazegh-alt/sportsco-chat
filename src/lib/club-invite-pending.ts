/**
 * Club link invites (QR code) usually require an e-mail confirmation before a
 * session exists, so the profile details collected on /register can't be
 * redeemed right away. We stash them locally, keyed by token, and replay them
 * on the first authenticated redeem (from /register or /login).
 */
import { supabase } from "@/integrations/supabase/client";

export type PendingClubInvitePayload = {
  mode: "self" | "child";
  birthDate?: string | null;
  phone?: string | null;
  license?: string | null;
  childFirstName?: string | null;
  childLastName?: string | null;
  childBirthDate?: string | null;
};

const KEY_PREFIX = "clubero:club_invite:";

export function storePendingClubInvite(token: string, payload: PendingClubInvitePayload) {
  if (typeof window === "undefined" || !token) return;
  try {
    window.localStorage.setItem(KEY_PREFIX + token, JSON.stringify(payload));
  } catch {
    /* storage unavailable */
  }
}

export function readPendingClubInvite(token: string): PendingClubInvitePayload | null {
  if (typeof window === "undefined" || !token) return null;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + token);
    return raw ? (JSON.parse(raw) as PendingClubInvitePayload) : null;
  } catch {
    return null;
  }
}

export function clearPendingClubInvite(token: string) {
  if (typeof window === "undefined" || !token) return;
  try {
    window.localStorage.removeItem(KEY_PREFIX + token);
  } catch {
    /* ignore */
  }
}

/** Redeem a club link invite, replaying any locally stored signup details. */
export async function redeemClubInvite(token: string, payload?: PendingClubInvitePayload | null) {
  const data = payload ?? readPendingClubInvite(token);
  const { error } = await supabase.rpc("redeem_club_invite_v2", {
    _token: token,
    _mode: data?.mode ?? "self",
    _birth_date: data?.birthDate || null,
    _phone: data?.phone || null,
    _license: data?.license || null,
    _child_first_name: data?.childFirstName || null,
    _child_last_name: data?.childLastName || null,
    _child_birth_date: data?.childBirthDate || null,
  } as never);
  if (!error) clearPendingClubInvite(token);
  return { error };
}
