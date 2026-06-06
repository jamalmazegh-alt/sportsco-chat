/**
 * RLS: tournaments — cross-club isolation.
 *
 * Seeds two tournaments (one per club) + a match per tournament with a
 * referee. Verifies that:
 *   - organizer (admin) of club A cannot mutate tournament of club B
 *   - referee of match A cannot edit match B's score
 *   - random members cannot mutate other clubs' tournaments
 *   - an anonymous client cannot mutate any tournament data
 *
 * Self-contained: creates and tears down its own tournament fixtures using
 * the service-role admin client, on top of the shared club/user fixtures
 * seeded by _global-setup.ts.
 */
import { describe, it, beforeAll, afterAll } from "vitest";
import { admin } from "./_admin";
import { signInAs, anonClient } from "./_clients";
import { getFixtures } from "./_setup";
import {
  expectNoAccess,
  expectUpdateBlocked,
  expectInsertBlocked,
  expectDeleteBlocked,
} from "./_helpers";

let tournamentA: string;
let tournamentB: string;
let matchA: string;
let matchB: string;
let teamRowA: string; // tournament_teams row in tournamentA
let teamRowB: string;

beforeAll(async () => {
  const fx = getFixtures();
  const today = new Date().toISOString().slice(0, 10);

  const { data: tourns, error: tErr } = await admin
    .from("tournaments")
    .insert([
      {
        club_id: fx.clubA,
        name: `__rls_${fx.runId}_tournA`,
        slug: `__rls_${fx.runId}_tourna`,
        starts_on: today,
        created_by: fx.users.adminA.userId,
      },
      {
        club_id: fx.clubB,
        name: `__rls_${fx.runId}_tournB`,
        slug: `__rls_${fx.runId}_tournb`,
        starts_on: today,
        created_by: fx.users.adminB.userId,
      },
    ])
    .select("id, club_id");
  if (tErr || !tourns) throw new Error(`tournaments insert: ${tErr?.message}`);
  tournamentA = tourns.find((t) => t.club_id === fx.clubA)!.id;
  tournamentB = tourns.find((t) => t.club_id === fx.clubB)!.id;

  const { data: tteams, error: ttErr } = await admin
    .from("tournament_teams")
    .insert([
      { tournament_id: tournamentA, name: `__rls_${fx.runId}_teamA1` },
      { tournament_id: tournamentA, name: `__rls_${fx.runId}_teamA2` },
      { tournament_id: tournamentB, name: `__rls_${fx.runId}_teamB1` },
      { tournament_id: tournamentB, name: `__rls_${fx.runId}_teamB2` },
    ])
    .select("id, tournament_id, name");
  if (ttErr || !tteams) throw new Error(`tournament_teams insert: ${ttErr?.message}`);
  const tA = tteams.filter((t) => t.tournament_id === tournamentA);
  const tB = tteams.filter((t) => t.tournament_id === tournamentB);
  teamRowA = tA[0].id;
  teamRowB = tB[0].id;

  // One match per tournament. Referee A = coachA, Referee B = coachB.
  const { data: matches, error: mErr } = await admin
    .from("tournament_matches")
    .insert([
      {
        tournament_id: tournamentA,
        team_a_id: tA[0].id,
        team_b_id: tA[1].id,
        referee_user_id: fx.users.coachA.userId,
        status: "scheduled",
      },
      {
        tournament_id: tournamentB,
        team_a_id: tB[0].id,
        team_b_id: tB[1].id,
        referee_user_id: fx.users.coachB.userId,
        status: "scheduled",
      },
    ])
    .select("id, tournament_id");
  if (mErr || !matches) throw new Error(`tournament_matches insert: ${mErr?.message}`);
  matchA = matches.find((m) => m.tournament_id === tournamentA)!.id;
  matchB = matches.find((m) => m.tournament_id === tournamentB)!.id;
});

afterAll(async () => {
  await admin.from("tournament_matches").delete().in("tournament_id", [tournamentA, tournamentB]);
  await admin.from("tournament_teams").delete().in("tournament_id", [tournamentA, tournamentB]);
  await admin.from("tournaments").delete().in("id", [tournamentA, tournamentB]);
});

describe("RLS: tournaments — cross-club isolation", () => {
  it("adminB ne peut pas modifier le tournoi du club A", async () => {
    const c = await signInAs("adminB");
    await expectUpdateBlocked(c, "tournaments", tournamentA, { name: "hacked" });
  });

  it("adminB ne peut pas supprimer une équipe du tournoi A", async () => {
    const c = await signInAs("adminB");
    await expectDeleteBlocked(c, "tournament_teams", teamRowA);
  });

  it("adminB ne peut pas créer une équipe dans le tournoi A", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    await expectInsertBlocked(c, "tournament_teams", {
      tournament_id: tournamentA,
      name: `__rls_${fx.runId}_evil`,
    });
  });

  it("adminB ne peut pas modifier un match du tournoi A", async () => {
    const c = await signInAs("adminB");
    await expectUpdateBlocked(c, "tournament_matches", matchA, {
      score_a: 9,
      score_b: 0,
    });
  });

  it("coachB (referee match B) ne peut pas soumettre un score du match A", async () => {
    const c = await signInAs("coachB");
    await expectUpdateBlocked(c, "tournament_matches", matchA, {
      score_a: 3,
      score_b: 1,
      status: "completed",
    });
  });

  it("playerA (membre club A non-staff) ne peut pas modifier le tournoi A", async () => {
    const c = await signInAs("playerA");
    await expectUpdateBlocked(c, "tournaments", tournamentA, { name: "hacked" });
  });

  it("un client anonyme ne peut pas modifier un tournoi", async () => {
    const c = anonClient();
    await expectUpdateBlocked(c, "tournaments", tournamentA, { name: "anon" });
    await expectInsertBlocked(c, "tournament_teams", {
      tournament_id: tournamentA,
      name: "anon-team",
    });
  });

  it("un client anonyme ne peut pas lire les équipes d'un tournoi draft", async () => {
    // tournaments are in 'draft' status by default → only members should read teams.
    const c = anonClient();
    await expectNoAccess(c, "tournament_teams", teamRowA);
  });
});
