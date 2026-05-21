import { describe, it, expect } from "vitest";
import {
  formationSlots,
  FORMATIONS,
  type FormationKey,
} from "@/lib/football-formations";

describe("formationSlots — structure générale", () => {
  const allFormations: FormationKey[] = ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "3-4-3", "custom"];

  for (const formation of allFormations) {
    it(`${formation} : contient exactement 11 slots`, () => {
      const slots = formationSlots(formation);
      expect(slots).toHaveLength(11);
    });

    it(`${formation} : contient exactement 1 gardien`, () => {
      const slots = formationSlots(formation);
      const gks = slots.filter((s) => s.role === "GK");
      expect(gks).toHaveLength(1);
    });

    it(`${formation} : le gardien est en id 'gk'`, () => {
      const slots = formationSlots(formation);
      const gk = slots.find((s) => s.role === "GK");
      expect(gk?.id).toBe("gk");
    });

    it(`${formation} : le gardien est centré (x=50)`, () => {
      const slots = formationSlots(formation);
      const gk = slots.find((s) => s.role === "GK");
      expect(gk?.x).toBe(50);
    });

    it(`${formation} : le gardien est en bas du terrain (y=90)`, () => {
      const slots = formationSlots(formation);
      const gk = slots.find((s) => s.role === "GK");
      expect(gk?.y).toBe(90);
    });

    it(`${formation} : tous les IDs sont uniques`, () => {
      const slots = formationSlots(formation);
      const ids = slots.map((s) => s.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it(`${formation} : toutes les coordonnées x sont entre 0 et 100`, () => {
      const slots = formationSlots(formation);
      for (const s of slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(100);
      }
    });

    it(`${formation} : toutes les coordonnées y sont entre 0 et 100`, () => {
      const slots = formationSlots(formation);
      for (const s of slots) {
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(100);
      }
    });

    it(`${formation} : tous les rôles sont valides`, () => {
      const validRoles = ["GK", "DEF", "MID", "FWD"];
      const slots = formationSlots(formation);
      for (const s of slots) {
        expect(validRoles).toContain(s.role);
      }
    });
  }
});

describe("formationSlots — 4-4-2", () => {
  it("4 défenseurs", () => {
    const slots = formationSlots("4-4-2");
    expect(slots.filter((s) => s.role === "DEF")).toHaveLength(4);
  });

  it("4 milieux", () => {
    const slots = formationSlots("4-4-2");
    expect(slots.filter((s) => s.role === "MID")).toHaveLength(4);
  });

  it("2 attaquants", () => {
    const slots = formationSlots("4-4-2");
    expect(slots.filter((s) => s.role === "FWD")).toHaveLength(2);
  });

  it("défenseurs plus proches du gardien que les milieux", () => {
    const slots = formationSlots("4-4-2");
    const defY = Math.min(...slots.filter((s) => s.role === "DEF").map((s) => s.y));
    const midY = Math.max(...slots.filter((s) => s.role === "MID").map((s) => s.y));
    expect(defY).toBeGreaterThan(midY);
  });

  it("milieux plus proches du gardien que les attaquants", () => {
    const slots = formationSlots("4-4-2");
    const midY = Math.min(...slots.filter((s) => s.role === "MID").map((s) => s.y));
    const fwdY = Math.max(...slots.filter((s) => s.role === "FWD").map((s) => s.y));
    expect(midY).toBeGreaterThan(fwdY);
  });
});

describe("formationSlots — 4-3-3", () => {
  it("4 défenseurs, 3 milieux, 3 attaquants", () => {
    const slots = formationSlots("4-3-3");
    expect(slots.filter((s) => s.role === "DEF")).toHaveLength(4);
    expect(slots.filter((s) => s.role === "MID")).toHaveLength(3);
    expect(slots.filter((s) => s.role === "FWD")).toHaveLength(3);
  });
});

describe("formationSlots — 4-2-3-1", () => {
  it("4 défenseurs, 5 milieux, 1 attaquant", () => {
    const slots = formationSlots("4-2-3-1");
    expect(slots.filter((s) => s.role === "DEF")).toHaveLength(4);
    expect(slots.filter((s) => s.role === "MID")).toHaveLength(5);
    expect(slots.filter((s) => s.role === "FWD")).toHaveLength(1);
  });

  it("l'attaquant est à x=50 (centré)", () => {
    const slots = formationSlots("4-2-3-1");
    const fwd = slots.find((s) => s.role === "FWD");
    expect(fwd?.x).toBe(50);
  });
});

describe("formationSlots — 3-5-2", () => {
  it("3 défenseurs, 5 milieux, 2 attaquants", () => {
    const slots = formationSlots("3-5-2");
    expect(slots.filter((s) => s.role === "DEF")).toHaveLength(3);
    expect(slots.filter((s) => s.role === "MID")).toHaveLength(5);
    expect(slots.filter((s) => s.role === "FWD")).toHaveLength(2);
  });
});

describe("formationSlots — 3-4-3", () => {
  it("3 défenseurs, 4 milieux, 3 attaquants", () => {
    const slots = formationSlots("3-4-3");
    expect(slots.filter((s) => s.role === "DEF")).toHaveLength(3);
    expect(slots.filter((s) => s.role === "MID")).toHaveLength(4);
    expect(slots.filter((s) => s.role === "FWD")).toHaveLength(3);
  });
});

describe("formationSlots — custom", () => {
  it("retourne 11 slots non vides (layout 4-3-3 par défaut)", () => {
    const slots = formationSlots("custom");
    expect(slots).toHaveLength(11);
  });

  it("contient un gardien", () => {
    const slots = formationSlots("custom");
    expect(slots.filter((s) => s.role === "GK")).toHaveLength(1);
  });
});

describe("répartition horizontale", () => {
  it("les joueurs d'une même ligne sont équidistants", () => {
    const slots = formationSlots("4-4-2");
    const defenders = slots
      .filter((s) => s.role === "DEF")
      .sort((a, b) => a.x - b.x);
    const gaps = defenders.slice(1).map((s, i) => s.x - defenders[i].x);
    const firstGap = gaps[0];
    for (const gap of gaps) {
      expect(Math.abs(gap - firstGap)).toBeLessThan(0.01);
    }
  });
});

describe("FORMATIONS liste", () => {
  it("contient toutes les formations attendues", () => {
    const keys = FORMATIONS.map((f) => f.key);
    expect(keys).toContain("4-4-2");
    expect(keys).toContain("4-3-3");
    expect(keys).toContain("4-2-3-1");
    expect(keys).toContain("3-5-2");
    expect(keys).toContain("3-4-3");
    expect(keys).toContain("custom");
  });

  it("chaque formation a une clé et un label", () => {
    for (const f of FORMATIONS) {
      expect(f.key).toBeTruthy();
      expect(f.label).toBeTruthy();
    }
  });

  it("6 formations au total", () => {
    expect(FORMATIONS).toHaveLength(6);
  });
});
