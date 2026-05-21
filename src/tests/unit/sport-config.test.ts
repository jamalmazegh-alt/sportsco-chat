import { describe, it, expect } from "vitest";
import {
  getSportConfig,
  SOLO_STAT_KINDS,
  type StatKind,
} from "@/lib/sport-config";

describe("getSportConfig — sports connus", () => {
  it("football retourne config complète", () => {
    const cfg = getSportConfig("football");
    expect(cfg.scoreUnit).toBe("goals");
    expect(cfg.assistsEnabled).toBe(true);
    expect(cfg.cardsEnabled).toBe(true);
    expect(cfg.minuteEnabled).toBe(true);
    expect(cfg.setScoresEnabled).toBe(false);
    expect(cfg.defaultStatKind).toBe("goal");
    expect(cfg.statKinds).toContain("goal");
    expect(cfg.statKinds).toContain("assist");
    expect(cfg.statKinds).toContain("yellow_card");
    expect(cfg.statKinds).toContain("red_card");
  });

  it("futsal a la même config que football", () => {
    const football = getSportConfig("football");
    const futsal = getSportConfig("futsal");
    expect(futsal.scoreUnit).toBe(football.scoreUnit);
    expect(futsal.assistsEnabled).toBe(football.assistsEnabled);
    expect(futsal.cardsEnabled).toBe(football.cardsEnabled);
    expect(futsal.defaultStatKind).toBe(football.defaultStatKind);
  });

  it("basketball retourne config points sans cartons", () => {
    const cfg = getSportConfig("basketball");
    expect(cfg.scoreUnit).toBe("points");
    expect(cfg.cardsEnabled).toBe(false);
    expect(cfg.minuteEnabled).toBe(false);
    expect(cfg.assistsEnabled).toBe(true);
    expect(cfg.defaultStatKind).toBe("point");
    expect(cfg.statKinds).toContain("point");
    expect(cfg.statKinds).toContain("foul");
  });

  it("volleyball retourne config sets", () => {
    const cfg = getSportConfig("volleyball");
    expect(cfg.scoreUnit).toBe("sets");
    expect(cfg.setScoresEnabled).toBe(true);
    expect(cfg.assistsEnabled).toBe(false);
    expect(cfg.cardsEnabled).toBe(false);
    expect(cfg.minuteEnabled).toBe(false);
    expect(cfg.statKinds).toContain("point");
  });

  it("handball retourne config avec buts et cartons", () => {
    const cfg = getSportConfig("handball");
    expect(cfg.scoreUnit).toBe("goals");
    expect(cfg.cardsEnabled).toBe(true);
    expect(cfg.assistsEnabled).toBe(true);
    expect(cfg.minuteEnabled).toBe(true);
    expect(cfg.statKinds).toContain("goal");
    expect(cfg.statKinds).toContain("yellow_card");
  });

  it("rugby retourne config essais sans assists", () => {
    const cfg = getSportConfig("rugby");
    expect(cfg.scoreUnit).toBe("points");
    expect(cfg.assistsEnabled).toBe(false);
    expect(cfg.cardsEnabled).toBe(true);
    expect(cfg.minuteEnabled).toBe(true);
    expect(cfg.defaultStatKind).toBe("try");
    expect(cfg.statKinds).toContain("try");
  });

  it("ice_hockey retourne config buts avec assists", () => {
    const cfg = getSportConfig("ice_hockey");
    expect(cfg.scoreUnit).toBe("goals");
    expect(cfg.assistsEnabled).toBe(true);
    expect(cfg.cardsEnabled).toBe(false);
    expect(cfg.statKinds).toContain("penalty");
  });

  it("field_hockey retourne config buts avec cartons", () => {
    const cfg = getSportConfig("field_hockey");
    expect(cfg.scoreUnit).toBe("goals");
    expect(cfg.cardsEnabled).toBe(true);
    expect(cfg.statKinds).toContain("white_card");
  });
});

describe("getSportConfig — cas limites", () => {
  it("null retourne la config football par défaut", () => {
    const cfg = getSportConfig(null);
    expect(cfg.scoreUnit).toBe("goals");
    expect(cfg.defaultStatKind).toBe("goal");
  });

  it("undefined retourne la config football par défaut", () => {
    const cfg = getSportConfig(undefined);
    expect(cfg.scoreUnit).toBe("goals");
  });

  it("sport inconnu retourne le fallback sans statKinds", () => {
    const cfg = getSportConfig("curling");
    expect(cfg.statKinds).toHaveLength(0);
    expect(cfg.assistsEnabled).toBe(false);
    expect(cfg.cardsEnabled).toBe(false);
  });

  it("sport inconnu retourne scoreUnit points", () => {
    const cfg = getSportConfig("unknownsport_xyz");
    expect(cfg.scoreUnit).toBe("points");
  });

  it("chaîne vide retourne la config football", () => {
    const cfg = getSportConfig("");
    expect(cfg.scoreUnit).toBe("goals");
  });
});

describe("SOLO_STAT_KINDS", () => {
  it("contient yellow_card", () => {
    expect(SOLO_STAT_KINDS).toContain("yellow_card");
  });

  it("contient red_card", () => {
    expect(SOLO_STAT_KINDS).toContain("red_card");
  });

  it("contient white_card", () => {
    expect(SOLO_STAT_KINDS).toContain("white_card");
  });

  it("contient own_goal", () => {
    expect(SOLO_STAT_KINDS).toContain("own_goal");
  });

  it("contient foul", () => {
    expect(SOLO_STAT_KINDS).toContain("foul");
  });

  it("contient penalty", () => {
    expect(SOLO_STAT_KINDS).toContain("penalty");
  });

  it("ne contient pas goal (goal a un assist possible)", () => {
    expect(SOLO_STAT_KINDS).not.toContain("goal");
  });

  it("ne contient pas assist", () => {
    expect(SOLO_STAT_KINDS).not.toContain("assist");
  });

  it("tous les éléments sont des StatKind valides", () => {
    const validKinds: StatKind[] = [
      "goal", "own_goal", "penalty", "assist",
      "try", "point", "yellow_card", "red_card",
      "white_card", "foul",
    ];
    for (const kind of SOLO_STAT_KINDS) {
      expect(validKinds).toContain(kind);
    }
  });
});

describe("statKinds cohérence par sport", () => {
  it("football : assist est dans statKinds ET assistsEnabled=true", () => {
    const cfg = getSportConfig("football");
    expect(cfg.assistsEnabled).toBe(true);
    expect(cfg.statKinds).toContain("assist");
  });

  it("rugby : pas d'assist dans statKinds ET assistsEnabled=false", () => {
    const cfg = getSportConfig("rugby");
    expect(cfg.assistsEnabled).toBe(false);
    expect(cfg.statKinds).not.toContain("assist");
  });

  it("volleyball : setScoresEnabled=true implique scoreUnit=sets", () => {
    const cfg = getSportConfig("volleyball");
    expect(cfg.setScoresEnabled).toBe(true);
    expect(cfg.scoreUnit).toBe("sets");
  });

  it("aucun sport avec setScoresEnabled=true n'a minuteEnabled=true", () => {
    const sportsWithSets = ["volleyball"];
    for (const sport of sportsWithSets) {
      const cfg = getSportConfig(sport);
      if (cfg.setScoresEnabled) {
        expect(cfg.minuteEnabled).toBe(false);
      }
    }
  });
});
