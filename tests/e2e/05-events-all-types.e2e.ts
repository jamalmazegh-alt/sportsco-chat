/**
 * 05 — Events: every type × multiple sports
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

const EVENT_TYPES = ["training", "match", "tournament", "meeting"] as const;
const SPORTS = ["football", "basketball"] as const;

test.describe("Events all types & sports", () => {
  let club: SeededClub;
  test.beforeAll(async () => { club = await createTestClub("events"); });
  test.afterAll(async () => { await club.cleanup(); });

  for (const sport of SPORTS) {
    test.describe(`sport=${sport}`, () => {
      let teamId: string;
      test.beforeAll(async () => {
        const { data } = await admin
          .from("teams")
          .insert({ club_id: club.clubId, name: `${club.prefix}_${sport}_evt`, sport })
          .select("id")
          .single();
        teamId = data!.id;
        await admin.from("team_members").insert({
          team_id: teamId,
          user_id: club.coach.userId,
          role: "coach",
        });
      });
      test.afterAll(async () => {
        await admin.from("events").delete().eq("team_id", teamId);
        await admin.from("team_members").delete().eq("team_id", teamId);
        await admin.from("teams").delete().eq("id", teamId);
      });

      for (const type of EVENT_TYPES) {
        test(`coach creates ${type}`, async () => {
          const c = await clientFor(club.coach);
          const future = new Date(Date.now() + 5 * 86400000).toISOString();
          const { data, error } = await c
            .from("events")
            .insert({
              team_id: teamId,
              title: `${club.prefix}_${sport}_${type}`,
              starts_at: future,
              type,
              status: "published",
              created_by: club.coach.userId,
              is_home: type === "match" ? true : null,
            })
            .select("id, type")
            .single();
          expect(error).toBeNull();
          expect(data?.type).toBe(type);
        });
      }
    });
  }
});
