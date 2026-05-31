/**
 * 19 — Player Suspensions
 *
 * Valide :
 *   1. Coach crée une suspension
 *   2. Suspension status=active visible par coach/admin
 *   3. Joueur ne voit pas sa suspension (RLS)
 *   4. matches_to_serve et matches_served corrects
 *   5. Coach peut annuler (status=cancelled)
 *   6. suspension_reason CHECK constraint
 *   7. matches_to_serve > 0 CHECK constraint
 *   8. served_event_ids est un tableau vide par défaut
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Player suspensions", () => {
  let club: SeededClub;
  let suspensionId: string;

  test.beforeAll(async () => {
    club = await createTestClub("suspension");
  });

  test.afterAll(async () => {
    try {
      if (suspensionId) {
        await admin.from("player_suspensions").delete().eq("id", suspensionId);
      }
    } catch { /* best-effort */ }
    await club.cleanup();
  });

  // ── 1. Coach crée une suspension ────────────────────────────
  test("coach can create a suspension", async () => {
    const c = await clientFor(club.coach);
    const { data, error } = await c
      .from("player_suspensions")
      .insert({
        player_id: club.player1.id,
        team_id: club.teamId,
        club_id: club.clubId,
        suspension_reason: "red_card",
        matches_to_serve: 2,
        suspension_start_date: new Date().toISOString().split("T")[0],
        created_by: club.coach.userId,
      })
      .select("id, status, matches_served, served_event_ids")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("active");
    expect(data?.matches_served).toBe(0);
    expect(data?.served_event_ids).toEqual([]);
    suspensionId = data!.id;
  });

  // ── 2. Suspension visible par coach ─────────────────────────
  test("coach can read active suspensions", async () => {
    const c = await clientFor(club.coach);
    const { data, error } = await c
      .from("player_suspensions")
      .select("id, status, matches_to_serve")
      .eq("player_id", club.player1.id)
      .eq("status", "active");
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThan(0);
    expect(data![0].matches_to_serve).toBe(2);
  });

  // ── 3. Joueur ne voit pas sa suspension (RLS) ───────────────
  test("player cannot read their own suspension (RLS)", async () => {
    const c = await clientFor(club.player1.user);
    const { data } = await c
      .from("player_suspensions")
      .select("id")
      .eq("player_id", club.player1.id);
    expect((data?.length ?? 0)).toBe(0);
  });

  // ── 4. Admin peut aussi lire ─────────────────────────────────
  test("admin can read club suspensions", async () => {
    const c = await clientFor(club.admin);
    const { data, error } = await c
      .from("player_suspensions")
      .select("id")
      .eq("club_id", club.clubId)
      .eq("status", "active");
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThan(0);
  });

  // ── 5. Coach peut annuler ────────────────────────────────────
  test("coach can cancel a suspension", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c
      .from("player_suspensions")
      .update({ status: "cancelled" })
      .eq("id", suspensionId);
    expect(error).toBeNull();

    const { data } = await admin
      .from("player_suspensions")
      .select("status")
      .eq("id", suspensionId)
      .single();
    expect(data?.status).toBe("cancelled");
  });

  // ── 6. suspension_reason invalide rejeté ────────────────────
  test("invalid suspension_reason is rejected", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("player_suspensions").insert({
      player_id: club.player1.id,
      team_id: club.teamId,
      club_id: club.clubId,
      suspension_reason: "bad_reason",
      matches_to_serve: 1,
    });
    expect(error).not.toBeNull();
  });

  // ── 7. matches_to_serve = 0 rejeté ──────────────────────────
  test("matches_to_serve = 0 is rejected", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("player_suspensions").insert({
      player_id: club.player1.id,
      team_id: club.teamId,
      club_id: club.clubId,
      suspension_reason: "red_card",
      matches_to_serve: 0,
    });
    expect(error).not.toBeNull();
  });
});
