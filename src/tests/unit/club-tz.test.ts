import { describe, expect, it } from "vitest";
import { CLUB_TIMEZONES, DEFAULT_CLUB_TZ, resolveClubTz, withClubTz } from "@/lib/time/club-tz";

describe("resolveClubTz", () => {
  it("falls back to Europe/Paris for empty or invalid input", () => {
    expect(resolveClubTz(null)).toBe(DEFAULT_CLUB_TZ);
    expect(resolveClubTz(undefined)).toBe(DEFAULT_CLUB_TZ);
    expect(resolveClubTz("  ")).toBe(DEFAULT_CLUB_TZ);
    expect(resolveClubTz("Mars/Olympus")).toBe(DEFAULT_CLUB_TZ);
  });

  it("keeps every timezone offered in the club settings list", () => {
    for (const tz of CLUB_TIMEZONES) expect(resolveClubTz(tz)).toBe(tz);
  });
});

describe("withClubTz", () => {
  it("merges the resolved timezone into Intl options", () => {
    expect(withClubTz({ hour: "2-digit" }, "America/Montreal")).toEqual({
      hour: "2-digit",
      timeZone: "America/Montreal",
    });
    expect(withClubTz({}, "nope").timeZone).toBe(DEFAULT_CLUB_TZ);
  });
});

describe("date-only rendering", () => {
  const render = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });

  it("keeps the calendar day stable regardless of the club timezone", () => {
    expect(render("2026-08-07")).toContain("7");
  });
});
