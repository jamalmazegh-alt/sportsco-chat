/**
 * Event wizard config + state + helpers.
 *
 * The wizard is deterministic (no LLM). It walks the user through a series of
 * questions, persists progress in sessionStorage (see event-wizard-draft.ts)
 * and produces either:
 *   - a single event insert payload (same shape as EventFormSheet)
 *   - a training-series payload (consumed by createTrainingSeries)
 */

import {
  buildEventPayload,
  type BuildEventPayloadInput,
  type EventRowPayload,
} from "@/lib/events/event-payload";

export type WizardEventType = "training" | "match" | "meeting" | "other";
export type IsHome = "home" | "away";
export type ConvocScope = "all" | "selection" | "none";

export type RecurrenceMode = "single" | "multi_day" | "weekly_one" | "weekly_multi" | "custom";

export interface RecurrenceState {
  mode: RecurrenceMode;
  weekdays: number[]; // 0=Sun..6=Sat
  startsOn?: string; // yyyy-mm-dd (season start)
  endsOn?: string; // yyyy-mm-dd (season end)
}

export interface EventWizardState {
  type: WizardEventType | "";
  /** Meeting scope: real team or internal (transverse) club team. */
  meetingScope?: "team" | "internal";
  /** Serialized audience picker state for meetings (Set → Array for storage). */
  meetingAudience?: {
    scalar: string[];
    groupIds: string[];
    teamPicks: Array<{ team_id: string; kind: string }>;
    category: string;
    preassigned: Array<{ user_id: string; full_name: string | null }>;
  };
  teamId: string;
  startDate?: string; // yyyy-mm-dd
  /** Optional end date for multi-day "other" events (e.g. team camp). */
  endDate?: string; // yyyy-mm-dd
  /** User-provided title (used mainly for "other" events, e.g. a camp name). */
  customTitle?: string;
  startTime: string; // HH:mm
  /** Optional end time (HH:mm). When set, duration is derived from endTime - startTime. */
  endTime?: string;
  durationMin: number;
  /** Per-day override for multi-day "other" events. yyyy-mm-dd → { start, end } (HH:mm). */
  dayTimes?: Record<string, { start: string; end: string }>;
  halvesFormat?: string; // e.g. "2x45"
  gameFormat?: string; // e.g. "11v11"
  isHome?: IsHome;
  meetingPoint?: string; // free address (away matches)
  meetingTime?: string; // HH:mm (away matches OR training convocation time)
  opponent?: string;
  isOfficial?: boolean;
  competitionType?: "friendly" | "championship" | "cup";
  competitionName?: string;
  /** Selected championship (championship type only). */
  championshipId?: string | null;
  location?: string;
  locationUrl?: string | null;
  /** Structured venue link (optional). Filled by VenuePicker. */
  venueId?: string | null;
  /** Structured facility link (optional). Filled by VenuePicker. */
  facilityId?: string | null;
  description?: string; // free comment added by the user

