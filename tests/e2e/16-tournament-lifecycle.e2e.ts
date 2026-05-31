/**
 * 16 — Tournament lifecycle — fixed
 *
 * Fix : "admin closes the tournament" échoue avec
 * "record new has no field start_date" car le trigger
 * on_tournament_completed_journey référençait NEW.start_date
 * qui n'existe pas sur tournaments.
 *
 * Le trigger a été corrigé dans la migration 20260531.
 * Le test reste identique — on valide juste que l'UPDATE
 * status='completed' passe sans erreur.
 *
 * Si l'erreur "invalid input syntax for uuid: undefined"
 * apparaît en retry, c'est que tournamentId n'est pas
 * initialisé — on ajoute un guard explicite.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Tournament lifecycle", () => {
  let club: SeededClub;
  let tournamentId: string;

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
    const { data, error } = await admin
      .from("tournaments")
      .insert({
        club_id: club.clubId,
        name: `__e2e_tournament_${club.prefix}`,
        status: "draft",
        sport: "football",
        start_date: future,
        end_date: future,
        created_by: club.admin.userId,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    tournamentId = data!.id;
  });

  test("admin adds 4 teams", async () => {
    if (!tournamentId) {
      test.skip(true, "No tournamentId from previous test");
      return;
    }
    const teams = ["Team A", "Team B", "Team C", "Team D"].map(name => ({
      tournament_id: tournamentId,
      name,
      club_id: club.clubId,
    }));
    const { error } = await admin.from("tournament_teams").insert(teams);
    expect(error).toBeNull();
  });

  test("admin draws 1 group and assigns the 4 teams", async () => {
    if (!tournamentId) {
      test.skip(true, "No tournamentId");
      return;
    }
    const { data: groupData, error: groupErr } = await admin
      .from("tournament_groups")
      .insert({
        tournament_id: tournamentId,
        name: "Groupe A",
        display_order: 1,
      })
      .select("id")
      .single();
    expect(groupErr).toBeNull();

    const { data: teams } = await admin
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId);
    expect((teams?.length ?? 0)).toBe(4);

    const { error } = await admin
      .from("tournament_teams")
      .update({ group_id: groupData!.id })
      .eq("tournament_id", tournamentId);
    expect(error).toBeNull();
  });

  test("admin schedules round-robin matches", async () => {
    if (!tournamentId) {
      test.skip(true, "No tournamentId");
      return;
    }
    const { data: teams } = await admin
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId);
    expect((teams?.length ?? 0)).toBe(4);

    const [t1, t2, t3, t4] = teams!;
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const matches = [
      { tournament_id: tournamentId, home_team_id: t1.id, away_team_id: t2.id, scheduled_at: future },
      { tournament_id: tournamentId, home_team_id: t3.id, away_team_id: t4.id, scheduled_at: future },
      { tournament_id: tournamentId, home_team_id: t1.id, away_team_id: t3.id, scheduled_at: future },
      { tournament_id: tournamentId, home_team_id: t2.id, away_team_id: t4.id, scheduled_at: future },
    ];
    const { error } = await admin.from("tournament_matches").insert(matches);
    expect(error).toBeNull();
  });

  test("admin records results and validates matches", async () => {
    if (!tournamentId) {
      test.skip(true, "No tournamentId");
      return;
    }
    const { data: matches } = await admin
      .from("tournament_matches")
      .select("id")
      .eq("tournament_id", tournamentId);
    expect((matches?.length ?? 0)).toBeGreaterThan(0);

    const { error } = await admin
      .from("tournament_matches")
      .update({ home_score: 2, away_score: 1, status: "completed" })
      .eq("tournament_id", tournamentId);
    expect(error).toBeNull();
  });

  test("admin publishes the programme and marks tournament live", async () => {
    if (!tournamentId) {
      test.skip(true, "No tournamentId");
      return;
    }
    const { error } = await admin
      .from("tournaments")
      .update({
        status: "in_progress",
        published_programme_at: new Date().toISOString(),
      })
      .eq("id", tournamentId);
    expect(error).toBeNull();

    const { data } = await admin
      .from("tournaments")
      .select("status, published_programme_at")
      .eq("id", tournamentId)
      .single();
    expect(data?.status).toBe("in_progress");
    expect(data?.published_programme_at).not.toBeNull();
  });

  // Fix : trigger on_tournament_completed_journey corrigé
  // en 20260531 — ne référence plus NEW.start_date
  test("admin closes the tournament", async () => {
    if (!tournamentId) {
      test.skip(true, "No tournamentId — previous test failed");
      return;
    }
    const { error } = await admin
      .from("tournaments")
      .update({ status: "completed" })
      .eq("id", tournamentId);
    expect(error).toBeNull();

    // Vérifier que le statut est bien completed
    const { data } = await admin
      .from("tournaments")
      .select("status")
      .eq("id", tournamentId)
      .single();
    expect(data?.status).toBe("completed");
  });
});
