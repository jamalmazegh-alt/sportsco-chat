/**
 * 11 — Match result, goals/cards, stats
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Match result, goals, cards, stats", () => {
  let club: SeededClub;
  test.beforeAll(async () => { club = await createTestClub("stats"); });
  test.afterAll(async () => { await club.cleanup(); });

  test("coach records score", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("match_results").upsert({
      event_id: club.eventId,
      home_score: 3,
      away_score: 1,
      recorded_by: club.coach.userId,
    });
    expect(error).toBeNull();
  });

  test("coach adds goals + cards", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("event_goals").insert([
      {
        event_id: club.eventId,
        scorer_player_id: club.player1.id,
        kind: "goal",
        minute: 10,
        created_by: club.coach.userId,
      },
      {
        event_id: club.eventId,
        scorer_player_id: club.player1.id,
        kind: "goal",
        minute: 55,
        created_by: club.coach.userId,
      },
      {
        event_id: club.eventId,
        scorer_player_id: club.player2WithParent.id,
        kind: "yellow_card",
        minute: 70,
        created_by: club.coach.userId,
      },
    ]);
    expect(error).toBeNull();
  });

  test("stats query returns the recorded events", async () => {
    const c = await clientFor(club.coach);
    const { data } = await c
      .from("event_goals")
      .select("kind, scorer_player_id")
      .eq("event_id", club.eventId);
    const goals = data!.filter((d) => d.kind === "goal");
    const cards = data!.filter((d) => d.kind === "yellow_card");
    expect(goals.length).toBe(2);
    expect(cards.length).toBe(1);
  });
});
