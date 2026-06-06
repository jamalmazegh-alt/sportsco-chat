/**
 * 06 — Lineup (football formation)
 *
 * Crée une compo via la server function upsertLineup et la publie.
 */
import { test, expect } from "@playwright/test";

import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Lineup", () => {
  let club: SeededClub;
  test.beforeAll(async () => { club = await createTestClub("lineup"); });
  test.afterAll(async () => { await club.cleanup(); });

  test("coach creates and publishes a 4-4-2 lineup", async () => {
    const c = await clientFor(club.coach);
    const slots = Array.from({ length: 11 }, (_, i) => ({
      id: `s${i}`,
      role: i === 0 ? "GK" : i < 5 ? "DEF" : i < 9 ? "MID" : "FWD",
      x: 10 + i * 8,
      y: 10 + i * 7,
      player_id: i === 0 ? club.player1.id : i === 1 ? club.player2WithParent.id : null,
    }));
    const { data, error } = await c
      .from("event_lineups")
      .upsert(
        {
          event_id: club.eventId,
          team_id: club.teamId,
          club_id: club.clubId,
          formation: "4-4-2",
          slots,
          bench: [],
          visibility: "team",
          published_at: new Date().toISOString(),
          created_by: club.coach.userId,
        },
        { onConflict: "event_id" },
      )
      .select("*")
      .single();
    expect(error).toBeNull();
    expect(data?.formation).toBe("4-4-2");
    expect(data?.published_at).not.toBeNull();
  });

  test("player can read published lineup", async () => {
    const c = await clientFor(club.player1.user);
    const { data } = await c
      .from("event_lineups")
      .select("formation")
      .eq("event_id", club.eventId)
      .maybeSingle();
    expect(data?.formation).toBe("4-4-2");
  });
  // Note: event_lineups cleanup is handled by club.cleanup() via createTestClub.
});
