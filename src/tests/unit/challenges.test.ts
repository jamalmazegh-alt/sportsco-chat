import { describe, expect, it } from "vitest";
import {
  ageFromBirthDate,
  speedKmhForStage,
  vo2AgeFactor,
  vo2Cooper,
  vo2Leger,
} from "@/lib/challenges/vo2";
import { aggregateResults } from "@/lib/challenges/aggregate";

describe("VO2 formulas", () => {
  it("Léger speed = 8 + 0.5*(stage-1)", () => {
    expect(speedKmhForStage(1)).toBe(8);
    expect(speedKmhForStage(5)).toBe(10);
    expect(speedKmhForStage(12)).toBe(13.5);
  });

  it("Léger VO2 at stage 12 ~= 47.25", () => {
    expect(vo2Leger(12)).toBeCloseTo(47.25, 2);
  });

  it("Cooper VO2 for 2400 m ~= 42.4", () => {
    expect(vo2Cooper(2400)).toBeCloseTo(42.4, 0);
  });

  it("age factor scales for young players", () => {
    expect(vo2AgeFactor(9)).toBe(0.9);
    expect(vo2AgeFactor(12)).toBe(0.94);
    expect(vo2AgeFactor(14)).toBe(0.98);
    expect(vo2AgeFactor(17)).toBe(1);
    expect(vo2AgeFactor(null)).toBe(1);
  });

  it("ageFromBirthDate handles pre-birthday of the year", () => {
    const ref = new Date("2026-01-10");
    expect(ageFromBirthDate("2010-03-15", ref)).toBe(15);
  });
});

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