  convocScope: ConvocScope;
  carpoolEnabled?: boolean;
  recurrence?: RecurrenceState;
  // book-keeping
  step: number;
  /** Tracks which steps the user has explicitly answered (visual hint). */
  touched?: string[];
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
  if (state.customTitle?.trim()) return state.customTitle.trim();
  switch (state.type) {
    case "match":
      return state.opponent
        ? `${name} vs ${state.opponent}`.trim()
        : `${t("events.types.match")} ${name}`.trim();
    case "training":
      return `${t("events.types.training")} ${name}`.trim();
    case "meeting":
      return `${t("events.types.meeting")} ${name}`.trim();
    default:
      return name || t("events.types.other");
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

/** Compute duration (minutes) between two HH:mm times on the same day. Null if invalid or non-positive. */
export function minutesBetweenTimes(startTime: string, endTime: string): number | null {
  const parse = (t: string) => {
    const [h, m] = t.split(":").map((n) => parseInt(n, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const a = parse(startTime);
  const b = parse(endTime);
  if (a == null || b == null) return null;
  const d = b - a;
  return d > 0 ? d : null;
}

/** Effective duration in minutes: endTime overrides durationMin when set and valid. */
export function effectiveDuration(state: EventWizardState): number {
  if (state.endTime) {
    const d = minutesBetweenTimes(state.startTime, state.endTime);
    if (d) return d;
  }
  return state.durationMin;
}

/**
 * Map wizard state to the shared builder input (single source of truth).
 * Returns null if mandatory fields are missing.
 */
export function toEventPayloadInput(
  state: EventWizardState,
  title: string,
): BuildEventPayloadInput | null {
  if (!state.type || !state.teamId || !state.startDate) return null;
  const startsIso = toIso(state.startDate, state.startTime);
  if (!startsIso) return null;
  const duration = effectiveDuration(state);
  // Multi-day "other" events (e.g. camp): end at endDate + startTime + duration
  const isMultiDay = state.type === "other" && !!state.endDate && state.endDate > state.startDate;
  const endsIso = isMultiDay
    ? addMinutesIso(toIso(state.endDate, state.startTime), duration)
    : addMinutesIso(startsIso, duration);
  const isMatch = state.type === "match";
  const isHomeMatch = isMatch && state.isHome === "home";
  const isAwayMatch = isMatch && state.isHome === "away";

  // Combine game format + per-day schedule + user comment into description
  const descParts: string[] = [];
  if (state.gameFormat) {
    descParts.push(
      `Format: ${state.gameFormat}${state.halvesFormat ? ` · ${state.halvesFormat} min` : ""}`,
    );
  }
  if (isMultiDay && state.dayTimes && Object.keys(state.dayTimes).length > 0) {
    const lines = Object.entries(state.dayTimes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, t]) => `${d}: ${t.start} - ${t.end}`);
    if (lines.length) descParts.push(`Horaires:\n${lines.join("\n")}`);
  }
  if (state.description?.trim()) descParts.push(state.description.trim());
  const desc = descParts.length ? descParts.join("\n") : null;

  // Convocation time = startDate + meetingTime
  const convocIso = state.meetingTime ? toIso(state.startDate, state.meetingTime) : null;

  return {
    teamId: state.teamId,
    type: state.type,
    title,
    description: desc,
    location: isHomeMatch ? (state.location ?? null) : (state.location ?? null),
    locationUrl: state.locationUrl ?? null,
    opponent: state.opponent ?? null,
    competitionType: state.competitionType ?? null,
    competitionName: state.competitionName?.trim() ? state.competitionName.trim() : null,
    championshipId:
      state.competitionType === "championship" ? (state.championshipId ?? null) : null,
    isHome: isMatch ? state.isHome === "home" : null,
    meetingPoint: isAwayMatch ? (state.meetingPoint ?? null) : null,
    startsAt: startsIso,
    endsAt: endsIso,
    convocationTime: convocIso,
    isOfficial: state.isOfficial,
    carpoolEnabled: typeof state.carpoolEnabled === "boolean" ? state.carpoolEnabled : undefined,
    venueId: state.venueId ?? null,
    facilityId: state.facilityId ?? null,
  };
}

/**
 * Map wizard state to an event row payload via the shared builder.
 * Returns null if mandatory fields are missing.
 */
export function toEventInsert(state: EventWizardState, title: string): null | EventRowPayload {
  const input = toEventPayloadInput(state, title);
  if (!input) return null;
  return buildEventPayload(input);
}

/**
 * Build a partial EventFormValues shape for prefilling EventFormSheet
 * (the "Réglages détaillés" path). 'other' stays 'other'.
 */
export function toEventFormInitial(
  state: EventWizardState,
  title: string,
): Record<string, unknown> {
  const startsIso = toIso(state.startDate, state.startTime);
  const isMultiDay =
    state.type === "other" &&
    !!state.endDate &&
    !!state.startDate &&
    state.endDate > state.startDate;
  const duration = effectiveDuration(state);
  const endsIso = isMultiDay
    ? addMinutesIso(toIso(state.endDate, state.startTime), duration)
    : addMinutesIso(startsIso, duration);
  const descParts: string[] = [];
  if (state.gameFormat) {
    descParts.push(
      `Format: ${state.gameFormat}${state.halvesFormat ? ` · ${state.halvesFormat} min` : ""}`,
    );
  }
  if (state.description?.trim()) descParts.push(state.description.trim());
  return {
    team_id: state.teamId || "",
    type: state.type || "training",
    title,
    description: descParts.length ? descParts.join("\n") : null,
    location: state.location ?? null,
    location_url: state.locationUrl ?? null,
    opponent: state.opponent ?? null,
    competition_type: state.competitionType ?? "friendly",
    competition_name: state.competitionName?.trim() ? state.competitionName.trim() : null,
    is_home: state.type === "match" ? state.isHome === "home" : null,
    meeting_point:
      state.type === "match" && state.isHome === "away" ? (state.meetingPoint ?? null) : null,
    starts_at: startsIso ?? "",
    ends_at: endsIso,
    convocation_time: state.meetingTime ? toIso(state.startDate, state.meetingTime) : null,
    is_official: state.type === "match" ? true : Boolean(state.isOfficial),
    venue_id: state.venueId ?? null,
    facility_id: state.facilityId ?? null,
  };
}
