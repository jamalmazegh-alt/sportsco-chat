import { describe, expect, it } from "vitest";
import { isAdultOnlyAgeGroup } from "@/lib/team-age-group";

describe("isAdultOnlyAgeGroup", () => {
  it("is false when the age group is missing or youth", () => {
    expect(isAdultOnlyAgeGroup(null)).toBe(false);
    expect(isAdultOnlyAgeGroup(undefined)).toBe(false);
    expect(isAdultOnlyAgeGroup("")).toBe(false);
    expect(isAdultOnlyAgeGroup("U15")).toBe(false);
    expect(isAdultOnlyAgeGroup("U18 Filles")).toBe(false);
    expect(isAdultOnlyAgeGroup("U19")).toBe(false);
    expect(isAdultOnlyAgeGroup("Espoirs")).toBe(false);
  });

  it("is true for senior / vétérans / loisir / U20+", () => {
    expect(isAdultOnlyAgeGroup("Senior")).toBe(true);
    expect(isAdultOnlyAgeGroup("Séniors")).toBe(true);
    expect(isAdultOnlyAgeGroup("Vétérans")).toBe(true);
    expect(isAdultOnlyAgeGroup("Loisir")).toBe(true);
    expect(isAdultOnlyAgeGroup("U20")).toBe(true);
    expect(isAdultOnlyAgeGroup("U 21")).toBe(true);
  });
});
