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
const DONE_PREFIX = "clubero:club_invite_done:";

/**
 * A QR/club-link token can be redeemed by several code paths in the same
 * browser session (/login?invite=…, the metadata replay in use-auth, the
 * manual "join a club" form). The first call consumes the stashed payload, so
 * a second call would fall back to `mode: "self"` and create a *player* row
 * for a user who signed up as a parent — the account then shows up twice
 * (parent + player) on the same team. We remember redeemed tokens locally and
 * make every later call a no-op.
 */
function markClubInviteRedeemed(token: string) {
  if (typeof window === "undefined" || !token) return;
  try {
    window.localStorage.setItem(DONE_PREFIX + token, "1");
  } catch {
    /* ignore */
  }
}

export function hasRedeemedClubInvite(token: string): boolean {
  if (typeof window === "undefined" || !token) return false;
  try {
    return window.localStorage.getItem(DONE_PREFIX + token) === "1";
  } catch {
    return false;
  }
}

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

/**
 * localStorage can be lost between signup and redeem (confirmation e-mail
 * opened on another device or browser). The same payload is mirrored in the
 * auth user metadata at signup, so we can still replay the exact details
 * instead of falling back to `mode: "self"` — which used to create a player
 * row named after the *parent*, with no birth date nor licence.
 */
async function readInviteFromMetadata(token: string): Promise<PendingClubInvitePayload | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const raw = (data.user?.user_metadata as any)?.club_invite_payload;
    if (!raw || typeof raw !== "object") return null;
    if (raw.token && raw.token !== token) return null;
    return {
      mode: raw.mode === "child" ? "child" : "self",
      birthDate: raw.birthDate ?? null,
      phone: raw.phone ?? null,
      license: raw.license ?? null,
      childFirstName: raw.childFirstName ?? null,
      childLastName: raw.childLastName ?? null,
      childBirthDate: raw.childBirthDate ?? null,
    };
  } catch {
    return null;
  }
}

/** Redeem a club link invite, replaying any locally stored signup details. */
export async function redeemClubInvite(token: string, payload?: PendingClubInvitePayload | null) {
  const local = payload ?? readPendingClubInvite(token);
  // Already redeemed in this browser: never replay with a default "self" mode.
  if (!payload && !local && hasRedeemedClubInvite(token)) {
    return { error: null };
  }
  const data = local ?? (await readInviteFromMetadata(token));
  const { error } = await supabase.rpc("redeem_club_invite_v2", {
    _token: token,
    _mode: data?.mode ?? "self",
    _birth_date: data?.birthDate || undefined,
    _phone: data?.phone || undefined,
    _license: data?.license || undefined,
    _child_first_name: data?.childFirstName || undefined,
    _child_last_name: data?.childLastName || undefined,
    _child_birth_date: data?.childBirthDate || undefined,
  });

  if (!error) {
    clearPendingClubInvite(token);
    markClubInviteRedeemed(token);
    // Prévient le staff de l'équipe pour qu'il valide la nouvelle fiche.
    void import("@/lib/club-invite-notify.functions")
      .then(({ notifyStaffOfQrJoin }) => notifyStaffOfQrJoin({ data: { token } }))
      .catch(() => {
        /* best-effort */
      });
  }

  // Normalize the identity-collision error so callers can toast a clear message
  // without depending on Postgres exception wording beyond the code.
  if (error?.message?.includes("player_already_linked")) {
    return {
      error: {
        ...error,
        message: "player_already_linked",
      },
    };
  }
  return { error };
}

/** Map redeem RPC errors to a user-facing string. */
export function clubInviteErrorMessage(
  error: { message?: string } | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (error?.message === "player_already_linked") {
    return t("auth.playerAlreadyLinked");
  }
  return error?.message || t("auth.inviteInvalid");
}
