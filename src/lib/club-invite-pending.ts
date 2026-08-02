/**
 * Club link invites (QR code) usually require an e-mail confirmation before a
 * session exists, so the profile details collected on /register can't be
 * redeemed right away. We stash them locally, keyed by token, and mirror them
 * in auth user_metadata so a confirmation opened on another device can still
 * replay the exact parent/child details.
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
  childPhone?: string | null;
};

const KEY_PREFIX = "clubero:club_invite:";
const DONE_PREFIX = "clubero:club_invite_done:";

/** Flat user_metadata keys (nested objects are fragile across auth clients). */
export const CLUB_INVITE_META = {
  mode: "club_invite_mode",
  birthDate: "club_invite_birth_date",
  phone: "club_invite_phone",
  license: "club_invite_license",
  childFirstName: "club_invite_child_first_name",
  childLastName: "club_invite_child_last_name",
  childBirthDate: "club_invite_child_birth_date",
  childPhone: "club_invite_child_phone",
  /** Legacy nested blob written by an earlier fix — still accepted when reading. */
  nested: "club_invite_payload",
} as const;

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

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Read `?invite=` from a location search string (or the current window URL).
 * Used when e-mail confirmation lands on `/login?invite=…` but `invite_token`
 * is missing from session user_metadata (stripped, stale session, other device).
 */
export function readInviteTokenFromLocation(search?: string): string | null {
  try {
    const raw = search ?? (typeof window !== "undefined" ? window.location.search : "");
    if (!raw) return null;
    const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
    return asTrimmedString(params.get("invite"));
  } catch {
    return null;
  }
}

/**
 * Prefer auth metadata `invite_token`, fall back to `?invite=` in the URL.
 * Pass `locationSearch` in tests; omit it in the browser to use window.location.
 */
export function resolvePendingInviteToken(
  metadata: Record<string, unknown> | null | undefined,
  locationSearch?: string,
): string | null {
  const fromMeta = asTrimmedString(metadata?.invite_token);
  if (fromMeta) return fromMeta;
  return readInviteTokenFromLocation(locationSearch);
}

/** Build flat auth metadata mirroring the localStorage payload. */
export function buildClubInviteAuthMetadata(
  token: string,
  payload: PendingClubInvitePayload,
): Record<string, string | null> {
  return {
    invite_token: token,
    [CLUB_INVITE_META.mode]: payload.mode,
    [CLUB_INVITE_META.birthDate]: payload.birthDate ?? null,
    [CLUB_INVITE_META.phone]: payload.phone ?? null,
    [CLUB_INVITE_META.license]: payload.license ?? null,
    [CLUB_INVITE_META.childFirstName]: payload.childFirstName ?? null,
    [CLUB_INVITE_META.childLastName]: payload.childLastName ?? null,
    [CLUB_INVITE_META.childBirthDate]: payload.childBirthDate ?? null,
    [CLUB_INVITE_META.childPhone]: payload.childPhone ?? null,
    // Drop the nested blob so we don't keep a stale / partial object around.
    [CLUB_INVITE_META.nested]: null,
  };
}

/** Keys to null out after a successful redeem (single updateUser merge). */
export function clubInviteAuthMetadataClear(): Record<string, null> {
  return {
    invite_token: null,
    [CLUB_INVITE_META.nested]: null,
    [CLUB_INVITE_META.mode]: null,
    [CLUB_INVITE_META.birthDate]: null,
    [CLUB_INVITE_META.phone]: null,
    [CLUB_INVITE_META.license]: null,
    [CLUB_INVITE_META.childFirstName]: null,
    [CLUB_INVITE_META.childLastName]: null,
    [CLUB_INVITE_META.childBirthDate]: null,
    [CLUB_INVITE_META.childPhone]: null,
  };
}

/**
 * Resolve the pending payload from auth user_metadata.
 * Prefer flat keys; accept the legacy nested `club_invite_payload` object.
 *
 * Important: callers must pass metadata from the current Session/User —
 * never call supabase.auth.getUser() from an onAuthStateChange path
 * (auth client lock can deadlock and leave the user on "create a club").
 */
