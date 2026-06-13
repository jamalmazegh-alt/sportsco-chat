/**
 * Shared row/detail types for the tournament module.
 *
 * Derived from the generated Supabase `Database` types so the detail query
 * (`getTournament`) and the components consuming it share a single source of
 * truth instead of scattering `as any` casts.
 */
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];

export type TournamentRow = Tables["tournaments"]["Row"];
export type TournamentGroupRow = Tables["tournament_groups"]["Row"];
export type TournamentTeamRow = Tables["tournament_teams"]["Row"];
export type TournamentMatchRow = Tables["tournament_matches"]["Row"];
export type TournamentFlightRow = Tables["tournament_flights"]["Row"];

/**
 * Tournament row enriched by `getTournament` with the owning club's Stripe
 * status (added server-side, not a DB column).
 */
export type TournamentWithClub = TournamentRow & {
  club_stripe_charges_enabled: boolean;
  club_stripe_account_id: string | null;
};

/** Exact shape returned by the `getTournament` server function. */
export interface TournamentDetail {
  tournament: TournamentWithClub;
  groups: TournamentGroupRow[];
  teams: TournamentTeamRow[];
  matches: TournamentMatchRow[];
  flights: TournamentFlightRow[];
  canManage: boolean;
}
