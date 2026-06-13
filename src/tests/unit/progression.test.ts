import { describe, it, expect } from "vitest";
import {
  decideMatchWinner,
  computeProgressionUpdates,
  type ProgressionMatch,
} from "@/modules/tournaments/lib/progression";

type Partial2 = Partial<ProgressionMatch> & { id: string };

function m(p: Partial2): ProgressionMatch {
  return {
    id: p.id,
    flight_id: p.flight_id ?? null,
    round: p.round ?? "sf",
    match_number: p.match_number ?? 0,
    team_a_id: p.team_a_id ?? null,
    team_b_id: p.team_b_id ?? null,
    team_a_source: p.team_a_source ?? null,
    team_b_source: p.team_b_source ?? null,
    score_a: p.score_a ?? null,
    score_b: p.score_b ?? null,
    penalty_score_a: p.penalty_score_a ?? null,
    penalty_score_b: p.penalty_score_b ?? null,
    status: p.status ?? "scheduled",
    winner_team_id: p.winner_team_id ?? null,
  };
}

/** Applique des updates à un snapshot (helper d'idempotence). */
function apply(
  matches: ProgressionMatch[],
  updates: ReturnType<typeof computeProgressionUpdates>,
): ProgressionMatch[] {
  const byId = new Map(matches.map((x) => [x.id, { ...x }]));
  for (const u of updates) {
    const row = byId.get(u.id)!;
    row.team_a_id = u.team_a_id;
    row.team_b_id = u.team_b_id;
    row.winner_team_id = u.winner_team_id;
  }
  return [...byId.values()];
}

describe("decideMatchWinner", () => {
  const base = {
    team_a_id: "A",
    team_b_id: "B",
    score_a: null,
    score_b: null,
    penalty_score_a: null,
    penalty_score_b: null,
  };

  it("renvoie null si non terminé", () => {
    expect(decideMatchWinner({ ...base, status: "scheduled" })).toEqual({
      winnerId: null,
      loserId: null,
    });
  });

  it("départage au score", () => {
    expect(decideMatchWinner({ ...base, status: "completed", score_a: 3, score_b: 1 })).toEqual({
      winnerId: "A",
      loserId: "B",
    });
  });

  it("départage aux tirs au but si score égal", () => {
    expect(
      decideMatchWinner({
        ...base,
        status: "completed",
        score_a: 1,
        score_b: 1,
        penalty_score_a: 4,
        penalty_score_b: 5,
      }),
    ).toEqual({ winnerId: "B", loserId: "A" });
  });

  it("forfait : l'équipe présente gagne", () => {
    expect(decideMatchWinner({ ...base, status: "forfeit_a" })).toEqual({
      winnerId: "B",
      loserId: "A",
    });
    expect(decideMatchWinner({ ...base, status: "no_show_b" })).toEqual({
      winnerId: "A",
      loserId: "B",
    });
  });
});

describe("computeProgressionUpdates — KO simple (4 équipes)", () => {
  function bracket(): ProgressionMatch[] {
    return [
      m({
        id: "sf1",
        round: "sf",
        match_number: 10,
        team_a_id: "T1",
        team_b_id: "T4",
        team_a_source: { teamId: "T1" },
        team_b_source: { teamId: "T4" },
      }),
      m({
        id: "sf2",
        round: "sf",
        match_number: 11,
        team_a_id: "T2",
        team_b_id: "T3",
        team_a_source: { teamId: "T2" },
        team_b_source: { teamId: "T3" },
      }),
      m({
        id: "final",
        round: "final",
        match_number: 12,
        team_a_source: { fromMatch: 1, outcome: "winner" },
        team_b_source: { fromMatch: 2, outcome: "winner" },
      }),
      m({
        id: "third",
        round: "third_place",
        match_number: 13,
        team_a_source: { fromMatch: 1, outcome: "loser" },
        team_b_source: { fromMatch: 2, outcome: "loser" },
      }),
    ];
  }

  it("propage vainqueurs et perdants vers la finale et la petite finale", () => {
    const matches = bracket();
    matches[0] = { ...matches[0], status: "completed", score_a: 2, score_b: 0 }; // sf1: T1>T4
    matches[1] = { ...matches[1], status: "completed", score_a: 1, score_b: 3 }; // sf2: T3>T2

    const updates = computeProgressionUpdates(matches);
    const byId = new Map(updates.map((u) => [u.id, u]));

    expect(byId.get("sf1")?.winner_team_id).toBe("T1");
    expect(byId.get("sf2")?.winner_team_id).toBe("T3");
    expect(byId.get("final")).toMatchObject({ team_a_id: "T1", team_b_id: "T3" });
    expect(byId.get("third")).toMatchObject({ team_a_id: "T4", team_b_id: "T2" });
  });

  it("est idempotent (rejouer ne produit aucun changement)", () => {
    let matches = bracket();
    matches[0] = { ...matches[0], status: "completed", score_a: 2, score_b: 0 };
    matches[1] = { ...matches[1], status: "completed", score_a: 1, score_b: 3 };
    matches = apply(matches, computeProgressionUpdates(matches));
    expect(computeProgressionUpdates(matches)).toHaveLength(0);
  });

  it("une dévalidation (retour scheduled) efface les équipes avales", () => {
    let matches = bracket();
    matches[0] = { ...matches[0], status: "completed", score_a: 2, score_b: 0 };
    matches[1] = { ...matches[1], status: "completed", score_a: 1, score_b: 3 };
    matches = apply(matches, computeProgressionUpdates(matches));

    // sf1 dévalidé
    matches = matches.map((x) =>
      x.id === "sf1" ? { ...x, status: "scheduled", score_a: null, score_b: null } : x,
    );
    matches = apply(matches, computeProgressionUpdates(matches));
    const final = matches.find((x) => x.id === "final")!;
    const third = matches.find((x) => x.id === "third")!;
    expect(final.team_a_id).toBeNull(); // venait de sf1.winner
    expect(third.team_a_id).toBeNull(); // venait de sf1.loser
    expect(final.team_b_id).toBe("T3"); // sf2 toujours validé
  });

  it("remplit un seul slot quand une seule demi-finale est terminée", () => {
    const matches = bracket();
    matches[0] = { ...matches[0], status: "completed", score_a: 2, score_b: 0 };
    const updates = computeProgressionUpdates(matches);
    const final = updates.find((u) => u.id === "final");
    // T1 (vainqueur sf1) est placé ; l'autre slot attend sf2.
    expect(final).toMatchObject({ team_a_id: "T1", team_b_id: null });
  });
});

