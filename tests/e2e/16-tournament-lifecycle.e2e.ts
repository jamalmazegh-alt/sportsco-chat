/**
 * 16 — Tournament lifecycle — v5 final
 *
 * Colonnes réelles vérifiées dans les migrations :
 * - tournaments     : starts_on, slug (NOT NULL UNIQUE)
 * - tournament_teams: id, tournament_id, name (pas club_id, pas display_order)
 * - tournament_groups: id, tournament_id, name (pas display_order)
 * - tournament_matches: team_a_id, team_b_id, score_a, score_b, scheduled_at
 */
import { test, expect } from "@playwright/test";
import { nanoid } from "nanoid";
import { admin } from "./_fixtures/admin";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Tournament lifecycle", () => {
  let club: SeededClub;
  let tournamentId: string;
  let teamIds: string[] = [];

  test.beforeAll(async () => {
    club = await createTestClub("tournament");
  });

  test.afterAll(async () => {
    try {
      if (tournamentId) {
        await admin.from("tournament_matches").delete()
          .eq("tournament_id", tournamentId);
        await admin.from("tournament_groups").delete()
          .eq("tournament_id", tournamentId);
        await admin.from("tournament_teams").delete()
          .eq("tournament_id", tournamentId);
        await admin.from("tournaments").delete()
          .eq("id", tournamentId);
      }
    } catch { /* best-effort */ }
    await club.cleanup();
  });

  test("admin creates a draft tournament", async () => {
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000)
      .toISOString().split("T")[0];
    const slug = `e2e-${nanoid(8)}`.toLowerCase();
    const { data, error } = await admin.from("tournaments").insert({
      club_id: club.clubId,
      name: `__e2e_tournament_${club.prefix}`,
      slug,
      status: "draft",
      sport: "football",
      starts_on: future,
      created_by: club.admin.userId,
    }).select("id").single();
    expect(error).toBeNull();
    tournamentId = data!.id;
  });

  test("admin adds 4 teams", async () => {
    if (!tournamentId) { test.skip(true, "No tournamentId"); return; }
    const { data, error } = await admin.from("tournament_teams").insert([
      { tournament_id: tournamentId, name: "Team A" },
      { tournament_id: tournamentId, name: "Team B" },
      { tournament_id: tournamentId, name: "Team C" },
      { tournament_id: tournamentId, name: "Team D" },
    ]).select("id");
    expect(error).toBeNull();
    teamIds = (data ?? []).map((t: any) => t.id);
  });

  test("admin draws 1 group and assigns the 4 teams", async () => {
    if (!tournamentId) { test.skip(true, "No tournamentId"); return; }
    const { data: groupData, error: groupErr } = await admin
      .from("tournament_groups")
      .insert({ tournament_id: tournamentId, name: "Groupe A" })
      .select("id").single();
    expect(groupErr).toBeNull();

    const { data: teams } = await admin.from("tournament_teams")
      .select("id").eq("tournament_id", tournamentId);
    expect((teams?.length ?? 0)).toBe(4);
    if (teamIds.length === 0) teamIds = (teams ?? []).map((t: any) => t.id);

    const { error } = await admin.from("tournament_teams")
      .update({ group_id: groupData!.id }).eq("tournament_id", tournamentId);
    expect(error).toBeNull();
  });

  test("admin schedules round-robin matches", async () => {
    if (!tournamentId || teamIds.length < 4) {
      test.skip(true, "No tournamentId or teams");
      return;
    }
    const [t1, t2, t3, t4] = teamIds;
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { error } = await admin.from("tournament_matches").insert([
      { tournament_id: tournamentId, team_a_id: t1, team_b_id: t2, scheduled_at: future },
      { tournament_id: tournamentId, team_a_id: t3, team_b_id: t4, scheduled_at: future },
      { tournament_id: tournamentId, team_a_id: t1, team_b_id: t3, scheduled_at: future },
      { tournament_id: tournamentId, team_a_id: t2, team_b_id: t4, scheduled_at: future },
    ]);
    expect(error).toBeNull();
  });

  test("admin records results and validates matches", async () => {
    if (!tournamentId) { test.skip(true, "No tournamentId"); return; }
    const { error } = await admin.from("tournament_matches")
      .update({ score_a: 2, score_b: 1, status: "completed" })
      .eq("tournament_id", tournamentId);
    expect(error).toBeNull();
  });

  test("admin publishes the programme and marks tournament live", async () => {
    if (!tournamentId) { test.skip(true, "No tournamentId"); return; }
    const { error } = await admin.from("tournaments")
      .update({ status: "in_progress", published_programme_at: new Date().toISOString() })
      .eq("id", tournamentId);
    expect(error).toBeNull();
    const { data } = await admin.from("tournaments")
      .select("status, published_programme_at").eq("id", tournamentId).single();
    expect(data?.status).toBe("in_progress");
  });

  test("admin closes the tournament", async () => {
    if (!tournamentId) { test.skip(true, "No tournamentId"); return; }
    const { error } = await admin.from("tournaments")
      .update({ status: "completed" }).eq("id", tournamentId);
    expect(error).toBeNull();
    const { data } = await admin.from("tournaments")
      .select("status").eq("id", tournamentId).single();
    expect(data?.status).toBe("completed");
  });
});
