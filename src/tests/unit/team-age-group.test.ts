import { describe, expect, it } from "vitest";
import {
  TEAM_AGE_CATEGORIES,
  isAdultOnlyAgeGroup,
  isCanonicalTeamAgeCategory,
  resolveTeamAgeCategory,
} from "@/lib/team-age-group";

describe("TEAM_AGE_CATEGORIES catalog", () => {
  it("covers U6–U21 plus Senior / Vétérans / Loisir", () => {
    const codes = TEAM_AGE_CATEGORIES.map((c) => c.code);
    expect(codes).toContain("U6");
    expect(codes).toContain("U15");
    expect(codes).toContain("U19");
    expect(codes).toContain("U20");
    expect(codes).toContain("U21");
    expect(codes).toContain("Senior");
    expect(codes).toContain("Vétérans");
    expect(codes).toContain("Loisir");
    expect(codes).toHaveLength(19);
  });

  it("marks only U20+ / Senior / Vétérans / Loisir as adult-only", () => {
    for (const c of TEAM_AGE_CATEGORIES) {
      const n = /^U(\d+)$/.exec(c.code);
      if (n) {
        expect(c.adultOnly).toBe(parseInt(n[1], 10) >= 20);
      } else {
        expect(c.adultOnly).toBe(true);
      }
    }
  });
});

describe("resolveTeamAgeCategory / isAdultOnlyAgeGroup", () => {
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

  it("resolves legacy free-text toward catalog codes", () => {
    expect(resolveTeamAgeCategory("U15 A")?.code).toBe("U15");
    expect(resolveTeamAgeCategory("senior feminine")?.code).toBe("Senior");
    expect(isCanonicalTeamAgeCategory("U15")).toBe(true);
    expect(isCanonicalTeamAgeCategory("U15 A")).toBe(false);
  });
});
