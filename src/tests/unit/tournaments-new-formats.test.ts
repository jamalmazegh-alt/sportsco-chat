import { describe, it, expect } from "vitest";
import { generateDoubleRoundRobin } from "@/modules/tournaments/lib/scheduling";
import { generateSwissRound, recommendedSwissRounds, type SwissTeamState } from "@/modules/tournaments/lib/swiss";
import { generateDoubleEliminationBracket } from "@/modules/tournaments/lib/double-elim";
import { computeStandings, type PointsConfig } from "@/modules/tournaments/lib/standings";

describe("double round-robin", () => {
  it("4 équipes → 12 matchs (2× round-robin), 6 rondes", () => {
    const p = generateDoubleRoundRobin(["a", "b", "c", "d"]);
    expect(p).toHaveLength(12);
    expect(Math.max(...p.map((x) => x.round))).toBe(6);
  });
  it("home/away inversés entre les deux passes", () => {
    const p = generateDoubleRoundRobin(["a", "b"]);
    expect(p).toHaveLength(2);
    expect(p[0].teamAId).not.toBe(p[1].teamAId);
  });
});

describe("système suisse", () => {
  it("ronde 1 : appariement haut/bas par seed", () => {
    const state: SwissTeamState[] = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({
      id: `t${s}`,
      seed: s,
      points: 0,
      opponents: [],
      byes: 0,
    }));
    const r1 = generateSwissRound(state, 1);
    expect(r1).toHaveLength(4);
    expect(r1[0]).toMatchObject({ teamAId: "t1", teamBId: "t5" });
    expect(r1[1]).toMatchObject({ teamAId: "t2", teamBId: "t6" });
  });

  it("ronde 2 : appariement par score, sans rematch", () => {
    const state: SwissTeamState[] = [
      { id: "a", seed: 1, points: 3, opponents: ["b"], byes: 0 },
      { id: "b", seed: 2, points: 0, opponents: ["a"], byes: 0 },
      { id: "c", seed: 3, points: 3, opponents: ["d"], byes: 0 },
      { id: "d", seed: 4, points: 0, opponents: ["c"], byes: 0 },
    ];
    const r2 = generateSwissRound(state, 2);
    expect(r2).toHaveLength(2);
    // Les 2 vainqueurs s'affrontent
    const winners = r2.find((p) => p.teamAId === "a")!;
    expect(winners.teamBId).toBe("c");
  });

  it("nombre de rondes recommandé", () => {
    expect(recommendedSwissRounds(8)).toBe(3);
    expect(recommendedSwissRounds(16)).toBe(4);
    expect(recommendedSwissRounds(32)).toBe(5);
  });
});

describe("double élimination", () => {
  it("8 équipes : winner + loser + grand final", () => {
    const b = generateDoubleEliminationBracket(["s1","s2","s3","s4","s5","s6","s7","s8"]);
    const wb = b.filter((m) => m.side === "winner");
    const lb = b.filter((m) => m.side === "loser");
    const gf = b.filter((m) => m.side === "grand_final");
    expect(wb).toHaveLength(7); // 4 QF + 2 SF + 1 F
    expect(gf).toHaveLength(1);
    expect(lb.length).toBeGreaterThan(0);
  });
  it("4 équipes", () => {
    const b = generateDoubleEliminationBracket(["s1","s2","s3","s4"]);
    expect(b.filter((m) => m.side === "winner")).toHaveLength(3);
    expect(b.filter((m) => m.side === "grand_final")).toHaveLength(1);
  });
});

describe("hockey OT points", () => {
  it("appliques otWin/otLoss quand le match a un overtime score", () => {
    const pts: PointsConfig = { win: 2, draw: 0, loss: 0, otWin: 2, otLoss: 1 };
    const s = computeStandings(
      ["a", "b"],
      [
        {
          teamAId: "a",
          teamBId: "b",
          scoreA: 4,
          scoreB: 3,
          status: "completed",
          decidedIn: "overtime",
        },
      ],
      pts,
    );
    const a = s.find((r) => r.teamId === "a")!;
    const b = s.find((r) => r.teamId === "b")!;
    expect(a.points).toBe(2);
    expect(b.points).toBe(1); // défaite en OT = 1 pt
  });
});
