import { describe, it, expect } from "vitest";
import {
  dateToIso,
  isStrictIsoDate,
  parseFlexibleDate,
  normalizeSheetCell,
} from "@/lib/superadmin-import/sheet-date";
import { PLAYER_FIELDS } from "@/lib/superadmin-import/schemas";
import { parseTemplate } from "@/lib/superadmin-import/template-parse";

describe("sheet-date: dateToIso (TZ-safe)", () => {
  it("uses local components, no toISOString drift", () => {
    // SheetJS with cellDates:true constructs Date via new Date(y, m-1, d)
    // in local time. dateToIso must round-trip that.
    expect(dateToIso(new Date(2014, 10, 30))).toBe("2014-11-30");
    expect(dateToIso(new Date(2010, 4, 12))).toBe("2010-05-12");
    expect(dateToIso(new Date(2000, 0, 1))).toBe("2000-01-01");
    expect(dateToIso(new Date(1999, 11, 31))).toBe("1999-12-31");
  });
});

describe("sheet-date: isStrictIsoDate", () => {
  it("accepts real calendar days", () => {
    expect(isStrictIsoDate("2014-11-30")).toBe(true);
    expect(isStrictIsoDate("2020-02-29")).toBe(true);
  });
  it("rejects impossible days silently produced by old normalizer", () => {
    expect(isStrictIsoDate("2014-30-11")).toBe(false); // mois 30
    expect(isStrictIsoDate("2021-02-29")).toBe(false); // pas bissextile
    expect(isStrictIsoDate("2014-13-01")).toBe(false);
    expect(isStrictIsoDate("2014-00-10")).toBe(false);
    expect(isStrictIsoDate("2014-11-31")).toBe(false);
  });
  it("rejects non-ISO shapes", () => {
    expect(isStrictIsoDate("14-11-2014")).toBe(false);
    expect(isStrictIsoDate("2014/11/30")).toBe(false);
  });
});

describe("sheet-date: parseFlexibleDate", () => {
  it("keeps ISO as-is", () => {
    expect(parseFlexibleDate("2014-11-30")).toEqual({
      iso: "2014-11-30",
      ambiguous: false,
    });
  });
  it("deduces order when one side > 12 (US format)", () => {
    expect(parseFlexibleDate("11/30/2014").iso).toBe("2014-11-30");
    expect(parseFlexibleDate("11-30-2014").iso).toBe("2014-11-30");
  });
  it("deduces order when one side > 12 (FR format)", () => {
    expect(parseFlexibleDate("30/11/2014").iso).toBe("2014-11-30");
    expect(parseFlexibleDate("30-11-2014").iso).toBe("2014-11-30");
  });
  it("flags ambiguity when both components <= 12 instead of guessing", () => {
    const r = parseFlexibleDate("2/4/2014");
    expect(r.iso).toBeNull();
    expect(r.ambiguous).toBe(true);
  });
  it("rejects impossible dates instead of returning invented ones", () => {
    expect(parseFlexibleDate("30/13/2014").iso).toBeNull(); // mois > 12 des deux côtés → rejeté
    expect(parseFlexibleDate("31/04/2014").iso).toBeNull(); // 31 avril
  });
  it("parses Excel serial numbers", () => {
    // 42005 = 2015-01-01
    expect(parseFlexibleDate("42005").iso).toBe("2015-01-01");
  });
});

describe("sheet-date: normalizeSheetCell", () => {
  it("converts native Date (SheetJS cellDates:true) to ISO", () => {
    expect(normalizeSheetCell(new Date(2014, 10, 30))).toBe("2014-11-30");
  });
  it("trims strings and leaves numbers untouched", () => {
    expect(normalizeSheetCell("  hi  ")).toBe("hi");
    expect(normalizeSheetCell(7)).toBe(7);
  });
});

describe("template-parse: pipeline mm-dd-yy anti-inversion", () => {
  it("US-cell (Date object) → ISO preserved through parseTemplate", () => {
    // Simule ce que SheetJS renvoie avec raw:true + cellDates:true
    // sur un fichier dont la colonne est au format mm-dd-yy : un Date natif.
    const cellDate = new Date(2014, 10, 30); // 30 novembre 2014, local
    const raw = normalizeSheetCell(cellDate) as string;
    const rows = [
      {
        equipe: "U13",
        sport: "football",
        categorie: "U13",
        prenom_joueur: "Léa",
        nom_joueur: "Martin",
        date_naissance: raw,
      },
    ];
    const headers = Object.keys(rows[0]);
    const res = parseTemplate("players", headers, rows);
    const cell = res.rows[0].date_naissance;
    expect(cell.value).toBe("2014-11-30");
    expect(cell.error).toBeNull();
  });

  it("ambiguous text-cell → flagged, not silently mis-parsed", () => {
    const rows = [
      {
        equipe: "U13",
        sport: "football",
        categorie: "U13",
        prenom_joueur: "Léa",
        nom_joueur: "Martin",
        date_naissance: "2/4/2014",
      },
    ];
    const res = parseTemplate("players", Object.keys(rows[0]), rows);
    const cell = res.rows[0].date_naissance;
    expect(cell.error).toMatch(/ambig/i);
    expect(res.summary.to_fix).toBe(1);
  });

  it("impossible date rejected (regression: 2014-30-11 no longer passes)", () => {
    const rows = [
      {
        equipe: "U13",
        sport: "football",
        categorie: "U13",
        prenom_joueur: "Léa",
        nom_joueur: "Martin",
        date_naissance: "2014-30-11", // ce que produisait l'ancien normalizer
      },
    ];
    const res = parseTemplate("players", Object.keys(rows[0]), rows);
    const cell = res.rows[0].date_naissance;
    expect(cell.error).toBeTruthy();
  });

  it("11/30/2014, 30/11/2014, 2014-11-30 all normalize to 2014-11-30", () => {
    for (const input of ["11/30/2014", "30/11/2014", "2014-11-30"]) {
      const rows = [
        {
          equipe: "U13",
          sport: "football",
          categorie: "U13",
          prenom_joueur: "X",
          nom_joueur: "Y",
          date_naissance: input,
        },
      ];
      const res = parseTemplate("players", Object.keys(rows[0]), rows);
      expect(res.rows[0].date_naissance.value).toBe("2014-11-30");
      expect(res.rows[0].date_naissance.error).toBeNull();
    }
  });
});
