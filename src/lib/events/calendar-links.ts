/**
 * Pure helpers to build "add to calendar" links for an event.
 * No DOM, no DB — safe to import anywhere and unit-testable.
 */

export interface CalendarEventInput {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string; // ISO
  endsAt?: string | null; // ISO
  /** Absolute URL of the event page, appended to the description when present. */
  url?: string | null;
}

const DEFAULT_DURATION_MS = 90 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC basic format used by both Google Calendar and iCalendar: 20250906T130000Z */
export function toCalendarUtc(iso: string): string {
  const d = new Date(iso);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export function resolveEnd(input: CalendarEventInput): string {
  if (input.endsAt) {
    const end = new Date(input.endsAt).getTime();
    const start = new Date(input.startsAt).getTime();
    if (!Number.isNaN(end) && end > start) return input.endsAt;
  }
  return new Date(new Date(input.startsAt).getTime() + DEFAULT_DURATION_MS).toISOString();
}

function fullDescription(input: CalendarEventInput): string {
  return [input.description?.trim() || "", input.url?.trim() || ""].filter(Boolean).join("\n\n");
}

export function buildGoogleCalendarUrl(input: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${toCalendarUtc(input.startsAt)}/${toCalendarUtc(resolveEnd(input))}`,
  });
  const details = fullDescription(input);
  if (details) params.set("details", details);
  if (input.location) params.set("location", input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escapes a value per RFC 5545 (commas, semicolons, backslashes, newlines). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folds long lines at 75 octets as required by RFC 5545. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

export function buildIcsContent(input: CalendarEventInput, now = new Date()): string {
  const details = fullDescription(input);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Clubero//Events//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.id}@clubero.app`,
    `DTSTAMP:${toCalendarUtc(now.toISOString())}`,
    `DTSTART:${toCalendarUtc(input.startsAt)}`,
    `DTEND:${toCalendarUtc(resolveEnd(input))}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    ...(details ? [`DESCRIPTION:${escapeIcsText(details)}`] : []),
    ...(input.location ? [`LOCATION:${escapeIcsText(input.location)}`] : []),
    ...(input.url ? [`URL:${input.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n");
}

export function icsFileName(title: string): string {
  const slug =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "evenement";
  return `${slug}.ics`;
}
