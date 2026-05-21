import { describe, it, expect } from "vitest";
import { generateRoundRobin, distributeIntoGroups, type Pairing } from "@/modules/tournaments/lib/scheduling";
import { computeStandings } from "@/modules/tournaments/lib/standings";
import { generateKnockoutBracket, type BracketMatch } from "@/modules/tournaments/lib/bracket";

describe("scheduling", () => {
  it("round-robin: 4 teams → 6 matches, 3 rounds", () => {
    const p = generateRoundRobin(["a", "b", "c", "d"]);
    expect(p).toHaveLength(6);
    expect(Math.max(...p.map((x: Pairing) => x.round))).toBe(3);
  });
  it("round-robin: 5 teams (odd) → 10 matches, 5 rounds with byes", () => {
    const p = generateRoundRobin(["a", "b", "c", "d", "e"]);
    expect(p).toHaveLength(10);
    expect(Math.max(...p.map((x: Pairing) => x.round))).toBe(5);
  });
  it("round-robin: each pair appears exactly once", () => {
    const teams = ["a", "b", "c", "d", "e", "f"];
    const p = generateRoundRobin(teams);
    const seen = new Set<string>();
    for (const m of p) {
      const k = [m.teamAId, m.teamBId].sort().join("|");
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
    expect(seen.size).toBe((teams.length * (teams.length - 1)) / 2);
  });
  it("distributeIntoGroups: snake draft with seeds", () => {
    const teams = [
      { id: "t1", seed: 1 },
      { id: "t2", seed: 2 },
      { id: "t3", seed: 3 },
      { id: "t4", seed: 4 },
    ];
    const groups = distributeIntoGroups(teams, 2);
    expect(groups[0]).toContain("t1");
    expect(groups[1]).toContain("t2");
    expect(groups[1]).toContain("t3");
    expect(groups[0]).toContain("t4");
  });
});

describe("standings", () => {
  it("classement 3 équipes : tri par points puis diff de buts", () => {
    const teams = ["a", "b", "c"];
    const matches = [
      { teamAId: "a", teamBId: "b", scoreA: 2, scoreB: 1, status: "completed" },
      { teamAId: "b", teamBId: "c", scoreA: 3, scoreB: 0, status: "completed" },
      { teamAId: "a", teamBId: "c", scoreA: 1, scoreB: 1, status: "completed" },
    ];
    const s = computeStandings(teams, matches);
    expect(s[0].teamId).toBe("b"); // 3pts, +1
    expect(s[1].teamId).toBe("a"); // 4pts wait
    // a: W vs b, D vs c → 4pts ; b: L vs a, W vs c → 3pts ; c: D, L → 1pt
    expect(s[0].teamId).toBe("a");
    expect(s[0].points).toBe(4);
    expect(s[1].teamId).toBe("b");
    expect(s[2].teamId).toBe("c");
  });
});

describe("bracket", () => {
  it("4 équipes → 3 matchs (2 SF + 1 final)", () => {
    const b = generateKnockoutBracket(["s1", "s2", "s3", "s4"]);
    expect(b).toHaveLength(3);
    expect(b.filter((m: BracketMatch) => m.round === "sf")).toHaveLength(2);
    expect(b.filter((m: BracketMatch) => m.round === "final")).toHaveLength(1);
  });
  it("4 équipes + 3e place → 4 matchs", () => {
    const b = generateKnockoutBracket(["s1", "s2", "s3", "s4"], { thirdPlace: true });
    expect(b).toHaveLength(4);
    expect(b.filter((m: BracketMatch) => m.round === "third_place")).toHaveLength(1);
  });
  it("8 équipes : seed 1 affronte seed 8 au QF", () => {
    const b = generateKnockoutBracket(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]);
    const qfs = b.filter((m: BracketMatch) => m.round === "qf");
    expect(qfs).toHaveLength(4);
    const first = qfs[0];
    const ids = [first.teamASource, first.teamBSource].map((s) =>
      s && "teamId" in s ? s.teamId : null,
    );
    expect(ids).toContain("s1");
    expect(ids).toContain("s8");
  });
});
