// Pure helper: décider si un besoin complet doit rester visible dans la
// sous-section « Récemment complétés » (fil /needs).
//
// Spec : visibleUntil = min(completedAt + 48 h, event.starts_at)
// completedAt approximé par need.updated_at (le compteur atteint 0 via une
// mutation signup qui touche la ligne).
//
// N.B. Ce helper est utilisé exclusivement par /needs — plus affiché sur
// l'accueil (voir HomeNeedsCard).

const FILLED_VISIBILITY_MS = 48 * 60 * 60 * 1000;

export function isRecentlyFilledVisible(
  need: {
    remaining_seats: number;
    updated_at?: string | null;
    events?: { starts_at?: string | null } | null;
  },
  now: Date = new Date(),
): boolean {
  if (need.remaining_seats !== 0) return false;
  const completedAt = need.updated_at ? new Date(need.updated_at).getTime() : NaN;
  if (!Number.isFinite(completedAt)) return false;
  const eventStart = need.events?.starts_at
    ? new Date(need.events.starts_at).getTime()
    : Number.POSITIVE_INFINITY;
  const visibleUntil = Math.min(completedAt + FILLED_VISIBILITY_MS, eventStart);
  return now.getTime() < visibleUntil;
}
