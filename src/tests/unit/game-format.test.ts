import { describe, expect, it } from "vitest";
import {
  gameFormatPlayerCount,
  parseBestOf,
  parseGameFormat,
  parseHalves,
  upperFirst,
} from "@/lib/events/game-format";

describe("parseGameFormat", () => {
  it("extrait format et mi-temps de la ligne écrite par l'assistant", () => {
    const parsed = parseGameFormat("Format: 11v11 · 2x45 min");
    expect(parsed.format).toBe("11v11");
    expect(parsed.halves).toBe("2x45");
    expect(parsed.rest).toBe("");
  });

  it("laisse le reste de la description intact", () => {
    const parsed = parseGameFormat("Format: 8v8 · 2x30 min\nTenue blanche obligatoire.");
    expect(parsed.format).toBe("8v8");
    expect(parsed.rest).toBe("Tenue blanche obligatoire.");
  });

  it("accepte une ligne Format sans mi-temps", () => {
    const parsed = parseGameFormat("Format: 5v5");
    expect(parsed.format).toBe("5v5");
    expect(parsed.halves).toBeNull();
  });

  it("trouve la ligne même si elle n'est pas la première", () => {
    const parsed = parseGameFormat("Rendez-vous au club.\nFormat: 7v7 · 2x35 min");
    expect(parsed.format).toBe("7v7");
    expect(parsed.halves).toBe("2x35");
    expect(parsed.rest).toBe("Rendez-vous au club.");
  });

  it("rend la description inchangée quand il n'y a pas de ligne Format", () => {
    const parsed = parseGameFormat("Prévoir les crampons vissés.");
    expect(parsed.format).toBeNull();
    expect(parsed.halves).toBeNull();
    expect(parsed.rest).toBe("Prévoir les crampons vissés.");
  });

  it("tolère une description absente", () => {
    expect(parseGameFormat(null)).toEqual({ format: null, halves: null, rest: "" });
    expect(parseGameFormat(undefined).rest).toBe("");
  });

  it("garde un format libre saisi à la main", () => {
    const parsed = parseGameFormat("Format: beach 4 contre 4");
    expect(parsed.format).toBe("beach 4 contre 4");
  });

  it("retient un format best-of", () => {
    const parsed = parseGameFormat("Format: 2v2 · best-of-3 min");
    expect(parsed.format).toBe("2v2");
    expect(parsed.halves).toBe("best-of-3");
  });
});

describe("gameFormatPlayerCount", () => {
  it("lit le nombre de joueurs d'un format symétrique", () => {
    expect(gameFormatPlayerCount("11v11")).toBe(11);
    expect(gameFormatPlayerCount("5v5")).toBe(5);
  });

  it("retient notre effectif sur un format asymétrique", () => {
    expect(gameFormatPlayerCount("9v11")).toBe(9);
  });

  it("refuse ce qui n'est pas un format NvN", () => {
    expect(gameFormatPlayerCount("best-of-3")).toBeNull();
    expect(gameFormatPlayerCount("beach 4 contre 4")).toBeNull();
    expect(gameFormatPlayerCount(null)).toBeNull();
    expect(gameFormatPlayerCount("")).toBeNull();
  });
});

describe("parseHalves", () => {
  it("sépare périodes et durée", () => {
    expect(parseHalves("2x45")).toEqual({ periods: 2, minutes: 45 });
    expect(parseHalves("4x10")).toEqual({ periods: 4, minutes: 10 });
  });

  it("refuse les formats non chiffrés", () => {
    expect(parseHalves("best-of-3")).toBeNull();
    expect(parseHalves(null)).toBeNull();
  });
});

describe("parseBestOf", () => {
  it("lit le nombre de manches", () => {
    expect(parseBestOf("best-of-3")).toBe(3);
    expect(parseBestOf("best-of-5")).toBe(5);
  });

  it("refuse le reste", () => {
    expect(parseBestOf("2x45")).toBeNull();
    expect(parseBestOf(null)).toBeNull();
  });
});

describe("upperFirst", () => {
  it("ne relève que l'initiale", () => {
    expect(upperFirst("samedi 14 mars 2026")).toBe("Samedi 14 mars 2026");
  });

  it("laisse le reste de la casse tranquille", () => {
    expect(upperFirst("Football à 11")).toBe("Football à 11");
  });

  it("tolère la chaîne vide", () => {
    expect(upperFirst("")).toBe("");
  });
});
