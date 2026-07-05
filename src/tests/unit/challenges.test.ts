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

  it("aggregate logic is unit-agnostic — works with score-unit rows too", () => {
    const scoreRows = [
      { player_id: "a", value: 12 },
      { player_id: "a", value: 8 },
      { player_id: "b", value: 15 },
    ];
    const cum = aggregateResults(scoreRows, "cumulative", "higher_better");
    expect(cum[0]).toMatchObject({ player_id: "a", score: 20 });
    expect(cum[1]).toMatchObject({ player_id: "b", score: 15 });
    const rec = aggregateResults(scoreRows, "record", "higher_better");
    expect(rec[0]).toMatchObject({ player_id: "b", score: 15 });
  });
});

describe("Phase 3 score unit — templates", () => {
  const SCORE_TEMPLATES = [
    "shotAccuracy",
    "handballShotAccuracy",
    "passingAccuracy",
    "rugbyPassingAccuracy",
    "pushPower",
    "serveAccuracy",
    "receptionControl",
    "attackAccuracy",
    "tennisServeAccuracy",
    "targetShots",
  ] as const;

  it.each(SCORE_TEMPLATES)("%s is registered with score unit + higher_better + staff visibility", (key) => {
    const t = CHALLENGE_TEMPLATES.find((x) => x.key === key);
    expect(t, `template ${key} missing`).toBeDefined();
    expect(t!.unit).toBe("score");
    expect(t!.direction).toBe("higher_better");
    expect(t!.ranking_visibility).toBe("staff");
  });

  it("pushPower and receptionControl use record aggregate; the other 8 use cumulative", () => {
    const byKey = Object.fromEntries(CHALLENGE_TEMPLATES.map((t) => [t.key, t]));
    expect(byKey.pushPower.aggregate).toBe("record");
    expect(byKey.receptionControl.aggregate).toBe("record");
    for (const k of ["shotAccuracy","handballShotAccuracy","passingAccuracy","rugbyPassingAccuracy","serveAccuracy","attackAccuracy","tennisServeAccuracy","targetShots"]) {
      expect(byKey[k].aggregate, `${k} should be cumulative`).toBe("cumulative");
    }
  });

  it("score templates surface via getTemplatesForSport for their sport", () => {
    const cases: Record<string, string[]> = {
      football: ["shotAccuracy"],
      handball: ["handballShotAccuracy", "passingAccuracy"],
      rugby: ["rugbyPassingAccuracy", "pushPower"],
      volleyball: ["serveAccuracy", "receptionControl", "attackAccuracy"],
      tennis: ["tennisServeAccuracy", "targetShots"],
    };
    for (const [sport, keys] of Object.entries(cases)) {
      const list = getTemplatesForSport(sport).map((t) => t.key);
      for (const k of keys) expect(list, `${sport} should include ${k}`).toContain(k);
    }
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