export function readInvitePayloadFromMetadata(
  token: string,
  metadata: Record<string, unknown> | null | undefined,
): PendingClubInvitePayload | null {
  if (!metadata || typeof metadata !== "object") return null;

  const flatMode = metadata[CLUB_INVITE_META.mode];
  if (flatMode === "self" || flatMode === "child") {
    return {
      mode: flatMode,
      birthDate: asTrimmedString(metadata[CLUB_INVITE_META.birthDate]),
      phone: asTrimmedString(metadata[CLUB_INVITE_META.phone]),
      license: asTrimmedString(metadata[CLUB_INVITE_META.license]),
      childFirstName: asTrimmedString(metadata[CLUB_INVITE_META.childFirstName]),
      childLastName: asTrimmedString(metadata[CLUB_INVITE_META.childLastName]),
      childBirthDate: asTrimmedString(metadata[CLUB_INVITE_META.childBirthDate]),
      childPhone: asTrimmedString(metadata[CLUB_INVITE_META.childPhone]),
    };
  }

  const raw = metadata[CLUB_INVITE_META.nested];
  if (!raw || typeof raw !== "object") return null;
  const nested = raw as Record<string, unknown>;
  if (nested.token && nested.token !== token) return null;
  return {
    mode: nested.mode === "child" ? "child" : "self",
    birthDate: asTrimmedString(nested.birthDate),
    phone: asTrimmedString(nested.phone),
    license: asTrimmedString(nested.license),
    childFirstName: asTrimmedString(nested.childFirstName),
    childLastName: asTrimmedString(nested.childLastName),
    childBirthDate: asTrimmedString(nested.childBirthDate),
    childPhone: asTrimmedString(nested.childPhone),
  };
}

export type RedeemClubInviteOptions = {
  /** Explicit payload (e.g. still on the register form). */
  payload?: PendingClubInvitePayload | null;
  /**
   * Auth user_metadata from the current session/user. Required for the
   * cross-device fallback — do not fetch it via getUser() here.
   */
  userMetadata?: Record<string, unknown> | null;
};

type RedeemResult = { error: { message?: string } | null };

/** Dedupe parallel redeem calls (getSession restore + SIGNED_IN). */
const inflightRedeems = new Map<string, Promise<RedeemResult>>();

/** Redeem a club link invite, replaying any locally stored signup details. */
export async function redeemClubInvite(
  token: string,
  options: RedeemClubInviteOptions = {},
): Promise<RedeemResult> {
  const existing = inflightRedeems.get(token);
  if (existing) return existing;

  const run = (async (): Promise<RedeemResult> => {
    const explicit = options.payload;
    const local = explicit ?? readPendingClubInvite(token);
    // Already redeemed in this browser: never replay with a default "self" mode.
    if (!explicit && !local && hasRedeemedClubInvite(token)) {
      return { error: null };
    }
    const data = local ?? readInvitePayloadFromMetadata(token, options.userMetadata ?? null);

    // Child mode without a name would raise in SQL and leave the user with no
    // club_members row (create-club screen). Fail fast with a clear error.
    if (data?.mode === "child" && (!data.childFirstName || !data.childLastName)) {
      return { error: { message: "Child name required" } };
    }

    const { error } = await supabase.rpc("redeem_club_invite_v2", {
      _token: token,
      _mode: data?.mode ?? "self",
      _birth_date: data?.birthDate || undefined,
      _phone: data?.phone || undefined,
      _license: data?.license || undefined,
      _child_first_name: data?.childFirstName || undefined,
      _child_last_name: data?.childLastName || undefined,
      _child_birth_date: data?.childBirthDate || undefined,
      _child_phone: data?.childPhone || undefined,
    });

    if (!error) {
      clearPendingClubInvite(token);
      markClubInviteRedeemed(token);
      // Prévient le staff de l'équipe pour qu'il valide la nouvelle fiche.
      // Awaited (avec garde-fou) : en fire-and-forget, la redirection post-redeem
      // annulait la requête et le staff ne recevait rien.
      // Metadata cleanup is owned by the caller (use-auth / login) via a single
      // updateUser — avoids auth-lock deadlocks inside onAuthStateChange.
      try {
        const { notifyStaffOfQrJoin } = await import("@/lib/club-invite-notify.functions");
        await Promise.race([
          notifyStaffOfQrJoin({ data: { token } }),
          new Promise((resolve) => setTimeout(resolve, 8000)),
        ]);
      } catch {
        /* best-effort */
      }
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
  })();

  inflightRedeems.set(token, run);
  try {
    return await run;
  } finally {
    inflightRedeems.delete(token);
  }
}

/** Map redeem RPC errors to a user-facing string. */
export function clubInviteErrorMessage(
  error: { message?: string } | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (error?.message === "player_already_linked") {
    return t("auth.playerAlreadyLinked");
  }
  if (error?.message === "Child name required") {
    return t("auth.childNameRequired", { defaultValue: "Nom de l'enfant requis" });
  }
  return error?.message || t("auth.inviteInvalid");
}
