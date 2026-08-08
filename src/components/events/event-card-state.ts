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

export interface FooterVisibilityInput {
  cancelled: boolean;
  past: boolean;
  isCoach: boolean;
  hasResult: boolean;
  hasCounts: boolean;
  convocationSent: boolean;
  hasMyConvocation: boolean;
}

export interface FooterVisibility {
  counts: boolean;
  sent: boolean;
  response: boolean;
  /** Liseré « convoqué » sur le bord droit. */
  calledRail: boolean;
}

/**
 * Ce que la ligne d'état affiche, selon le moment de l'événement.
 *
 * Une fois le match joué, c'est le résultat qui compte : les compteurs de
 * présence, la pastille de réponse et « convoc envoyée » n'apprennent plus
 * rien et encombrent la carte. Ils restent consultables sur le détail, où
 * l'historique a sa place.
 *
 * Sur un événement annulé, tout se tait de la même façon : la seule chose à
 * dire est qu'il n'aura pas lieu.
 */
export function cardFooterVisibility(input: FooterVisibilityInput): FooterVisibility {
  if (input.cancelled) {
    return { counts: false, sent: false, response: false, calledRail: false };
  }
  if (input.past) {
    return { counts: false, sent: false, response: false, calledRail: false };
  }
  const counts = input.isCoach && input.hasCounts;
  return {
    counts,
    // Les compteurs impliquent déjà l'envoi : la pastille ne s'affiche qu'à
    // défaut, pour ne jamais laisser un coach sans indication.
    sent: input.convocationSent && !counts,
    response: input.hasMyConvocation,
    calledRail: input.hasMyConvocation,
  };
}
