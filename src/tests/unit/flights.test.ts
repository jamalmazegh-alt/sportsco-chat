import { describe, expect, it } from "vitest";
import {
  proposeFlightDistributions,
  defaultQualificationRules,
  qualifyTeamsToFlight,
  generateFlightBracket,
  computeOverallStandings,
  canAutoGenerateChampions,
  type GroupStandingInput,
  type QualRule,
} from "@/modules/tournaments/lib/flights";

describe("canAutoGenerateChampions (Fix F applicability)", () => {
  it("is applicable for regular structures with ≥3 teams per group", () => {
    expect(canAutoGenerateChampions(8, 2)).toBe(true); // 2 poules × 4
    expect(canAutoGenerateChampions(9, 3)).toBe(true); // 3 poules × 3
    expect(canAutoGenerateChampions(16, 4)).toBe(true); // 4 poules × 4
    expect(canAutoGenerateChampions(20, 5)).toBe(true); // 5 poules × 4
  });

  it("is NOT applicable for irregular group sizes", () => {
    expect(canAutoGenerateChampions(10, 3)).toBe(false); // 10/3 non entier
    expect(canAutoGenerateChampions(14, 4)).toBe(false); // 14/4 non entier
  });

  it("is NOT applicable when groups are too small (<3 per group)", () => {
    expect(canAutoGenerateChampions(6, 3)).toBe(false); // 3 poules × 2
    expect(canAutoGenerateChampions(4, 2)).toBe(false); // 2 poules × 2
  });

  it("is NOT applicable with a single group", () => {
    expect(canAutoGenerateChampions(8, 1)).toBe(false);
    expect(canAutoGenerateChampions(8, 0)).toBe(false);
  });
});

describe("proposeFlightDistributions", () => {
  it("handles 12 teams with clean powers of 2", () => {
    const opts = proposeFlightDistributions(12);
    expect(opts.length).toBeGreaterThan(0);
    // Au moins une option avec brackets propres (ex: 4+8)
    expect(opts.some((o) => o.cleanBrackets)).toBe(true);
    for (const o of opts) {
      expect(o.sizes.reduce((a, b) => a + b, 0)).toBe(12);
    }
  });

  it("handles 16 teams", () => {
    const opts = proposeFlightDistributions(16);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0].cleanBrackets).toBe(true);
    expect(opts.some((o) => o.sizes.length === 2)).toBe(true);
  });

  it("handles 24 teams", () => {
    const opts = proposeFlightDistributions(24);
    expect(opts.length).toBeGreaterThan(0);
    // 3 flights de 8 doit exister
    expect(
      opts.some((o) => o.sizes.length === 3 && o.sizes.every((s) => s === 8)),
    ).toBe(true);
  });

  it("handles 13 teams (odd) with multiple options", () => {
    const opts = proposeFlightDistributions(13);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(o.sizes.reduce((a, b) => a + b, 0)).toBe(13);
    }
  });

  it("returns empty for <4 teams", () => {
    expect(proposeFlightDistributions(3)).toEqual([]);
  });
});

describe("defaultQualificationRules", () => {
  it("assigns top positions to first flight, rest to last", () => {
    // 16 équipes, 4 poules de 4, 2 flights [4, 12]
    const rules = defaultQualificationRules([4, 12], 4, 4);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual([{ kind: "group_position", positions: [1] }]);
    // Dernier flight prend positions 2..4
    expect(rules[1]).toEqual([
      { kind: "group_position", positions: [2, 3, 4] },
    ]);
  });

  it("uses wild cards when size doesn't divide evenly", () => {
    // 16 équipes, 4 poules, flights [5, 11]
    const rules = defaultQualificationRules([5, 11], 4, 4);
    expect(rules[0]).toEqual([
      { kind: "group_position", positions: [1] },
      { kind: "best_n_remaining", n: 1 },
    ]);
  });
});

describe("qualifyTeamsToFlight", () => {
  const standings: GroupStandingInput[] = [
    { group_id: "g1", ordered_team_ids: ["a1", "a2", "a3", "a4"] },
    { group_id: "g2", ordered_team_ids: ["b1", "b2", "b3", "b4"] },
    { group_id: "g3", ordered_team_ids: ["c1", "c2", "c3", "c4"] },
  ];

  it("group_position picks all teams at given positions", () => {
    const picks = qualifyTeamsToFlight(
      standings,
      new Set(),
      [{ kind: "group_position", positions: [1] }],
      99,
    );
    expect(picks).toEqual(["a1", "b1", "c1"]);
  });

  it("respects quota and already-qualified", () => {
    const already = new Set(["a1"]);
    const picks = qualifyTeamsToFlight(
      standings,
      already,
      [{ kind: "group_position", positions: [1, 2] }],
      3,
    );
    expect(picks).toEqual(["b1", "c1", "a2"]);
  });

  it("best_n_remaining picks remaining teams in position order", () => {
    const already = new Set(["a1", "b1", "c1"]);
    const picks = qualifyTeamsToFlight(
      standings,
      already,
      [{ kind: "best_n_remaining", n: 3 }],
      99,
    );
    expect(picks).toEqual(["a2", "b2", "c2"]);
  });

  it("manual rule respects explicit list", () => {
    const picks = qualifyTeamsToFlight(
      standings,
      new Set(),
      [{ kind: "manual", team_ids: ["c4", "b3"] }],
      99,
    );
    expect(picks).toEqual(["c4", "b3"]);
  });

  it("group_position_in scopes to a single group", () => {
    const picks = qualifyTeamsToFlight(
      standings,
      new Set(),
      [{ kind: "group_position_in", group_id: "g2", positions: [1, 2] }],
      99,
    );
    expect(picks).toEqual(["b1", "b2"]);
  });
});

describe("generateFlightBracket", () => {
  it("generates a 4-team bracket with final and 3rd place", () => {
    const bracket = generateFlightBracket(["t1", "t2", "t3", "t4"], {
      thirdPlace: true,
    });
    // 2 semis + 1 finale + 1 3e place = 4 matchs
    expect(bracket.length).toBe(4);
    expect(bracket.some((m) => m.placement_kind === "final")).toBe(true);
    expect(bracket.some((m) => m.placement_kind === "semi")).toBe(true);
    expect(bracket.some((m) => m.placement_kind === "third_place")).toBe(true);
  });

  it("generates an 8-team bracket", () => {
    const bracket = generateFlightBracket(
      ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"],
      {},
    );
    expect(bracket.some((m) => m.placement_kind === "quarter")).toBe(true);
    expect(bracket.some((m) => m.placement_kind === "final")).toBe(true);
  });
});

describe("computeOverallStandings", () => {
  it("offsets ranks by previous flight sizes", () => {
    const ranking = computeOverallStandings([
      {
        flight_id: "fA",
        flight_name: "Champions",
        sort_order: 0,
        expected_size: 4,
        ordered_team_ids: ["winA", "runnerA", "thirdA", "fourthA"],
      },
      {
        flight_id: "fB",
        flight_name: "Europa",
        sort_order: 1,
        expected_size: 4,
        ordered_team_ids: ["winB", "runnerB"],
      },
    ]);
    expect(ranking.find((r) => r.team_id === "winA")?.rank).toBe(1);
    expect(ranking.find((r) => r.team_id === "fourthA")?.rank).toBe(4);
    expect(ranking.find((r) => r.team_id === "winB")?.rank).toBe(5);
    expect(ranking.find((r) => r.team_id === "runnerB")?.rank).toBe(6);
  });
});
