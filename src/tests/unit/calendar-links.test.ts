import { describe, it, expect } from "vitest";
import {
  buildGoogleCalendarUrl,
  buildIcsContent,
  escapeIcsText,
  icsFileName,
  resolveEnd,
  toCalendarUtc,
} from "@/lib/events/calendar-links";

const BASE = {
  id: "evt-1",
  title: "U15 vs FC Metz",
  description: "Match de championnat",
  location: "Stade municipal, Metz",
  startsAt: "2025-09-06T13:00:00.000Z",
  endsAt: "2025-09-06T14:30:00.000Z",
  url: "https://clubero.app/events/evt-1",
};

describe("calendar links", () => {
  it("formats UTC stamps", () => {
    expect(toCalendarUtc("2025-09-06T13:00:00.000Z")).toBe("20250906T130000Z");
  });

  it("falls back to a 90 min duration when end is missing or invalid", () => {
    expect(resolveEnd({ ...BASE, endsAt: null })).toBe("2025-09-06T14:30:00.000Z");
    expect(resolveEnd({ ...BASE, endsAt: "2025-09-06T12:00:00.000Z" })).toBe(
      "2025-09-06T14:30:00.000Z",
    );
  });

  it("builds a Google Calendar template URL", () => {
    const url = new URL(buildGoogleCalendarUrl(BASE));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("U15 vs FC Metz");
    expect(url.searchParams.get("dates")).toBe("20250906T130000Z/20250906T143000Z");
    expect(url.searchParams.get("location")).toBe("Stade municipal, Metz");
    expect(url.searchParams.get("details")).toContain("https://clubero.app/events/evt-1");
  });

  it("escapes ICS special characters", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("builds a valid VEVENT", () => {
    const ics = buildIcsContent(BASE, new Date("2025-09-01T00:00:00.000Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:evt-1@clubero.app");
    expect(ics).toContain("DTSTART:20250906T130000Z");
    expect(ics).toContain("DTEND:20250906T143000Z");
    expect(ics).toContain("SUMMARY:U15 vs FC Metz");
    expect(ics).toContain("LOCATION:Stade municipal\\, Metz");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("slugifies the file name", () => {
    expect(icsFileName("Entraînement U15 !")).toBe("entrainement-u15.ics");
    expect(icsFileName("")).toBe("evenement.ics");
  });
});
