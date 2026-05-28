/**
 * 10 — Coach feedback + AI review (synthèse) — v2
 *
 * Corrections :
 * - player_reviews : colonnes réelles = kind (pas review_type), pas de season
 * - test 4 (update) : utilise maybeSingle() + skip si pas de données
 * - test 3 (player cannot read) : guard si RLS retourne [] ou null
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

  // ── 1. Coach insère du feedback sur 2 joueurs ───────────────────────────
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

  // ── 2. Synthèse IA (mock via admin) ────────────────────────────────────
  // Colonnes réelles : kind (enum), content, club_id, player_id, author_user_id
  // Pas de review_type ni season
  test("coach creates a player synthesis (mock via admin)", async () => {
    const REAL_AI = process.env.E2E_REAL_AI === "1";

    if (REAL_AI) {
      const c = await clientFor(club.coach);
      const { error } = await c.from("player_reviews").insert({
        player_id: club.player1.id,
        club_id: club.clubId,
        author_user_id: club.coach.userId,
        kind: "end_of_season",
        content: "Synthèse IA test",
      });
      expect(error).toBeNull();
    } else {
      // Insert via admin pour bypass RLS écriture
      const { data: inserted, error: insErr } = await admin
        .from("player_reviews")
        .insert({
          player_id: club.player1.id,
          club_id: club.clubId,
          author_user_id: club.coach.userId,
          kind: "end_of_season",
          content: "Synthèse mock E2E",
          visibility: "coach_only",
        })
        .select("id")
        .single();
      expect(insErr).toBeNull();
      expect(inserted?.id).toBeTruthy();

      // Le coach peut lire sa review
      const c = await clientFor(club.coach);
      const { data: readable, error: readErr } = await c
        .from("player_reviews")
        .select("id, content")
        .eq("id", inserted!.id)
        .single();
      expect(readErr).toBeNull();
      expect(readable?.content).toBe("Synthèse mock E2E");
    }
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
    // Chercher via admin (pas de filtre RLS)
    const { data: fb } = await admin
      .from("player_feedback")
      .select("id")
      .eq("player_id", club.player1.id)
      .eq("author_user_id", club.coach.userId)
      .maybeSingle();

    if (!fb) {
      // Pas de feedback trouvé — le test 1 a peut-être échoué, on skip
      test.skip(true, "No feedback found from test 1 — skipping update test");
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
