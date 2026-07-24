/**
 * Tests unitaires pour le calcul FFF de la catégorie d'âge.
 * Helpers purs — pas de dépendance DB.
 */
import { describe, it, expect } from "vitest";
import {
  computeFffCategory,
  parseSeasonEndYear,
  seasonLabelFromEndYear,
} from "@/lib/fff-category";

describe("parseSeasonEndYear", () => {
  it("parses YYYY-YYYY", () => {
    expect(parseSeasonEndYear("2024-2025")).toBe(2025);
  });
  it("parses YYYY/YYYY", () => {
    expect(parseSeasonEndYear("2024/2025")).toBe(2025);
  });
  it("parses YY-YY as 20xx", () => {
    expect(parseSeasonEndYear("24-25")).toBe(2025);
  });
  it("parses single year (end year)", () => {
    expect(parseSeasonEndYear("2025")).toBe(2025);
  });
  it("returns null for garbage", () => {
    expect(parseSeasonEndYear("saison")).toBeNull();
    expect(parseSeasonEndYear(null)).toBeNull();
    expect(parseSeasonEndYear("")).toBeNull();
  });
});

describe("computeFffCategory", () => {
  // Saison 2024-2025 (endYear = 2025)
  it("U15 for 2010-born in season 2024-2025", () => {
    expect(computeFffCategory("2010-05-14", 2025)).toBe("U15");
  });
  it("U6 lower bound", () => {
    expect(computeFffCategory("2019-01-01", 2025)).toBe("U6");
  });
  it("U19 upper bound", () => {
    expect(computeFffCategory("2006-12-31", 2025)).toBe("U19");
  });
  it("Senior when diff >= 20", () => {
    expect(computeFffCategory("2005-01-01", 2025)).toBe("Senior");
    expect(computeFffCategory("1980-06-06", 2025)).toBe("Senior");
  });
  it("returns null for too young (< 4)", () => {
    expect(computeFffCategory("2023-01-01", 2025)).toBeNull();
  });
  it("returns null for invalid date", () => {
    expect(computeFffCategory("14/05/2010", 2025)).toBeNull();
    expect(computeFffCategory(null, 2025)).toBeNull();
    expect(computeFffCategory("not-a-date", 2025)).toBeNull();
  });
  it("accepts Date objects (UTC year)", () => {
    expect(computeFffCategory(new Date(Date.UTC(2010, 4, 14)), 2025)).toBe("U15");
  });
});

describe("seasonLabelFromEndYear", () => {
  it("builds YYYY-YYYY", () => {
    expect(seasonLabelFromEndYear(2025)).toBe("2024-2025");
  });
});
