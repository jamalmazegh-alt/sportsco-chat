import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/lib/i18n";

async function redeemPendingInvite(session: Session) {
  const token = (session.user?.user_metadata as any)?.invite_token as string | undefined;
  if (!token) return;
  try {
    // Determine which RPC to use based on the invite source
    const { data } = await supabase.rpc("get_member_invite_info", { _token: token });
    const row = Array.isArray(data) ? data[0] : null;
    const rpcName = row ? "redeem_member_invite" : "redeem_club_invite";
    const { error } = await supabase.rpc(rpcName, { _token: token });
    if (error) {
      console.warn("Invite redemption failed:", error.message);
      return;
    }
    // Clear token from metadata so we don't try again
    await supabase.auth.updateUser({ data: { invite_token: null } });
  } catch (e) {
    console.warn("Invite redemption error:", e);
  }
}

export type AppRole = "admin" | "coach" | "parent" | "player";

export interface ClubMembership {
  club_id: string;
  role: AppRole;
  roles: string[];
  club: { id: string; name: string; logo_url: string | null };
}

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  memberships: ClubMembership[];
  activeClubId: string | null;
  setActiveClubId: (id: string | null) => void;
  refreshMemberships: () => Promise<void>;
  signOut: () => Promise<void>;
}

const ACTIVE_CLUB_KEY = "clubero:active_club_id";
const LEGACY_ACTIVE_CLUB_KEY = "squadly:active_club_id";

function readActiveClubKey(): string | null {
  if (typeof window === "undefined") return null;
  const current = localStorage.getItem(ACTIVE_CLUB_KEY);
  if (current) return current;
  // Migrate one-shot from the old "squadly:" key (pre-rebrand).
  const legacy = localStorage.getItem(LEGACY_ACTIVE_CLUB_KEY);
  if (legacy) {
    localStorage.setItem(ACTIVE_CLUB_KEY, legacy);
    localStorage.removeItem(LEGACY_ACTIVE_CLUB_KEY);
    return legacy;
  }
  return null;
}

export function useAuthState(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<ClubMembership[]>([]);
  const [activeClubId, setActiveClubIdState] = useState<string | null>(readActiveClubKey);
  const activeClubIdRef = useRef(activeClubId);
  activeClubIdRef.current = activeClubId;

  const setActiveClubId = useCallback((id: string | null) => {
    setActiveClubIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(ACTIVE_CLUB_KEY, id);
      else localStorage.removeItem(ACTIVE_CLUB_KEY);
    }
  }, []);

  const refreshMemberships = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setMemberships([]);
      return;
    }
    supabase
      .from("profiles")
      .select("preferred_language")
      .eq("id", userData.user.id)
      .single()
      .then(({ data: prof }) => {
        const lang = prof?.preferred_language;
        if (lang && (lang === "en" || lang === "fr") && i18n.language?.slice(0, 2) !== lang) {
          i18n.changeLanguage(lang);
        }
      });
    const { data, error } = await supabase
      .from("club_members")
      .select("club_id, role, roles, clubs:club_id(id, name, logo_url)")
      .eq("user_id", userData.user.id);
    if (error) {
      console.error(error);
      return;
    }
    const list: ClubMembership[] = (data ?? []).map((row: any) => ({
      club_id: row.club_id,
      role: row.role,
      roles: row.roles ?? [row.role],
      club: row.clubs,
    }));
    setMemberships(list);
    const current = activeClubIdRef.current;
    if (list.length > 0 && !list.some((m) => m.club_id === current)) {
      const preferred = list.find((m) => m.role === "admin") ?? list[0];
      setActiveClubId(preferred.club_id);
    }
    if (list.length === 0) setActiveClubId(null);
  }, [setActiveClubId]);

  useEffect(() => {
    let cancelled = false;

    // 1) Subscribe FIRST so we don't miss any event during restore.
    //    Filter to identity transitions only — TOKEN_REFRESHED fires hourly
    //    and on tab focus; INITIAL_SESSION is handled by getSession() below.
    //    Reacting to every event causes spurious setSession(null) and
    //    bounces the user to /login on app resume.
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED" &&
        event !== "TOKEN_REFRESHED"
      ) {
        return;
      }
      // TOKEN_REFRESHED can deliver a fresh session; never treat it as sign-out.
      if (event === "TOKEN_REFRESHED" && !newSession) return;
      setSession(newSession);
      if (newSession) {
        setTimeout(() => {
          redeemPendingInvite(newSession).finally(() => refreshMemberships());
        }, 0);
      } else if (event === "SIGNED_OUT") {
        setMemberships([]);
        setActiveClubId(null);
      }
    });

    // 2) Restore persisted session from storage. getSession() awaits the
    //    supabase-js init promise, so this resolves with the localStorage
    //    value once available. We only flip `loading` to false AFTER this
    //    completes so route guards don't redirect to /login during restore.
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) {
        await refreshMemberships();
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const activeMembership = memberships.find((m) => m.club_id === activeClubId);
  const _ = activeMembership; // silence

  return {
    session,
    user: session?.user ?? null,
    loading,
    memberships,
    activeClubId,
    setActiveClubId,
    refreshMemberships,
    signOut,
  };
}
