/**
 * 03 — Users & roles
 *
 * - Invite admin et coach via member_invites
 * - Rattache un coach à une équipe
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Users & roles", () => {
  let club: SeededClub;
  test.beforeAll(async () => { club = await createTestClub("roles"); });
  test.afterAll(async () => { await club.cleanup(); });

  test("admin can invite admin + coach", async () => {
    const c = await clientFor(club.admin);
    const tokens = ["adm", "coach"].map(
      (k) => `${club.prefix}_inv_${k}_${Math.random().toString(36).slice(2, 10)}`,
    );
    const { error } = await c.from("member_invites").insert([
      {
        club_id: club.clubId,
        role: "admin",
        token: tokens[0],
        email: `inv_admin_${club.prefix}@clubero-e2e.test`,
        created_by: club.admin.userId,
      },
      {
        club_id: club.clubId,
        role: "coach",
        token: tokens[1],
        email: `inv_coach_${club.prefix}@clubero-e2e.test`,
        created_by: club.admin.userId,
      },
    ]);
    expect(error).toBeNull();
  });

  test("coach is attached to team", async () => {
    const { data } = await admin
      .from("team_members")
      .select("user_id, role")
      .eq("team_id", club.teamId)
      .eq("user_id", club.coach.userId)
      .single();
    expect(data?.role).toBe("coach");
  });
});
