import { logConversionEvent } from "./conversion-tracking.functions";

export type ConversionEventName =
  | "banner_seen"
  | "banner_clicked"
  | "pricing_viewed"
  | "trial_started"
  | "club_activated"
  | "payment_completed";

/**
 * Fire-and-forget client tracker. Never throws.
 * Dedupes `banner_seen` per (event, tournamentId) within a session.
 */
const SEEN_KEY = "clubero:conversion_seen";

function alreadySeen(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    if (set.has(key)) return true;
    set.add(key);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(set)));
    return false;
  } catch {
    return false;
  }
}

export function trackConversion(
  event_name: ConversionEventName,
  properties: Record<string, unknown> = {},
  options: { dedupeKey?: string } = {},
): void {
  if (options.dedupeKey && alreadySeen(`${event_name}:${options.dedupeKey}`)) return;
  logConversionEvent({ data: { event_name, properties } }).catch(() => {
    // swallow — tracking should never break the UI
  });
}
