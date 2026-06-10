/**
 * Helpers for the tournament → club conversion banner.
 *
 * The banner targets organisers of standalone tournaments (no real club, or a
 * personal one) once their tournament has reached a meaningful state, and
 * nudges them toward a club subscription.
 */

const DISMISS_PREFIX = "clubero:tournament_banner_dismissed:";
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface TournamentForBanner {
  id: string;
  status: string;
  club_is_personal?: boolean | null;
}

export interface BannerContext {
  tournament: TournamentForBanner;
  /** Whether the user belongs to at least one real (non-personal) club. */
  hasRealClubMembership: boolean;
  /** Number of tournament matches with a recorded result. */
  resultsCount: number;
}

export function isBannerDismissed(tournamentId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(DISMISS_PREFIX + tournamentId);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    if (Date.now() - ts > DISMISS_TTL_MS) {
      localStorage.removeItem(DISMISS_PREFIX + tournamentId);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function dismissBanner(tournamentId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISS_PREFIX + tournamentId, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function shouldShowTournamentBanner(ctx: BannerContext): boolean {
  const { tournament, hasRealClubMembership, resultsCount } = ctx;
  if (hasRealClubMembership) return false;
  if (tournament.status === "draft" || tournament.status === "cancelled") return false;
  const tournamentIsAdvanced = tournament.status === "completed" || resultsCount > 0;
  if (!tournamentIsAdvanced) return false;
  if (isBannerDismissed(tournament.id)) return false;
  return true;
}
