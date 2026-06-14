/**
 * Event wizard config + state + helpers.
 *
 * The wizard is deterministic (no LLM). It walks the user through a series of
 * questions, persists progress in sessionStorage (see event-wizard-draft.ts)
 * and produces either:
 *   - a single event insert payload (same shape as EventFormSheet)
 *   - a training-series payload (consumed by createTrainingSeries)
 */

export type WizardEventType = "training" | "match" | "meeting" | "other";
export type IsHome = "home" | "away";
export type ConvocScope = "all" | "selection" | "none";

export type RecurrenceMode =
  | "single"
  | "weekly_one"
  | "weekly_multi"
  | "custom";

export interface RecurrenceState {
  mode: RecurrenceMode;
  weekdays: number[]; // 0=Sun..6=Sat
  startsOn?: string; // yyyy-mm-dd (season start)
  endsOn?: string; // yyyy-mm-dd (season end)
}

export interface EventWizardState {
  type: WizardEventType | "";
  teamId: string;
  startDate?: string; // yyyy-mm-dd
  startTime: string; // HH:mm
  durationMin: number;
  isHome?: IsHome;
  meetingPoint?: string;
  opponent?: string;
  isOfficial?: boolean;
  competitionType?: "friendly" | "championship" | "cup";
  location?: string;
  locationUrl?: string | null;
  convocScope: ConvocScope;
  carpoolEnabled?: boolean;
  recurrence?: RecurrenceState;
  // book-keeping
  step: number;
}

export function defaultState(): EventWizardState {
  return {
    type: "",
    teamId: "",
    startTime: "18:30",
    durationMin: 90,
    convocScope: "all",
    step: 0,
  };
}

export function defaultDuration(type: WizardEventType): number {
  switch (type) {
    case "training":
      return 90;
    case "match":
      return 105;
    case "meeting":
      return 60;
    default:
      return 60;
  }
}

export function defaultStartTime(type: WizardEventType): string {
  return type === "match" ? "15:00" : "18:30";
}

/** Build a default title when none is provided. */
export function autoTitle(
  state: EventWizardState,
  teamName: string | undefined,
  t: (k: string, opt?: Record<string, unknown>) => string,
): string {
  const name = teamName ?? "";
  switch (state.type) {
    case "match":
      return state.opponent ? `${name} vs ${state.opponent}`.trim() : `${t("events.types.match")} ${name}`.trim();
    case "training":
      return `${t("events.types.training")} ${name}`.trim();
    case "meeting":
      return `${t("events.types.meeting")} ${name}`.trim();
    default:
      return name || t("events.types.other", { defaultValue: "Événement" });
  }
}

/** Combine a yyyy-mm-dd + HH:mm into an ISO string (local time). */
export function toIso(dateStr: string | undefined, time: string): string | null {
  if (!dateStr || !time) return null;
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

export function addMinutesIso(iso: string | null, minutes: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

/** Count occurrences in [startsOn..endsOn] matching the given weekdays. */
export function countOccurrences(
  startsOn: string | undefined,
  endsOn: string | undefined,
  weekdays: number[],
): number {
  if (!startsOn || !endsOn || weekdays.length === 0) return 0;
  const start = new Date(`${startsOn}T00:00:00`);
  const end = new Date(`${endsOn}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end < start) return 0;
  const set = new Set(weekdays);
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (set.has(cursor.getDay())) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * Map wizard state to an event insert payload (same shape as EventFormSheet).
 * Returns null if mandatory fields are missing.
 */
export function toEventInsert(
  state: EventWizardState,
  userId: string,
  title: string,
): null | Record<string, unknown> {
  if (!state.type || !state.teamId || !state.startDate) return null;
  const startsIso = toIso(state.startDate, state.startTime);
  if (!startsIso) return null;
  const endsIso = addMinutesIso(startsIso, state.durationMin);

  const finalLocationUrl = state.locationUrl?.trim()
    ? state.locationUrl.trim()
    : state.location?.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(state.location.trim())}`
      : null;

  const isMatch = state.type === "match";

  return {
    team_id: state.teamId,
    type: state.type === "other" ? "training" : state.type, // 'other' falls back to training type for now
    title,
    description: null,
    location: state.location ?? null,
    location_url: finalLocationUrl,
    opponent: isMatch ? state.opponent ?? null : null,
    competition_type: isMatch ? state.competitionType ?? "friendly" : null,
    competition_name: null,
    is_home: isMatch ? state.isHome === "home" : null,
    meeting_point: isMatch && state.isHome === "away" ? state.meetingPoint ?? null : null,
    starts_at: startsIso,
    ends_at: state.type === "training" ? endsIso : isMatch ? endsIso : endsIso,
    convocation_time: null,
    status: "published",
    created_by: userId,
    convocations_sent: false,
    is_official: isMatch ? true : Boolean(state.isOfficial),
  };
}

/**
 * Build a partial EventFormValues shape for prefilling EventFormSheet
 * (the "Réglages détaillés" path).
 */
export function toEventFormInitial(state: EventWizardState, title: string): Record<string, unknown> {
  const startsIso = toIso(state.startDate, state.startTime);
  const endsIso = addMinutesIso(startsIso, state.durationMin);
  return {
    team_id: state.teamId || "",
    type: state.type === "other" ? "training" : state.type || "training",
    title,
    description: null,
    location: state.location ?? null,
    location_url: state.locationUrl ?? null,
    opponent: state.opponent ?? null,
    competition_type: state.competitionType ?? "friendly",
    competition_name: null,
    is_home: state.type === "match" ? state.isHome === "home" : null,
    meeting_point: state.meetingPoint ?? null,
    starts_at: startsIso ?? "",
    ends_at: endsIso,
    convocation_time: null,
    is_official: state.type === "match" ? true : Boolean(state.isOfficial),
  };
}
