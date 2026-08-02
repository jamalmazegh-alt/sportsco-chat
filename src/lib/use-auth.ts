import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { redeemClubInvite } from "@/lib/club-invite-pending";
import i18n from "@/lib/i18n";
import { identifyPostHog, resetPostHog } from "@/lib/posthog";

async function redeemPendingInvite(session: Session) {
  const token = (session.user?.user_metadata as any)?.invite_token as string | undefined;
  if (!token) return;
  try {
    // Member invites are nominative; club link invites (QR) go through v2 so a
    // team-scoped token still creates the player row + team_members, and so any
    // details stashed in localStorage at /register are replayed.
    const { data } = await supabase.rpc("get_member_invite_info", { _token: token });
    const row = Array.isArray(data) ? data[0] : null;
    const { error } = row
      ? await supabase.rpc("redeem_member_invite", { _token: token })
      : await redeemClubInvite(token);
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
  /**
   * `true` seulement après une lecture RÉUSSIE des adhésions.
   *
   * Sans ce drapeau, un échec réseau laissait `memberships` à son tableau vide
   * initial et les gardes concluaient « aucun club » — affichant l'écran de
   * création à un utilisateur qui en a un, avec le risque qu'il crée un
   * doublon. Constaté en mode avion sur un appareil réel.
   */
  membershipsLoaded: boolean;
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
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);
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
    // Auto-link parent memberships (matches player_parents by email) so a
    // parent whose invite/link never created a club_members row still lands
    // on their child's club instead of the "create a club" screen.
    try {
      await (supabase.rpc as any)("link_parent_memberships");
      // Fire-and-forget: send a one-shot email for any child that was just
      // linked to this parent account. Server-side dedupe via
      // parent_link_notifications guarantees a single email per (parent, child).
      import("@/lib/parent-link-notify.functions")
        .then((m) => m.notifyNewlyLinkedChildren())
        .catch((e) => console.warn("notifyNewlyLinkedChildren failed:", e));
    } catch (e) {
      console.warn("link_parent_memberships failed:", e);
    }

    const { data, error } = await supabase
      .from("club_members")
      .select("club_id, role, roles, clubs:club_id(id, name, logo_url)")
      .eq("user_id", userData.user.id);
    if (error) {
      // On ne touche NI à `memberships` NI à `membershipsLoaded` : un échec
      // transitoire ne doit jamais être interprété comme « cet utilisateur
      // n'a aucun club ».
      console.error(error);
      return;
    }
    const list: ClubMembership[] = (data ?? [])
      // Un club masqué par RLS (ou supprimé) renvoie `clubs: null` : on ignore
      // ces adhésions plutôt que de crasher plus loin sur `club.logo_url`.
      .filter((row: any) => row.clubs)
      .map((row: any) => ({
        club_id: row.club_id,
        role: row.role,
        roles: row.roles ?? [row.role],
        club: row.clubs,
      }));
    setMemberships(list);
    setMembershipsLoaded(true);
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
      if (event === "SIGNED_IN") {
        // Start a fresh sponsor-impressions session per sign-in.
        import("@/lib/sponsor-session").then((m) => m.resetSponsorSession()).catch(() => {});
      }
      if (newSession) {
        identifyPostHog(newSession.user.id, { email: newSession.user.email ?? null });
        setTimeout(() => {
          redeemPendingInvite(newSession).finally(() => refreshMemberships());
        }, 0);
      } else if (event === "SIGNED_OUT") {
        resetPostHog();
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
        identifyPostHog(data.session.user.id, { email: data.session.user.email ?? null });
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
    membershipsLoaded,
    activeClubId,
    setActiveClubId,
    refreshMemberships,
    signOut,
  };
}
