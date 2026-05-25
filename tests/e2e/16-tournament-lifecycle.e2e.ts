/**
 * 16 — Tournament full lifecycle
 *
 * Covers: create tournament → add teams → create groups + assign teams →
 * schedule matches → record results → publish → verify standings → cleanup.
 *
 * Follows the same "hybrid" pattern as the other E2E files: writes go
 * through the RLS-authenticated admin client; reads assert via the same
 * client. No UI navigation required for this lifecycle.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Tournament lifecycle", () => {
  let club: SeededClub;
  let tournamentId: string;
  const createdTeamIds: string[] = [];
  const createdGroupIds: string[] = [];
  const createdMatchIds: string[] = [];

  test.beforeAll(async () => {
    club = await createTestClub("tournament");
  });

  test.afterAll(async () => {
    try {
      if (createdMatchIds.length) {
        await admin
          .from("tournament_match_events")
          .delete()
          .in("match_id", createdMatchIds);
        await admin.from("tournament_matches").delete().in("id", createdMatchIds);
      }
      if (createdTeamIds.length) {
        await admin.from("tournament_teams").delete().in("id", createdTeamIds);
      }
      if (createdGroupIds.length) {
        await admin.from("tournament_groups").delete().in("id", createdGroupIds);
      }
      if (tournamentId) {
        await admin.from("tournaments").delete().eq("id", tournamentId);
      }
    } finally {
      await club.cleanup();
    }
  });

  test("admin creates a draft tournament", async () => {
    const slug = `e2e-${club.runId}`;
    const startsOn = new Date(Date.now() + 14 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const endsOn = new Date(Date.now() + 15 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const { data, error } = await admin
      .from("tournaments")
      .insert({
        club_id: club.clubId,
        name: `E2E Tournament ${club.runId}`,
        slug,
        sport: "football",
        starts_on: startsOn,
        ends_on: endsOn,
        format: "group",
        num_teams: 4,
        created_by: club.admin.userId,
      })
      .select("id, status")
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe("draft");
    tournamentId = data!.id;
  });

  test("admin adds 4 teams", async () => {
    const { data, error } = await admin
      .from("tournament_teams")
      .insert(
        [1, 2, 3, 4].map((i) => ({
          tournament_id: tournamentId,
          name: `Team ${i} ${club.runId}`,
          seed: i,
        })),
      )
      .select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(4);
    createdTeamIds.push(...data!.map((t) => t.id));
  });

  test("admin draws 1 group and assigns the 4 teams", async () => {
    const { data: group, error: gErr } = await admin
      .from("tournament_groups")
      .insert({
        tournament_id: tournamentId,
        name: "Groupe A",
        qualifiers_count: 2,
        sort_order: 0,
      })
      .select("id")
      .single();
    expect(gErr).toBeNull();
    createdGroupIds.push(group!.id);

    const { error: assignErr } = await admin
      .from("tournament_teams")
      .update({ group_id: group!.id })
      .in("id", createdTeamIds);
    expect(assignErr).toBeNull();

    const { data: check } = await admin
      .from("tournament_teams")
      .select("group_id")
      .in("id", createdTeamIds);
    expect(check!.every((t) => t.group_id === group!.id)).toBe(true);
  });

  test("admin schedules round-robin matches", async () => {
    const [a, b, c, d] = createdTeamIds;
    const groupId = createdGroupIds[0];
    const base = Date.now() + 14 * 86_400_000;
    const pairs: Array<[string, string]> = [
      [a, b],
      [c, d],
      [a, c],
      [b, d],
      [a, d],
      [b, c],
    ];

    const { data, error } = await admin
      .from("tournament_matches")
      .insert(
        pairs.map(([ta, tb], idx) => ({
          tournament_id: tournamentId,
          group_id: groupId,
          round: "group",
          match_number: idx + 1,
          team_a_id: ta,
          team_b_id: tb,
          scheduled_at: new Date(base + idx * 90 * 60_000).toISOString(),
          field: "Terrain 1",
          duration_min: 60,
        })),
      )
      .select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(6);
    createdMatchIds.push(...data!.map((m) => m.id));
  });

  test("admin records results and validates matches", async () => {
    // Team A wins all 3 → 9 pts, others get a mix.
    const [a, b, c, d] = createdTeamIds;
    const results: Array<{
      idx: number;
      score_a: number;
      score_b: number;
      winner: string | null;
    }> = [
      { idx: 0, score_a: 2, score_b: 1, winner: a }, // A v B
      { idx: 1, score_a: 1, score_b: 1, winner: null }, // C v D draw
      { idx: 2, score_a: 3, score_b: 0, winner: a }, // A v C
      { idx: 3, score_a: 0, score_b: 2, winner: d }, // B v D
      { idx: 4, score_a: 1, score_b: 0, winner: a }, // A v D
      { idx: 5, score_a: 2, score_b: 2, winner: null }, // B v C draw
    ];

    for (const r of results) {
      const { error } = await admin
        .from("tournament_matches")
        .update({
          score_a: r.score_a,
          score_b: r.score_b,
          winner_team_id: r.winner,
          status: "completed",
          validated_at: new Date().toISOString(),
          validated_by: club.admin.userId,
        })
        .eq("id", createdMatchIds[r.idx]);
      expect(error).toBeNull();
    }

    const { data: done } = await admin
      .from("tournament_matches")
      .select("status")
      .eq("tournament_id", tournamentId);
    expect(done!.every((m) => m.status === "completed")).toBe(true);
    // sanity: team A won 3 matches
    const { data: aWins } = await admin
      .from("tournament_matches")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("winner_team_id", a);
    expect(aWins).toHaveLength(3);
    void b;
    void c;
  });

  test("admin publishes the programme and marks tournament live", async () => {
    const { error } = await admin
      .from("tournaments")
      .update({
        status: "ongoing",
        published_programme_at: new Date().toISOString(),
      })
      .eq("id", tournamentId);
    expect(error).toBeNull();

    const { data } = await admin
      .from("tournaments")
      .select("status, published_programme_at")
      .eq("id", tournamentId)
      .single();
    expect(data?.status).toBe("ongoing");
    expect(data?.published_programme_at).not.toBeNull();
  });

  test("admin closes the tournament", async () => {
    const { error } = await admin
      .from("tournaments")
      .update({ status: "completed" })
      .eq("id", tournamentId);
    expect(error).toBeNull();
  });
});
