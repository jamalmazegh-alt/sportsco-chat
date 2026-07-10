import { describe, it, expect } from "vitest";

// Mirrors the exclusion logic used in ExistingPlayerPicker: exclude only
// players already in the CURRENT team (never across all team_members).
type Player = { id: string };
type Membership = { player_id: string; team_id: string };

function candidatesForTeam(
  clubPlayers: Player[],
  memberships: Membership[],
  currentTeamId: string,
) {
  const excluded = new Set(
    memberships.filter((m) => m.team_id === currentTeamId).map((m) => m.player_id),
  );
  return clubPlayers.filter((p) => !excluded.has(p.id));
}

function otherTeamsFor(playerId: string, memberships: Membership[], currentTeamId: string) {
  return memberships
    .filter((m) => m.player_id === playerId && m.team_id !== currentTeamId)
    .map((m) => m.team_id);
}

describe("existing-player-picker: exclusion & badges", () => {
  const clubPlayers: Player[] = [
    { id: "p1" }, // only in team A (current)
    { id: "p2" }, // in team B (other) — should APPEAR when current=A
    { id: "p3" }, // in A and B — should NOT appear when current=A
    { id: "p4" }, // in no team
  ];
  const memberships: Membership[] = [
    { player_id: "p1", team_id: "A" },
    { player_id: "p2", team_id: "B" },
    { player_id: "p3", team_id: "A" },
    { player_id: "p3", team_id: "B" },
  ];

  it("excludes players already in the current team only", () => {
    const ids = candidatesForTeam(clubPlayers, memberships, "A").map((p) => p.id);
    expect(ids).toEqual(["p2", "p4"]);
  });

  it("a player in another team appears in the picker for the current team", () => {
    const ids = candidatesForTeam(clubPlayers, memberships, "A").map((p) => p.id);
    expect(ids).toContain("p2");
  });

  it("a player already in the current team never appears", () => {
    const ids = candidatesForTeam(clubPlayers, memberships, "A").map((p) => p.id);
    expect(ids).not.toContain("p1");
    expect(ids).not.toContain("p3");
  });

  it("other-team badges list teams other than the current one", () => {
    expect(otherTeamsFor("p3", memberships, "A")).toEqual(["B"]);
    expect(otherTeamsFor("p2", memberships, "A")).toEqual(["B"]);
    expect(otherTeamsFor("p1", memberships, "A")).toEqual([]);
  });

  it("empty state when all club players are in the current team", () => {
    const all = candidatesForTeam(
      [{ id: "p1" }, { id: "p3" }],
      [
        { player_id: "p1", team_id: "A" },
        { player_id: "p3", team_id: "A" },
      ],
      "A",
    );
    expect(all).toEqual([]);
  });
});

describe("23505 handling", () => {
  // Simulates the attach loop's classification: 23505 → alreadyIn, other → failed.
  function classify(errors: (null | { code?: string; message?: string })[]) {
    let attached = 0,
      alreadyIn = 0,
      failed = 0;
    for (const err of errors) {
      if (!err) attached++;
      else if (err.code === "23505") alreadyIn++;
      else failed++;
    }
    return { attached, alreadyIn, failed };
  }

  it("splits results into attached / alreadyIn / failed", () => {
    const out = classify([
      null,
      { code: "23505", message: "duplicate key" },
      { code: "23503", message: "fk" },
      null,
    ]);
    expect(out).toEqual({ attached: 2, alreadyIn: 1, failed: 1 });
  });
});
