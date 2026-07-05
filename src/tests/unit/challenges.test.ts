import { describe, expect, it } from "vitest";
import { aggregateResults } from "@/lib/challenges/aggregate";
import { CHALLENGE_TEMPLATES, getTemplatesForSport } from "@/lib/challenges/templates";

describe("aggregate rankings", () => {
  const rows = [
    { player_id: "a", value: 3 },
    { player_id: "a", value: 5 },
    { player_id: "b", value: 4 },
    { player_id: "b", value: 4 },
  ];

  it("cumulative sums per player, sorts by score desc when higher_better", () => {
    const r = aggregateResults(rows, "cumulative", "higher_better");
    expect(r.map((x) => x.player_id)).toEqual(["a", "b"]);
    expect(r[0].score).toBe(8);
    expect(r[1].score).toBe(8);
  });

  it("record keeps max when higher_better", () => {
    const r = aggregateResults(rows, "record", "higher_better");
    expect(r[0]).toMatchObject({ player_id: "a", score: 5 });
  });

  it("record keeps min when lower_better (sprint)", () => {
    const sprint = [
      { player_id: "a", value: 3.1 },
      { player_id: "a", value: 3.4 },
      { player_id: "b", value: 3.0 },
    ];
    const r = aggregateResults(sprint, "record", "lower_better");
    expect(r[0]).toMatchObject({ player_id: "b", score: 3.0 });
    expect(r[1]).toMatchObject({ player_id: "a", score: 3.1 });
  });
});

describe("getTemplatesForSport — single filtering entry point", () => {
  it("returns generic-only when sport is missing/unknown/null", () => {
    const generic = CHALLENGE_TEMPLATES.filter((t) => t.sport === "generic");
    for (const sport of [null, undefined, "", "table_tennis"]) {
      const list = getTemplatesForSport(sport as any);
      expect(list.map((t) => t.key).sort()).toEqual(generic.map((t) => t.key).sort());
    }
  });

  it("football sees generic + football templates only", () => {
    const list = getTemplatesForSport("football");
    for (const t of list) {
      expect(["generic", "football"]).toContain(t.sport);
    }
    // Sanity: at least one football-specific template is present.
    expect(list.some((t) => t.sport === "football")).toBe(true);
  });

  it.each(["basketball", "handball", "rugby", "volleyball", "tennis"])(
    "%s sees only generic + its own templates",
    (sport) => {
      const list = getTemplatesForSport(sport);
      for (const t of list) {
        expect(["generic", sport]).toContain(t.sport);
      }
    },
  );

  it("futsal (no dedicated templates yet) sees generic only", () => {
    const list = getTemplatesForSport("futsal");
    expect(list.every((t) => t.sport === "generic")).toBe(true);
  });

  it("every template has a valid sport tag", () => {
    const allowed = new Set([
      "generic",
      "football",
      "basketball",
      "handball",
      "volleyball",
      "rugby",
      "futsal",
      "ice_hockey",
      "field_hockey",
      "tennis",
      "padel",
      "custom",
    ]);
    for (const t of CHALLENGE_TEMPLATES) {
      expect(allowed.has(t.sport)).toBe(true);
    }
  });
});
