/**
 * Single source of truth for the `events` insert payload.
 *
 * Both the classic EventFormSheet, the deterministic EventWizard (single event)
 * and the training-series children build their row through `buildEventPayload`.
 * No caller is allowed to assemble its own `events` row mapping — this is what
 * guarantees "the wizard produces EXACTLY the same event as the classic form".
 *
 * Pure module: no DB, no React, no DOM. Safe to import from client and server.
 */

export type EventTypeValue = "training" | "match" | "tournament" | "meeting" | "other";
export type CompetitionTypeValue = "friendly" | "championship" | "cup";

/** Attachments are stored as jsonb; kept opaque here to stay pure. */
export type EventAttachment = Record<string, unknown>;

export interface BuildEventPayloadInput {
  teamId: string;
  type: EventTypeValue;
  title: string;
  description?: string | null;
  location?: string | null;
  /** Explicit Maps URL; when absent one is derived from `location`. */
  locationUrl?: string | null;
  opponent?: string | null;
  competitionType?: CompetitionTypeValue | null;
  competitionName?: string | null;
  /** Stable link to team_championships (championship type only). */
  championshipId?: string | null;
  /** true = home, false = away, null/undefined = not a match. */
  isHome?: boolean | null;
  meetingPoint?: string | null;
  startsAt: string; // ISO
  endsAt?: string | null; // ISO
  convocationTime?: string | null; // ISO
  isOfficial?: boolean | null;
  /** Only persisted when explicitly provided (otherwise DB default/trigger applies). */
  carpoolEnabled?: boolean | null;
  /** Links a child event to its training_series. */
  seriesId?: string | null;
  attachments?: EventAttachment[] | null;
  /** Structured link to a preconfigured club venue (site). */
  venueId?: string | null;
  /** Structured link to a preconfigured facility (field) within the venue. */
  facilityId?: string | null;
}

/** The shape inserted into `events` (without insert-meta: status/created_by/...). */
export interface EventRowPayload {
  team_id: string;
  type: EventTypeValue;
  title: string;
  description: string | null;
  location: string | null;
  location_url: string | null;
  opponent: string | null;
  competition_type: CompetitionTypeValue | null;
  competition_name: string | null;
  is_home: boolean | null;
  meeting_point: string | null;
  starts_at: string;
  ends_at: string | null;
  convocation_time: string | null;
  is_official: boolean;
  carpool_enabled?: boolean;
  series_id?: string;
  championship_id?: string | null;
  attachments?: EventAttachment[] | null;
  venue_id?: string | null;
  facility_id?: string | null;
}

export function toGoogleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * Build the `events` row from a normalized input. Field policies (only-for-match
 * fields, location_url derivation, is_official rules, carpool, series link)
 * live here and nowhere else.
 */
export function buildEventPayload(input: BuildEventPayloadInput): EventRowPayload {
  const isMatch = input.type === "match";

  const finalLocationUrl = input.locationUrl?.trim()
    ? input.locationUrl.trim()
    : input.location?.trim()
      ? toGoogleMapsUrl(input.location.trim())
      : null;

  const row: EventRowPayload = {
    team_id: input.teamId,
    type: input.type,
    title: input.title,
    description: input.description || null,
    location: input.location || null,
    location_url: finalLocationUrl,
    opponent: isMatch ? input.opponent || null : null,
    competition_type: isMatch ? (input.competitionType ?? "friendly") : null,
    competition_name: isMatch ? input.competitionName || null : null,
    is_home: isMatch ? (input.isHome ?? null) : null,
    meeting_point: isMatch && input.isHome === false ? input.meetingPoint || null : null,
    starts_at: input.startsAt,
    ends_at: input.endsAt ?? null,
    convocation_time: input.convocationTime ?? null,
    is_official: isMatch ? true : Boolean(input.isOfficial),
  };

  // championship_id is only meaningful for a "championship" match.
  // Other types explicitly clear it, so switching type away from championship
  // never keeps a stale link.
  if (isMatch && input.competitionType === "championship") {
    row.championship_id = input.championshipId ?? null;
  } else {
    row.championship_id = null;
  }

  // Only persist carpool when the caller actually decided it; otherwise let the
  // DB default + away-match trigger apply.
  if (typeof input.carpoolEnabled === "boolean") {
    row.carpool_enabled = input.carpoolEnabled;
  }
  if (input.seriesId) {
    row.series_id = input.seriesId;
  }
  if (input.attachments !== undefined) {
    row.attachments = input.attachments;
  }
  if (input.venueId !== undefined) row.venue_id = input.venueId;
  if (input.facilityId !== undefined) row.facility_id = input.facilityId;

  return row;
}