describe("computeProgressionUpdates — scoping par flight", () => {
  it("isole les compteurs entre flights (fromMatch=1 reste dans son flight)", () => {
    const matches: ProgressionMatch[] = [
      // Flight A
      m({
        id: "A_sf1",
        flight_id: "FA",
        round: "sf",
        match_number: 1,
        team_a_id: "A1",
        team_b_id: "A2",
        status: "completed",
        score_a: 3,
        score_b: 0,
      }),
      m({
        id: "A_sf2",
        flight_id: "FA",
        round: "sf",
        match_number: 2,
        team_a_id: "A3",
        team_b_id: "A4",
        status: "completed",
        score_a: 0,
        score_b: 2,
      }),
      m({
        id: "A_final",
        flight_id: "FA",
        round: "final",
        match_number: 3,
        team_a_source: { fromMatch: 1, outcome: "winner" },
        team_b_source: { fromMatch: 2, outcome: "winner" },
      }),
      // Flight B (mêmes match_number 1..3)
      m({
        id: "B_sf1",
        flight_id: "FB",
        round: "sf",
        match_number: 1,
        team_a_id: "B1",
        team_b_id: "B2",
        status: "completed",
        score_a: 1,
        score_b: 2,
      }),
      m({
        id: "B_final",
        flight_id: "FB",
        round: "final",
        match_number: 2,
        team_a_source: { fromMatch: 1, outcome: "winner" },
        team_b_source: null,
        team_b_id: "B3",
      }),
    ];

    const updates = computeProgressionUpdates(matches);
    const byId = new Map(updates.map((u) => [u.id, u]));
    expect(byId.get("A_final")).toMatchObject({ team_a_id: "A1", team_b_id: "A4" });
    // Flight B final côté A vient de B_sf1.winner = B2, côté B (seed direct) conservé.
    expect(byId.get("B_final")?.team_a_id).toBe("B2");
    expect(byId.get("B_final")?.team_b_id).toBe("B3");
  });

  it("ne touche jamais les matchs de poule", () => {
    const matches: ProgressionMatch[] = [
      m({
        id: "g1",
        flight_id: null,
        round: "group",
        match_number: 1,
        team_a_id: "X",
        team_b_id: "Y",
        status: "completed",
        score_a: 2,
        score_b: 1,
      }),
    ];
    expect(computeProgressionUpdates(matches)).toHaveLength(0);
  });

  it("ne réécrit pas un slot à seed direct / déplacement manuel (source nulle)", () => {
    const matches: ProgressionMatch[] = [
      m({
        id: "f",
        flight_id: "FA",
        round: "final",
        match_number: 1,
        team_a_id: "MANUAL",
        team_a_source: null,
        team_b_id: "OTHER",
        team_b_source: null,
      }),
    ];
    // Aucun changement attendu (pas de source fromMatch, pas terminé).
    expect(computeProgressionUpdates(matches)).toHaveLength(0);
  });
});
