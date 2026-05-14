import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "coach" | "parent" | "player";

export interface ClubMembership {
  club_id: string;
  role: AppRole;
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

const ACTIVE_CLUB_KEY = "squadly:active_club_id";

export function useAuthState(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<ClubMembership[]>([]);
  const [activeClubId, setActiveClubIdState] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(ACTIVE_CLUB_KEY) : null
  );

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
    const { data, error } = await supabase
      .from("club_members")
      .select("club_id, role, clubs:club_id(id, name, logo_url)")
      .eq("user_id", userData.user.id);
    if (error) {
      console.error(error);
      return;
    }
    const list: ClubMembership[] = (data ?? []).map((row: any) => ({
      club_id: row.club_id,
      role: row.role,
      club: row.clubs,
    }));
    setMemberships(list);
    if (list.length > 0 && !list.some((m) => m.club_id === activeClubId)) {
      setActiveClubId(list[0].club_id);
    }
    if (list.length === 0) setActiveClubId(null);
  }, [activeClubId, setActiveClubId]);

  useEffect(() => {
    // Set up listener BEFORE getSession
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        // defer to avoid deadlocks
        setTimeout(() => {
          refreshMemberships();
        }, 0);
      } else {
        setMemberships([]);
        setActiveClubId(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) refreshMemberships();
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
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
