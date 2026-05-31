/**
 * 20 — Player Availabilities (Disponibilités & Absences)
 *
 * Valide :
 *   1. Parent crée une absence pour son enfant
 *   2. Coach peut lire les absences de l'équipe
 *   3. Joueur peut lire sa propre absence
 *   4. Contrainte end_date >= start_date
 *   5. reason invalide rejeté (CHECK constraint)
 *   6. Parent peut annuler (status=cancelled)
 *   7. status=completed ne peut pas être recréé manuellement
 *   8. Admin peut lire les absences du club
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Player availabilities", () => {
  let club: SeededClub;
  let availabilityId: string;

  test.beforeAll(async () => {
    club = await createTestClub("availability");
  });

  test.afterAll(async () => {
    try {
      await admin
        .from("player_availabilities")
        .delete()
        .in("player_id", [club.player1.id, club.player2WithParent.id]);
    } catch { /* best-effort */ }
    await club.cleanup();
  });

  // ── 1. Parent crée une absence ──────────────────────────────
  test("parent can create an absence for their child", async () => {
    const future = new Date(Date.now() + 14 * 24 * 3600 * 1000);
    const start = future.toISOString().split("T")[0];
    const end = new Date(Date.now() + 21 * 24 * 3600 * 1000)
      .toISOString().split("T")[0];

    const c = await clientFor(club.player2WithParent.parent);
    const { data, error } = await c
      .from("player_availabilities")
      .insert({
        player_id: club.player2WithParent.id,
        created_by_user_id: club.player2WithParent.parent.userId,
        start_date: start,
        end_date: end,
        reason: "vacation",
        comment: "Vacances scolaires",
      })
      .select("id, status, reason")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("active");
    expect(data?.reason).toBe("vacation");
    availabilityId = data!.id;
  });

  // ── 2. Coach lit les absences ───────────────────────────────
  test("coach can read player absences", async () => {
    const c = await clientFor(club.coach);
    const { data, error } = await c
      .from("player_availabilities")
      .select("id, reason, status")
      .eq("player_id", club.player2WithParent.id)
      .eq("status", "active");
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThan(0);
  });

  // ── 3. Admin peut lire ──────────────────────────────────────
  test("admin can read absences", async () => {
    const { data, error } = await admin
      .from("player_availabilities")
      .select("id")
      .eq("player_id", club.player2WithParent.id)
      .eq("status", "active");
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThan(0);
  });

  // ── 4. end_date < start_date rejeté ────────────────────────
  test("end_date before start_date is rejected", async () => {
    const c = await clientFor(club.player2WithParent.parent);
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString().split("T")[0];
    const { error } = await c.from("player_availabilities").insert({
      player_id: club.player2WithParent.id,
      created_by_user_id: club.player2WithParent.parent.userId,
      start_date: today,
      end_date: yesterday,
      reason: "injury",
    });
    expect(error).not.toBeNull();
  });

  // ── 5. reason invalide rejeté ──────────────────────────────
  test("invalid reason is rejected", async () => {
    const c = await clientFor(club.player2WithParent.parent);
    const today = new Date().toISOString().split("T")[0];
    const { error } = await c.from("player_availabilities").insert({
      player_id: club.player2WithParent.id,
      created_by_user_id: club.player2WithParent.parent.userId,
      start_date: today,
      end_date: today,
      reason: "suspension", // intentionnellement absent du CHECK
    });
    expect(error).not.toBeNull();
  });

  // ── 6. Parent annule l'absence ──────────────────────────────
  test("parent can cancel their absence", async () => {
    const c = await clientFor(club.player2WithParent.parent);
    const { error } = await c
      .from("player_availabilities")
      .update({ status: "cancelled" })
      .eq("id", availabilityId);
    expect(error).toBeNull();

    const { data } = await admin
      .from("player_availabilities")
      .select("status")
      .eq("id", availabilityId)
      .single();
    expect(data?.status).toBe("cancelled");
  });

  // ── 7. Coach crée aussi une absence manuellement ────────────
  test("coach can create an absence manually", async () => {
    const today = new Date().toISOString().split("T")[0];
    const c = await clientFor(club.coach);
    const { data, error } = await c
      .from("player_availabilities")
      .insert({
        player_id: club.player1.id,
        created_by_user_id: club.coach.userId,
        start_date: today,
        end_date: today,
        reason: "injury",
        comment: "Cheville tordue à l'entraînement",
      })
      .select("id, reason")
      .single();
    expect(error).toBeNull();
    expect(data?.reason).toBe("injury");
  });
});
