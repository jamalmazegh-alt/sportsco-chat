/**
 * 10 — Coach feedback + AI review — v3
 *
 * Fix test 2 : admin fixture n'est pas service_role → ne peut pas bypass RLS.
 * Solution : utiliser clientFor(club.coach) directement.
 * La RLS player_reviews_insert autorise si :
 *   - author_user_id = auth.uid()  ✅ (on passe coach.userId)
 *   - can_author_player_feedback(uid, player_id) = true
 *     → has_club_role(uid, club_id, 'coach') via club_members
 *     ✅ Le coach E2E est dans club_members du club E2E permanent
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Coach feedback + AI synthesis", () => {
  let club: SeededClub;

  test.beforeAll(async () => {
    club = await createTestClub("feedback");
  });

  test.afterAll(async () => {
    await admin
      .from("player_reviews")
      .delete()
      .in("player_id", [club.player1.id, club.player2WithParent.id]);
    await admin
      .from("player_feedback")
      .delete()
      .in("player_id", [club.player1.id, club.player2WithParent.id]);
    await club.cleanup();
  });

  // ── 1. Coach écrit du feedback sur 2 joueurs ────────────────────────────
  test("coach writes feedback for two players", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("player_feedback").insert([
      {
        club_id: club.clubId,
        team_id: club.teamId,
        player_id: club.player1.id,
        event_id: club.eventId,
        author_user_id: club.coach.userId,
        rating: 4,
        comment: "Bon match",
        tags: ["combatif"],
        visibility: "coach_only",
      },
      {
        club_id: club.clubId,
        team_id: club.teamId,
        player_id: club.player2WithParent.id,
        event_id: club.eventId,
        author_user_id: club.coach.userId,
        rating: 3,
        comment: "Peut mieux faire",
        tags: ["technique"],
        visibility: "coach_only",
      },
    ]);
    expect(error).toBeNull();
  });

  // ── 2. Coach crée une synthèse (via son propre client, pas admin) ────────
  test("coach creates a player synthesis (mock via coach client)", async () => {
    const REAL_AI = process.env.E2E_REAL_AI === "1";
    const c = await clientFor(club.coach);

    const { data: inserted, error: insErr } = await c
      .from("player_reviews")
      .insert({
        player_id: club.player1.id,
        club_id: club.clubId,
        author_user_id: club.coach.userId,
        kind: REAL_AI ? "end_of_season" : "coaching",
        content: REAL_AI ? "Synthèse IA test" : "Synthèse mock E2E",
      })
      .select("id, content")
      .single();

    expect(insErr).toBeNull();
    expect(inserted?.id).toBeTruthy();

    // Vérifier la lecture
    const { data: readable, error: readErr } = await c
      .from("player_reviews")
      .select("id, content")
      .eq("id", inserted!.id)
      .single();
    expect(readErr).toBeNull();
    expect(readable?.content).toBeTruthy();
  });

  // ── 3. Un joueur ne peut PAS lire les feedbacks coach_only ─────────────
  test("player cannot read coach_only feedback", async () => {
    const c = await clientFor(club.player1.user);
    const { data } = await c
      .from("player_feedback")
      .select("id")
      .eq("player_id", club.player1.id)
      .eq("visibility", "coach_only");
    expect((data?.length ?? 0)).toBe(0);
  });

  // ── 4. Le coach peut modifier son propre feedback ───────────────────────
  test("coach can update their own feedback", async () => {
    const { data: fb } = await admin
      .from("player_feedback")
      .select("id")
      .eq("player_id", club.player1.id)
      .eq("author_user_id", club.coach.userId)
      .maybeSingle();

    if (!fb) {
      test.skip(true, "No feedback from test 1 — skipping");
      return;
    }

    const c = await clientFor(club.coach);
    const { error } = await c
      .from("player_feedback")
      .update({ comment: "Feedback mis à jour", rating: 5 })
      .eq("id", fb.id);
    expect(error).toBeNull();
  });
});
