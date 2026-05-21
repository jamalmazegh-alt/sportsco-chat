import { describe, it, expect } from "vitest";
import { getFeedbackTagsForSport } from "@/lib/feedback-tags";

const COMMON_TAGS = [
  "effort", "mentality", "leadership", "teamwork",
  "discipline", "communication", "attitude", "focus",
  "physical", "technical",
];

describe("getFeedbackTagsForSport — sports connus", () => {
  it("football retourne tags sport-spécifiques en premier", () => {
    const tags = getFeedbackTagsForSport("football");
    expect(tags[0]).toBe("positioning");
    expect(tags).toContain("passing");
    expect(tags).toContain("dribbling");
    expect(tags).toContain("defending");
    expect(tags).toContain("finishing");
    expect(tags).toContain("pressing");
    expect(tags).toContain("vision");
  });

  it("football inclut tous les tags communs", () => {
    const tags = getFeedbackTagsForSport("football");
    for (const tag of COMMON_TAGS) {
      expect(tags).toContain(tag);
    }
  });

  it("football : tags sport avant tags communs", () => {
    const tags = getFeedbackTagsForSport("football");
    const firstCommon = tags.findIndex((t) => COMMON_TAGS.includes(t));
    const lastSport = tags.findIndex((t) => t === "vision");
    expect(lastSport).toBeLessThan(firstCommon);
  });

  it("basketball retourne tags basket-spécifiques", () => {
    const tags = getFeedbackTagsForSport("basketball");
    expect(tags).toContain("shooting");
    expect(tags).toContain("rebounding");
    expect(tags).toContain("ball_handling");
    expect(tags).toContain("court_vision");
    expect(tags).toContain("pick_and_roll");
    expect(tags).toContain("spacing");
  });

  it("handball retourne tags handball-spécifiques", () => {
    const tags = getFeedbackTagsForSport("handball");
    expect(tags).toContain("pivot_play");
    expect(tags).toContain("fast_break");
    expect(tags).toContain("set_play");
  });

  it("volleyball retourne tags volley-spécifiques", () => {
    const tags = getFeedbackTagsForSport("volleyball");
    expect(tags).toContain("serving");
    expect(tags).toContain("reception");
    expect(tags).toContain("setting");
    expect(tags).toContain("attacking");
    expect(tags).toContain("blocking");
  });

  it("rugby retourne tags rugby-spécifiques", () => {
    const tags = getFeedbackTagsForSport("rugby");
    expect(tags).toContain("tackling");
    expect(tags).toContain("rucking");
    expect(tags).toContain("line_out");
    expect(tags).toContain("scrum");
    expect(tags).toContain("kicking");
  });

  it("hockey retourne tags hockey-spécifiques", () => {
    const tags = getFeedbackTagsForSport("hockey");
    expect(tags).toContain("skating");
    expect(tags).toContain("puck_handling");
  });

  it("futsal retourne tags futsal-spécifiques", () => {
    const tags = getFeedbackTagsForSport("futsal");
    expect(tags).toContain("first_touch");
    expect(tags).toContain("pressing");
  });
});

describe("getFeedbackTagsForSport — normalisation", () => {
  it("soccer → football", () => {
    const soccer = getFeedbackTagsForSport("soccer");
    const football = getFeedbackTagsForSport("football");
    expect(soccer).toEqual(football);
  });

  it("foot → football", () => {
    const foot = getFeedbackTagsForSport("foot");
    const football = getFeedbackTagsForSport("football");
    expect(foot).toEqual(football);
  });

  it("basket → basketball", () => {
    const basket = getFeedbackTagsForSport("basket");
    const basketball = getFeedbackTagsForSport("basketball");
    expect(basket).toEqual(basketball);
  });

  it("hand → handball", () => {
    const hand = getFeedbackTagsForSport("hand");
    const handball = getFeedbackTagsForSport("handball");
    expect(hand).toEqual(handball);
  });

  it("volley → volleyball", () => {
    const volley = getFeedbackTagsForSport("volley");
    const volleyball = getFeedbackTagsForSport("volleyball");
    expect(volley).toEqual(volleyball);
  });

  it("ice_hockey → hockey", () => {
    const ice = getFeedbackTagsForSport("ice_hockey");
    const hockey = getFeedbackTagsForSport("hockey");
    expect(ice).toEqual(hockey);
  });

  it("FOOTBALL en majuscules — normalisé", () => {
    const upper = getFeedbackTagsForSport("FOOTBALL");
    const lower = getFeedbackTagsForSport("football");
    expect(upper).toEqual(lower);
  });
});

describe("getFeedbackTagsForSport — cas limites", () => {
  it("null retourne seulement les tags communs", () => {
    const tags = getFeedbackTagsForSport(null);
    expect(tags).toHaveLength(COMMON_TAGS.length);
    for (const tag of COMMON_TAGS) {
      expect(tags).toContain(tag);
    }
  });

  it("undefined retourne seulement les tags communs", () => {
    const tags = getFeedbackTagsForSport(undefined);
    expect(tags).toHaveLength(COMMON_TAGS.length);
  });

  it("sport inconnu retourne seulement les tags communs", () => {
    const tags = getFeedbackTagsForSport("curling_on_mars");
    expect(tags).toHaveLength(COMMON_TAGS.length);
  });

  it("chaîne vide retourne seulement les tags communs", () => {
    const tags = getFeedbackTagsForSport("");
    expect(tags).toHaveLength(COMMON_TAGS.length);
  });

  it("aucun doublon dans les tags retournés", () => {
    const sports = ["football", "basketball", "handball", "volleyball", "rugby", "hockey", "futsal"];
    for (const sport of sports) {
      const tags = getFeedbackTagsForSport(sport);
      const unique = new Set(tags);
      expect(unique.size).toBe(tags.length);
    }
  });

  it("tous les tags sont en snake_case", () => {
    const sports = ["football", "basketball", "handball", "volleyball", "rugby", null, undefined];
    const snakeCase = /^[a-z][a-z0-9_]*$/;
    for (const sport of sports) {
      const tags = getFeedbackTagsForSport(sport);
      for (const tag of tags) {
        expect(tag).toMatch(snakeCase);
      }
    }
  });

  it("retourne un tableau (jamais null/undefined)", () => {
    expect(getFeedbackTagsForSport(null)).toBeTruthy();
    expect(Array.isArray(getFeedbackTagsForSport(null))).toBe(true);
  });
});
