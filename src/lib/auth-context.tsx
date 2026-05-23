import { createContext, useContext, type ReactNode } from "react";
import { useAuthState, type AuthState } from "./use-auth";

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useActiveRole(): "admin" | "coach" | "parent" | "player" | null {
  const { memberships, activeClubId } = useAuth();
  const m = memberships.find((x) => x.club_id === activeClubId);
  if (!m) return null;
  const all = new Set<string>(m.roles ?? [m.role]);
  const order: Array<"admin" | "coach" | "parent" | "player"> = [
    "admin",
    "coach",
    "parent",
    "player",
  ];
  for (const r of order) if (all.has(r)) return r;
  return m.role;
}

/** Full roles array for the active club (multi-role aware). */
export function useMyRoles(): string[] {
  const { memberships, activeClubId } = useAuth();
  const m = memberships.find((x) => x.club_id === activeClubId);
  return m?.roles ?? (m ? [m.role] : []);
}
