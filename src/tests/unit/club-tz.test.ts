import { describe, expect, it } from "vitest";
import {
  CLUB_TIMEZONES,
  DEFAULT_CLUB_TZ,
  formatDateOnly,
  resolveClubTz,
  withClubTz,
} from "@/lib/time/club-tz";

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

describe("formatDateOnly (code réel utilisé par les notifications d'absence)", () => {
  it("garde le jour saisi quel que soit le fuseau du process", () => {
    expect(formatDateOnly("2026-08-07", "fr-FR")).toBe("vendredi 7 août");
    expect(formatDateOnly("2026-01-01", "en-GB", { day: "numeric", month: "long" })).toBe(
      "1 January",
    );
  });

  const withProcessTz = (zone: string, fn: () => void) => {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
      fn();
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  };

  it("ne recule pas d'un jour en fuseau occidental (protège timeZone: UTC)", () => {
    withProcessTz("America/Los_Angeles", () => {
      expect(formatDateOnly("2026-08-07", "fr-FR", { day: "numeric", month: "numeric" })).toMatch(
        /^0?7\/0?8$/,
      );
    });
  });

  it("ne recule pas d'un jour en fuseau oriental (protège le suffixe Z du parsing)", () => {
    withProcessTz("Asia/Tokyo", () => {
      expect(formatDateOnly("2026-08-07", "fr-FR", { day: "numeric", month: "numeric" })).toMatch(
        /^0?7\/0?8$/,
      );
    });
  });

  it("retourne la valeur brute si la locale est invalide", () => {
    expect(formatDateOnly("2026-08-07", "!!invalid!!")).toBe("2026-08-07");
  });
});
