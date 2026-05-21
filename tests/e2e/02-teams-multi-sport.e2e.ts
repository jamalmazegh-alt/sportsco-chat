/**
 * 02 — Multi-sport teams
 *
 * Crée une équipe pour chaque sport supporté et vérifie la persistance.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

const SPORTS = ["football", "basketball", "rugby", "handball", "volleyball"] as const;

test.describe("Multi-sport teams", () => {
  let club: SeededClub;
  test.beforeAll(async () => { club = await createTestClub("sports"); });
  test.afterAll(async () => { await club.cleanup(); });

  for (const sport of SPORTS) {
    test(`create ${sport} team`, async () => {
      const c = await clientFor(club.admin);
      const { data, error } = await c
        .from("teams")
        .insert({
          club_id: club.clubId,
          name: `${club.prefix}_${sport}`,
          sport,
        })
        .select("id, sport")
        .single();
      expect(error).toBeNull();
      expect(data?.sport).toBe(sport);
      await admin.from("teams").delete().eq("id", data!.id);
    });
  }
});
