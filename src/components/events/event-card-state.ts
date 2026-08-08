import { isSameDay } from "date-fns";

/**
 * Logique pure de la carte d'événement, séparée du composant pour rester
 * testable en environnement node (et pour ne pas casser le fast refresh).
 */

export interface EventCardEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  type: string;
  status: string;
  team_id: string;
  team_name?: string;
  opponent?: string | null;
  competition_type?: string | null;
  competition_name?: string | null;
  is_home?: boolean | null;
  convocations_sent?: boolean | null;
  result?: { home_score: number; away_score: number } | null;
}

export type Outcome = "win" | "loss" | "draw";

/**
 * Issue du match du point de vue de notre équipe. `is_home === false` signifie
 * que nous sommes l'équipe extérieure, donc notre score est `away_score`.
 */
export function matchOutcome(event: EventCardEvent): Outcome | null {
  if (event.type !== "match" || !event.result) return null;
  const ourSide = event.is_home === false ? "away" : "home";
  const ours = ourSide === "home" ? event.result.home_score : event.result.away_score;
  const theirs = ourSide === "home" ? event.result.away_score : event.result.home_score;
  return ours > theirs ? "win" : ours < theirs ? "loss" : "draw";
}

export interface EventCardState {
  cancelled: boolean;
  today: boolean;
  past: boolean;
  live: boolean;
}

/**
 * État temporel de la carte. `live` reste faux quand `ends_at` est absent :
 * sans heure de fin on ne devine pas la durée d'un événement.
 */
export function eventCardState(event: EventCardEvent, now: Date): EventCardState {
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const cancelled = event.status === "cancelled";
  const today = isSameDay(start, now);
  const past = start.getTime() < now.getTime() && !today;
  const live =
    !cancelled &&
    today &&
    !!end &&
    now.getTime() >= start.getTime() &&
    now.getTime() <= end.getTime();
  return { cancelled, today, past, live };
}
