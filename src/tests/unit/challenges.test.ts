import { describe, expect, it } from "vitest";
import { aggregateResults } from "@/lib/challenges/aggregate";

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
